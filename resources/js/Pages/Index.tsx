import { useState, useCallback, useRef } from 'react';
import { Head } from '@inertiajs/react';
import MainLayout from '../Layouts/MainLayout';
import HeaderBar from '../Components/HeaderBar';
import MapDisplay, { Vessel } from '../Components/MapDisplay';
import ShipDetailsSidebar from '../Components/ShipDetailsSidebar';

interface FleetStats {
    renderedIcons: number;
    totalRenderedShips: number;
    trackedShips: number;
    trackedVessels: Vessel[];
    currentArea: string;
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
        currentArea: 'WORLD OVERVIEW',
    });

    const [trackedVessels, setTrackedVessels] = useState<Vessel[]>([]);
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
    const [showClusterZoomNotice, setShowClusterZoomNotice] = useState(false);
    const clusterZoomNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleNavigate = useCallback((lat: number, lng: number, zoom: number = 12) => {
        setMapViewState({ center: [lat, lng], zoom });
    }, []);

    const handleFleetUpdate = useCallback((stats: FleetStats) => {
        setFleetStats({
            renderedIcons: stats.renderedIcons,
            totalRenderedShips: stats.totalRenderedShips,
            trackedShips: stats.trackedShips,
            currentArea: stats.currentArea,
        });
        setTrackedVessels(stats.trackedVessels || []);
    }, []);

    const handleSelectVessel = useCallback((vessel: Vessel | null) => {
        setSelectedVessel(vessel);
    }, []);

    const handleClusterZoomNotice = useCallback(() => {
        setShowClusterZoomNotice(true);
        if (clusterZoomNoticeTimerRef.current) {
            clearTimeout(clusterZoomNoticeTimerRef.current);
        }
        clusterZoomNoticeTimerRef.current = setTimeout(() => {
            setShowClusterZoomNotice(false);
        }, 1800);
    }, []);

    return (
        <MainLayout
            header={
                <HeaderBar
                    onNavigate={handleNavigate}
                    vessels={trackedVessels}
                    onSelectVessel={handleSelectVessel}
                    selectedVesselName={
                        selectedVessel
                            ? selectedVessel.name?.trim() || `MMSI ${selectedVessel.mmsi}`
                            : undefined
                    }
                    showClusterZoomNotice={showClusterZoomNotice}
                />
            }
            fleetStats={fleetStats}
        >
            <Head title="Home" />
            <MapDisplay
                center={mapViewState.center}
                zoom={mapViewState.zoom}
                onFleetUpdate={handleFleetUpdate}
                selectedMmsi={selectedVessel?.mmsi ?? null}
                onVesselSelect={handleSelectVessel}
                onClusterZoomNotice={handleClusterZoomNotice}
            />
            <ShipDetailsSidebar vessel={selectedVessel} onClose={() => handleSelectVessel(null)} />
        </MainLayout>
    );
}
