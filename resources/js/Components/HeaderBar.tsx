import { useState, useMemo, useEffect, useRef } from 'react';
import portsGeoJson from '../../data/ports.json';
import countriesJson from '../../data/countries.json';
import citiesJson from '../../data/cities.json';
import { Vessel as MapVessel } from './MapDisplay';
import { FaSearch, FaShip, FaAnchor, FaGlobe, FaCity, FaHistory, FaTrash } from 'react-icons/fa';

interface Vessel {
    name: string;
    mmsi: string;
    imo: string;
    category: 'vessel';
    lat: number;
    lng: number;
}

interface Port {
    category: 'port';
    name: string;
    code: string;
    country: string;
    lat: number;
    lng: number;
}

interface Country {
    category: 'country';
    name: string;
    cca2: string;
    lat: number;
    lng: number;
}

interface Continent {
    category: 'continent';
    name: string;
    lat: number;
    lng: number;
}

interface Ocean {
    category: 'ocean';
    name: string;
    lat: number;
    lng: number;
}

interface City {
    category: 'city';
    name: string;
    country: string;
    iso: string;
    lat: number;
    lng: number;
}

interface CoordinateSearch {
    category: 'coordinate';
    name: string;
    lat: number;
    lng: number;
}

type SearchResult = Vessel | Port | Country | Continent | Ocean | City | CoordinateSearch;

const isVessel = (item: SearchResult): item is Vessel => item.category === 'vessel';
const isPort = (item: SearchResult): item is Port => item.category === 'port';
const isCountry = (item: SearchResult): item is Country => item.category === 'country';
const isCity = (item: SearchResult): item is City => item.category === 'city';
const isCoordinate = (item: SearchResult): item is CoordinateSearch =>
    item.category === 'coordinate';

interface Coordinates {
    lat: number;
    lng: number;
}

type NavigableItem =
    | { type: 'result'; data: SearchResult }
    | { type: 'recent'; data: SearchResult }
    | { type: 'expand'; category: string; label: string }
    | { type: 'clear_recents' };

interface HeaderBarProps {
    onNavigate?: (lat: number, lng: number, zoom: number) => void;
    trackedVessels?: MapVessel[];
    onVesselSelect?: (vessel: MapVessel | null) => void;
    selectedVesselName?: string;
    showClusterZoomNotice?: boolean;
}

interface PortData {
    name: string;
    country: string;
    code: string;
    lat: number;
    lng: number;
}

const WORLD_PORTS: Port[] = (portsGeoJson as PortData[]).map((p) => ({
    category: 'port' as const,
    name: p.name.toUpperCase(),
    code: p.code,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
}));

interface CountryData {
    name: string;
    lat: number;
    lng: number;
    cca2: string;
}

const WORLD_COUNTRIES: Country[] = (countriesJson as CountryData[]).map((c) => ({
    category: 'country' as const,
    name: c.name.toUpperCase(),
    cca2: c.cca2,
    lat: c.lat,
    lng: c.lng,
}));

const COUNTRY_LOOKUP: Record<string, string> = (countriesJson as CountryData[]).reduce(
    (acc, c) => {
        acc[c.cca2] = c.name.toUpperCase();
        return acc;
    },
    {} as Record<string, string>
);

const WORLD_CONTINENTS: Continent[] = [
    { category: 'continent', name: 'AFRICA', lat: 1.6508, lng: 17.321 },
    { category: 'continent', name: 'ANTARCTICA', lat: -75.2509, lng: -0.0713 },
    { category: 'continent', name: 'ASIA', lat: 34.0479, lng: 100.6197 },
    { category: 'continent', name: 'EUROPE', lat: 48.3794, lng: 14.5133 },
    { category: 'continent', name: 'NORTH AMERICA', lat: 46.073, lng: -100.546 },
    { category: 'continent', name: 'OCEANIA', lat: -25.2744, lng: 133.7751 },
    { category: 'continent', name: 'SOUTH AMERICA', lat: -15.6006, lng: -56.0721 },
];

const WORLD_OCEANS: Ocean[] = [
    { category: 'ocean', name: 'ARCTIC OCEAN', lat: 90, lng: 0 },
    { category: 'ocean', name: 'ATLANTIC OCEAN', lat: 0, lng: -30 },
    { category: 'ocean', name: 'INDIAN OCEAN', lat: -20, lng: 80 },
    { category: 'ocean', name: 'PACIFIC OCEAN', lat: 0, lng: -160 },
    { category: 'ocean', name: 'SOUTHERN OCEAN', lat: -60, lng: 0 },
];
interface RawCityData {
    name: string;
    lat: number;
    lng: number;
    country: string;
}

const WORLD_CITIES: City[] = (citiesJson as RawCityData[]).map((c) => ({
    category: 'city' as const,
    name: c.name.toUpperCase(),
    country: COUNTRY_LOOKUP[c.country] || c.country,
    iso: c.country,
    lat: c.lat,
    lng: c.lng,
}));

const parseVesselCoords = (input: string): Coordinates | null => {
    const q = input.trim();

    const stdDD = q.match(/^([-+]?\d{1,2}(?:\.\d+)?),\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (stdDD) return { lat: parseFloat(stdDD[1]), lng: parseFloat(stdDD[2]) };

    const hemiDD = q.match(/^(\d+(?:\.\d+)?)°?\s*([NSns]),?\s*(\d+(?:\.\d+)?)°?\s*([EWew])$/);
    if (hemiDD) {
        let lat = parseFloat(hemiDD[1]);
        let lng = parseFloat(hemiDD[3]);
        if (hemiDD[2].toUpperCase() === 'S') lat *= -1;
        if (hemiDD[4].toUpperCase() === 'W') lng *= -1;
        return { lat, lng };
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
        let lng = d2 + m2 / 60 + s2 / 3600;

        if (h1 === 'S') lat *= -1;
        if (h2 === 'W') lng *= -1;

        return { lat, lng };
    }

    return null;
};

export default function HeaderBar({
    onNavigate,
    trackedVessels = [],
    onVesselSelect,
    selectedVesselName,
    showClusterZoomNotice = false,
}: HeaderBarProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({
        country: 5,
        continent: 3,
        ocean: 3,
        vessel: 5,
        port: 5,
        city: 5,
    });
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [recentSearches, setRecentSearches] = useState<SearchResult[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sist_recent_searches');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse recent searches', e);
                }
            }
        }
        return [];
    });
    const [recentLimit, setRecentLimit] = useState(3);
    const [error, setError] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const activeQuery = selectedVesselName ?? query;
    const isSearchEmpty = !activeQuery.trim();
    const hasRecents = recentSearches.length > 0;

    useEffect(() => {
        if (selectedIndex >= 0 && scrollContainerRef.current) {
            const selectedElement =
                scrollContainerRef.current.querySelector('[data-selected="true"]');
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth',
                });
            }
        }
    }, [selectedIndex]);

    const handleLogoClick = () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        setTimeout(() => {
            window.location.reload();
        }, 800);
    };

    const allResults = useMemo(() => {
        const liveVessels: Vessel[] = trackedVessels.map((v) => ({
            category: 'vessel' as const,
            name: v.name || 'UNKNOWN',
            mmsi: String(v.mmsi),
            imo: String(v.imo || ''),
            lat: v.lat,
            lng: v.lng,
        }));
        return [
            ...liveVessels,
            ...WORLD_PORTS,
            ...WORLD_COUNTRIES,
            ...WORLD_CITIES,
            ...WORLD_CONTINENTS,
            ...WORLD_OCEANS,
        ];
    }, [trackedVessels]);

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
            if (item.category === 'port') {
                return (
                    item.name.toUpperCase().includes(q) ||
                    (item.code && item.code.toUpperCase().includes(q)) ||
                    (item.country && item.country.toUpperCase().includes(q))
                );
            }
            if (item.category === 'country') {
                return item.name.toUpperCase().includes(q) || item.cca2.toUpperCase().includes(q);
            }
            if (item.category === 'city') {
                return (
                    item.name.toUpperCase().includes(q) ||
                    (item.country && item.country.toUpperCase().includes(q))
                );
            }
            return item.name.toUpperCase().includes(q);
        });

        return matches.sort((a, b) => {
            if (a.category !== b.category) {
                const priority: Record<string, number> = {
                    country: 0,
                    continent: 1,
                    ocean: 2,
                    city: 3,
                    vessel: 4,
                    port: 5,
                };
                return priority[a.category] - priority[b.category];
            }
            return a.name.localeCompare(b.name);
        });
    }, [activeQuery, allResults]);

    const visibleItems = useMemo(() => {
        const items: NavigableItem[] = [];

        if (isSearchEmpty && hasRecents) {
            const displayedRecents = recentSearches.slice(0, recentLimit);
            displayedRecents.forEach((d) => items.push({ type: 'recent', data: d }));
            if (recentSearches.length > recentLimit) {
                items.push({ type: 'expand', category: 'recent', label: 'Recent Searches' });
            }
            items.push({ type: 'clear_recents' });
        }

        ['country', 'city', 'continent', 'ocean', 'vessel', 'port'].forEach((cat) => {
            const catItems = suggestions.filter((i) => i.category === cat);
            const displayed = catItems.slice(0, categoryLimits[cat]);

            displayed.forEach((d) => items.push({ type: 'result', data: d }));

            if (catItems.length > categoryLimits[cat]) {
                const label =
                    cat === 'vessel'
                        ? 'Vessels'
                        : cat === 'port'
                          ? 'Ports'
                          : cat === 'country'
                            ? 'Countries'
                            : cat === 'city'
                              ? 'Cities / Towns'
                              : cat === 'continent'
                                ? 'Continents'
                                : 'Oceans';
                items.push({ type: 'expand', category: cat, label });
            }
        });
        return items;
    }, [suggestions, categoryLimits, isSearchEmpty, hasRecents, recentSearches, recentLimit]);

    const showSuggestionsPanel =
        showSuggestions && !error && (suggestions.length > 0 || hasRecents);

    const handleSelect = (item: SearchResult) => {
        setRecentSearches((prev) => {
            const filtered = prev.filter(
                (r) =>
                    !(
                        r.name === item.name &&
                        r.category === item.category &&
                        (isVessel(r) && isVessel(item) ? r.mmsi === item.mmsi : true)
                    )
            );
            const updated = [item, ...filtered].slice(0, 20);
            localStorage.setItem('sist_recent_searches', JSON.stringify(updated));
            return updated;
        });

        // @ts-expect-error - GTM dataLayer
        window.dataLayer = window.dataLayer || [];
        // @ts-expect-error - GTM dataLayer
        window.dataLayer.push({
            event: 'search_select',
            search_item_name: item.name,
            search_item_category: item.category,
        });

        if (item.category === 'vessel') {
            if (onVesselSelect) {
                const originalVessel = trackedVessels.find(
                    (v: MapVessel) => String(v.mmsi) === item.mmsi
                );
                onVesselSelect(originalVessel || null);
            }
        }

        if (onNavigate) {
            let zoom = 14;
            if (item.category === 'country') zoom = 6;
            if (item.category === 'continent') zoom = 3;
            if (item.category === 'ocean') zoom = 3;
            if (item.category === 'city') zoom = 11;
            onNavigate(item.lat, item.lng, zoom);
        }

        setQuery(item.name);
        setShowSuggestions(false);
        setCategoryLimits({
            country: 5,
            continent: 3,
            ocean: 3,
            vessel: 5,
            port: 5,
            city: 5,
        });
        setError(null);
        setSelectedIndex(-1);
        setRecentLimit(3);
    };

    const clearRecents = () => {
        setRecentSearches([]);
        localStorage.removeItem('sist_recent_searches');
        setSelectedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0 && visibleItems[selectedIndex]) {
                const item = visibleItems[selectedIndex];
                if (item.type === 'result' || item.type === 'recent') {
                    handleSelect(item.data);
                } else if (item.type === 'clear_recents') {
                    clearRecents();
                } else {
                    if (item.category === 'recent') {
                        setRecentLimit((prev) => prev + 5);
                    } else {
                        setCategoryLimits((prev) => ({
                            ...prev,
                            [item.category]: prev[item.category] + 5,
                        }));
                    }
                }
                return;
            }
            const q = activeQuery.trim();
            const coords = parseVesselCoords(q);

            if (coords) {
                const { lat, lng } = coords;
                if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    setError('Invalid coordinates: Values outside Earth boundaries');
                    return;
                }

                if (onNavigate) {
                    onNavigate(lat, lng, 12);
                }

                handleSelect({
                    category: 'coordinate',
                    name: q,
                    lat,
                    lng,
                });
                return;
            }

            const upperQ = q.toUpperCase();
            const exactMatch = allResults.find((item) => {
                if (item.category === 'vessel') {
                    return item.name === upperQ || item.mmsi === upperQ || item.imo === upperQ;
                }
                if (item.category === 'port') {
                    return item.name === upperQ || item.code === upperQ;
                }
                if (item.category === 'country') {
                    return item.name === upperQ || item.cca2 === upperQ;
                }
                return item.name === upperQ;
            });

            if (exactMatch) {
                handleSelect(exactMatch);
            } else if (q.length > 0) {
                setError('No match found.');
            }
        }
    };

    return (
        <header
            role="banner"
            className="fixed top-0 left-0 right-0 z-50 p-2 sm:p-4 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-2 sm:gap-0 pointer-events-none"
        >
            {showSuggestionsPanel && (
                <div
                    className="fixed inset-0 pointer-events-auto z-0"
                    onClick={() => setShowSuggestions(false)}
                />
            )}

            <div
                onClick={handleLogoClick}
                role="button"
                aria-label={isRefreshing ? 'Refreshing Page' : 'SIST Home - Refresh'}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleLogoClick()}
                className="relative flex items-center gap-2 sm:gap-3 bg-zinc-950 border border-white/20 px-3 py-2 sm:px-4 sm:py-3 shadow-2xl pointer-events-auto z-10 self-start cursor-pointer transition-all active:scale-95"
            >
                {isRefreshing ? (
                    <div className="relative w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center">
                        <div className="w-full h-full border-[3px] border-white/10 rounded-full" />
                        <div
                            className="absolute inset-0 border-t-[3px] border-white rounded-full animate-spin"
                            aria-hidden="true"
                        />
                        <span className="sr-only">Refreshing...</span>
                    </div>
                ) : (
                    <img
                        src="/images/logo.png"
                        alt=""
                        width="112"
                        height="28"
                        className="h-5 sm:h-7 w-auto"
                    />
                )}
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-white text-xs sm:text-sm font-bold tracking-wider">
                        {isRefreshing ? 'REFRESHING...' : 'SIST'}
                    </span>
                    <span className="text-zinc-500 text-[8px] sm:text-[9px] font-medium mt-0.5 hidden xs:block">
                        {isRefreshing
                            ? 'REFRESHING THE PAGE...'
                            : 'Intelligence & Suspicion Tracker'}
                    </span>
                </div>
            </div>

            <div className="relative w-full sm:px-0 sm:max-w-[400px] min-[960px]:absolute min-[960px]:left-1/2 min-[960px]:-translate-x-1/2 pointer-events-auto z-10">
                <div className="relative flex items-center gap-3 bg-zinc-950 border border-white/20 px-4 py-3 shadow-2xl transition-all focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10">
                    <FaSearch
                        className={`w-4 h-4 ${query ? 'text-white' : 'text-zinc-500'}`}
                        aria-hidden="true"
                    />
                    <input
                        type="text"
                        value={activeQuery}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={showSuggestionsPanel}
                        aria-haspopup="listbox"
                        aria-controls="search-results-listbox"
                        aria-activedescendant={
                            selectedIndex >= 0 ? `suggestion-item-${selectedIndex}` : undefined
                        }
                        aria-label="Search vessels, ports, or coordinates"
                        onChange={(e) => {
                            if (selectedVesselName && onVesselSelect) {
                                onVesselSelect(null);
                            }
                            setQuery(e.target.value);
                            setSelectedIndex(-1);
                            setCategoryLimits({
                                country: 5,
                                continent: 3,
                                ocean: 3,
                                vessel: 5,
                                port: 5,
                                city: 5,
                            });
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
                    <div
                        ref={scrollContainerRef}
                        id="search-results-listbox"
                        role="listbox"
                        aria-label="Search suggestions"
                        className="absolute top-full left-0 right-0 bg-zinc-950 border-x border-b border-white/20 shadow-2xl mt-px max-h-[60vh] overflow-y-auto"
                    >
                        {isSearchEmpty && hasRecents && (
                            <div className="border-b border-white/10">
                                <div className="px-4 py-2 border-b border-white/5 bg-white/2 flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                        Recent Searches
                                    </span>
                                    <button
                                        onClick={clearRecents}
                                        aria-label="Clear recent searches"
                                        className="text-[8px] text-zinc-600 hover:text-red-400 font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
                                    >
                                        <FaTrash className="w-2 h-2" />
                                        Clear
                                    </button>
                                </div>
                                {recentSearches.slice(0, recentLimit).map((item, idx) => {
                                    const globalIdx = visibleItems.findIndex(
                                        (vi) => vi.type === 'recent' && vi.data === item
                                    );
                                    const isSelected = globalIdx === selectedIndex;
                                    const Icon =
                                        item.category === 'vessel'
                                            ? FaShip
                                            : item.category === 'port'
                                              ? FaAnchor
                                              : item.category === 'city'
                                                ? FaCity
                                                : FaGlobe;

                                    return (
                                        <button
                                            key={`recent-${idx}`}
                                            id={`suggestion-item-${globalIdx}`}
                                            role="option"
                                            aria-selected={isSelected}
                                            data-selected={isSelected}
                                            onClick={() => handleSelect(item)}
                                            className={`w-full flex items-center justify-between px-4 py-3 transition-colors border-b border-white/5 last:border-none text-left ${
                                                isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <FaHistory
                                                    className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-zinc-500'}`}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-white text-[11px] font-bold">
                                                        {item.name}
                                                    </span>
                                                    <span
                                                        className={`text-[8px] font-mono uppercase ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}
                                                    >
                                                        {isVessel(item)
                                                            ? `MMSI: ${item.mmsi} | IMO: ${item.imo || 'Unknown'}`
                                                            : isPort(item)
                                                              ? `CODE: ${item.code} | ${item.country}`
                                                              : isCountry(item)
                                                                ? `ISO: ${item.cca2}`
                                                                : isCity(item)
                                                                  ? `COUNTRY: ${item.country} (${item.iso})`
                                                                  : isCoordinate(item)
                                                                    ? 'Coordinates'
                                                                    : item.category === 'continent'
                                                                      ? 'Region'
                                                                      : 'Water Body'}
                                                    </span>
                                                </div>
                                            </div>
                                            <Icon className="w-3 h-3 text-white/10" />
                                        </button>
                                    );
                                })}
                                {recentSearches.length > recentLimit && (
                                    <button
                                        onClick={() => setRecentLimit((prev) => prev + 5)}
                                        className={`w-full py-2 text-[9px] font-bold uppercase tracking-widest transition-colors border-b border-white/5 ${
                                            selectedIndex ===
                                            visibleItems.findIndex(
                                                (vi) =>
                                                    vi.type === 'expand' && vi.category === 'recent'
                                            )
                                                ? 'bg-white/10 text-white'
                                                : 'bg-white/2 hover:bg-white/5 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        Show more Recent
                                    </button>
                                )}
                            </div>
                        )}

                        {isSearchEmpty && (
                            <div className="px-4 py-2 border-b border-white/5 bg-white/2">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                    Quick Search
                                </span>
                            </div>
                        )}

                        {['country', 'city', 'continent', 'ocean', 'vessel', 'port'].map((cat) => {
                            const catItems = suggestions.filter((i) => i.category === cat);
                            if (catItems.length === 0) return null;

                            const displayed = catItems.slice(0, categoryLimits[cat]);
                            const label =
                                cat === 'vessel'
                                    ? 'Vessels'
                                    : cat === 'port'
                                      ? 'Ports'
                                      : cat === 'country'
                                        ? 'Countries'
                                        : cat === 'city'
                                          ? 'Cities / Towns'
                                          : cat === 'continent'
                                            ? 'Continents'
                                            : 'Oceans';
                            const Icon =
                                cat === 'vessel'
                                    ? FaShip
                                    : cat === 'port'
                                      ? FaAnchor
                                      : cat === 'city'
                                        ? FaCity
                                        : FaGlobe;

                            return (
                                <div key={cat}>
                                    <div
                                        className={`px-4 py-2 bg-zinc-900/30 border-b border-white/5 ${cat !== 'country' ? 'mt-2' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                                                {label}
                                            </span>
                                            <span className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">
                                                {catItems.length.toLocaleString()} found
                                            </span>
                                        </div>
                                    </div>
                                    {displayed.map((item, idx) => {
                                        const globalIdx = visibleItems.findIndex(
                                            (vi) => vi.type === 'result' && vi.data === item
                                        );
                                        const isSelected = globalIdx === selectedIndex;
                                        return (
                                            <button
                                                key={`${cat}-${idx}`}
                                                id={`suggestion-item-${globalIdx}`}
                                                role="option"
                                                aria-selected={isSelected}
                                                data-selected={isSelected}
                                                onClick={() => handleSelect(item)}
                                                className={`w-full flex items-center justify-between px-4 py-3 transition-colors border-b border-white/5 last:border-none text-left ${
                                                    isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon
                                                        className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-zinc-500'}`}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-white text-[11px] font-bold">
                                                            {item.name}
                                                        </span>
                                                        <span
                                                            className={`text-[9px] font-mono uppercase ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}
                                                        >
                                                            {isVessel(item)
                                                                ? `MMSI: ${item.mmsi} | IMO: ${item.imo || 'Unknown'}`
                                                                : isPort(item)
                                                                  ? `CODE: ${item.code} | ${item.country}`
                                                                  : isCountry(item)
                                                                    ? `ISO: ${item.cca2}`
                                                                    : isCity(item)
                                                                      ? `COUNTRY: ${item.country} (${item.iso})`
                                                                      : item.category ===
                                                                          'continent'
                                                                        ? 'Region'
                                                                        : 'Water Body'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {catItems.length > categoryLimits[cat] && (
                                        <button
                                            type="button"
                                            data-selected={
                                                selectedIndex ===
                                                visibleItems.findIndex(
                                                    (vi) =>
                                                        vi.type === 'expand' && vi.category === cat
                                                )
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setCategoryLimits((prev) => ({
                                                    ...prev,
                                                    [cat]: prev[cat] + 5,
                                                }));
                                            }}
                                            className={`w-full py-2 text-[9px] font-bold uppercase tracking-widest transition-colors border-b border-white/5 ${
                                                selectedIndex ===
                                                visibleItems.findIndex(
                                                    (vi) =>
                                                        vi.type === 'expand' && vi.category === cat
                                                )
                                                    ? 'bg-white/10 text-white'
                                                    : 'bg-white/2 hover:bg-white/5 text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            Show more {label}
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        <div className="flex flex-col gap-2 px-4 py-2 bg-white/2 border-t border-white/5">
                            <div className="flex items-center justify-center">
                                <span className="text-[9px] text-zinc-600 font-medium">
                                    Total search results: {suggestions.length.toLocaleString()}
                                </span>
                            </div>
                            {suggestions.some((i) => i.category === 'port') && (
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
