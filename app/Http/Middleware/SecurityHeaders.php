<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Only apply security headers in non-local environments to avoid blocking Vite dev server
        if (! App::environment('local')) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
            $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
            $response->headers->set('X-Content-Type-Options', 'nosniff');
            $response->headers->set('X-XSS-Protection', '1; mode=block');
            $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
            $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');

            // Content Security Policy (CSP)
            $csp = "default-src 'self'; ".
                   "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://www.googletagmanager.com; ".
                   "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; ".
                   "img-src 'self' data: https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com https://www.google.com https://www.googletagmanager.com; ".
                   "font-src 'self' https://fonts.gstatic.com; ".
                   "connect-src 'self' https://sist.tristanbudd.com wss://* https://www.google-analytics.com; ".
                   "frame-ancestors 'none'; ".
                   'upgrade-insecure-requests';

            $response->headers->set('Content-Security-Policy', $csp);
        }

        return $response;
    }
}
