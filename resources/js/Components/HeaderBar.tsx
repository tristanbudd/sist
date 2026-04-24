import { useState, useMemo } from 'react';
import { FaSearch, FaShip, FaAnchor } from 'react-icons/fa';
import portsGeoJson from '../../data/ports.json';
import { Vessel as MapVessel } from './MapDisplay';

interface Vessel {
    name: string;
    mmsi: string;
    imo: string;
    category: 'vessel';
    lat: number;
    lon: number;
}

interface Port {
    category: 'port';
    name: string;
    code: string;
    country: string;
    lat: number;
    lon: number;
}

type SearchResult = Vessel | Port;

interface Coordinates {
    lat: number;
    lon: number;
}

interface HeaderBarProps {
    onNavigate?: (lat: number, lon: number, zoom: number) => void;
    vessels?: MapVessel[];
    onSelectVessel?: (vessel: MapVessel | null) => void;
    selectedVesselName?: string;
    showClusterZoomNotice?: boolean;
}

interface PortFeature {
    properties: {
        Name: string;
        LOCODE: string;
        Country: string;
    };
    geometry: {
        coordinates: [number, number];
    };
}

const portsGeoJsonTyped = portsGeoJson as unknown as { features: PortFeature[] };

const WORLD_PORTS: Port[] = portsGeoJsonTyped.features.map((feature: PortFeature) => ({
    category: 'port' as const,
    name: feature.properties.Name.toUpperCase(),
    code: feature.properties.LOCODE,
    country: feature.properties.Country,
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
}));

const parseVesselCoords = (input: string): Coordinates | null => {
    const q = input.trim();

    const stdDD = q.match(/^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (stdDD) return { lat: parseFloat(stdDD[1]), lon: parseFloat(stdDD[2]) };

    const hemiDD = q.match(/^(\d+(?:\.\d+)?)°?\s*([NSns]),?\s*(\d+(?:\.\d+)?)°?\s*([EWew])$/);
    if (hemiDD) {
        let lat = parseFloat(hemiDD[1]);
        let lon = parseFloat(hemiDD[3]);
        if (hemiDD[2].toUpperCase() === 'S') lat *= -1;
        if (hemiDD[4].toUpperCase() === 'W') lon *= -1;
        return { lat, lon };
    }

    const dms = q.match(
        /^(\d+)°?\s*(\d+)[′']?\s*(\d+(?:\.\d+)?)[″"]?\s*([NSns]),?\s*(\d+)°?\s*(\d+)[′']?\s*(\d+(?:\.\d+)?)[″"]?\s*([EWew])$/
    );
    if (dms) {
        const [d1, m1, s1, h1] = [
            parseFloat(dms[1]),
            parseFloat(dms[2]),
            parseFloat(dms[3]),
            dms[4].toUpperCase(),
        ];
        const [d2, m2, s2, h2] = [
            parseFloat(dms[5]),
            parseFloat(dms[6]),
            parseFloat(dms[7]),
            dms[8].toUpperCase(),
        ];

        let lat = d1 + m1 / 60 + s1 / 3600;
        let lon = d2 + m2 / 60 + s2 / 3600;

        if (h1 === 'S') lat *= -1;
        if (h2 === 'W') lon *= -1;

        return { lat, lon };
    }

    return null;
};

export default function HeaderBar({
    onNavigate,
    vessels = [],
    onSelectVessel,
    selectedVesselName,
    showClusterZoomNotice = false,
}: HeaderBarProps) {
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [limit, setLimit] = useState(5);
    const [error, setError] = useState<string | null>(null);
    const activeQuery = selectedVesselName ?? query;

    const allResults = useMemo(() => {
        const liveVessels: Vessel[] = vessels.map((v) => ({
            category: 'vessel' as const,
            name: v.name || 'UNKNOWN',
            mmsi: String(v.mmsi),
            imo: String(v.imo || ''),
            lat: v.lat,
            lon: v.lng,
        }));
        return [...liveVessels, ...WORLD_PORTS];
    }, [vessels]);

    const suggestions = useMemo(() => {
        const q = activeQuery.toUpperCase().trim();

        const matches = allResults.filter((item: SearchResult) => {
            if (!q) return true;
            if (item.category === 'vessel') {
                return (
                    item.name.toUpperCase().includes(q) ||
                    item.mmsi.includes(q) ||
                    item.imo.includes(q)
                );
            }
            return (
                item.name.toUpperCase().includes(q) ||
                (item.code && item.code.toUpperCase().includes(q)) ||
                (item.country && item.country.toUpperCase().includes(q))
            );
        });

        return matches.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category === 'vessel' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
    }, [activeQuery, allResults]);

    const displayedSuggestions = useMemo(() => suggestions.slice(0, limit), [suggestions, limit]);
    const showSuggestionsPanel = showSuggestions && !error && suggestions.length > 0;

    const handleSelect = (item: SearchResult) => {
        if (item.category === 'vessel') {
            console.info(`FLEET_INTEL: Vessel Search Selection [MMSI: ${item.mmsi}]`);
            if (onSelectVessel) {
                const originalVessel = vessels.find((v) => String(v.mmsi) === item.mmsi);
                onSelectVessel(originalVessel || null);
            }
        }

        if (onNavigate) {
            onNavigate(item.lat, item.lon, 14);
        }

        setQuery(item.name);
        setShowSuggestions(false);
        setLimit(5);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const q = activeQuery.trim();
            const coords = parseVesselCoords(q);

            if (coords) {
                const { lat, lon } = coords;
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    setError('Invalid coordinates: Values outside Earth boundaries');
                    return;
                }

                if (onNavigate) {
                    onNavigate(lat, lon, 12);
                }

                setError(null);
                setShowSuggestions(false);
                return;
            }

            const upperQ = q.toUpperCase();
            const exactMatch = allResults.find((item) => {
                if (item.category === 'vessel') {
                    return item.name === upperQ || item.mmsi === upperQ || item.imo === upperQ;
                }
                return item.name === upperQ || item.code === upperQ;
            });

            if (exactMatch) {
                handleSelect(exactMatch);
            } else if (q.length > 0) {
                setError('No match found.');
            }
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-2 sm:p-4 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-2 sm:gap-0 pointer-events-none">
            {showSuggestionsPanel && (
                <div
                    className="fixed inset-0 pointer-events-auto z-0"
                    onClick={() => setShowSuggestions(false)}
                />
            )}

            <div className="relative flex items-center gap-2 sm:gap-3 bg-zinc-950 border border-white/20 px-3 py-2 sm:px-4 sm:py-3 shadow-2xl pointer-events-auto z-10 self-start">
                <img src="/images/logo.png" alt="SIST" className="h-5 sm:h-7 w-auto" />
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-white text-xs sm:text-sm font-bold tracking-wider">
                        SIST
                    </span>
                    <span className="text-zinc-500 text-[8px] sm:text-[9px] font-medium mt-0.5 hidden xs:block">
                        Intelligence & Suspicion Tracker
                    </span>
                </div>
            </div>

            <div className="relative w-full sm:px-0 sm:max-w-[400px] min-[960px]:absolute min-[960px]:left-1/2 min-[960px]:-translate-x-1/2 pointer-events-auto z-10">
                <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 px-4 py-3 shadow-2xl transition-all focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10">
                    <FaSearch className={`w-4 h-4 ${query ? 'text-white' : 'text-zinc-500'}`} />
                    <input
                        type="text"
                        value={activeQuery}
                        onChange={(e) => {
                            if (selectedVesselName && onSelectVessel) {
                                onSelectVessel(null);
                            }
                            setQuery(e.target.value);
                            setLimit(5);
                            setError(null);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search vessels, ports, or coordinates..."
                        className="bg-transparent border-none outline-none text-white text-xs font-semibold w-full placeholder:text-zinc-500 focus:ring-0"
                    />
                </div>

                {error && (
                    <div className="absolute top-full left-0 right-0 bg-red-500/10 border border-red-500/50 px-4 py-2 mt-px shadow-2xl">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                            {error}
                        </span>
                    </div>
                )}

                {showSuggestionsPanel && (
                    <div className="absolute top-full left-0 right-0 bg-zinc-950 border-x border-b border-white/20 shadow-2xl mt-px max-h-[60vh] overflow-y-auto">
                        {!activeQuery.trim() && (
                            <div className="px-4 py-2 border-b border-white/5 bg-white/2">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    Quick Search
                                </span>
                            </div>
                        )}

                        {displayedSuggestions.some((i) => i.category === 'vessel') && (
                            <div className="px-4 py-2 bg-zinc-900/30 border-b border-white/5">
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                                    Vessels
                                </span>
                            </div>
                        )}
                        {displayedSuggestions
                            .filter((i): i is Vessel => i.category === 'vessel')
                            .map((item, idx) => (
                                <button
                                    key={`vessel-${item.mmsi}-${idx}`}
                                    onClick={() => handleSelect(item)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-none text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <FaShip className="text-zinc-500 w-3 h-3" />
                                        <div className="flex flex-col">
                                            <span className="text-white text-[11px] font-bold">
                                                {item.name}
                                            </span>
                                            <span className="text-zinc-500 text-[9px] font-mono">
                                                MMSI: {item.mmsi} | IMO: {item.imo || 'Unknown'}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}

                        {displayedSuggestions.some((i) => i.category === 'port') && (
                            <div
                                className={`px-4 py-2 bg-zinc-900/30 border-b border-white/5 ${displayedSuggestions.some((i) => i.category === 'vessel') ? 'mt-2' : ''}`}
                            >
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                                    Ports
                                </span>
                            </div>
                        )}
                        {displayedSuggestions
                            .filter((i): i is Port => i.category === 'port')
                            .map((item, idx) => (
                                <button
                                    key={`port-${item.code}-${idx}`}
                                    onClick={() => handleSelect(item)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-none text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <FaAnchor className="text-zinc-500 w-3 h-3" />
                                        <div className="flex flex-col">
                                            <span className="text-white text-[11px] font-bold">
                                                {item.name}
                                            </span>
                                            <span className="text-zinc-500 text-[9px] font-mono">
                                                CODE: {item.code} | {item.country}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}

                        <div className="flex flex-col gap-2 px-4 py-2 bg-white/2 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-zinc-500 font-medium">
                                    Showing {displayedSuggestions.length} of {suggestions.length}{' '}
                                    found
                                </span>
                                {suggestions.length > limit && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setLimit((prev) => prev + 5);
                                        }}
                                        className="text-[9px] text-zinc-300 hover:text-white font-bold uppercase tracking-wider px-2 py-1"
                                    >
                                        Show more
                                    </button>
                                )}
                            </div>
                            {displayedSuggestions.some((i) => i.category === 'port') && (
                                <div className="text-[7px] text-zinc-600 uppercase tracking-widest text-center border-t border-white/5 pt-2 pb-0">
                                    Port Data:{' '}
                                    <a
                                        href="https://datacatalog.worldbank.org/search/dataset/0038118/global-international-ports"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:text-zinc-400 transition-colors"
                                    >
                                        World Bank Group
                                    </a>
                                </div>
                            )}
                        </div>

                        {showClusterZoomNotice && (
                            <div className="px-4 py-2 border-t border-white/10 bg-zinc-900/80">
                                <span className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider">
                                    Grouped ships detected, zooming in...
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {showClusterZoomNotice && !showSuggestionsPanel && (
                    <div className="absolute top-full left-0 right-0 bg-zinc-900/90 border border-white/20 px-4 py-2 mt-px shadow-2xl">
                        <span className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider">
                            Grouped ships detected, zooming in...
                        </span>
                    </div>
                )}
            </div>
            <div className="w-16 hidden md:block" />
        </header>
    );
}
