<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vessel;
use App\Models\VesselPosition;
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
     *
     * @response 200 scenario="Success" {
     * "data": [
     * {
     * "mmsi": 235000123,
     * "name": "SIST EXPLORER",
     * "lat": 50.1234,
     * "lng": -1.2345,
     * "speed": 14.5,
     * "course": 180.2,
     * "last_seen_at": "2026-04-02T12:00:00+00:00"
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

        if ($request->has(['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng'])) {
            $query->whereBetween('lat', [$request->sw_lat, $request->ne_lat])
                ->whereBetween('lng', [$request->sw_lng, $request->ne_lng]);
        }

        $vessels = $query->limit(1000)->get();

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
     * Retrieve the latest known state and location for a specific vessel from the SIST database.
     *
     * @urlParam mmsi integer required The Maritime Mobile Service Identity (MMSI) number. Example: 235000123
     *
     * @response 200 scenario="Vessel found" {
     * "mmsi": 235000123,
     * "name": "SIST EXPLORER",
     * "lat": 50.1234,
     * "lng": -1.2345,
     * "speed": 14.5,
     * "course": 180.2,
     * "last_seen_at": "2026-04-02T12:00:00+00:00"
     * }
     * @response 404 scenario="Vessel not found" {
     * "error": "Vessel not found in SIST records",
     * "mmsi": 999999999
     * }
     *
     * @responseField mmsi integer The unique 9-digit Maritime Mobile Service Identity.
     * @responseField name string The registered name of the vessel (if known).
     * @responseField lat number The last recorded latitude.
     * @responseField lng number The last recorded longitude.
     * @responseField speed number Speed over ground (SOG) in knots.
     * @responseField course number Course over ground (COG) in degrees.
     * @responseField last_seen_at string ISO 8601 timestamp of the last received AIS report.
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
     * @response 404 scenario="No history found" {
     * "error": "No history found for this time period"
     * }
     */
    public function history(Request $request, $mmsi): JsonResponse
    {
        if (! Vessel::where('mmsi', $mmsi)->exists()) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $hours = $request->input('hours', 24);

        $positions = VesselPosition::where('mmsi', $mmsi)
            ->where('recorded_at', '>=', now()->subHours($hours))
            ->orderBy('recorded_at', 'desc')
            ->get(['lat', 'lng', 'speed', 'course', 'recorded_at']);

        if ($positions->isEmpty()) {
            return response()->json(['error' => 'No history found for this time period'], 404);
        }

        return response()->json([
            'mmsi' => (int) $mmsi,
            'history' => $positions,
        ]);
    }
}
