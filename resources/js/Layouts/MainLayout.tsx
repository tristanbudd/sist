import { PropsWithChildren, useState } from 'react';
import StatusBar from '../Components/StatusBar';
import HeaderBar from '../Components/HeaderBar';
import DisclaimerNotice from '../Components/DisclaimerNotice';
import { FaDisplay } from 'react-icons/fa6';

export default function MainLayout({
    children,
    header,
    fleetStats,
}: PropsWithChildren<{
    header?: React.ReactNode;
    fleetStats?: {
        renderedIcons: number;
        totalRenderedShips: number;
        trackedShips: number;
        currentArea?: string;
    };
}>) {
    const [hasAccepted, setHasAccepted] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sist_disclaimer_accepted') === 'true';
        }
        return false;
    });

    return (
        <>
            {/* Unsupported screen notice - shown below 350px */}
            <div className="hidden max-[349px]:flex fixed inset-0 z-9999 bg-zinc-950 items-center justify-center p-6">
                <div className="flex flex-col items-center gap-3 text-center max-w-[280px]">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 mb-1">
                        <FaDisplay className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-200 tracking-tight">
                        Screen Too Small
                    </p>
                    <p className="text-[11px] leading-relaxed text-zinc-600">
                        This application requires a minimum width of 350px to function correctly.
                    </p>
                </div>
            </div>

            {/* Main content - hidden below 350px */}
            <div className="max-[349px]:hidden min-h-screen bg-zinc-950">
                {!hasAccepted ? (
                    <DisclaimerNotice onAccept={() => setHasAccepted(true)} />
                ) : (
                    <>
                        {header || <HeaderBar />}
                        {children}
                        <StatusBar
                            renderedIcons={fleetStats?.renderedIcons ?? 0}
                            totalRenderedShips={fleetStats?.totalRenderedShips ?? 0}
                            trackedShips={fleetStats?.trackedShips ?? 0}
                            currentArea={fleetStats?.currentArea ?? 'WORLD OVERVIEW'}
                        />
                    </>
                )}
            </div>
        </>
    );
}
