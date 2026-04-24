import { useState, useCallback } from 'react';
import { Head } from '@inertiajs/react';
import MainLayout from '../Layouts/MainLayout';
import HeaderBar from '../Components/HeaderBar';
import MapDisplay, { Vessel } from '../Components/MapDisplay';

interface FleetStats {
    renderedIcons: number;
    totalRenderedShips: number;
    trackedShips: number;
    trackedVessels: Vessel[];
}

export default function Index() {
    const [mapViewState, setMapViewState] = useState<{ center: [number, number]; zoom: number }>({
        center: [20, 0],
        zoom: 3,
    });

    const [fleetStats, setFleetStats] = useState({
        renderedIcons: 0,
        totalRenderedShips: 0,
        trackedShips: 0,
    });

    const [trackedVessels, setTrackedVessels] = useState<Vessel[]>([]);

    const handleNavigate = useCallback((lat: number, lon: number, zoom: number = 12) => {
        setMapViewState({ center: [lat, lon], zoom });
    }, []);

    const handleFleetUpdate = useCallback((stats: FleetStats) => {
        setFleetStats({
            renderedIcons: stats.renderedIcons,
            totalRenderedShips: stats.totalRenderedShips,
            trackedShips: stats.trackedShips,
        });
        setTrackedVessels(stats.trackedVessels || []);
    }, []);

    return (
        <MainLayout
            header={<HeaderBar onNavigate={handleNavigate} vessels={trackedVessels} />}
            fleetStats={fleetStats}
        >
            <Head title="Home" />
            <MapDisplay
                center={mapViewState.center}
                zoom={mapViewState.zoom}
                onFleetUpdate={handleFleetUpdate}
            />
        </MainLayout>
    );
}
