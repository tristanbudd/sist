<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vessel extends Model
{
    protected $primaryKey = 'mmsi';

    public $incrementing = false;

    protected $guarded = [];
}