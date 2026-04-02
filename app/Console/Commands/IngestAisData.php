<?php

namespace App\Console\Commands;

use App\Models\Vessel;
use App\Models\VesselPosition;
use Carbon\Carbon;
use Illuminate\Console\Command;
use WebSocket\Client;
use WebSocket\ConnectionException;

class IngestAisData extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sist:ingest-ais';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Connects to AISStream WebSocket and persists live ship data to the database.';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $url = 'wss://stream.aisstream.io/v0/stream';
        $apiKey = config('services.aisstream.key');

        if (empty($apiKey)) {
            $this->error('SIST | ERROR: AISStream API Key is missing. Check your .env file and run `php artisan config:clear`.');

            return;
        }

        $this->info('SIST | Initializing AISStream Connection...');

        try {
            $client = new Client($url, ['timeout' => 60]);

            $subscribeMsg = [
                'APIKey' => $apiKey,
                'BoundingBoxes' => [[[-90, -180], [90, 180]]],
                'FilterMessageTypes' => ['PositionReport', 'ShipStaticData'],
            ];

            $client->send(json_encode($subscribeMsg));
            $this->info('SIST | Subscription Active. Listening for vessels...');

            while (true) {
                try {
                    $raw = $client->receive();
                    $data = json_decode($raw, true);

                    if (isset($data['MessageType'])) {
                        $this->processMessage($data);
                    }
                } catch (ConnectionException $e) {
                    $this->warn('SIST | Connection lost. Reconnecting...');
                    break;
                } catch (\Exception $e) {
                    $this->error('SIST | Error processing message: '.$e->getMessage());

                    continue;
                }
            }
        } catch (\Exception $e) {
            $this->error('SIST | Fatal Error: '.$e->getMessage());
        }
    }

    private function processMessage(array $data)
    {
        $mmsi = $data['MetaData']['MMSI'];
        $type = $data['MessageType'];

        $vessel = Vessel::firstOrNew(['mmsi' => $mmsi]);
        $needsHistoryUpdate = false;

        if ($type === 'PositionReport') {
            $report = $data['Message']['PositionReport'];

            $vessel->lat = $report['Latitude'];
            $vessel->lng = $report['Longitude'];
            $vessel->speed = $report['Sog'];
            $vessel->course = $report['Cog'];

            $vessel->heading = $report['TrueHeading'] === 511 ? null : $report['TrueHeading'];
            $vessel->navigational_status = $report['NavigationalStatus'] ?? null;

            if (! $vessel->exists || ! $vessel->last_seen_at || $vessel->last_seen_at->diffInMinutes(now()) >= 3) {
                $needsHistoryUpdate = true;
            }
        }

        if ($type === 'ShipStaticData') {
            $static = $data['Message']['ShipStaticData'];

            $vessel->name = trim($data['MetaData']['ShipName'] ?? $vessel->name);
            $vessel->type = $static['Type'] ?? $vessel->type;
            $vessel->imo = $static['ImoNumber'] ?? $vessel->imo;
            $vessel->call_sign = trim($static['CallSign'] ?? $vessel->call_sign);
            $vessel->destination = trim($static['Destination'] ?? $vessel->destination);

            $vessel->draught = isset($static['MaximumStaticDraught']) ? ($static['MaximumStaticDraught'] / 10) : $vessel->draught;

            if (isset($static['Dimension'])) {
                $dim = $static['Dimension'];
                $vessel->length = ($dim['A'] ?? 0) + ($dim['B'] ?? 0);
                $vessel->width = ($dim['C'] ?? 0) + ($dim['D'] ?? 0);
            }

            if (isset($static['Eta']) && $static['Eta']['Month'] > 0 && $static['Eta']['Day'] > 0) {
                try {
                    $year = date('Y');
                    $etaDate = Carbon::createFromFormat(
                        'Y-n-j H:i',
                        "{$year}-{$static['Eta']['Month']}-{$static['Eta']['Day']} {$static['Eta']['Hour']}:{$static['Eta']['Minute']}"
                    );
                    $vessel->eta = $etaDate;
                } catch (\Exception $e) {
                    // Ignore invalid crew-entered dates (e.g., February 30th)
                }
            }
        }

        $vessel->last_seen_at = now();
        $vessel->save();

        if ($needsHistoryUpdate) {
            VesselPosition::create([
                'mmsi' => $mmsi,
                'lat' => $vessel->lat,
                'lng' => $vessel->lng,
                'speed' => $vessel->speed,
                'course' => $vessel->course,
                'recorded_at' => now(),
            ]);
        }

        $this->line("<info>Updated:</info> [$mmsi] ".($vessel->name ?? 'Unknown'));
    }
}
