<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <!-- Page Title -->
        <title inertia>{{ config('app.name', 'SIST') }}</title>

        <!-- Meta Tags: Accessibility -->
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <!-- Meta Tags: Compatibility -->
        <meta name="robots" content="index, follow">
        <meta name="apple-mobile-web-app-title" content="SIST" />
        <link rel="manifest" href="{{ asset('site.webmanifest') }}" />

        <!-- Meta Tags: SEO -->
        <meta name="description" content="SIST (Ship Intelligence & Suspicion Tracker) - A modern AIS monitoring and analysis platform designed to detect suspicious vessel activity, anomalies, and patterns in maritime data.">
        <meta name="keywords" content="sist, maritime-security, maritime-intelligence, maritime-analytics, maritime-surveillance, maritime-monitoring, react, php, shipping, laravel, typescript, spa, geospatial, gis, data-visualization, real-time-data, ais, anomaly-detection, tailwindcss, vite, inertiajs, maritime-data, vessel-tracking">
        <meta name="author" content="Tristan Budd (https://tristanbudd.com)">
        
        <!-- Meta Tags: Opengraph -->
        <meta property="og:title" content="SIST - Ship Intelligence & Suspicion Tracker">
        <meta property="og:description" content="SIST (Ship Intelligence & Suspicion Tracker) - A modern AIS monitoring and analysis platform designed to detect suspicious vessel activity, anomalies, and patterns in maritime data.">
        <meta property="og:image" content="{{ asset('images/sist-opengraph.png') }}">
        <meta property="og:image:alt" content="SIST - Ship Intelligence & Suspicion Tracker">
        <meta property="og:url" content="{{ url('/') }}">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="SIST">
        <meta property="og:locale" content="en_GB">

        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:title" content="SIST - Ship Intelligence & Suspicion Tracker">
        <meta property="twitter:description" content="SIST (Ship Intelligence & Suspicion Tracker) - A modern AIS monitoring and analysis platform designed to detect suspicious vessel activity, anomalies, and patterns in maritime data.">
        <meta property="twitter:image" content="{{ asset('images/sist-opengraph.png') }}">
        <meta property="twitter:site" content="@tristanbudd">

        <!-- Favicon -->
        <link rel="icon" type="image/png" href="{{ asset('favicon-96x96.png') }}" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="{{ asset('favicon.svg') }}" />
        <link rel="shortcut icon" href="{{ asset('favicon.ico') }}" />
        <link rel="apple-touch-icon" sizes="180x180" href="{{ asset('apple-touch-icon.png') }}" />

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap" rel="stylesheet">

        <!-- Scripts -->
        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx'])
        @inertiaHead
    </head>
    <body>
        @inertia
    </body>
</html>
