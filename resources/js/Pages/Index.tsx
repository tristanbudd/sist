import { useState } from 'react';
import { Head } from '@inertiajs/react';
import MainLayout from '../Layouts/MainLayout';
import HeaderBar from '../Components/HeaderBar';
import MapDisplay from '../Components/MapDisplay';

export default function Index() {
    const [mapViewState, setMapViewState] = useState<{ center: [number, number]; zoom: number }>({
        center: [20, 0],
        zoom: 3,
    });

    const handleNavigate = (lat: number, lon: number, zoom: number = 12) => {
        setMapViewState({ center: [lat, lon], zoom });
    };

    return (
        <MainLayout header={<HeaderBar onNavigate={handleNavigate} />}>
            <Head title="Home" />
            <MapDisplay center={mapViewState.center} zoom={mapViewState.zoom} />
        </MainLayout>
    );
}
