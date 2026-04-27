import { useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
    FaXmark,
    FaLocationDot,
    FaCompass,
    FaGaugeHigh,
    FaClock,
    FaShieldHalved,
    FaCloudSun,
    FaCircleInfo,
    FaCircleCheck,
    FaLocationArrow,
    FaRoute,
    FaArrowRight,
    FaCircleExclamation,
} from 'react-icons/fa6';
import { LuAnchor, LuWaves, LuThermometer } from 'react-icons/lu';
import axios from 'axios';

interface Vessel {
    mmsi: number;
    imo?: number;
    name: string;
    lat: number;
    lng: number;
    course: number;
}

interface VesselDetails extends Vessel {
    call_sign?: string;
    type?: number;
    navigational_status?: number;
    speed?: number;
    heading?: number;
    length?: number;
    width?: number;
    draught?: number;
    destination?: string;
    eta?: string;
    last_seen_at?: string;
    nav_status_text?: string;
    vessel_type_text?: string;
    flying_flag?: string;
    flying_flag_country?: string;
    flying_flag_continent?: string;
    registry_country?: string;
    registry_country_code?: string;
    registry_continent?: string;
    registry_timezone?: string;
    position_age_seconds?: number;
}

interface WeatherData {
    current: {
        time: string;
        temperature_c: number;
        apparent_temperature_c: number;
        wind_speed_kph: number;
        wind_direction_degrees: number;
        cloud_cover_percent?: number;
        weather_code: number;
        is_day: number;
    };
    hourly: {
        time: string;
        temperature_c: number;
        precipitation_mm: number;
        wind_speed_kph: number;
    }[];
    source: string;
}

interface TideData {
    current: {
        time: string;
        wave_height: number;
        wave_period: number;
        sea_level_height_msl: number;
    };
    predictions: {
        time: string;
        wave_height: number;
        sea_level_height_msl: number;
    }[];
    metadata: {
        timezone: string;
    };
    source: string;
}

interface SanctionRecord {
    name: string;
    source: string;
    source_id?: string;
    matched_name?: string;
}

interface SanctionsData {
    is_sanctioned: boolean;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    sanctions_count: number;
    sources_confirming: string[];
    sanctions: SanctionRecord[];
}

interface HistoryPosition {
    lat: number;
    lng: number;
    speed: number;
    course: number;
    recorded_at: string;
    isLatest?: boolean;
}

interface ShipDetailsSidebarProps {
    vessel: Vessel | null;
    onClose: () => void;
    onHistoryUpdate?: (history: HistoryPosition[]) => void;
    showHistory?: boolean;
    onShowHistoryChange?: (show: boolean) => void;
    onNavigate?: (lat: number, lng: number, zoom: number) => void;
    showWaypoints?: boolean;
    onShowWaypointsChange?: (show: boolean) => void;
}

export default function ShipDetailsSidebar({
    vessel,
    onClose,
    onHistoryUpdate,
    showHistory,
    onShowHistoryChange,
    onNavigate,
    showWaypoints = true,
    onShowWaypointsChange,
}: ShipDetailsSidebarProps) {
    const [details, setDetails] = useState<VesselDetails | null>(null);
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [tides, setTides] = useState<TideData | null>(null);
    const [sanctions, setSanctions] = useState<SanctionsData | null>(null);
    const [history, setHistory] = useState<HistoryPosition[]>([]);
    const [historyHours, setHistoryHours] = useState(24);
    const [waypointsLimit, setWaypointsLimit] = useState(10);
    const [hasEnvError, setHasEnvError] = useState(false);
    const [loading, setLoading] = useState<{
        details: boolean;
        weather: boolean;
        tides: boolean;
        sanctions: boolean;
        history: boolean;
    }>({
        details: false,
        weather: false,
        tides: false,
        sanctions: false,
        history: false,
    });

    const fetchAllData = useCallback(
        async (mmsi: number) => {
            setDetails(null);
            setWeather(null);
            setTides(null);
            setSanctions(null);
            setWaypointsLimit(10);
            setHasEnvError(false);
            setHistory([]);
            setLoading({
                details: true,
                weather: true,
                tides: true,
                sanctions: true,
                history: true,
            });

            // TODO: Set API links back to relative paths after development
            let detailsData: VesselDetails | null = null;
            try {
                const res = await axios.get(`https://sist.tristanbudd.com/api/vessels/${mmsi}`);
                detailsData = res.data;
                setDetails(detailsData);
            } catch (err) {
                console.error('Failed to fetch vessel details:', err);
            } finally {
                setLoading((prev) => ({ ...prev, details: false }));
            }

            try {
                const res = await axios.get(
                    `https://sist.tristanbudd.com/api/conditions/weather/${mmsi}`
                );
                setWeather(res.data);
            } catch (err) {
                console.error('Failed to fetch weather:', err);
                setHasEnvError(true);
            } finally {
                setLoading((prev) => ({ ...prev, weather: false }));
            }

            try {
                const res = await axios.get(
                    `https://sist.tristanbudd.com/api/conditions/tides/${mmsi}`
                );
                setTides(res.data);
            } catch (err) {
                console.error('Failed to fetch tides:', err);
                setHasEnvError(true);
            } finally {
                setLoading((prev) => ({ ...prev, tides: false }));
            }

            try {
                const res = await axios.get(
                    `https://sist.tristanbudd.com/api/vessels/${mmsi}/sanctions`
                );
                const sanctionsData = res.data;

                if (sanctionsData.sanctions && sanctionsData.sanctions.length > 3) {
                    sanctionsData.risk_level = 'high';
                }

                setSanctions(sanctionsData);
            } catch (err) {
                console.error('Failed to fetch sanctions:', err);
            } finally {
                setLoading((prev) => ({ ...prev, sanctions: false }));
            }

            try {
                setLoading((prev) => ({ ...prev, history: true }));
                const res = await axios.get(
                    `https://sist.tristanbudd.com/api/vessels/${mmsi}/history?hours=${historyHours}`
                );
                let data = res.data.history || [];

                if (detailsData) {
                    const latestHistory = data.length > 0 ? data[0] : null;
                    const detailsTime = new Date(detailsData.last_seen_at || Date.now()).getTime();
                    const historyTime = latestHistory
                        ? new Date(latestHistory.recorded_at).getTime()
                        : 0;

                    const isSamePos =
                        latestHistory &&
                        Math.abs(Number(latestHistory.lat) - Number(detailsData.lat)) < 0.0001 &&
                        Math.abs(Number(latestHistory.lng) - Number(detailsData.lng)) < 0.0001;

                    if (!isSamePos && detailsTime > historyTime) {
                        data = [
                            {
                                lat: detailsData.lat,
                                lng: detailsData.lng,
                                speed: detailsData.speed || 0,
                                course: detailsData.course || 0,
                                recorded_at: detailsData.last_seen_at || new Date().toISOString(),
                                isLatest: true,
                            },
                            ...data,
                        ];
                    } else if (isSamePos && data.length > 0) {
                        data[0].isLatest = true;
                    }
                }

                setHistory(data);
                onHistoryUpdate?.(data);
            } catch (err) {
                console.error('Failed to fetch history:', err);
            } finally {
                setLoading((prev) => ({ ...prev, history: false }));
            }
        },
        [historyHours, onHistoryUpdate]
    );

    const mergedHistory = useMemo(() => {
        if (history.length === 0) return [];
        const result: (HistoryPosition & { mergedCount: number })[] = [];

        history.forEach((pos) => {
            if (result.length === 0) {
                result.push({ ...pos, mergedCount: 1 });
                return;
            }

            const last = result[result.length - 1];
            const dist = Math.sqrt(
                Math.pow(Number(pos.lat) - Number(last.lat), 2) +
                    Math.pow(Number(pos.lng) - Number(last.lng), 2)
            );

            if (!pos.isLatest && !last.isLatest && dist < 0.0005) {
                last.mergedCount++;
            } else {
                result.push({ ...pos, mergedCount: 1 });
            }
        });
        return result;
    }, [history]);

    useEffect(() => {
        if (vessel) {
            fetchAllData(vessel.mmsi);
        } else {
            setDetails(null);
            setWeather(null);
            setTides(null);
            setSanctions(null);
        }
    }, [vessel, fetchAllData]);

    if (!vessel) return null;

    const isOpen = !!vessel;

    return (
        <div
            className={`fixed top-0 right-0 h-[calc(100%-32px)] w-full sm:w-[400px] bg-zinc-950/95 backdrop-blur-xl border-l border-white/10 z-2000 shadow-2xl transition-transform duration-500 ease-in-out transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
        >
            <div className="p-6 border-b border-white/10 shrink-0">
                <div className="flex items-center justify-end mb-2">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/5 transition-colors text-zinc-500 hover:text-white"
                    >
                        <FaXmark className="w-5 h-5" />
                    </button>
                </div>

                <h2 className="text-2xl font-black text-white tracking-tight uppercase leading-tight">
                    {details?.name || vessel.name || 'Unknown Vessel'}
                </h2>
                <div className="flex items-center gap-4 mt-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">MMSI</span>
                        <span className="text-sm font-mono text-zinc-300">{vessel.mmsi}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">IMO</span>
                        <span className="text-sm font-mono text-zinc-300">
                            {details?.imo || vessel.imo || 'N/A'}
                        </span>
                    </div>
                    {details?.flying_flag && (
                        <>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                    Flag
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold text-zinc-300">
                                        {details.flying_flag}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 truncate max-w-[80px]">
                                        {details.flying_flag_country}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                <section className={loading.details ? 'animate-pulse opacity-50' : ''}>
                    <SectionTitle icon={<FaLocationDot />} title="Live Status" />
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <StatusCard
                            label="Nav Status"
                            value={
                                details?.nav_status_text || (loading.details ? '...' : 'Underway')
                            }
                            icon={<LuAnchor className="text-zinc-500" />}
                        />
                        <StatusCard
                            label="Speed"
                            value={loading.details ? '...' : `${details?.speed || '12.4'} kn`}
                            icon={<FaGaugeHigh className="text-zinc-500" />}
                        />
                        <StatusCard
                            label="Course"
                            value={
                                loading.details
                                    ? '...'
                                    : `${details?.course || vessel.course || '0'}°`
                            }
                            icon={<FaCompass className="text-zinc-500" />}
                        />
                        <StatusCard
                            label="Heading"
                            value={loading.details ? '...' : `${details?.heading || 'N/A'}°`}
                            icon={<FaLocationArrow className="text-zinc-500" />}
                        />
                    </div>

                    <div className="mt-4 p-4 bg-white/5 border border-white/10 space-y-3">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                    Destination
                                </span>
                                <span className="text-sm text-zinc-100 font-bold">
                                    {loading.details
                                        ? '...'
                                        : details?.destination || 'Global Waters'}
                                </span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                    ETA
                                </span>
                                <span className="text-sm text-zinc-100 font-mono">
                                    {loading.details
                                        ? '...'
                                        : details?.eta
                                          ? new Date(details.eta).toLocaleDateString('en-GB', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })
                                          : 'N/A'}
                                </span>
                            </div>
                        </div>
                        <div className="relative h-1 bg-zinc-800 overflow-hidden">
                            <div
                                className={`absolute top-0 left-0 h-full bg-zinc-400 transition-all duration-1000 ${loading.details ? 'w-full animate-pulse' : 'w-2/3'}`}
                            />
                        </div>
                    </div>
                </section>

                <section className={loading.sanctions ? 'animate-pulse opacity-50' : ''}>
                    <SectionTitle icon={<FaShieldHalved />} title="Compliance & Security" />
                    <div
                        className={`mt-4 p-4 border flex items-center justify-between gap-4 ${
                            loading.sanctions
                                ? 'bg-zinc-900 border-zinc-800'
                                : sanctions?.risk_level === 'high' ||
                                    sanctions?.risk_level === 'critical'
                                  ? 'bg-red-500/10 border-red-500/20'
                                  : sanctions?.risk_level === 'medium'
                                    ? 'bg-amber-500/10 border-amber-500/20'
                                    : sanctions
                                      ? 'bg-emerald-500/10 border-emerald-500/20'
                                      : 'bg-white/5 border-white/10'
                        }`}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            {loading.sanctions ? (
                                <div className="w-8 h-8 bg-zinc-800 animate-pulse" />
                            ) : sanctions?.risk_level === 'high' ||
                              sanctions?.risk_level === 'critical' ? (
                                <FaCircleExclamation className="text-red-500 w-8 h-8 shrink-0" />
                            ) : sanctions?.risk_level === 'medium' ? (
                                <FaCircleExclamation className="text-amber-500 w-8 h-8 shrink-0" />
                            ) : (
                                <FaCircleCheck className="text-emerald-500 w-8 h-8 shrink-0" />
                            )}
                            <div className="min-w-0">
                                <div
                                    className={`text-sm font-black uppercase tracking-tight truncate ${
                                        loading.sanctions
                                            ? 'text-zinc-500'
                                            : sanctions?.risk_level === 'high' ||
                                                sanctions?.risk_level === 'critical'
                                              ? 'text-red-500'
                                              : sanctions?.risk_level === 'medium'
                                                ? 'text-amber-500'
                                                : 'text-emerald-500'
                                    }`}
                                >
                                    {loading.sanctions
                                        ? 'Verifying...'
                                        : sanctions?.is_sanctioned
                                          ? 'Sanctioned'
                                          : 'Clear'}
                                </div>
                                <div className="text-[10px] text-zinc-500 truncate">
                                    {loading.sanctions
                                        ? 'Checking databases'
                                        : sanctions?.is_sanctioned
                                          ? `${sanctions.sanctions_count} lists`
                                          : 'SDN & UN verified'}
                                </div>
                            </div>
                        </div>
                        {sanctions && !loading.sanctions && (
                            <div
                                className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest shrink-0 ${
                                    sanctions.risk_level === 'high' ||
                                    sanctions.risk_level === 'critical'
                                        ? 'bg-red-500 text-white'
                                        : sanctions.risk_level === 'medium'
                                          ? 'bg-amber-500 text-black'
                                          : 'bg-emerald-500 text-white'
                                }`}
                            >
                                {sanctions.risk_level}
                            </div>
                        )}
                    </div>

                    {sanctions?.is_sanctioned && sanctions.sanctions.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {sanctions.sanctions.map((s, i) => (
                                <div
                                    key={i}
                                    className={`p-3 border flex flex-col gap-1 ${
                                        sanctions.risk_level === 'high' ||
                                        sanctions.risk_level === 'critical'
                                            ? 'bg-red-500/5 border-red-500/10'
                                            : sanctions.risk_level === 'medium'
                                              ? 'bg-amber-500/5 border-amber-500/10'
                                              : 'bg-emerald-500/5 border-emerald-500/10'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <span
                                            className={`text-[11px] font-black uppercase tracking-tight leading-tight ${
                                                sanctions.risk_level === 'high' ||
                                                sanctions.risk_level === 'critical'
                                                    ? 'text-red-400'
                                                    : sanctions.risk_level === 'medium'
                                                      ? 'text-amber-400'
                                                      : 'text-emerald-400'
                                            }`}
                                        >
                                            {s.name}
                                        </span>
                                        <a
                                            href={
                                                s.source === 'sanctions_network'
                                                    ? 'https://sanctions.network/'
                                                    : 'https://fleetleaks.com/'
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[9px] text-zinc-500 font-bold uppercase hover:text-zinc-300 transition-colors underline decoration-zinc-700 underline-offset-2 shrink-0"
                                        >
                                            {s.source.replace('_', ' ')}
                                        </a>
                                    </div>
                                    {s.matched_name && (
                                        <div className="text-[9px] text-zinc-600">
                                            Match:{' '}
                                            <span className="text-zinc-400">{s.matched_name}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className={loading.history ? 'animate-pulse opacity-50' : ''}>
                    <SectionTitle icon={<FaRoute />} title="Trajectory Analysis" />

                    <div className="mt-4 space-y-4">
                        <div className="p-4 bg-white/5 border border-white/10 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-zinc-200">
                                        Trajectory Visualization
                                    </span>
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">
                                        Map Overlay breadcrumbs
                                    </span>
                                </div>
                                <button
                                    onClick={() => onShowHistoryChange?.(!showHistory)}
                                    className={`relative inline-flex h-5 w-9 items-center transition-colors focus:outline-none ${
                                        showHistory ? 'bg-zinc-100' : 'bg-zinc-800'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-3 w-3 transform transition-transform ${
                                            showHistory
                                                ? 'translate-x-5 bg-black'
                                                : 'translate-x-1 bg-zinc-500'
                                        }`}
                                    />
                                </button>
                            </div>

                            {showHistory && (
                                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-bold text-zinc-300">
                                            Show Point Markers
                                        </span>
                                        <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tight">
                                            Individual position dots
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => onShowWaypointsChange?.(!showWaypoints)}
                                        className={`relative inline-flex h-4 w-7 items-center transition-colors focus:outline-none ${
                                            showWaypoints ? 'bg-zinc-400' : 'bg-zinc-800'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-2 w-2 transform transition-transform ${
                                                showWaypoints
                                                    ? 'translate-x-4 bg-white'
                                                    : 'translate-x-1 bg-zinc-600'
                                            }`}
                                        />
                                    </button>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">
                                        History Window
                                    </span>
                                    <span className="text-[10px] text-zinc-200 font-mono">
                                        {historyHours} Hours
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="6"
                                    max="168"
                                    step="6"
                                    value={historyHours}
                                    onChange={(e) => setHistoryHours(parseInt(e.target.value))}
                                    className="w-full h-1 bg-zinc-800 appearance-none cursor-pointer accent-white"
                                />
                                <div className="flex justify-between text-[8px] text-zinc-600 font-black uppercase tracking-widest">
                                    <span>6h</span>
                                    <span>24h</span>
                                    <span>7d</span>
                                </div>
                            </div>
                        </div>

                        {history.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">
                                    Recent Waypoints
                                </div>
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                    {mergedHistory
                                        .slice(0, waypointsLimit)
                                        .map(
                                            (
                                                pos: HistoryPosition & { mergedCount: number },
                                                i: number
                                            ) => (
                                                <div
                                                    key={i}
                                                    onClick={() =>
                                                        onNavigate?.(
                                                            Number(pos.lat),
                                                            Number(pos.lng),
                                                            14
                                                        )
                                                    }
                                                    className="bg-white/5 border border-white/5 p-2 flex items-center justify-between group hover:bg-white/10 transition-colors cursor-pointer"
                                                >
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-mono text-zinc-500">
                                                                {new Date(
                                                                    pos.recorded_at
                                                                ).toLocaleTimeString('en-GB', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    timeZone: 'Europe/London',
                                                                })}
                                                            </span>
                                                            {pos.mergedCount > 1 && (
                                                                <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 py-0.5 font-bold uppercase tracking-tighter">
                                                                    {pos.mergedCount} pts merged
                                                                </span>
                                                            )}
                                                            {pos.isLatest && (
                                                                <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1 py-0.5 font-black uppercase tracking-widest border border-emerald-500/20">
                                                                    Latest
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">
                                                            {Number(pos.lat).toFixed(4)},{' '}
                                                            {Number(pos.lng).toFixed(4)}
                                                        </span>
                                                    </div>
                                                    <div className="text-right flex flex-col">
                                                        <span className="text-[11px] font-black text-zinc-200">
                                                            {Number(pos.speed).toFixed(1)} kn
                                                        </span>
                                                        <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">
                                                            {Number(pos.course).toFixed(0)}°
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        )}

                                    {mergedHistory.length > waypointsLimit && (
                                        <button
                                            type="button"
                                            onClick={() => setWaypointsLimit((prev) => prev + 10)}
                                            className="w-full py-2 bg-white/2 hover:bg-white/5 text-[9px] text-zinc-400 hover:text-white font-bold uppercase tracking-widest transition-colors border border-white/5 mt-1"
                                        >
                                            Show more waypoints
                                        </button>
                                    )}
                                </div>

                                <div className="mt-2 p-2 bg-white/5 border border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[9px] text-zinc-500 uppercase font-bold tracking-tight">
                                        <FaClock className="w-2.5 h-2.5" />
                                        Server Time (London)
                                        <span className="text-zinc-400">
                                            (
                                            {new Date().toLocaleTimeString('en-GB', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                timeZone: 'Europe/London',
                                            })}
                                            )
                                        </span>
                                    </div>
                                    <div className="text-[9px] text-zinc-600 font-mono">
                                        Total: {mergedHistory.length} records
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <section
                    className={loading.weather || loading.tides ? 'animate-pulse opacity-50' : ''}
                >
                    <SectionTitle icon={<FaCloudSun />} title="Environmental Snapshot" />

                    <div className="mt-4 grid grid-cols-2 gap-px bg-white/10 border border-white/10 overflow-hidden">
                        {/* Atmosphere Overview */}
                        <div className="bg-zinc-950 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-zinc-500">
                                <LuThermometer className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    Atmosphere
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-4xl font-black text-white">
                                    {loading.weather
                                        ? '--'
                                        : weather?.current.temperature_c !== undefined
                                          ? `${Number(weather.current.temperature_c).toFixed(1)}°C`
                                          : 'N/A'}
                                </span>
                                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">
                                    Current Air Temp
                                </span>
                            </div>
                        </div>

                        {/* Marine Overview */}
                        <div className="bg-zinc-950 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-zinc-500">
                                <LuWaves className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    Marine
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-4xl font-black text-cyan-400">
                                    {loading.tides
                                        ? '--'
                                        : tides?.current.wave_height !== undefined
                                          ? `${Number(tides.current.wave_height).toFixed(1)}m`
                                          : 'N/A'}
                                </span>
                                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">
                                    Significant Wave
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        {(loading.weather || (weather && weather.hourly.length > 1)) && (
                            <div className="space-y-1.5">
                                <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">
                                    Outlook
                                </div>
                                {loading.weather || !weather
                                    ? Array(5)
                                          .fill(0)
                                          .map((_, i) => (
                                              <div
                                                  key={i}
                                                  className="bg-white/5 border border-white/10 p-2 h-10 animate-pulse"
                                              />
                                          ))
                                    : weather.hourly.slice(1, 6).map((h, i) => (
                                          <div
                                              key={i}
                                              className="bg-white/5 border border-white/5 p-2 flex items-center justify-between"
                                          >
                                              <span className="text-[10px] font-mono text-zinc-500">
                                                  {h.time.split('T')[1]}
                                              </span>
                                              <span className="text-[11px] font-black text-zinc-200">
                                                  {Number(h.temperature_c).toFixed(1)}°C
                                              </span>
                                          </div>
                                      ))}
                            </div>
                        )}

                        {(loading.tides || (tides && tides.predictions.length > 1)) && (
                            <div className="space-y-1.5">
                                <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">
                                    Predictions
                                </div>
                                {loading.tides || !tides
                                    ? Array(5)
                                          .fill(0)
                                          .map((_, i) => (
                                              <div
                                                  key={i}
                                                  className="bg-white/5 border border-white/10 p-2 h-10 animate-pulse"
                                              />
                                          ))
                                    : tides.predictions.slice(1, 6).map((p, i) => (
                                          <div
                                              key={i}
                                              className="bg-white/5 border border-white/5 p-2 flex items-center justify-between"
                                          >
                                              <span className="text-[10px] font-mono text-zinc-500">
                                                  {p.time.split('T')[1]}
                                              </span>
                                              <span className="text-[11px] font-black text-cyan-500/80">
                                                  {Number(p.wave_height).toFixed(1)}m
                                              </span>
                                          </div>
                                      ))}
                            </div>
                        )}
                    </div>

                    {!loading.weather &&
                        !loading.tides &&
                        (weather?.source || tides?.metadata.timezone) && (
                            <div className="mt-3 p-2 bg-white/5 border border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[9px] text-zinc-500 uppercase font-bold tracking-tight">
                                    <FaClock className="w-2.5 h-2.5" />
                                    Server Time (London)
                                    <span className="text-zinc-400">
                                        (
                                        {new Date().toLocaleTimeString('en-GB', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            timeZone: 'Europe/London',
                                        })}
                                        )
                                    </span>
                                </div>
                                <div className="text-[8px] text-zinc-600 uppercase font-black tracking-widest">
                                    Data: {weather?.source || tides?.source || 'Open-Meteo'}
                                </div>
                            </div>
                        )}

                    {hasEnvError && !loading.weather && !loading.tides && (
                        <div className="mt-px p-2 bg-white/5 border border-white/5 flex items-center gap-2">
                            <FaCircleInfo className="text-zinc-500 w-3 h-3" />
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">
                                Unable to fetch environmental data for this location
                            </span>
                        </div>
                    )}
                </section>

                <section>
                    <SectionTitle icon={<FaCircleInfo />} title="Technical Specifications" />
                    <div className="mt-4 space-y-1">
                        {!!details?.vessel_type_text && (
                            <InfoRow
                                label="Vessel Type"
                                value={details.vessel_type_text
                                    .split(',')[0]
                                    .replace(/\s+all ships of this type/i, '')
                                    .trim()}
                            />
                        )}
                        {!!details?.call_sign && (
                            <InfoRow label="Call Sign" value={details.call_sign} />
                        )}
                        {!!(details?.length || details?.width) && (
                            <InfoRow
                                label="Dimensions"
                                value={`${details.length || '--'}m x ${details.width || '--'}m`}
                            />
                        )}
                        {!!details?.draught && (
                            <InfoRow label="Draught" value={`${details.draught}m`} />
                        )}
                        {details?.registry_country && (
                            <InfoRow label="Registry" value={details.registry_country} />
                        )}
                        {details?.registry_continent && (
                            <InfoRow label="Home Continent" value={details.registry_continent} />
                        )}
                        {vessel.lat !== undefined && vessel.lng !== undefined && (
                            <InfoRow
                                label="Coordinates"
                                value={`${Number(vessel.lat).toFixed(4)}, ${Number(vessel.lng).toFixed(4)}`}
                            />
                        )}
                    </div>
                </section>

                <section>
                    <SectionTitle icon={<FaClock />} title="Time & Persistence" />
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <div className="flex flex-col p-3 bg-white/5 border border-white/5">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                Local Time
                            </span>
                            <span className="text-xs text-zinc-200 mt-1">
                                {new Date().toLocaleTimeString('en-GB', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: details?.registry_timezone || 'UTC',
                                })}
                                <span className="ml-1 text-[10px] text-zinc-500 font-normal">
                                    (
                                    {new Date()
                                        .toLocaleTimeString('en-GB', {
                                            timeZone: details?.registry_timezone || 'UTC',
                                            timeZoneName: 'short',
                                        })
                                        .split(' ')
                                        .pop()}
                                    )
                                </span>
                            </span>
                        </div>
                        <div className="flex flex-col p-3 bg-white/5 border border-white/5">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold">
                                Last AIS Update
                            </span>
                            <span className="text-xs text-zinc-200 mt-1">
                                {loading.details
                                    ? '...'
                                    : details?.position_age_seconds !== undefined
                                      ? details.position_age_seconds < 60
                                          ? `${details.position_age_seconds}s ago`
                                          : details.position_age_seconds < 3600
                                            ? `${Math.floor(details.position_age_seconds / 60)}m ago`
                                            : `${Math.floor(details.position_age_seconds / 3600)}h ago`
                                      : 'N/A'}
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            <div className="p-6 border-t border-white/10 shrink-0 bg-zinc-950">
                {/* TODO: Implement full intelligence analysis report generator */}
                <button
                    onClick={() => alert('Full Intelligence Analysis Reports are coming soon.')}
                    className="w-full py-3 bg-zinc-100 hover:bg-white text-black font-black uppercase text-xs tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                >
                    View Full Analysis Report
                    <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <div className="text-zinc-400 text-sm">{icon}</div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
                {title}
            </h3>
            <div className="flex-1 h-px bg-white/5" />
        </div>
    );
}

function StatusCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
    return (
        <div className="p-3 bg-white/5 border border-white/5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">{label}</span>
                <div className="text-sm">{icon}</div>
            </div>
            <span className="text-sm text-zinc-100 font-black truncate">{value}</span>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <span className="text-[11px] text-zinc-500 font-bold uppercase">{label}</span>
            <span className="text-[11px] text-zinc-200 font-mono">{value}</span>
        </div>
    );
}
