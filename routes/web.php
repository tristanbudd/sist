<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/* Main application route */
Route::get('/', function () {
    return Inertia::render('Index');
});

/* Redirects */
Route::redirect('/documentation', '/docs');

/* API Routes */
use App\Http\Controllers\Api\StatusController;
use App\Http\Controllers\Api\VesselController;

Route::prefix('api')->group(function () {
    Route::prefix('status')->name('status.')->group(function () {
        Route::get('/', [StatusController::class, 'index'])->name('index');
        Route::get('/ready', [StatusController::class, 'ready'])->name('ready');
    });
    Route::prefix('vessels')->name('vessels.')->group(function () {
        Route::get('/{mmsi}', [VesselController::class, 'show'])->name('show');
    });
});
