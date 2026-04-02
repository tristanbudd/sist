<?php

namespace App\Models;

use App\Services\MaritimeIdentityService;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vessel extends Model
{
    protected $primaryKey = 'mmsi';

    public $incrementing = false;

    protected $guarded = [];

    protected $casts = [
        'last_seen_at' => 'datetime',
        'eta' => 'datetime',
    ];

    protected $appends = [
        'nav_status_text',
        'vessel_type_text',
        'flag_country',
        'flag_code',
        'flag_continent',
        'flag_local_time',
        'flag_timezone',
    ];

    public function positions(): HasMany
    {
        return $this->hasMany(VesselPosition::class, 'mmsi', 'mmsi');
    }

    protected function flagCountry(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['country']
        );
    }

    protected function flagCode(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['code']
        );
    }

    protected function flagContinent(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['continent']
        );
    }

    protected function flagLocalTime(): Attribute
    {
        return Attribute::make(
            get: function () {
                $tz = MaritimeIdentityService::getFlagData($this->mmsi)['tz'];

                return now()->setTimezone($tz)->format('Y-m-d H:i:s');
            }
        );
    }

    protected function flagTimezone(): Attribute
    {
        return Attribute::make(
            get: function () {
                return MaritimeIdentityService::getFlagData($this->mmsi)['tz'];
            }
        );
    }

    protected function navStatusText(): Attribute
    {
        return Attribute::make(
            get: function () {
                $map = [
                    0 => 'Under way using engine',
                    1 => 'At anchor',
                    2 => 'Not under command',
                    3 => 'Restricted maneuverability',
                    4 => 'Constrained by her draught',
                    5 => 'Moored',
                    6 => 'Aground',
                    7 => 'Engaged in Fishing',
                    8 => 'Under way sailing',
                ];

                return $map[$this->navigational_status] ?? 'Unknown';
            }
        );
    }

    protected function vesselTypeText(): Attribute
    {
        return Attribute::make(
            get: function () {
                $type = $this->type;
                if (! $type) {
                    return 'Unknown';
                }
                if ($type >= 70 && $type <= 79) {
                    return 'Cargo';
                }
                if ($type >= 80 && $type <= 89) {
                    return 'Tanker';
                }
                if ($type >= 60 && $type <= 69) {
                    return 'Passenger';
                }
                if ($type === 30) {
                    return 'Fishing';
                }
                if ($type >= 31 && $type <= 32) {
                    return 'Towing';
                }
                if ($type >= 40 && $type <= 49) {
                    return 'High Speed Craft';
                }
                if ($type >= 50 && $type <= 59) {
                    return 'Pilot/SAR/Special';
                }
                if ($type >= 20 && $type <= 29) {
                    return 'Wing in Ground';
                }

                return 'Other';
            }
        );
    }
}
