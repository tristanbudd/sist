<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vessel;
use App\Models\VesselPosition;
use App\Services\SanctionsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @group Vessel Intelligence
 *
 * Endpoints for querying and tracking maritime vessels within the SIST database.
 * These endpoints provide the latest AIS states, positions, and metadata for ships.
 */
class VesselController extends Controller
{
    /**
     * List Active Fleet
     *
     * Retrieve a list of recently active vessels. Supports spatial bounding box filtering
     * to only return vessels currently visible on the user's map interface.
     *
     * @queryParam sw_lat float South-West Latitude (Bounding Box). Example: 49.0
     * @queryParam sw_lng float South-West Longitude (Bounding Box). Example: -5.0
     * @queryParam ne_lat float North-East Latitude (Bounding Box). Example: 51.5
     * @queryParam ne_lng float North-East Longitude (Bounding Box). Example: 2.0
     * @queryParam age_minutes integer Filter out vessels not seen in this many minutes. Defaults to 60 (1 hour). Example: 30
     * @queryParam offset integer The number of records to skip. Use with a limit of 2500 for pagination. Example: 2500
     *
     * @response 200 scenario="Success" {
     * "data": [
     * {
     * "mmsi": 219225000,
     * "imo": 9326093,
     * "name": "MAERSK NORFOLK",
     * "lat": 51.9542,
     * "lng": 1.2589,
     * "course": 210.0
     * }
     * ]
     * }
     * @response 404 scenario="No vessels found" {
     * "message": "No active vessels found in the specified area or timeframe."
     * }
     */
    public function index(Request $request): JsonResponse
    {
        $query = Vessel::query();

        $age = $request->input('age_minutes', 60);
        $query->where('last_seen_at', '>=', now()->subMinutes($age));

        $ignoredNames = ['--'];
        $query->whereNotNull('name')
            ->whereNotIn('name', $ignoredNames);

        if ($request->has(['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng'])) {
            $query->whereBetween('lat', [(float) $request->sw_lat, (float) $request->ne_lat])
                ->whereBetween('lng', [(float) $request->sw_lng, (float) $request->ne_lng]);
        }

        $vessels = $query->orderBy('last_seen_at', 'desc')
            ->offset($request->input('offset', 0))
            ->limit(2500)
            ->get([
                'mmsi',
                'imo',
                'name',
                'lat',
                'lng',
                'course',
            ])
            ->map(fn ($vessel) => [
                'mmsi' => (int) $vessel->mmsi,
                'imo' => (int) $vessel->imo,
                'name' => $vessel->name,
                'lat' => (float) $vessel->lat,
                'lng' => (float) $vessel->lng,
                'course' => (float) $vessel->course,
            ]);

        if ($vessels->isEmpty()) {
            return response()->json([
                'message' => 'No active vessels found in the specified area or timeframe.',
            ], 404);
        }

        return response()->json([
            'data' => $vessels,
        ]);
    }

    /**
     * Lookup Vessel by MMSI
     *
     * Retrieve the latest known state, identity, and location for a specific vessel from the SIST database.
     *
     * @urlParam mmsi integer required The Maritime Mobile Service Identity (MMSI) number. Example: 219225000
     *
     * @response 200 scenario="Vessel found" {
     * "mmsi": 219225000,
     * "imo": 9326093,
     * "name": "MAERSK NORFOLK",
     * "call_sign": "OWDQ2",
     * "type": 70,
     * "navigational_status": 0,
     * "lat": 51.9542,
     * "lng": 1.2589,
     * "speed": 18.5,
     * "course": 210.0,
     * "heading": 212,
     * "length": 299,
     * "width": 40,
     * "draught": 12.5,
     * "destination": "FELIXSTOWE",
     * "eta": "2026-04-03T14:30:00.000000Z",
     * "last_seen_at": "2026-04-02T14:15:00.000000Z",
     * "nav_status_text": "Under way using engine",
     * "vessel_type_text": "Cargo",
     * "flying_flag": "DK",
     * "flying_flag_country": "Denmark",
     * "flying_flag_continent": "Europe",
     * "flying_flag_local_time": "2026-04-02 16:15:00",
     * "flying_flag_timezone": "Europe/Copenhagen",
     * "registry_country": "Denmark",
     * "registry_country_code": "DK",
     * "registry_continent": "Europe",
     * "registry_local_time": "2026-04-02 16:15:00",
     * "registry_timezone": "Europe/Copenhagen"
     * }
     * @response 404 scenario="Vessel not found" {
     * "error": "Vessel not found in SIST records",
     * "mmsi": 999999999
     * }
     *
     * @responseField mmsi integer The unique 9-digit Maritime Mobile Service Identity.
     * @responseField imo integer The unique 7-digit International Maritime Organization identifier.
     * @responseField name string The registered name of the vessel.
     * @responseField call_sign string The vessel's unique radio call sign.
     * @responseField type integer The raw AIS vessel type code (e.g., 70 for Cargo).
     * @responseField navigational_status integer The raw AIS navigational status code.
     * @responseField lat number The last recorded latitude.
     * @responseField lng number The last recorded longitude.
     * @responseField speed number Speed over ground (SOG) in knots.
     * @responseField course number Course over ground (COG) in degrees.
     * @responseField heading integer The true heading of the vessel in degrees (if available).
     * @responseField length integer The length of the vessel in meters (calculated from dimensions).
     * @responseField width integer The width of the vessel in meters (calculated from dimensions).
     * @responseField draught number The maximum static draught of the vessel in meters.
     * @responseField destination string The crew-reported destination.
     * @responseField eta string ISO 8601 estimated time of arrival (crew-reported).
     * @responseField last_seen_at string ISO 8601 timestamp of the last received AIS report.
     * @responseField nav_status_text string Human-readable translation of the navigational status.
     * @responseField vessel_type_text string Human-readable translation of the vessel's classification.
     * @responseField flying_flag string The 2-letter flag code from the vessel's current AIS transmission.
     * @responseField flying_flag_country string The country corresponding to the current flying flag.
     * @responseField flying_flag_continent string The continent of the current flying flag.
     * @responseField flying_flag_local_time string The calculated current local time based on the flying flag's timezone.
     * @responseField flying_flag_timezone string The IANA timezone string for the current flying flag.
     * @responseField registry_country string The country of registry extracted from the MMSI's MID (home port).
     * @responseField registry_country_code string The ISO 3166-1 alpha-2 country code of the registry.
     * @responseField registry_continent string The continent of the vessel's registry (home port).
     * @responseField registry_local_time string The calculated current local time in the vessel's registry.
     * @responseField registry_timezone string The IANA timezone string for the vessel's registry.
     *
     * @param  int  $mmsi
     */
    public function show($mmsi): JsonResponse
    {
        $vessel = Vessel::where('mmsi', $mmsi)->first();

        if (! $vessel) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        return response()->json($vessel);
    }

    /**
     * Get Vessel History
     *
     * Retrieve the historical breadcrumb trail (trajectory) for a specific vessel,
     * ordered from newest to oldest.
     *
     * @urlParam mmsi integer required The MMSI of the vessel. Example: 235000123
     *
     * @queryParam hours integer Number of past hours to retrieve. Defaults to 24. Example: 48
     *
     * @response 200 scenario="History found" {
     * "mmsi": 235000123,
     * "history": [
     * {
     * "lat": 50.1234,
     * "lng": -1.2345,
     * "speed": 14.5,
     * "course": 180.2,
     * "recorded_at": "2026-04-02T12:00:00+00:00"
     * }
     * ]
     * }
     * @response 404 scenario="Vessel not found or no history found" {
     * "error": "No history found for this time period",
     * "reason": "no_history_found",
     * "mmsi": 235000123
     * }
     */
    public function history(Request $request, string $mmsi): JsonResponse
    {
        if (! Vessel::where('mmsi', $mmsi)->exists()) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'reason' => 'vessel_not_found',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $hours = $request->input('hours', 24);

        $positions = VesselPosition::where('mmsi', $mmsi)
            ->where('recorded_at', '>=', now()->subHours($hours))
            ->orderBy('recorded_at', 'desc')
            ->get([
                'mmsi',
                'lat',
                'lng',
                'speed',
                'course',
                'heading',
                'navigational_status',
                'rate_of_turn',
                'position_accuracy',
                'raim',
                'recorded_at',
            ]);

        // Transform to pair numeric values with their text equivalents
        $history = $positions->map(function ($position) {
            return [
                'lat' => $position->lat,
                'lng' => $position->lng,
                'speed' => $position->speed,
                'course' => $position->course,
                'heading' => $position->heading,
                'nav_status' => $position->navigational_status,
                'nav_status_text' => $position->nav_status_text,
                'rate_of_turn' => $position->rate_of_turn,
                'position_accuracy' => $position->position_accuracy,
                'raim' => $position->raim,
                'recorded_at' => $position->recorded_at,
            ];
        });

        if ($positions->isEmpty()) {
            return response()->json([
                'error' => 'No history found for this time period',
                'reason' => 'no_history_found',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        return response()->json([
            'mmsi' => (int) $mmsi,
            'history' => $history,
        ]);
    }

    /**
     * Check Sanctions Status
     *
     * Check if a vessel is listed on international sanctions lists using multiple sources:
     * - sanctions.network (OFAC SDN, UN, EU sanctions lists)
     * - FleetLeaks (sanctioned vessel map data)
     *
     * @urlParam mmsi integer required The MMSI of the vessel. Example: 219225000
     *
     * @queryParam force_refresh boolean Force refresh cached data (default: false). Example: false
     *
     * @response 200 scenario="Vessel checked" {
     * "vessel_name": "LIGOVSKY PROSPECT",
     * "imo": 9256066,
     * "mmsi": 273251810,
     * "call_sign": "UBRZ6",
     * "is_sanctioned": true,
     * "risk_level": "medium",
     * "sanctions_count": 1,
     * "sources_confirming": ["sanctions_network"],
     * "checked_at": "2026-04-13T12:20:07+00:00",
     * "sources": {
     * "sanctions_network": {
     * "status": "ok",
     * "found": true,
     * "count": 1,
     * "results": [
     * {
     * "name": "LIGOVSKY PROSPECT",
     * "source": "ofac",
     * "source_id": "46288",
     * "matched_name": "LIGOVSKY PROSPECT"
     * }
     * ]
     * },
     * "fleetleaks": {
     * "status": "ok",
     * "found": false,
     * "results": []
     * }
     * }
     * }
     * @response 404 scenario="Vessel not found in SIST records" {
     * "error": "Vessel not found in SIST records",
     * "mmsi": 999999999
     * }
     * @response 422 scenario="Insufficient vessel data" {
     * "error": "Insufficient vessel data for sanctions check",
     * "mmsi": 999999999
     * }
     *
     * @param  int  $mmsi
     */
    public function checkSanctions(Request $request, $mmsi, SanctionsService $sanctionsService): JsonResponse
    {
        $vessel = Vessel::where('mmsi', $mmsi)->first();

        if (! $vessel) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        // Validate vessel has identifying information
        if (! $vessel->name && ! $vessel->imo && ! $vessel->mmsi && ! $vessel->call_sign) {
            return response()->json([
                'error' => 'Insufficient vessel data for sanctions check',
                'mmsi' => (int) $mmsi,
            ], 422);
        }

        $forceRefresh = $request->boolean('force_refresh');

        $result = $sanctionsService->checkVessel(
            $vessel->name ?? "MMSI-{$vessel->mmsi}",
            $vessel->imo ? (string) $vessel->imo : null,
            $vessel->mmsi ? (string) $vessel->mmsi : null,
            $vessel->call_sign,
            $forceRefresh
        );

        // Build clean response matching API style
        return response()->json([
            'mmsi' => (int) $mmsi,
            'imo' => $vessel->imo,
            'name' => $result['vessel_name'],
            'call_sign' => $vessel->call_sign,
            'is_sanctioned' => $result['is_sanctioned'],
            'sanctions_count' => $result['sanctions_count'],
            'risk_level' => $result['risk_level'],
            'sources_confirming' => $result['sources_confirming'],
            'sanctions' => $result['sanctions'],
            'checked_at' => $result['checked_at'],
            'sources' => $result['sources'],
        ]);
    }
}
