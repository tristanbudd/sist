import { Head } from '@inertiajs/react';
import MainLayout from '../Layouts/MainLayout';
import MapDisplay from '../Components/MapDisplay';

export default function Index() {
    return (
        <MainLayout>
            <Head title="Home" />
            <MapDisplay />
        </MainLayout>
    );
}
