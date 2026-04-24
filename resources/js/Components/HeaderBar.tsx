import { useState, useMemo } from 'react';
import { FaSearch, FaShip, FaAnchor } from 'react-icons/fa';

const SAMPLE_VESSELS = [
    {
        name: 'OCEAN EXPLORER',
        mmsi: '235114700',
        imo: '9153549',
        type: 'Research',
        category: 'vessel',
    },
    { name: 'ARCTIC TERN', mmsi: '231001000', imo: '8901234', type: 'Fishing', category: 'vessel' },
    { name: 'GLOBAL TRADER', mmsi: '351123000', imo: '9412345', type: 'Cargo', category: 'vessel' },
    { name: 'PACIFIC STAR', mmsi: '563001000', imo: '9876543', type: 'Tanker', category: 'vessel' },
    {
        name: 'NORTH SEA GIANT',
        mmsi: '257545000',
        imo: '9523964',
        type: 'Offshore',
        category: 'vessel',
    },
    { name: 'BLUE WHALE', mmsi: '477312600', imo: '9616759', type: 'Tug', category: 'vessel' },
    {
        name: 'EVER GIVEN',
        mmsi: '353136000',
        imo: '9811000',
        type: 'Container',
        category: 'vessel',
    },
    {
        name: 'VIKING GRACE',
        mmsi: '230629000',
        imo: '9606900',
        type: 'Passenger',
        category: 'vessel',
    },
];

const SAMPLE_PORTS = [
    {
        name: 'PORT OF SINGAPORE',
        code: 'SGSIN',
        country: 'Singapore',
        type: 'Main',
        category: 'port',
    },
    {
        name: 'PORT OF ROTTERDAM',
        code: 'NLRTM',
        country: 'Netherlands',
        type: 'Major',
        category: 'port',
    },
    { name: 'PORT OF SHANGHAI', code: 'CNSHA', country: 'China', type: 'Main', category: 'port' },
    {
        name: 'PORT OF LOS ANGELES',
        code: 'USLAX',
        country: 'United States',
        type: 'Major',
        category: 'port',
    },
];

const ALL_RESULTS = [...SAMPLE_VESSELS, ...SAMPLE_PORTS];

const COORD_REGEX = /^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/;

export default function HeaderBar() {
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [limit, setLimit] = useState(5);
    const [error, setError] = useState<string | null>(null);

    const suggestions = useMemo(() => {
        const q = query.toUpperCase().trim();
        if (!q) return ALL_RESULTS;

        return ALL_RESULTS.filter((item) => {
            if (item.category === 'vessel') {
                return (
                    item.name.includes(q) ||
                    (item as any).mmsi.includes(q) ||
                    (item as any).imo.includes(q)
                );
            }
            return (
                item.name.includes(q) ||
                (item as any).code.includes(q) ||
                (item as any).country.toUpperCase().includes(q)
            );
        });
    }, [query]);

    const displayedSuggestions = useMemo(() => {
        return suggestions.slice(0, limit);
    }, [suggestions, limit]);

    const handleSelect = (item: (typeof ALL_RESULTS)[0]) => {
        if (item.category === 'vessel') {
            console.log(`MONITORING VESSEL: ${item.name} (MMSI: ${(item as any).mmsi})`);
        } else {
            console.log(
                `ARRIVING AT PORT: ${item.name} (${(item as any).code}, ${(item as any).country})`
            );
        }
        setQuery(item.name);
        setShowSuggestions(false);
        setLimit(5);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const q = query.trim();

            // 1. Check for coordinates
            const coordMatch = q.match(COORD_REGEX);
            if (coordMatch) {
                const lat = parseFloat(coordMatch[1]);
                const lon = parseFloat(coordMatch[2]);
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    setError(
                        'Invalid coordinates: Values outside Earth boundaries (Lat: -90/90, Lon: -180/180)'
                    );
                    return;
                }
                console.log(`NAVIGATING TO COORDINATES: [${lat}, ${lon}]`);
                setError(null);
                setShowSuggestions(false);
                return;
            }

            // 2. Check for exact matches
            const upperQ = q.toUpperCase();
            const exactMatch = ALL_RESULTS.find((item) => {
                if (item.category === 'vessel') {
                    return (
                        item.name === upperQ ||
                        (item as any).mmsi === upperQ ||
                        (item as any).imo === upperQ
                    );
                }
                return item.name === upperQ || (item as any).code === upperQ;
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
            {/* Click-off Overlay */}
            {showSuggestions && (
                <div
                    className="fixed inset-0 pointer-events-auto z-0"
                    onClick={() => setShowSuggestions(false)}
                />
            )}

            {/* Logo Block */}
            <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 rounded-none px-4 py-3 shadow-2xl pointer-events-auto z-10">
                <img src="/images/logo.png" alt="SIST Logo" className="h-7 w-auto" />
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-white text-sm font-bold tracking-wider">SIST</span>
                    <span className="text-zinc-500 text-[9px] font-medium tracking-tight mt-0.5">
                        Ship Intelligence & Suspicion Tracker
                    </span>
                </div>
            </div>

            {/* Search Bar Block */}
            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[400px] pointer-events-auto z-10">
                <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 rounded-none px-4 py-3 shadow-2xl transition-all focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10">
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

                {/* Error Message */}
                {error && (
                    <div className="absolute top-full left-0 right-0 bg-red-500/10 border border-red-500/50 rounded-none px-4 py-2 mt-[1px] shadow-2xl">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                            {error}
                        </span>
                    </div>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && !error && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-zinc-950 border-x border-b border-white/20 shadow-2xl mt-[1px] max-h-[400px] overflow-y-auto">
                        {!query.trim() && (
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    Quick Search
                                </span>
                            </div>
                        )}
                        {displayedSuggestions.map((item) => (
                            <button
                                key={
                                    item.category === 'vessel'
                                        ? (item as any).mmsi
                                        : (item as any).code
                                }
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
                                                ? `MMSI: ${(item as any).mmsi} | IMO: ${(item as any).imo}`
                                                : `CODE: ${(item as any).code} | ${(item as any).country}`}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter bg-white/5 px-1.5 py-0.5">
                                    {item.type}
                                </span>
                            </button>
                        ))}

                        {/* Search Footer */}
                        <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-t border-white/5">
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

            {/* Right side spacer */}
            <div className="w-16 hidden md:block" />
        </header>
    );
}
