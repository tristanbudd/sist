import { useState, useMemo } from 'react';
import { FaSearch, FaShip, FaAnchor } from 'react-icons/fa';

interface Vessel {
    category: 'vessel';
    name: string;
    mmsi: string;
    imo: string;
    type: string;
    lat: number;
    lon: number;
}

interface Port {
    category: 'port';
    name: string;
    code: string;
    country: string;
    type: string;
    lat: number;
    lon: number;
}

type SearchItem = Vessel | Port;

const SAMPLE_VESSELS: Vessel[] = [
    {
        name: 'OCEAN EXPLORER',
        mmsi: '235114700',
        imo: '9153549',
        type: 'Research',
        category: 'vessel',
        lat: 51.5074,
        lon: -0.1278,
    },
    {
        name: 'ARCTIC TERN',
        mmsi: '231001000',
        imo: '8901234',
        type: 'Fishing',
        category: 'vessel',
        lat: 64.1265,
        lon: -21.8174,
    },
    {
        name: 'GLOBAL TRADER',
        mmsi: '351123000',
        imo: '9412345',
        type: 'Cargo',
        category: 'vessel',
        lat: 1.2902,
        lon: 103.8519,
    },
    {
        name: 'PACIFIC STAR',
        mmsi: '563001000',
        imo: '9876543',
        type: 'Tanker',
        category: 'vessel',
        lat: 34.0522,
        lon: -118.2437,
    },
    {
        name: 'NORTH SEA GIANT',
        mmsi: '257545000',
        imo: '9523964',
        type: 'Offshore',
        category: 'vessel',
        lat: 58.969,
        lon: 5.7331,
    },
    {
        name: 'BLUE WHALE',
        mmsi: '477312600',
        imo: '9616759',
        type: 'Tug',
        category: 'vessel',
        lat: 22.3193,
        lon: 114.1694,
    },
    {
        name: 'EVER GIVEN',
        mmsi: '353136000',
        imo: '9811000',
        type: 'Container',
        category: 'vessel',
        lat: 29.9745,
        lon: 32.5418,
    },
    {
        name: 'VIKING GRACE',
        mmsi: '230629000',
        imo: '9606900',
        type: 'Passenger',
        category: 'vessel',
        lat: 60.4518,
        lon: 22.2666,
    },
];

const SAMPLE_PORTS: Port[] = [
    {
        name: 'PORT OF SINGAPORE',
        code: 'SGSIN',
        country: 'Singapore',
        type: 'Main',
        category: 'port',
        lat: 1.2762,
        lon: 103.8014,
    },
    {
        name: 'PORT OF ROTTERDAM',
        code: 'NLRTM',
        country: 'Netherlands',
        type: 'Major',
        category: 'port',
        lat: 51.885,
        lon: 4.2867,
    },
    {
        name: 'PORT OF SHANGHAI',
        code: 'CNSHA',
        country: 'China',
        type: 'Main',
        category: 'port',
        lat: 31.2304,
        lon: 121.4737,
    },
    {
        name: 'PORT OF LOS ANGELES',
        code: 'USLAX',
        country: 'United States',
        type: 'Major',
        category: 'port',
        lat: 33.7701,
        lon: -118.2437,
    },
];

const ALL_RESULTS: SearchItem[] = [...SAMPLE_VESSELS, ...SAMPLE_PORTS];

/**
 * Handles multi-format coordinate parsing (DD, Hemisphere-DD, and DMS)
 * Standardizes all inputs into decimal degree objects.
 */
const parseVesselCoords = (input: string): { lat: number; lon: number } | null => {
    const q = input.trim();

    // Standard Decimal Degrees (e.g. 51.5074, -0.1278)
    const stdDD = q.match(/^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (stdDD) return { lat: parseFloat(stdDD[1]), lon: parseFloat(stdDD[2]) };

    // Decimal Degrees with Hemispheres (e.g. 37.4° N, 116.8° W)
    const hemiDD = q.match(/^(\d+(?:\.\d+)?)°?\s*([NSns]),?\s*(\d+(?:\.\d+)?)°?\s*([EWew])$/);
    if (hemiDD) {
        let lat = parseFloat(hemiDD[1]);
        let lon = parseFloat(hemiDD[3]);
        if (hemiDD[2].toUpperCase() === 'S') lat *= -1;
        if (hemiDD[4].toUpperCase() === 'W') lon *= -1;
        return { lat, lon };
    }

    // Degrees Minutes Seconds (e.g. 12° 22′ 13″ N, 23° 19′ 20″ E)
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

interface HeaderBarProps {
    onNavigate?: (lat: number, lon: number, zoom?: number) => void;
}

export default function HeaderBar({ onNavigate }: HeaderBarProps) {
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [limit, setLimit] = useState(5);
    const [error, setError] = useState<string | null>(null);

    const suggestions = useMemo(() => {
        const q = query.toUpperCase().trim();
        if (!q) return ALL_RESULTS;

        return ALL_RESULTS.filter((item) => {
            if (item.category === 'vessel') {
                return item.name.includes(q) || item.mmsi.includes(q) || item.imo.includes(q);
            }
            return (
                item.name.includes(q) ||
                item.code.includes(q) ||
                item.country.toUpperCase().includes(q)
            );
        });
    }, [query]);

    const displayedSuggestions = useMemo(() => suggestions.slice(0, limit), [suggestions, limit]);

    const handleSelect = (item: SearchItem) => {
        if (item.category === 'vessel') {
            console.info(`MONITORING VESSEL: ${item.name} (MMSI: ${item.mmsi})`);
        } else {
            console.info(`ARRIVING AT PORT: ${item.name} (${item.code}, ${item.country})`);
        }

        // Navigate map to item location
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
            const q = query.trim();
            const coords = parseVesselCoords(q);

            if (coords) {
                const { lat, lon } = coords;
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    setError(
                        'Invalid coordinates: Values outside Earth boundaries (Lat: -90/90, Lon: -180/180)'
                    );
                    return;
                }
                console.info(`NAVIGATING TO COORDINATES: [${lat.toFixed(6)}, ${lon.toFixed(6)}]`);

                if (onNavigate) {
                    onNavigate(lat, lon, 12);
                }

                setError(null);
                setShowSuggestions(false);
                return;
            }

            const upperQ = q.toUpperCase();
            const exactMatch = ALL_RESULTS.find((item) => {
                if (item.category === 'vessel') {
                    return item.name === upperQ || item.mmsi === upperQ || item.imo === upperQ;
                }
                return item.name === upperQ || item.code === upperQ;
            });

            if (exactMatch) {
                handleSelect(exactMatch);
            } else if (q.length > 0) {
                setError('No exact match found for vessel, port, or coordinates.');
            }
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-4 flex items-start justify-between pointer-events-none">
            {/* Background overlay to handle click-off dismissals */}
            {showSuggestions && (
                <div
                    className="fixed inset-0 pointer-events-auto z-0"
                    onClick={() => setShowSuggestions(false)}
                />
            )}

            <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 px-4 py-3 shadow-2xl pointer-events-auto z-10">
                <img src="/images/logo.png" alt="SIST Logo" className="h-7 w-auto" />
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-white text-sm font-bold tracking-wider">SIST</span>
                    <span className="text-zinc-500 text-[9px] font-medium tracking-tight mt-0.5">
                        Ship Intelligence & Suspicion Tracker
                    </span>
                </div>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[400px] pointer-events-auto z-10">
                <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 px-4 py-3 shadow-2xl transition-all focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10">
                    <FaSearch
                        className={`w-4 h-4 transition-colors ${query ? 'text-white' : 'text-zinc-500'}`}
                    />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setLimit(5);
                            setError(null);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search vessels, ports, or coordinates..."
                        className="bg-transparent border-none outline-none text-white text-xs font-semibold w-full placeholder:text-zinc-500 focus:ring-0 tracking-wide"
                    />
                </div>

                {error && (
                    <div className="absolute top-full left-0 right-0 bg-red-500/10 border border-red-500/50 px-4 py-2 mt-px shadow-2xl">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                            {error}
                        </span>
                    </div>
                )}

                {showSuggestions && !error && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-zinc-950 border-x border-b border-white/20 shadow-2xl mt-px max-h-[400px] overflow-y-auto">
                        {!query.trim() && (
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    Quick Search
                                </span>
                            </div>
                        )}
                        {displayedSuggestions.map((item) => (
                            <button
                                key={item.category === 'vessel' ? item.mmsi : item.code}
                                onClick={() => handleSelect(item)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-none text-left"
                            >
                                <div className="flex items-center gap-3">
                                    {item.category === 'vessel' ? (
                                        <FaShip className="text-zinc-500 w-3 h-3" />
                                    ) : (
                                        <FaAnchor className="text-zinc-500 w-3 h-3" />
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-white text-[11px] font-bold">
                                            {item.name}
                                        </span>
                                        <span className="text-zinc-500 text-[9px] font-mono">
                                            {item.category === 'vessel'
                                                ? `MMSI: ${item.mmsi} | IMO: ${item.imo}`
                                                : `CODE: ${item.code} | ${item.country}`}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter bg-white/5 px-1.5 py-0.5">
                                    {item.type}
                                </span>
                            </button>
                        ))}

                        <div className="flex items-center justify-between px-4 py-2 bg-white/2 border-t border-white/5">
                            <span className="text-[9px] text-zinc-500 font-medium">
                                Showing {displayedSuggestions.length} of {suggestions.length} found
                            </span>
                            {suggestions.length > limit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLimit((prev) => prev + 5);
                                    }}
                                    className="text-[9px] text-zinc-300 hover:text-white font-bold uppercase tracking-wider transition-colors px-2 py-1"
                                >
                                    Show more
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="w-16 hidden md:block" />
        </header>
    );
}
