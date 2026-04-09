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
    private ?Carbon $nextRetentionRunAt = null;

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
        $this->pruneVesselPositionHistory();

        $mmsi = $data['MetaData']['MMSI'];
        $type = $data['MessageType'];

        $vessel = Vessel::firstOrNew(['mmsi' => $mmsi]);
        $needsHistoryUpdate = false;

        $vessel->flag = $this->cleanNullableString(
            data_get($data, 'MetaData.Flag')
                ?? data_get($data, 'MetaData.FlagCode')
                ?? data_get($data, 'Message.ShipStaticData.Flag')
                ?? data_get($data, 'Message.ShipStaticData.FlagCode')
                ?? $vessel->flag
        );

        $vessel->ais_message_id = data_get($data, 'Message.MessageID', $vessel->ais_message_id);
        $vessel->repeat_indicator = data_get($data, 'Message.RepeatIndicator', $vessel->repeat_indicator);
        $vessel->user_id = data_get($data, 'Message.UserID', $vessel->user_id);
        $vessel->valid = data_get($data, 'Message.Valid', $vessel->valid);

        if ($type === 'PositionReport') {
            $report = $data['Message']['PositionReport'];

            $vessel->lat = $report['Latitude'];
            $vessel->lng = $report['Longitude'];
            $vessel->speed = $report['Sog'];
            $vessel->course = $report['Cog'];

            $vessel->heading = $report['TrueHeading'] === 511 ? null : $report['TrueHeading'];
            $vessel->navigational_status = $report['NavigationalStatus'] ?? null;
            $vessel->rate_of_turn = $report['RateOfTurn'] ?? null;
            $vessel->position_accuracy = $report['PositionAccuracy'] ?? null;
            $vessel->position_timestamp = isset($report['Timestamp']) && $report['Timestamp'] <= 59
                ? $report['Timestamp']
                : null;
            $vessel->special_manoeuvre_indicator = $report['SpecialManoeuvreIndicator'] ?? null;
            $vessel->position_spare = $report['Spare'] ?? null;
            $vessel->raim = $report['Raim'] ?? null;
            $vessel->communication_state = $report['CommunicationState'] ?? null;

            if (! $vessel->exists || ! $vessel->last_seen_at || $vessel->last_seen_at->diffInMinutes(now()) >= 3) {
                $needsHistoryUpdate = true;
            }
        }

        if ($type === 'ShipStaticData') {
            $static = $data['Message']['ShipStaticData'];

            $vessel->name = $this->cleanNullableString($static['Name'] ?? $data['MetaData']['ShipName'] ?? $vessel->name);
            $vessel->type = $static['Type'] ?? $vessel->type;
            $vessel->imo = $static['ImoNumber'] ?? $vessel->imo;
            $vessel->call_sign = $this->cleanNullableString($static['CallSign'] ?? $vessel->call_sign);
            $vessel->destination = $this->cleanNullableString($static['Destination'] ?? $vessel->destination);

            $vessel->ais_version = $static['AisVersion'] ?? $vessel->ais_version;
            $vessel->fix_type = $static['FixType'] ?? $vessel->fix_type;
            $vessel->dte = $static['Dte'] ?? $vessel->dte;
            $vessel->static_spare = $static['Spare'] ?? $vessel->static_spare;

            $vessel->draught = isset($static['MaximumStaticDraught']) ? ($static['MaximumStaticDraught'] / 10) : $vessel->draught;

            if (isset($static['Dimension'])) {
                $dim = $static['Dimension'];
                $vessel->dimension_a = $dim['A'] ?? $vessel->dimension_a;
                $vessel->dimension_b = $dim['B'] ?? $vessel->dimension_b;
                $vessel->dimension_c = $dim['C'] ?? $vessel->dimension_c;
                $vessel->dimension_d = $dim['D'] ?? $vessel->dimension_d;
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
            $report = $data['Message']['PositionReport'] ?? [];

            VesselPosition::create([
                'mmsi' => $mmsi,
                'ais_message_id' => data_get($data, 'Message.MessageID'),
                'repeat_indicator' => data_get($data, 'Message.RepeatIndicator'),
                'user_id' => data_get($data, 'Message.UserID'),
                'valid' => data_get($data, 'Message.Valid'),
                'lat' => $vessel->lat,
                'lng' => $vessel->lng,
                'speed' => $vessel->speed,
                'course' => $vessel->course,
                'heading' => $vessel->heading,
                'navigational_status' => data_get($report, 'NavigationalStatus'),
                'rate_of_turn' => data_get($report, 'RateOfTurn'),
                'position_accuracy' => data_get($report, 'PositionAccuracy'),
                'position_timestamp' => data_get($report, 'Timestamp'),
                'special_manoeuvre_indicator' => data_get($report, 'SpecialManoeuvreIndicator'),
                'position_spare' => data_get($report, 'Spare'),
                'raim' => data_get($report, 'Raim'),
                'communication_state' => data_get($report, 'CommunicationState'),
                'recorded_at' => now(),
            ]);
        }

        $this->line("<info>Updated:</info> [$mmsi] ".($vessel->name ?? 'Unknown'));
    }

    private function cleanNullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    private function pruneVesselPositionHistory(): void
    {
        $now = now();

        if ($this->nextRetentionRunAt !== null && $now->lt($this->nextRetentionRunAt)) {
            return;
        }

        $deleted = VesselPosition::query()
            ->where('recorded_at', '<', $now->copy()->subDays(30))
            ->delete();

        if ($deleted > 0) {
            $this->line("<comment>Retention:</comment> removed {$deleted} vessel position records older than 30 days.");
        }

        // Run cleanup periodically to keep overhead low in the streaming loop.
        $this->nextRetentionRunAt = $now->copy()->addMinutes(15);
    }
}
