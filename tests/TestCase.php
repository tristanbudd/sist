<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Tells Laravel to ignore Vite assets during testing
        // so CI doesn't crash looking for a missing manifest.json
        $this->withoutVite();
    }
}
