import { PropsWithChildren } from 'react';
import StatusBar from '../../Components/StatusBar';

export default function MainLayout({ children }: PropsWithChildren) {
    return (
        <>
            {children}
            <StatusBar />
        </>
    );
}
