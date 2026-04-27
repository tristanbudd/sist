import { useState, useEffect } from 'react';
import { LuCode } from 'react-icons/lu';
import { FaGithub } from 'react-icons/fa6';

interface HealthCheck {
    status: string;
    latency_ms?: number;
    message?: string;
    last_message_age_seconds?: number;
}

interface ReadyResponse {
    status: 'healthy' | 'degraded';
    reason?: string;
    checks: {
        database: HealthCheck;
        cache: HealthCheck;
        ais_stream: HealthCheck;
    };
    timestamp: string;
}

export default function StatusBar({
    renderedIcons,
    totalRenderedShips,
    trackedShips,
    currentArea = 'WORLD OVERVIEW',
}: {
    renderedIcons: number;
    totalRenderedShips: number;
    trackedShips: number;
    currentArea?: string;
}) {
    const [systemStatus, setSystemStatus] = useState<ReadyResponse | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // TODO: Change back to relative link after dev
                const response = await fetch('https://sist.tristanbudd.com/api/status/ready');
                const data = await response.json();
                setSystemStatus(data);
            } catch (error) {
                console.error('Error | Failed to fetch system status:', error);
            }
        };

        fetchStatus();
        const statusInterval = setInterval(fetchStatus, 30000);

        const timeInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => {
            clearInterval(statusInterval);
            clearInterval(timeInterval);
        };
    }, []);

    const getStatusInfo = () => {
        if (!systemStatus) {
            return { color: 'bg-zinc-600', text: 'Connecting', ring: 'ring-zinc-600/20' };
        }
        if (systemStatus.status === 'healthy') {
            return { color: 'bg-emerald-500', text: 'Operational', ring: 'ring-emerald-500/20' };
        }
        if (systemStatus.status === 'degraded') {
            return { color: 'bg-amber-500', text: 'Degraded', ring: 'ring-amber-500/20' };
        }
        return { color: 'bg-red-500', text: 'Offline', ring: 'ring-red-500/20' };
    };

    const statusInfo = getStatusInfo();

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 h-8 bg-zinc-950 border-t border-zinc-800/50 flex items-center justify-between px-4 text-zinc-400 text-[11px] font-medium z-[3000]">
                {/* Left section - Stats */}
                <div className="flex items-center gap-3 overflow-x-auto">
                    <StatItem
                        label="Rendered"
                        value={
                            renderedIcons === totalRenderedShips
                                ? totalRenderedShips.toLocaleString()
                                : `${renderedIcons.toLocaleString()} (${totalRenderedShips.toLocaleString()} Total)`
                        }
                    />
                    <Divider />
                    <StatItem label="Tracked" value={trackedShips.toLocaleString()} />
                    <Divider className="hidden sm:block" />
                    <span className="text-zinc-500 text-[10px] whitespace-nowrap hidden sm:inline">
                        {currentArea}
                    </span>
                    <Divider className="max-md:hidden" />
                    <span className="text-zinc-500 text-[10px] font-mono whitespace-nowrap hidden md:inline">
                        {currentTime.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        })}
                        <span className="ml-2 text-zinc-600">
                            (UTC:{' '}
                            {currentTime.toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'UTC',
                            })}
                            )
                        </span>
                    </span>
                </div>

                {/* Right section - System Status & Links */}
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <a
                            href="/docs"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors hover:bg-zinc-900/50 hover:text-zinc-200"
                            title="API Documentation"
                        >
                            <LuCode className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">API Documentation</span>
                        </a>

                        <Divider className="h-3 hidden sm:block" />

                        <a
                            href="https://github.com/tristanbudd/sist"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors hover:bg-zinc-900/50 hover:text-zinc-200"
                            title="View on GitHub"
                        >
                            <FaGithub className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">View on GitHub</span>
                        </a>
                    </div>

                    <Divider className="h-3" />

                    <div className="relative">
                        <button
                            className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors hover:bg-zinc-900/50"
                            onClick={() => setShowDetails(!showDetails)}
                        >
                            <div className="relative flex items-center">
                                <div
                                    className={`w-1.5 h-1.5 rounded-full ${statusInfo.color} ring-2 ${statusInfo.ring}`}
                                />
                            </div>
                            <span className="text-zinc-300 hidden sm:inline">
                                {statusInfo.text}
                            </span>
                        </button>

                        {showDetails && systemStatus && (
                            <div className="absolute bottom-full right-0 mb-2 bg-zinc-950 border border-white/20 shadow-2xl p-4 w-80 sm:w-96 animate-in slide-in-from-bottom-2 duration-200">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                        <div>
                                            <div className="font-semibold text-zinc-100 text-sm">
                                                System Health
                                            </div>
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                {new Date(systemStatus.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShowDetails(false)}
                                            className="text-zinc-500 hover:text-white transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                                            title="Close"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <StatusDetail
                                            name="Database"
                                            status={systemStatus.checks.database.status}
                                            latency={systemStatus.checks.database.latency_ms}
                                            message={systemStatus.checks.database.message}
                                        />

                                        <StatusDetail
                                            name="Cache"
                                            status={systemStatus.checks.cache.status}
                                            latency={systemStatus.checks.cache.latency_ms}
                                            message={systemStatus.checks.cache.message}
                                        />

                                        <StatusDetail
                                            name="AIS Stream"
                                            status={systemStatus.checks.ais_stream.status}
                                            latency={systemStatus.checks.ais_stream.latency_ms}
                                            message={systemStatus.checks.ais_stream.message}
                                            lastMessageAge={
                                                systemStatus.checks.ais_stream
                                                    .last_message_age_seconds
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showDetails && systemStatus && (
                <div
                    className="fixed inset-0 z-[2999] bg-transparent"
                    onClick={() => setShowDetails(false)}
                />
            )}
        </>
    );
}

interface StatItemProps {
    label: string;
    value: string;
}

function StatItem({ label, value }: StatItemProps) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 text-[10px] hidden lg:inline">{label}:</span>
            <span className="text-zinc-200 font-semibold">{value}</span>
        </div>
    );
}

interface DividerProps {
    className?: string;
}

function Divider({ className = '' }: DividerProps) {
    return <div className={`w-px h-4 bg-zinc-800 ${className}`} />;
}

interface StatusDetailProps {
    name: string;
    status: string;
    latency?: number;
    message?: string;
    lastMessageAge?: number;
}

function StatusDetail({ name, status, latency, message, lastMessageAge }: StatusDetailProps) {
    const isOk = status === 'ok';

    return (
        <div className="flex items-center justify-between py-2.5 px-3 bg-zinc-900/30 border border-white/5">
            <div className="flex items-center gap-3">
                <div
                    className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-red-500'} ring-2 ${isOk ? 'ring-emerald-500/20' : 'ring-red-500/20'}`}
                />
                <div>
                    <div className="text-zinc-200 text-xs font-medium">{name}</div>
                    {message ? (
                        <div className="text-[10px] text-red-400 mt-0.5">{message}</div>
                    ) : lastMessageAge !== undefined ? (
                        <div className="text-zinc-500 text-[10px] font-mono">
                            Last Updated:{' '}
                            {(() => {
                                const absSec = Math.round(Math.abs(lastMessageAge));
                                if (absSec < 60) return `${absSec} seconds ago`;
                                if (absSec < 3600) {
                                    const mins = Math.floor(absSec / 60);
                                    return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
                                }
                                const hours = Math.floor(absSec / 3600);
                                return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
                            })()}
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="text-right">
                {latency !== undefined && (
                    <div className="text-zinc-400 text-[11px] font-mono">
                        {Math.round(latency)}ms
                    </div>
                )}
            </div>
        </div>
    );
}
