<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vessel;
use App\Models\VesselPosition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

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
     * "flag_country": "Denmark",
     * "flag_code": "DK",
     * "flag_continent": "Europe",
     * "flag_local_time": "2026-04-02 16:15:00",
     * "flag_timezone": "Europe/Copenhagen"
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
     * "flag_country": "Denmark",
     * "flag_code": "DK",
     * "flag_continent": "Europe",
     * "flag_local_time": "2026-04-02 16:15:00",
     * "flag_timezone": "Europe/Copenhagen"
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
     * @responseField flag_country string The country of registry extracted from the MMSI's MID.
     * @responseField flag_code string The ISO 3166-1 alpha-2 country code of the registry.
     * @responseField flag_continent string The continent of the vessel's registry.
     * @responseField flag_local_time string The calculated current local time in the vessel's registry.
     * @responseField flag_timezone string The IANA timezone string for the vessel's registry.
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

    /**
     * Vessel Weather Snapshot
     *
     * Returns a weather snapshot for a vessel's most recent position when the vessel
     * has been updated within the last 10 minutes (Uses Open-Meteo).
     *
     * @group Weather
     *
     * @urlParam mmsi integer required The Maritime Mobile Service Identity (MMSI) number. Example: 219225000
     *
     * @response 200 scenario="Weather found" {
     *   "mmsi": 219225000,
     *   "vessel": {
     *     "name": "MAERSK NORFOLK",
     *     "last_seen_at": "2026-04-07T12:00:00+00:00",
     *     "position_age_seconds": 180
     *   },
     *   "position": {
     *     "lat": 51.9542,
    *     "lng": 1.2589
     *   },
     *   "current": {
     *     "time": "2026-04-07T12:00",
     *     "temperature_c": 12.4,
     *     "apparent_temperature_c": 10.8,
     *     "wind_speed_kph": 24.1,
     *     "wind_direction_degrees": 188,
     *     "wind_gusts_kph": 32.8,
     *     "weather_code": 3,
     *     "is_day": 1
     *   },
     *   "hourly": [
     *     {
     *       "time": "2026-04-07T12:00",
     *       "temperature_c": 12.4,
     *       "precipitation_mm": 0,
     *       "cloud_cover_percent": 72,
     *       "wind_speed_kph": 24.1,
     *       "wind_direction_degrees": 188
     *     }
     *   ],
     *   "daily": [
     *     {
     *       "date": "2026-04-07",
     *       "temperature_max_c": 14.7,
     *       "temperature_min_c": 8.9,
     *       "precipitation_sum_mm": 1.2,
     *       "wind_speed_max_kph": 36.1,
     *       "weather_code": 61
     *     }
     *   ],
     *   "source": "open-meteo.com"
     * }
     * @response 404 scenario="No recent vessel position" {
     *   "error": "No recent vessel position found for this MMSI."
     * }
     * @response 502 scenario="Weather provider failure" {
     *   "error": "Unable to fetch weather data right now."
     * }
     *
     * @param  int  $mmsi
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

        $position = VesselPosition::where('mmsi', $mmsi)
            ->where('recorded_at', '>=', now()->subMinutes(10))
            ->orderByDesc('recorded_at')
            ->first();

        $latitude = $vessel->lat ?? $position?->lat;
        $longitude = $vessel->lng ?? $position?->lng;

        if ($latitude === null || $longitude === null) {
            return response()->json([
                'error' => 'No recent vessel position found for this MMSI.',
                'mmsi' => (int) $mmsi,
            ], 404);
        }

        $query = [
            'latitude' => $latitude,
            'longitude' => $longitude,
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
                'lat' => $latitude,
                'lng' => $longitude,
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
}
