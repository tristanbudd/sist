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
        'valid' => 'boolean',
        'position_accuracy' => 'boolean',
        'dte' => 'boolean',
        'static_spare' => 'boolean',
        'raim' => 'boolean',
    ];

    protected $appends = [
        'nav_status_text',
        'vessel_type_text',
        'flying_flag',
        'flying_flag_country',
        'flying_flag_continent',
        'flying_flag_local_time',
        'flying_flag_timezone',
        'registry_country',
        'registry_country_code',
        'registry_continent',
        'registry_local_time',
        'registry_timezone',
    ];

    public function positions(): HasMany
    {
        return $this->hasMany(VesselPosition::class, 'mmsi', 'mmsi');
    }

    protected function flyingFlag(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->flag
        );
    }

    protected function flyingFlagCountry(): Attribute
    {
        return Attribute::make(
            get: function () {
                $data = MaritimeIdentityService::getFlagDataByCode($this->flag);

                return $data['country'] ?? 'Unknown';
            }
        );
    }

    protected function flyingFlagContinent(): Attribute
    {
        return Attribute::make(
            get: function () {
                $data = MaritimeIdentityService::getFlagDataByCode($this->flag);

                return $data['continent'] ?? 'Unknown';
            }
        );
    }

    protected function flyingFlagLocalTime(): Attribute
    {
        return Attribute::make(
            get: function () {
                $data = MaritimeIdentityService::getFlagDataByCode($this->flag);
                $tz = $data['tz'] ?? 'UTC';

                return now()->setTimezone($tz)->format('Y-m-d H:i:s');
            }
        );
    }

    protected function flyingFlagTimezone(): Attribute
    {
        return Attribute::make(
            get: function () {
                $data = MaritimeIdentityService::getFlagDataByCode($this->flag);

                return $data['tz'] ?? 'UTC';
            }
        );
    }

    protected function registryCountry(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['country']
        );
    }

    protected function registryCountryCode(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['code']
        );
    }

    protected function registryContinent(): Attribute
    {
        return Attribute::make(
            get: fn () => MaritimeIdentityService::getFlagData($this->mmsi)['continent']
        );
    }

    protected function registryLocalTime(): Attribute
    {
        return Attribute::make(
            get: function () {
                $tz = MaritimeIdentityService::getFlagData($this->mmsi)['tz'];

                return now()->setTimezone($tz)->format('Y-m-d H:i:s');
            }
        );
    }

    protected function registryTimezone(): Attribute
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
            get: fn () => self::navigationStatusDescription($this->navigational_status)
        );
    }

    protected function vesselTypeText(): Attribute
    {
        return Attribute::make(
            get: fn () => self::shipTypeDescription($this->type)
        );
    }

    public static function navigationStatusDescription(?int $status): string
    {
        $map = [
            0 => 'Under way using engine',
            1 => 'At anchor',
            2 => 'Not under command',
            3 => 'Restricted manoeuverability',
            4 => 'Constrained by her draught',
            5 => 'Moored',
            6 => 'Aground',
            7 => 'Engaged in Fishing',
            8 => 'Under way sailing',
            9 => 'Reserved for future amendment of Navigational Status for HSC',
            10 => 'Reserved for future amendment of Navigational Status for WIG',
            11 => 'Reserved for future use',
            12 => 'Reserved for future use',
            13 => 'Reserved for future use',
            14 => 'AIS-SART is active',
            15 => 'Not defined (default)',
        ];

        return $map[$status] ?? 'Unknown';
    }

    public static function shipTypeDescription(?int $type): string
    {
        if ($type === null) {
            return 'Unknown';
        }

        if ($type >= 1 && $type <= 19) {
            return 'Reserved for future use';
        }

        $map = [
            0 => 'Not available (default)',
            20 => 'Wing in ground (WIG), all ships of this type',
            21 => 'Wing in ground (WIG), Hazardous category A',
            22 => 'Wing in ground (WIG), Hazardous category B',
            23 => 'Wing in ground (WIG), Hazardous category C',
            24 => 'Wing in ground (WIG), Hazardous category D',
            25 => 'Wing in ground (WIG), Reserved for future use',
            26 => 'Wing in ground (WIG), Reserved for future use',
            27 => 'Wing in ground (WIG), Reserved for future use',
            28 => 'Wing in ground (WIG), Reserved for future use',
            29 => 'Wing in ground (WIG), Reserved for future use',
            30 => 'Fishing',
            31 => 'Towing',
            32 => 'Towing: length exceeds 200m or breadth exceeds 25m',
            33 => 'Dredging or underwater ops',
            34 => 'Diving ops',
            35 => 'Military ops',
            36 => 'Sailing',
            37 => 'Pleasure Craft',
            38 => 'Reserved',
            39 => 'Reserved',
            40 => 'High speed craft (HSC), all ships of this type',
            41 => 'High speed craft (HSC), Hazardous category A',
            42 => 'High speed craft (HSC), Hazardous category B',
            43 => 'High speed craft (HSC), Hazardous category C',
            44 => 'High speed craft (HSC), Hazardous category D',
            45 => 'High speed craft (HSC), Reserved for future use',
            46 => 'High speed craft (HSC), Reserved for future use',
            47 => 'High speed craft (HSC), Reserved for future use',
            48 => 'High speed craft (HSC), Reserved for future use',
            49 => 'High speed craft (HSC), No additional information',
            50 => 'Pilot Vessel',
            51 => 'Search and Rescue vessel',
            52 => 'Tug',
            53 => 'Port Tender',
            54 => 'Anti-pollution equipment',
            55 => 'Law Enforcement',
            56 => 'Spare - Local Vessel',
            57 => 'Spare - Local Vessel',
            58 => 'Medical Transport',
            59 => 'Noncombatant ship according to RR Resolution No. 18',
            60 => 'Passenger, all ships of this type',
            61 => 'Passenger, Hazardous category A',
            62 => 'Passenger, Hazardous category B',
            63 => 'Passenger, Hazardous category C',
            64 => 'Passenger, Hazardous category D',
            65 => 'Passenger, Reserved for future use',
            66 => 'Passenger, Reserved for future use',
            67 => 'Passenger, Reserved for future use',
            68 => 'Passenger, Reserved for future use',
            69 => 'Passenger, No additional information',
            70 => 'Cargo, all ships of this type',
            71 => 'Cargo, Hazardous category A',
            72 => 'Cargo, Hazardous category B',
            73 => 'Cargo, Hazardous category C',
            74 => 'Cargo, Hazardous category D',
            75 => 'Cargo, Reserved for future use',
            76 => 'Cargo, Reserved for future use',
            77 => 'Cargo, Reserved for future use',
            78 => 'Cargo, Reserved for future use',
            79 => 'Cargo, No additional information',
            80 => 'Tanker, all ships of this type',
            81 => 'Tanker, Hazardous category A',
            82 => 'Tanker, Hazardous category B',
            83 => 'Tanker, Hazardous category C',
            84 => 'Tanker, Hazardous category D',
            85 => 'Tanker, Reserved for future use',
            86 => 'Tanker, Reserved for future use',
            87 => 'Tanker, Reserved for future use',
            88 => 'Tanker, Reserved for future use',
            89 => 'Tanker, No additional information',
            90 => 'Other Type, all ships of this type',
            91 => 'Other Type, Hazardous category A',
            92 => 'Other Type, Hazardous category B',
            93 => 'Other Type, Hazardous category C',
            94 => 'Other Type, Hazardous category D',
            95 => 'Other Type, Reserved for future use',
            96 => 'Other Type, Reserved for future use',
            97 => 'Other Type, Reserved for future use',
            98 => 'Other Type, Reserved for future use',
            99 => 'Other Type, No additional information',
        ];

        return $map[$type] ?? 'Unknown';
    }
}
