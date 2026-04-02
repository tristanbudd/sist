<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vessel extends Model
{
    protected $primaryKey = 'mmsi';

    public $incrementing = false;

    protected $guarded = [];

    protected $casts = [
        'last_seen_at' => 'datetime',
    ];

    public function positions(): HasMany
    {
        return $this->hasMany(VesselPosition::class, 'mmsi', 'mmsi');
    }
}
