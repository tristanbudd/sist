import { PropsWithChildren } from 'react';
import StatusBar from '../Components/StatusBar';
import { FaDisplay } from 'react-icons/fa6';

export default function MainLayout({ children }: PropsWithChildren) {
    return (
        <>
            {/* Unsupported screen notice - shown below 350px */}
            <div className="hidden max-[349px]:flex fixed inset-0 z-[9999] bg-zinc-950 items-center justify-center p-6">
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
            <div className="max-[349px]:hidden">
                {children}
                <StatusBar />
            </div>
        </>
    );
}
