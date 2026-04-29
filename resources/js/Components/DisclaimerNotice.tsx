import { useState, useEffect } from 'react';
import { FaInfoCircle, FaShieldAlt, FaFlask } from 'react-icons/fa';
import { Head } from '@inertiajs/react';

interface DisclaimerNoticeProps {
    onAccept?: () => void;
}

export default function DisclaimerNotice({ onAccept }: DisclaimerNoticeProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const hasAccepted = localStorage.getItem('sist_disclaimer_accepted');
        if (!hasAccepted) {
            const timer = setTimeout(() => setIsVisible(true), 500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('sist_disclaimer_accepted', 'true');
        setIsVisible(false);
        if (onAccept) onAccept();
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-all duration-500 animate-in fade-in">
            <Head title="Disclosure" />
            <div className="bg-zinc-950 border border-white/10 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
                {/* Header */}
                <div className="bg-zinc-900/50 border-b border-white/5 px-5 py-4 flex items-center gap-3">
                    <img src="/images/logo.png" alt="SIST" className="h-6 w-auto" />
                    <div>
                        <h2 className="text-white text-[13px] font-black tracking-tight uppercase">
                            SIST System Disclosure
                        </h2>
                        <p className="text-zinc-500 text-[9px] uppercase tracking-widest font-bold">
                            Operational Notice
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 pb-2 space-y-6">
                    <section className="flex gap-4">
                        <FaInfoCircle className="w-3.5 h-3.5 text-zinc-500 mt-1 shrink-0" />
                        <div>
                            <h3 className="text-zinc-200 text-[11px] font-black mb-1.5 uppercase tracking-wider">
                                AIS Coverage Limits
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed">
                                SIST's AIS tracking is subject to terrestrial and satellite
                                reception limits. Coverage is not 100% global, and vessel data may
                                experience latency or intermittent gaps depending on region.
                            </p>
                        </div>
                    </section>

                    <section className="flex gap-4">
                        <FaShieldAlt className="w-3.5 h-3.5 text-zinc-500 mt-1 shrink-0" />
                        <div>
                            <h3 className="text-zinc-200 text-[11px] font-black mb-1.5 uppercase tracking-wider">
                                Data Integrity
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed">
                                Information is aggregated from public, open-source maritime feeds.
                                SIST provides this for tracking and research purposes, but absolute
                                data integrity depends on external source accuracy.
                            </p>
                        </div>
                    </section>

                    <section className="flex gap-4">
                        <FaFlask className="w-3.5 h-3.5 text-zinc-500 mt-1 shrink-0" />
                        <div>
                            <h3 className="text-zinc-200 text-[11px] font-black mb-1.5 uppercase tracking-wider">
                                Developmental Status
                            </h3>
                            <p className="text-zinc-400 text-xs leading-relaxed">
                                SIST is a new platform undergoing active testing. Features,
                                analytics, and data accuracy are currently under evaluation.
                            </p>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-5 sm:p-6 pt-0">
                    <button
                        onClick={handleAccept}
                        className="w-full bg-white hover:bg-zinc-200 text-black text-[11px] font-black py-3.5 tracking-[0.2em] transition-colors uppercase shadow-xl"
                    >
                        Dismiss Notice
                    </button>
                </div>
            </div>
        </div>
    );
}
