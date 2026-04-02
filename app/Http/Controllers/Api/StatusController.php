<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

use App\Models\Vessel;

use Carbon\Carbon;

/**
 * @group System Health
 *
 * Endpoints for monitoring the operational status of the SIST engine.
 * These endpoints are unauthenticated and suitable for uptime monitors,
 * load balancers, and orchestration platforms (e.g. Kubernetes probes).
 */
class StatusController extends Controller
{
    /**
     * Health Check
     *
     * Returns the current operational status of the SIST API, including environment
     * metadata and a live server timestamp. Performs no database I/O and is safe
     * to poll at high frequency. Use as a liveness probe.
     *
     * @unauthenticated
     *
     * @response 200 scenario="Healthy" {
     *   "status": "online",
     *   "service": "SIST | Ship Intelligence & Suspicion Tracker",
     *   "version": "1.0.0",
     *   "environment": "production",
     *   "timestamp": "2026-01-01T12:00:00+00:00"
     * }
     *
     * @responseField status string The operational state of the API. Always `online` when reachable.
     * @responseField service string Human-readable service identifier.
     * @responseField version string Semantic version of the deployed application.
     * @responseField environment string Active Laravel environment (`production`, `staging`, `local`).
     * @responseField timestamp string ISO 8601 server timestamp at time of response.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'status' => 'online',
            'service' => 'SIST | Ship Intelligence & Suspicion Tracker',
            'version' => config('app.version', '1.0.0'),
            'environment' => app()->environment(),
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    /**
     * Readiness Check
     *
     * Checks all critical service dependencies and reports their individual health, 
     * including verifying that the background AIS WebSocket ingestion is actively receiving data.
     * Returns 200 when the application is ready, 503 when one or more dependencies are down.
     *
     * @unauthenticated
     *
     * @response 200 scenario="All systems operational" {
     * "status": "healthy",
     * "checks": {
     * "database": { "status": "ok", "latency_ms": 3 },
     * "cache":    { "status": "ok", "latency_ms": 1 },
     * "ais_stream": { "status": "ok", "latency_ms": 5, "last_message_age_seconds": 12 }
     * },
     * "timestamp": "2026-01-01T12:00:00+00:00"
     * }
     * @response 503 scenario="Dependency degraded" {
     * "status": "degraded",
     * "checks": {
     * "database": { "status": "ok", "latency_ms": 2 },
     * "cache":    { "status": "ok", "latency_ms": 1 },
     * "ais_stream": { "status": "error", "message": "No AIS data received in the last 15 minutes." }
     * },
     * "timestamp": "2026-01-01T12:00:00+00:00"
     * }
     *
     * @responseField status string Aggregate health: `healthy` if all checks pass, `degraded` if any fail.
     * @responseField checks object Map of dependency name to its individual health result.
     * @responseField checks.*.status string `ok`, `degraded`, or `error` for this dependency.
     * @responseField checks.*.latency_ms integer Round-trip time in milliseconds (present on success).
     * @responseField checks.*.message string Error detail (present on failure or degradation).
     * @responseField checks.ais_stream.last_message_age_seconds integer Seconds since the last ship was updated.
     * @responseField timestamp string ISO 8601 server timestamp at time of response.
     */
    public function ready(): JsonResponse
    {
        $checks = [];
        $healthy = true;
        $httpCode = 200;

        try {
            $start = hrtime(true);
            DB::select('SELECT 1');
            $checks['database'] = [
                'status' => 'ok',
                'latency_ms' => (int) ((hrtime(true) - $start) / 1_000_000),
            ];
        } catch (\Throwable $e) {
            $healthy = false;
            $httpCode = 503;
            $checks['database'] = [
                'status' => 'error',
                'message' => 'Database unreachable: ' . $e->getMessage(),
            ];
        }

        try {
            $start = hrtime(true);
            Cache::set('_healthcheck', true, 5);
            $checks['cache'] = [
                'status' => 'ok',
                'latency_ms' => (int) ((hrtime(true) - $start) / 1_000_000),
            ];
        } catch (\Throwable $e) {
            $healthy = false;
            $httpCode = 503;
            $checks['cache'] = [
                'status' => 'error',
                'message' => 'Cache unreachable: ' . $e->getMessage(),
            ];
        }

        if ($checks['database']['status'] === 'ok') {
            try {
                $start = hrtime(true);

                $latestPing = Vessel::max('last_seen_at');
                
                if (!$latestPing) {
                    throw new \Exception("No vessel data exists in the database.");
                }

                $latestPingDate = Carbon::parse($latestPing);
                $secondsSinceLastPing = $latestPingDate->diffInSeconds(now());
                $latencyMs = (int) ((hrtime(true) - $start) / 1_000_000);

                if ($secondsSinceLastPing <= 60) {
                    $checks['ais_stream'] = [
                        'status' => 'ok',
                        'latency_ms' => $latencyMs,
                        'last_message_age_seconds' => $secondsSinceLastPing
                    ];
                } elseif ($secondsSinceLastPing <= 300) {
                    $healthy = false; 
                    $checks['ais_stream'] = [
                        'status' => 'degraded',
                        'latency_ms' => $latencyMs,
                        'last_message_age_seconds' => $secondsSinceLastPing,
                        'message' => "AIS stream is lagging. Last message was {$secondsSinceLastPing} seconds ago."
                    ];
                } else {
                    throw new \Exception("No AIS data received in the last 15 minutes.");
                }

            } catch (\Throwable $e) {
                $healthy = false;
                $httpCode = 503;
                $checks['ais_stream'] = [
                    'status' => 'error',
                    'message' => $e->getMessage(),
                ];
            }
        } else {
            $checks['ais_stream'] = [
                'status' => 'error',
                'message' => 'Skipped due to Database failure.',
            ];
        }

        return response()->json([
            'status' => $healthy ? 'healthy' : 'degraded',
            'checks' => $checks,
            'timestamp' => now()->toIso8601String(),
        ], $httpCode);
    }
}
