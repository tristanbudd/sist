<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class VesselPosition extends Model
{
    protected $guarded = [];

    protected $casts = [
        'recorded_at' => 'datetime',
        'position_accuracy' => 'boolean',
        'raim' => 'boolean',
    ];

    protected $appends = [
        'nav_status_text',
    ];

    public function vessel()
    {
        return $this->belongsTo(Vessel::class, 'mmsi', 'mmsi');
    }

    protected function navStatusText(): Attribute
    {
        return Attribute::make(
            get: fn () => Vessel::navigationStatusDescription($this->navigational_status)
        );
    }
}
