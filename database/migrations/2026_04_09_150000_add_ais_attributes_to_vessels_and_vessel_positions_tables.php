<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vessels', function (Blueprint $table) {
            $table->unsignedTinyInteger('ais_message_id')->nullable()->after('type');
            $table->unsignedTinyInteger('repeat_indicator')->nullable()->after('ais_message_id');
            $table->unsignedInteger('user_id')->nullable()->after('repeat_indicator');
            $table->boolean('valid')->nullable()->after('user_id');

            $table->unsignedTinyInteger('ais_version')->nullable()->after('valid');
            $table->unsignedTinyInteger('fix_type')->nullable()->after('ais_version');
            $table->unsignedInteger('dimension_a')->nullable()->after('fix_type');
            $table->unsignedInteger('dimension_b')->nullable()->after('dimension_a');
            $table->unsignedInteger('dimension_c')->nullable()->after('dimension_b');
            $table->unsignedInteger('dimension_d')->nullable()->after('dimension_c');
            $table->boolean('dte')->nullable()->after('dimension_d');
            $table->boolean('static_spare')->nullable()->after('dte');

            $table->integer('rate_of_turn')->nullable()->after('navigational_status');
            $table->boolean('position_accuracy')->nullable()->after('rate_of_turn');
            $table->unsignedTinyInteger('position_timestamp')->nullable()->after('heading');
            $table->unsignedTinyInteger('special_manoeuvre_indicator')->nullable()->after('position_timestamp');
            $table->unsignedInteger('position_spare')->nullable()->after('special_manoeuvre_indicator');
            $table->boolean('raim')->nullable()->after('position_spare');
            $table->unsignedInteger('communication_state')->nullable()->after('raim');
        });

        Schema::table('vessel_positions', function (Blueprint $table) {
            $table->integer('heading')->nullable()->after('course');
            $table->integer('navigational_status')->nullable()->after('heading');
            $table->integer('rate_of_turn')->nullable()->after('navigational_status');
            $table->boolean('position_accuracy')->nullable()->after('rate_of_turn');
            $table->boolean('raim')->nullable()->after('position_accuracy');
        });
    }

    public function down(): void
    {
        Schema::table('vessel_positions', function (Blueprint $table) {
            $table->dropColumn([
                'heading',
                'navigational_status',
                'rate_of_turn',
                'position_accuracy',
                'raim',
            ]);
        });

        Schema::table('vessels', function (Blueprint $table) {
            $table->dropColumn([
                'ais_message_id',
                'repeat_indicator',
                'user_id',
                'valid',
                'ais_version',
                'fix_type',
                'dimension_a',
                'dimension_b',
                'dimension_c',
                'dimension_d',
                'dte',
                'static_spare',
                'rate_of_turn',
                'position_accuracy',
                'position_timestamp',
                'special_manoeuvre_indicator',
                'position_spare',
                'raim',
                'communication_state',
            ]);
        });
    }
};
