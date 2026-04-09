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
use App\Http\Controllers\Api\ConditionsController;
use App\Http\Controllers\Api\StatusController;
use App\Http\Controllers\Api\VesselController;

Route::prefix('api')->group(function () {
    Route::prefix('status')->name('status.')->group(function () {
        Route::get('/', [StatusController::class, 'index'])->name('index');
        Route::get('/ready', [StatusController::class, 'ready'])->name('ready');
    });

    Route::prefix('conditions')->name('conditions.')->group(function () {
        Route::get('/weather/{mmsi}', [ConditionsController::class, 'weather'])->name('weather');
        Route::get('/tides/{mmsi}', [ConditionsController::class, 'tides'])->name('tides');
    });

    Route::prefix('vessels')->name('vessels.')->group(function () {
        Route::get('/', [VesselController::class, 'index'])->name('index');
        Route::get('/{mmsi}', [VesselController::class, 'show'])->name('show');
        Route::get('/{mmsi}/history', [VesselController::class, 'history'])->name('history');
    });
});
