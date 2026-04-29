<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sanctions Checking Service
 *
 * Integrates with multiple free sanctions databases:
 * - sanctions.network (OFAC SDN, UN, EU sanctions lists)
 * - FleetLeaks (sanctioned vessels map data)
 */
class SanctionsService
{
    private const CACHE_VERSION = 'v4';

    private const CACHE_TTL = 86400; // 24 hours

    private const SANCTIONS_NETWORK_URL = 'https://api.sanctions.network';

    private const SANCTIONS_NETWORK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

    private const FLEETLEAKS_URL = 'https://fleetleaks.com/wp-json/fleetleaks/v1/vessels/map-data';

    private const FLEETLEAKS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

    /**
     * Check if a vessel is sanctioned across all sources
     */
    public function checkVessel(
        ?string $vesselName = null,
        ?string $imoNumber = null,
        ?string $mmsi = null,
        ?string $callSign = null,
        bool $forceRefresh = false
    ): array {
        $resolvedName = $this->resolveVesselName($vesselName, $imoNumber, $mmsi, $callSign);
        $cacheKey = $this->cacheKey($imoNumber, $mmsi, $callSign);

        if (! $forceRefresh) {
            $cached = Cache::get($cacheKey);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $result = [
            'vessel_name' => $resolvedName,
            'imo' => $imoNumber,
            'mmsi' => $mmsi,
            'call_sign' => $callSign,
            'sources' => [
                'sanctions_network' => $this->checkSanctionsNetwork($resolvedName, $imoNumber, $forceRefresh),
                'fleetleaks' => $this->checkFleetLeaks($resolvedName, $imoNumber, $mmsi, $callSign, $forceRefresh),
            ],
            'checked_at' => now()->toIso8601String(),
        ];

        $result = $this->aggregateResults($result);

        if ($this->shouldCacheResult($result)) {
            Cache::put($cacheKey, $result, self::CACHE_TTL);
        }

        return $result;
    }

    /**
     * Check sanctions.network using its public PostgREST search endpoint.
     */
    private function checkSanctionsNetwork(string $vesselName, ?string $imoNumber = null, bool $forceRefresh = false): array
    {
        $cacheKey = $this->sourceCacheKey('sanctions_network', $vesselName, $imoNumber, null, null);

        $cached = ! $forceRefresh ? Cache::get($cacheKey) : null;
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $sanctionsNetworkConfig = config('services.sanctions_network', []);
            $sanctionsNetworkUrl = (string) ($sanctionsNetworkConfig['url'] ?? self::SANCTIONS_NETWORK_URL);
            $sanctionsNetworkTimeout = (int) ($sanctionsNetworkConfig['timeout'] ?? 10);
            $sanctionsNetworkUserAgent = (string) ($sanctionsNetworkConfig['user_agent'] ?? self::SANCTIONS_NETWORK_USER_AGENT);
            $sanctionsNetworkReferer = (string) ($sanctionsNetworkConfig['referer'] ?? 'https://api.sanctions.network/');

            $response = Http::timeout($sanctionsNetworkTimeout)
                ->withHeaders([
                    'User-Agent' => $sanctionsNetworkUserAgent,
                    'Referer' => $sanctionsNetworkReferer,
                ])
                ->acceptJson()
                ->get(rtrim($sanctionsNetworkUrl, '/').'/rpc/search_sanctions', [
                    'name' => $vesselName,
                    'limit' => 25,
                ]);

            if (! $response->successful()) {
                Log::warning('sanctions.network API error', [
                    'status' => $response->status(),
                    'vessel' => $vesselName,
                    'url' => $sanctionsNetworkUrl,
                    'content_type' => $response->header('Content-Type'),
                    'server' => $response->header('Server'),
                ]);

                return ['status' => 'error', 'found' => false, 'results' => []];
            }

            $payload = $response->json();
            $entities = [];

            if (is_array($payload)) {
                $entities = array_is_list($payload) ? $payload : ($payload['results'] ?? []);
            }

            if (! is_array($entities) || empty($entities)) {
                $result = ['status' => 'ok', 'found' => false, 'results' => []];
                Cache::put($cacheKey, $result, self::CACHE_TTL);

                return $result;
            }

            $results = [];
            $vesselNameNorm = $this->normalizeText($vesselName);

            foreach ($entities as $entity) {
                if (! is_array($entity)) {
                    continue;
                }

                $names = $this->asList($entity['names'] ?? $entity['name'] ?? []);
                $entityName = $entity['name'] ?? ($names[0] ?? null);

                $isExact = $this->normalizeText($entityName) === $vesselNameNorm;
                if (! $isExact) {
                    foreach ($names as $altName) {
                        if ($this->normalizeText($altName) === $vesselNameNorm) {
                            $isExact = true;
                            break;
                        }
                    }
                }

                $results[] = [
                    'name' => $entityName ?? $vesselName,
                    'source' => $entity['source'] ?? null,
                    'source_id' => $entity['source_id'] ?? $entity['id'] ?? null,
                    'alternate_names' => $names,
                    'matched_name' => $vesselName,
                    'match_type' => $isExact ? 'exact' : 'fuzzy',
                ];
            }

            $results = $this->dedupeResults($results, ['source_id', 'name']);

            $result = [
                'status' => 'ok',
                'found' => collect($results)->where('match_type', 'exact')->isNotEmpty(),
                'count' => count($results),
                'results' => $results,
            ];

            Cache::put($cacheKey, $result, self::CACHE_TTL);

            return $result;

        } catch (\Throwable $e) {
            Log::error('sanctions.network check error', [
                'error' => $e->getMessage(),
                'vessel' => $vesselName,
            ]);

            return ['status' => 'error', 'found' => false, 'results' => []];
        }
    }

    /**
     * Check FleetLeaks map data.
     */
    private function checkFleetLeaks(
        string $vesselName,
        ?string $imoNumber = null,
        ?string $mmsi = null,
        ?string $callSign = null,
        bool $forceRefresh = false
    ): array {
        $cacheKey = $this->sourceCacheKey('fleetleaks', $vesselName, $imoNumber, $mmsi, $callSign);

        $cached = ! $forceRefresh ? Cache::get($cacheKey) : null;
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $fleetleaksConfig = config('services.fleetleaks', []);
            $fleetleaksUrl = (string) ($fleetleaksConfig['url'] ?? self::FLEETLEAKS_URL);
            $fleetleaksTimeout = (int) ($fleetleaksConfig['timeout'] ?? 10);
            $fleetleaksUserAgent = (string) ($fleetleaksConfig['user_agent'] ?? self::FLEETLEAKS_USER_AGENT);
            $fleetleaksReferer = (string) ($fleetleaksConfig['referer'] ?? 'https://fleetleaks.com/');

            $response = Http::timeout($fleetleaksTimeout)
                ->withHeaders([
                    'User-Agent' => $fleetleaksUserAgent,
                    'Referer' => $fleetleaksReferer,
                ])
                ->acceptJson()
                ->get($fleetleaksUrl);

            if (! $response->successful()) {
                Log::warning('FleetLeaks API error', [
                    'status' => $response->status(),
                    'url' => $fleetleaksUrl,
                    'content_type' => $response->header('Content-Type'),
                    'server' => $response->header('Server'),
                ]);

                return ['status' => 'error', 'found' => false, 'results' => []];
            }

            $payload = $response->json();
            $allVessels = is_array($payload) ? $payload : ($payload['data'] ?? []);

            if (! is_array($allVessels) || empty($allVessels)) {
                $result = ['status' => 'ok', 'found' => false, 'results' => []];
                Cache::put($cacheKey, $result, self::CACHE_TTL);

                return $result;
            }

            $matches = [];
            $targetImo = $this->normalizeId($imoNumber);
            $targetMmsi = $this->normalizeId($mmsi);
            $targetName = $this->normalizeText($vesselName);

            foreach ($allVessels as $vessel) {
                if (! is_array($vessel)) {
                    continue;
                }

                $imoCandidate = $this->normalizeId($vessel['imo'] ?? null);
                $mmsiCandidate = $this->normalizeId($vessel['mmsi'] ?? null);
                $nameCandidate = $this->normalizeText($vessel['name'] ?? '');

                $isMatch = false;

                // Tier 1: Exact Numeric Identifier Match (Highest Confidence)
                // IMO and MMSI are prioritized over names because vessel names frequently change or are shared
                if ($targetImo !== '' && $imoCandidate !== '') {
                    if ($targetImo === $imoCandidate) {
                        $isMatch = true;
                    } else {
                        continue;
                    }
                }

                if (! $isMatch && $targetMmsi !== '' && $mmsiCandidate !== '') {
                    if ($targetMmsi === $mmsiCandidate) {
                        $isMatch = true;
                    } else {
                        continue;
                    }
                }

                if (! $isMatch && $targetName !== '' && $nameCandidate !== '') {
                    if ($targetName === $nameCandidate) {
                        $isMatch = true;
                    }
                }

                // Tier 2: Fuzzy Name Match (Informational)
                // Substring matching is used as a fallback but must be treated carefully
                // 'Ocean' matching 'Ocean Explorer' triggers a fuzzy match, which prevents it from being flagged as a high-confidence Official Designation
                $isFuzzyMatch = false;
                if (! $isMatch && $targetName !== '' && $nameCandidate !== '') {
                    if (str_contains($targetName, $nameCandidate) || str_contains($nameCandidate, $targetName)) {
                        $isFuzzyMatch = true;
                    }
                }

                if (! $isMatch && ! $isFuzzyMatch) {
                    continue;
                }

                $matches[] = [
                    'name' => ($vessel['name'] ?? '') !== '' ? $vessel['name'] : $vesselName,
                    'imo' => $vessel['imo'] ?? null,
                    'mmsi' => $vessel['mmsi'] ?? null,
                    'call_sign' => $vessel['call_sign'] ?? $vessel['callSign'] ?? null,
                    'flag' => $vessel['flag'] ?? null,
                    'vessel_type' => $vessel['vessel_type'] ?? null,
                    'sanctioned_by' => $this->asList($vessel['sanctioners'] ?? $vessel['sanctions'] ?? []),
                    'link' => $vessel['link'] ?? null,
                    'ais_status' => $vessel['ais_status'] ?? null,
                    'match_type' => $isMatch ? 'exact' : 'fuzzy',
                    'matched_name' => $vesselName,
                ];
            }

            $result = [
                'status' => 'ok',
                'found' => collect($matches)->where('match_type', 'exact')->isNotEmpty(),
                'count' => count($matches),
                'results' => array_slice($matches, 0, 25),
            ];

            Cache::put($cacheKey, $result, self::CACHE_TTL);

            return $result;

        } catch (\Throwable $e) {
            Log::error('FleetLeaks check error', [
                'error' => $e->getMessage(),
                'vessel' => $vesselName,
            ]);

            return ['status' => 'error', 'found' => false, 'results' => []];
        }
    }

    /**
     * Aggregate results from all sources and determine final verdict.
     */
    public function aggregateResults(array $result): array
    {
        $sources = $result['sources'] ?? [];
        $allMatches = [];
        $sourcesConfirming = [];
        $sanctionsCount = 0;

        foreach ($sources as $source => $data) {
            $sourceFound = ! empty($data['found']);
            $sourceResults = $data['results'] ?? [];

            if ($sourceFound || ! empty($sourceResults)) {
                $sanctionsCount++;
                $sourcesConfirming[] = $source;

                foreach ($sourceResults as $match) {
                    if (! is_array($match)) {
                        continue;
                    }

                    $allMatches[] = array_merge($match, ['source' => $source]);
                }
            }
        }

        $result['is_sanctioned'] = $sanctionsCount > 0;
        $result['sanctions_count'] = $sanctionsCount;
        $result['sources_confirming'] = $sourcesConfirming;
        $result['sanctions'] = $allMatches;
        $result['risk_level'] = $this->calculateRiskLevel($sanctionsCount);

        return $result;
    }

    /**
     * Calculate risk level based on how many sources confirm sanctions.
     */
    private function calculateRiskLevel(int $sourcesConfirming): string
    {
        return match ($sourcesConfirming) {
            0 => 'low',
            1 => 'medium',
            default => 'high',
        };
    }

    /**
     * Clear cache for a vessel and its source lookups.
     */
    public function clearCache(
        ?string $imoNumber = null,
        ?string $mmsi = null,
        ?string $callSign = null,
        ?string $vesselName = null
    ): void {
        Cache::forget($this->cacheKey($imoNumber, $mmsi, $callSign));

        if ($vesselName !== null) {
            Cache::forget($this->sourceCacheKey('sanctions_network', $vesselName, $imoNumber, null, null));
            Cache::forget($this->sourceCacheKey('fleetleaks', $vesselName, $imoNumber, $mmsi, $callSign));
        }
    }

    private function resolveVesselName(
        ?string $vesselName,
        ?string $imoNumber,
        ?string $mmsi,
        ?string $callSign
    ): string {
        // Ensures the API always has a string to query against even if the AIS broadcast lacks a vessel name
        // Prefixes prevent raw numbers from inadvertently matching short, numeric vessel names
        $candidate = trim((string) $vesselName);

        if ($candidate !== '') {
            return $candidate;
        }

        if ($imoNumber !== null && trim($imoNumber) !== '') {
            return 'IMO-'.trim($imoNumber);
        }

        if ($mmsi !== null && trim($mmsi) !== '') {
            return 'MMSI-'.trim($mmsi);
        }

        if ($callSign !== null && trim($callSign) !== '') {
            return 'CALLSIGN-'.trim($callSign);
        }

        return 'UNKNOWN VESSEL';
    }

    private function shouldCacheResult(array $result): bool
    {
        foreach (($result['sources'] ?? []) as $source) {
            if (($source['status'] ?? 'error') === 'ok') {
                return true;
            }
        }

        return false;
    }

    private function cacheKey(?string $imoNumber, ?string $mmsi, ?string $callSign): string
    {
        return self::CACHE_VERSION.':sanctions:vessel:'.sha1(implode('|', [
            (string) $imoNumber,
            (string) $mmsi,
            (string) $callSign,
        ]));
    }

    private function sourceCacheKey(
        string $source,
        string $vesselName,
        ?string $imoNumber,
        ?string $mmsi,
        ?string $callSign
    ): string {
        return self::CACHE_VERSION.':sanctions:'.$source.':'.sha1(implode('|', [
            $source,
            $this->normalizeText($vesselName),
            (string) $imoNumber,
            (string) $mmsi,
            (string) $callSign,
        ]));
    }

    private function normalizeText(?string $value): string
    {
        $value = $value ?? '';
        $value = mb_strtolower(trim($value));
        $value = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value) ?? $value;

        return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
    }

    private function normalizeScalar(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_array($value)) {
            return implode(' ', array_map([$this, 'normalizeScalar'], $value));
        }

        return $this->normalizeText((string) $value);
    }

    private function normalizeId(mixed $value): string
    {
        $scalar = (string) ($value ?? '');

        return preg_replace('/\D/', '', $scalar) ?? '';
    }

    private function textMatches(string $haystack, string $needle): bool
    {
        $needleNorm = $this->normalizeText($needle);
        $haystackNorm = $this->normalizeText($haystack);

        if ($needleNorm === '' || $haystackNorm === '') {
            return false;
        }

        return $needleNorm === $haystackNorm;
    }

    private function asList(mixed $value): array
    {
        if ($value === null) {
            return [];
        }

        if (is_array($value)) {
            return array_values(array_filter($value, static fn ($item) => $item !== null && $item !== ''));
        }

        if (is_string($value)) {
            $parts = array_map('trim', explode(',', $value));

            return array_values(array_filter($parts, static fn ($item) => $item !== ''));
        }

        return [$value];
    }

    private function dedupeResults(array $results, array $preferredKeys): array
    {
        $seen = [];
        $deduped = [];

        foreach ($results as $result) {
            if (! is_array($result)) {
                continue;
            }

            $parts = [];
            foreach ($preferredKeys as $key) {
                $parts[] = $this->normalizeScalar($result[$key] ?? null);
            }

            $signature = implode('|', $parts);
            if ($signature === '|' || isset($seen[$signature])) {
                continue;
            }

            $seen[$signature] = true;
            $deduped[] = $result;
        }

        return $deduped;
    }
}
