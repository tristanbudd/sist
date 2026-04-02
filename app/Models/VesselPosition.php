<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VesselPosition extends Model
{
    protected $guarded = [];

    protected $casts = [
        'recorded_at' => 'datetime',
    ];

    public function vessel()
    {
        return $this->belongsTo(Vessel::class, 'mmsi', 'mmsi');
    }
}
