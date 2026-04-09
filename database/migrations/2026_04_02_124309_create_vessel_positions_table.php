<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vessel_positions', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('mmsi');
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->float('speed')->nullable();
            $table->float('course')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();

            $table->foreign('mmsi')->references('mmsi')->on('vessels')->onDelete('cascade');

            $table->index(['mmsi', 'recorded_at']);
            $table->index('recorded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vessel_positions');
    }
};
