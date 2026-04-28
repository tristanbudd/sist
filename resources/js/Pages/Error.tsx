import { Head, Link } from '@inertiajs/react';

interface ErrorProps {
    status: number;
}

export default function Error({ status }: ErrorProps) {
    const title =
        {
            503: 'Service Unavailable',
            500: 'System Failure',
            404: 'Resource Not Found',
            403: 'Access Denied',
        }[status] || `Error ${status}`;

    const description =
        {
            503: 'SIST systems are currently undergoing maintenance. Please return shortly.',
            500: 'A critical server-side anomaly has been detected. Engineers have been notified.',
            404: 'The requested vessel or data point could not be located in our database.',
            403: 'Security protocol: Your account does not have clearance for this resource.',
        }[status] || 'An unexpected system error has occurred.';

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 font-sans antialiased">
            <Head title={`${status}: ${title}`} />

            {/* Simple error for very small screens */}
            <div className="hidden max-[349px]:flex flex-col items-center justify-center gap-4 text-center">
                <h1 className="text-6xl font-black tracking-tighter text-white/10">{status}</h1>
                <h2 className="text-lg font-black tracking-tight uppercase">{title}</h2>
                <Link
                    href="/"
                    className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                    Return Home
                </Link>
            </div>

            {/* Standard error for supported screens */}
            <div className="w-full max-w-md max-[349px]:hidden">
                <div className="bg-white/5 border border-white/10 p-8 md:p-12 backdrop-blur-md relative overflow-hidden">
                    <div className="flex flex-col items-center text-center">
                        <div className="mb-8">
                            <h1 className="text-8xl font-black tracking-tighter text-white/20">
                                {status}
                            </h1>
                        </div>

                        <div className="space-y-2 mb-10">
                            <h2 className="text-3xl font-black tracking-tight uppercase">
                                {title}
                            </h2>
                        </div>

                        <div className="w-full h-px bg-white/10 mb-10" />

                        <p className="text-sm text-zinc-400 font-bold uppercase tracking-wide leading-relaxed mb-12">
                            {description}
                        </p>

                        <Link
                            href="/"
                            className="w-full py-4 bg-zinc-100 hover:bg-white text-black font-black uppercase text-xs tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                            Return To Home
                        </Link>
                    </div>
                </div>

                <div className="mt-8 flex items-center justify-between px-2">
                    <div className="flex items-center gap-3 text-[9px] text-zinc-600 font-black uppercase tracking-widest">
                        <span>SIST</span>
                    </div>
                    <div className="text-[9px] text-zinc-600 font-mono tracking-tighter">
                        {new Date().toISOString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
