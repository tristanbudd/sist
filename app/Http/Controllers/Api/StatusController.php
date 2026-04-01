<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

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
            'status'      => 'online',
            'service'     => 'SIST | Ship Intelligence & Suspicion Tracker',
            'version'     => config('app.version', '1.0.0'),
            'environment' => app()->environment(),
            'timestamp'   => now()->toIso8601String(),
        ]);
    }

    /**
     * Readiness Check
     *
     * Checks all critical service dependencies and reports their individual health.
     * Returns 200 when the application is ready for production traffic, 503 when
     * one or more dependencies are degraded. Use as a readiness probe.
     *
     * @unauthenticated
     *
     * @response 200 scenario="All systems operational" {
     *   "status": "healthy",
     *   "checks": {
     *     "database": { "status": "ok", "latency_ms": 3 },
     *     "cache":    { "status": "ok", "latency_ms": 1 }
     *   },
     *   "timestamp": "2026-01-01T12:00:00+00:00"
     * }
     *
     * @response 503 scenario="Dependency degraded" {
     *   "status": "degraded",
     *   "checks": {
     *     "database": { "status": "error", "message": "SQLSTATE[HY000]: Connection refused" },
     *     "cache":    { "status": "ok", "latency_ms": 1 }
     *   },
     *   "timestamp": "2026-01-01T12:00:00+00:00"
     * }
     *
     * @responseField status string Aggregate health: `healthy` if all checks pass, `degraded` if any fail.
     * @responseField checks object Map of dependency name to its individual health result.
     * @responseField checks.*.status string `ok` or `error` for this dependency.
     * @responseField checks.*.latency_ms integer Round-trip time in milliseconds (present on success).
     * @responseField checks.*.message string Error detail (present on failure only).
     * @responseField timestamp string ISO 8601 server timestamp at time of response.
     */
    public function ready(): JsonResponse
    {
        $checks = [];
        $healthy = true;

        // Database check
        try {
            $start = hrtime(true);
            DB::select('SELECT 1');
            $checks['database'] = [
                'status'     => 'ok',
                'latency_ms' => (int) ((hrtime(true) - $start) / 1_000_000),
            ];
        } catch (\Throwable $e) {
            $healthy = false;
            $checks['database'] = [
                'status'  => 'error',
                'message' => $e->getMessage(),
            ];
        }

        // Cache check
        try {
            $start = hrtime(true);
            Cache::set('_healthcheck', true, 5);
            $checks['cache'] = [
                'status'     => 'ok',
                'latency_ms' => (int) ((hrtime(true) - $start) / 1_000_000),
            ];
        } catch (\Throwable $e) {
            $healthy = false;
            $checks['cache'] = [
                'status'  => 'error',
                'message' => $e->getMessage(),
            ];
        }

        return response()->json([
            'status'    => $healthy ? 'healthy' : 'degraded',
            'checks'    => $checks,
            'timestamp' => now()->toIso8601String(),
        ], $healthy ? 200 : 503);
    }
}
