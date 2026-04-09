<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vessel;
use App\Models\VesselPosition;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

/**
 * @group Conditions
 *
 * Endpoints for environmental and marine conditions derived from the vessel's
 * latest known position. These endpoints provide weather and tide context to
 * support maritime situational awareness.
 */
class ConditionsController extends Controller
{
    /**
     * Vessel Weather Snapshot
     *
     * Returns weather conditions for a vessel's last known position.
     * The vessel's last position must be updated within the last 10 minutes.
     * Uses Open-Meteo.
     *
     * @urlParam mmsi integer required The Maritime Mobile Service Identity (MMSI) number. Example: 219225000
     */
    public function weather($mmsi): JsonResponse
    {
        $vessel = Vessel::where('mmsi', $mmsi)->first();

        if (! $vessel) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        if (! $vessel->last_seen_at || $vessel->last_seen_at->lt(now()->subMinutes(10))) {
            return response()->json([
                'error' => 'No recent vessel position found for this MMSI.',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $coordinates = $this->resolveConditionCoordinates($vessel);

        if (! $coordinates) {
            return response()->json([
                'error' => 'No recent vessel position found for this MMSI.',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $query = [
            'latitude' => $coordinates['latitude'],
            'longitude' => $coordinates['longitude'],
            'current_weather' => 'true',
            'hourly' => implode(',', [
                'temperature_2m',
                'apparent_temperature',
                'precipitation',
                'cloud_cover',
                'wind_speed_10m',
                'wind_direction_10m',
            ]),
            'daily' => implode(',', [
                'temperature_2m_max',
                'temperature_2m_min',
                'precipitation_sum',
                'wind_speed_10m_max',
                'weather_code',
            ]),
            'timezone' => 'auto',
        ];

        $response = Http::timeout(15)->get('https://api.open-meteo.com/v1/forecast', $query);

        if (! $response->successful()) {
            return response()->json([
                'error' => 'Unable to fetch weather data right now.',
                'provider_status' => $response->status(),
            ], 502);
        }

        $payload = $response->json();
        $currentWeather = $payload['current_weather'] ?? null;
        $hourly = $payload['hourly'] ?? [];
        $daily = $payload['daily'] ?? [];

        $hourlyEntries = [];
        $hourlyTimes = $hourly['time'] ?? [];
        $hourlyTemperature = $hourly['temperature_2m'] ?? [];
        $hourlyApparentTemperature = $hourly['apparent_temperature'] ?? [];
        $hourlyPrecipitation = $hourly['precipitation'] ?? [];
        $hourlyCloudCover = $hourly['cloud_cover'] ?? [];
        $hourlyWindSpeed = $hourly['wind_speed_10m'] ?? [];
        $hourlyWindDirection = $hourly['wind_direction_10m'] ?? [];

        $hourlyCount = min(count($hourlyTimes), 24);
        for ($index = 0; $index < $hourlyCount; $index++) {
            $hourlyEntries[] = [
                'time' => $hourlyTimes[$index] ?? null,
                'temperature_c' => $hourlyTemperature[$index] ?? null,
                'apparent_temperature_c' => $hourlyApparentTemperature[$index] ?? null,
                'precipitation_mm' => $hourlyPrecipitation[$index] ?? null,
                'cloud_cover_percent' => $hourlyCloudCover[$index] ?? null,
                'wind_speed_kph' => $hourlyWindSpeed[$index] ?? null,
                'wind_direction_degrees' => $hourlyWindDirection[$index] ?? null,
            ];
        }

        $dailyEntries = [];
        $dailyDates = $daily['time'] ?? [];
        $dailyTempMax = $daily['temperature_2m_max'] ?? [];
        $dailyTempMin = $daily['temperature_2m_min'] ?? [];
        $dailyPrecipitation = $daily['precipitation_sum'] ?? [];
        $dailyWindMax = $daily['wind_speed_10m_max'] ?? [];
        $dailyWeatherCode = $daily['weather_code'] ?? [];

        $dailyCount = min(count($dailyDates), 7);
        for ($index = 0; $index < $dailyCount; $index++) {
            $dailyEntries[] = [
                'date' => $dailyDates[$index] ?? null,
                'temperature_max_c' => $dailyTempMax[$index] ?? null,
                'temperature_min_c' => $dailyTempMin[$index] ?? null,
                'precipitation_sum_mm' => $dailyPrecipitation[$index] ?? null,
                'wind_speed_max_kph' => $dailyWindMax[$index] ?? null,
                'weather_code' => $dailyWeatherCode[$index] ?? null,
            ];
        }

        return response()->json([
            'mmsi' => (int) $mmsi,
            'vessel' => [
                'name' => $vessel->name,
                'last_seen_at' => $vessel->last_seen_at?->toIso8601String(),
                'position_age_seconds' => $vessel->last_seen_at ? $vessel->last_seen_at->diffInSeconds(now()) : null,
            ],
            'position' => [
                'lat' => $coordinates['latitude'],
                'lng' => $coordinates['longitude'],
            ],
            'current' => $currentWeather ? [
                'time' => $currentWeather['time'] ?? null,
                'temperature_c' => $currentWeather['temperature'] ?? null,
                'apparent_temperature_c' => $currentWeather['apparent_temperature'] ?? null,
                'wind_speed_kph' => $currentWeather['windspeed'] ?? null,
                'wind_direction_degrees' => $currentWeather['winddirection'] ?? null,
                'wind_gusts_kph' => $currentWeather['windgusts'] ?? null,
                'weather_code' => $currentWeather['weathercode'] ?? null,
                'is_day' => $currentWeather['is_day'] ?? null,
            ] : null,
            'hourly' => $hourlyEntries,
            'daily' => $dailyEntries,
            'source' => 'open-meteo.com',
        ]);
    }

    /**
     * Vessel Tide Snapshot
     *
     * Returns tide and marine conditions for a vessel's last known position.
     * The vessel's last position must be updated within the last 10 minutes.
     * Uses Open-Meteo Marine.
     *
     * @urlParam mmsi integer required The Maritime Mobile Service Identity (MMSI) number. Example: 219225000
     */
    public function tides($mmsi): JsonResponse
    {
        $vessel = Vessel::where('mmsi', $mmsi)->first();

        if (! $vessel) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        if (! $vessel->last_seen_at || $vessel->last_seen_at->lt(now()->subMinutes(10))) {
            return response()->json([
                'error' => 'No recent vessel position found for this MMSI.',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $coordinates = $this->resolveConditionCoordinates($vessel);

        if (! $coordinates) {
            return response()->json([
                'error' => 'No recent vessel position found for this MMSI.',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        try {
            $tideData = $this->fetchOpenMeteoMarine($coordinates['latitude'], $coordinates['longitude']);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Unable to fetch tide data right now.',
                'details' => $e->getMessage(),
            ], 502);
        }

        $response = [
            'mmsi' => (int) $mmsi,
            'vessel' => [
                'name' => $vessel->name,
                'last_seen_at' => $vessel->last_seen_at?->toIso8601String(),
                'position_age_seconds' => $vessel->last_seen_at ? $vessel->last_seen_at->diffInSeconds(now()) : null,
            ],
            'position' => [
                'lat' => $coordinates['latitude'],
                'lng' => $coordinates['longitude'],
            ],
            'current' => $tideData['current'] ?? null,
            'predictions' => $tideData['predictions'] ?? [],
            'metadata' => $tideData['metadata'] ?? [],
            'source' => $tideData['source'],
        ];

        return response()->json($response);
    }

    private function resolveConditionCoordinates(Vessel $vessel): ?array
    {
        if ($vessel->lat !== null && $vessel->lng !== null) {
            return [
                'latitude' => (float) $vessel->lat,
                'longitude' => (float) $vessel->lng,
            ];
        }

        $position = VesselPosition::where('mmsi', $vessel->mmsi)
            ->where('recorded_at', '>=', now()->subMinutes(10))
            ->whereNotNull('lat')
            ->whereNotNull('lng')
            ->orderByDesc('recorded_at')
            ->first();

        if (! $position) {
            return null;
        }

        return [
            'latitude' => (float) $position->lat,
            'longitude' => (float) $position->lng,
        ];
    }

    private function fetchOpenMeteoMarine(float $latitude, float $longitude): array
    {
        $response = Http::timeout(20)->get('https://marine-api.open-meteo.com/v1/marine', [
            'latitude' => $latitude,
            'longitude' => $longitude,
            'current' => implode(',', [
                'sea_level_height_msl',
                'ocean_current_velocity',
                'ocean_current_direction',
                'wave_height',
                'wave_direction',
                'wave_period',
            ]),
            'hourly' => implode(',', [
                'sea_level_height_msl',
                'ocean_current_velocity',
                'ocean_current_direction',
                'wave_height',
                'wave_direction',
                'wave_period',
            ]),
            'daily' => implode(',', [
                'wave_height_max',
                'wave_direction_dominant',
                'wave_period_max',
            ]),
            'timezone' => 'auto',
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Open-Meteo Marine request failed.');
        }

        $payload = $response->json();
        $current = $payload['current'] ?? null;
        $hourly = $payload['hourly'] ?? [];
        $daily = $payload['daily'] ?? [];

        $hourlyEntries = [];
        $hourlyTimes = $hourly['time'] ?? [];
        $hourlySeaLevel = $hourly['sea_level_height_msl'] ?? [];
        $hourlyCurrentVelocity = $hourly['ocean_current_velocity'] ?? [];
        $hourlyCurrentDirection = $hourly['ocean_current_direction'] ?? [];
        $hourlyWaveHeight = $hourly['wave_height'] ?? [];
        $hourlyWaveDirection = $hourly['wave_direction'] ?? [];
        $hourlyWavePeriod = $hourly['wave_period'] ?? [];

        $hourlyCount = min(count($hourlyTimes), 24);
        for ($index = 0; $index < $hourlyCount; $index++) {
            $entry = [
                'time' => $hourlyTimes[$index] ?? null,
                'sea_level_height_msl' => $hourlySeaLevel[$index] ?? null,
                'ocean_current_velocity' => $hourlyCurrentVelocity[$index] ?? null,
                'ocean_current_direction' => $hourlyCurrentDirection[$index] ?? null,
                'wave_height' => $hourlyWaveHeight[$index] ?? null,
                'wave_direction' => $hourlyWaveDirection[$index] ?? null,
                'wave_period' => $hourlyWavePeriod[$index] ?? null,
            ];

            $hourlyEntries[] = $entry;
        }

        $dailyEntries = [];
        $dailyTimes = $daily['time'] ?? [];
        $dailyWaveHeightMax = $daily['wave_height_max'] ?? [];
        $dailyWaveDirectionDominant = $daily['wave_direction_dominant'] ?? [];
        $dailyWavePeriodMax = $daily['wave_period_max'] ?? [];

        $dailyCount = min(count($dailyTimes), 7);
        for ($index = 0; $index < $dailyCount; $index++) {
            $dailyEntries[] = [
                'date' => $dailyTimes[$index] ?? null,
                'wave_height_max' => $dailyWaveHeightMax[$index] ?? null,
                'wave_direction_dominant' => $dailyWaveDirectionDominant[$index] ?? null,
                'wave_period_max' => $dailyWavePeriodMax[$index] ?? null,
            ];
        }

        return [
            'provider' => 'open-meteo',
            'current' => $current ? [
                'time' => $current['time'] ?? null,
                'sea_level_height_msl' => $current['sea_level_height_msl'] ?? null,
                'ocean_current_velocity' => $current['ocean_current_velocity'] ?? null,
                'ocean_current_direction' => $current['ocean_current_direction'] ?? null,
                'wave_height' => $current['wave_height'] ?? null,
                'wave_direction' => $current['wave_direction'] ?? null,
                'wave_period' => $current['wave_period'] ?? null,
            ] : null,
            'predictions' => $hourlyEntries,
            'metadata' => [
                'timezone' => $payload['timezone'] ?? null,
            ],
            'source' => 'open-meteo.com',
        ];
    }
}
