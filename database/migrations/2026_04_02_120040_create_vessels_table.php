<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vessels', function (Blueprint $table) {
            $table->unsignedInteger('mmsi')->primary();
            $table->unsignedInteger('imo')->nullable();
            $table->string('name')->nullable();
            $table->string('call_sign')->nullable();
            $table->string('flag')->nullable();
            $table->integer('type')->nullable();
            $table->integer('navigational_status')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->float('speed')->nullable();
            $table->float('course')->nullable();
            $table->integer('heading')->nullable();
            $table->integer('length')->nullable();
            $table->integer('width')->nullable();
            $table->decimal('draught', 5, 2)->nullable();
            $table->string('destination')->nullable();
            $table->timestamp('eta')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index('last_seen_at');
            $table->index(['lat', 'lng']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vessels');
    }
};
