<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vessel;
use Illuminate\Http\JsonResponse;

/**
 * @group Vessel Intelligence
 *
 * Endpoints for querying and tracking maritime vessels within the SIST database.
 * These endpoints provide the latest AIS states, positions, and metadata for ships.
 */
class VesselController extends Controller
{
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
     * @param int $mmsi
     * @return JsonResponse
     */
    public function show($mmsi): JsonResponse
    {
        $vessel = Vessel::where('mmsi', $mmsi)->first();

        if (!$vessel) {
            return response()->json([
                'error' => 'Vessel not found in SIST records',
                'mmsi' => (int) $mmsi
            ], 404);
        }

        return response()->json($vessel);
    }
}