import { useEffect, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import {
    MapContainer,
    TileLayer,
    useMap,
    Marker,
    Popup,
    useMapEvents,
    Polyline,
    CircleMarker,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
    FaPlus,
    FaMinus,
    FaXmark,
    FaLayerGroup,
    FaCity,
    FaAnchor,
    FaLocationArrow,
} from 'react-icons/fa6';
import L from 'leaflet';
import axios from 'axios';
import portsData from '../../data/ports.json';
import countriesData from '../../data/countries.json';
import citiesData from '../../data/cities.json';
import { HistoryPosition } from '../Pages/Index';

// @ts-expect-error - Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MAX_BOUNDS: L.LatLngBoundsExpression = [
    [-90, -180],
    [90, 180],
];

interface Country {
    name: string;
    lat: number;
    lng: number;
    cca2: string;
}

const COUNTRY_NAMES: Record<string, string> = (countriesData as Country[]).reduce(
    (acc, c) => {
        acc[c.cca2] = c.name;
        return acc;
    },
    {} as Record<string, string>
);

export interface Vessel {
    mmsi: number;
    imo?: number;
    name: string;
    lat: number;
    lng: number;
    course: number;
}

interface ClusteredVessel extends Vessel {
    isCluster: boolean;
    clusterCount: number;
    sumLat: number;
    sumLng: number;
}

const IGNORED_VESSEL_NAMES = ['--'];

function normalizeVessels(raw: Vessel[]): Vessel[] {
    // Deduplicates raw vessel data by MMSI.
    // AIS data frequently contains overlapping or malformed broadcasts (e.g., ships named "--").
    // This logic ensures that if multiple records exist for the same MMSI, the one with a "useful" name is kept.
    const byMmsi = new Map<number, Vessel>();

    for (const vessel of raw) {
        const trimmedName = (vessel.name || '').trim().toUpperCase();

        if (!trimmedName || IGNORED_VESSEL_NAMES.includes(trimmedName)) {
            continue;
        }

        const existing = byMmsi.get(vessel.mmsi);
        if (!existing) {
            byMmsi.set(vessel.mmsi, vessel);
            continue;
        }

        const existingName = (existing.name || '').trim().toUpperCase();
        const currentName = (vessel.name || '').trim().toUpperCase();
        const existingHasUsefulName =
            existingName.length > 2 && !IGNORED_VESSEL_NAMES.includes(existingName);
        const currentHasUsefulName =
            currentName.length > 2 && !IGNORED_VESSEL_NAMES.includes(currentName);

        if (currentHasUsefulName && !existingHasUsefulName) {
            byMmsi.set(vessel.mmsi, vessel);
        }
    }

    return Array.from(byMmsi.values());
}

function FleetLayer({
    onUpdate,
    selectedMmsi,
    onVesselSelect,
    onClusterZoomNotice,
    showAll,
    sidebarOpen,
}: {
    onUpdate?: (stats: {
        renderedIcons: number;
        totalRenderedShips: number;
        trackedShips: number;
        trackedVessels: Vessel[];
        currentArea: string;
    }) => void;
    selectedMmsi: number | null;
    onVesselSelect?: (vessel: Vessel | null) => void;
    onClusterZoomNotice?: () => void;
    showAll?: boolean;
    sidebarOpen?: boolean;
}) {
    const map = useMap();
    const [windowVessels, setWindowVessels] = useState<Vessel[]>([]);
    const [trackedCount, setTrackedCount] = useState(0);
    const [trackedSearchVessels, setTrackedSearchVessels] = useState<Vessel[]>([]);
    const [zoom, setZoom] = useState(map.getZoom());
    const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trackedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const suppressNextMapClickRef = useRef(false);
    const lastClusterInteractionRef = useRef<{ mmsi: number; at: number } | null>(null);
    const [lastActivity, setLastActivity] = useState(() => Date.now());
    const [isIdle, setIsIdle] = useState(false);
    const IDLE_THRESHOLD = 120000;

    const recordActivity = useCallback(() => {
        setLastActivity(() => Date.now());
        if (isIdle) setIsIdle(false);
    }, [isIdle]);

    const fetchWindowVessels = useCallback(
        async (force = false) => {
            if (isIdle && !force) return;

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            const controller = new AbortController();
            abortControllerRef.current = controller;

            const bounds = map.getBounds();
            const currentZoom = map.getZoom();

            try {
                // Fetch only vessels within the current viewport bounds to optimize rendering and database queries
                // age_minutes limits results to recently active vessels for performance
                // TODO: Change to relative path once finished with dev
                const response = await axios.get('https://sist.tristanbudd.com/api/v1/vessels', {
                    signal: controller.signal,
                    params: {
                        sw_lat: bounds.getSouthWest().lat,
                        sw_lng: bounds.getSouthWest().lng,
                        ne_lat: bounds.getNorthEast().lat,
                        ne_lng: bounds.getNorthEast().lng,
                        age_minutes: 60,
                    },
                });
                setZoom(currentZoom);
                const data = normalizeVessels(response.data.data || []);
                setWindowVessels(data);
            } catch (error) {
                if (axios.isCancel(error)) return;
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    setWindowVessels([]);
                    return;
                }
                console.error('Failed to fetch fleet data:', error);
                setWindowVessels([]);
            } finally {
                if (abortControllerRef.current === controller) {
                    abortControllerRef.current = null;
                }
            }
        },
        [map, isIdle]
    );

    const fetchTrackedSearchVessels = useCallback(async () => {
        if (isIdle) return;

        let allVessels: Vessel[] = [];
        let offset = 0;
        let hasMore = true;
        const BATCH_LIMIT = 2500;

        try {
            while (hasMore) {
                // TODO: Change to relative path once finished with dev
                const response = await axios.get('https://sist.tristanbudd.com/api/v1/vessels', {
                    params: {
                        age_minutes: 60,
                        offset: offset,
                    },
                });

                const batch = response.data.data || [];
                allVessels = [...allVessels, ...batch];

                if (batch.length < BATCH_LIMIT) {
                    hasMore = false;
                } else {
                    offset += BATCH_LIMIT;
                }

                if (offset >= 100000) break;
            }

            const normalized = normalizeVessels(allVessels);
            setTrackedCount(normalized.length);
            setTrackedSearchVessels(normalized);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                if (offset === 0) {
                    setTrackedCount(0);
                    setTrackedSearchVessels([]);
                }
                return;
            }
            console.error('Failed to fetch global fleet:', error);
        }
    }, [isIdle]);

    const debouncedFetch = useCallback(() => {
        // Debounce map movement events to prevent spamming the API while the user is actively panning or zooming
        if (fetchTimer.current) {
            clearTimeout(fetchTimer.current);
        }
        fetchTimer.current = setTimeout(() => {
            fetchWindowVessels();
        }, 400);
    }, [fetchWindowVessels]);

    useMapEvents({
        moveend: () => {
            recordActivity();
            debouncedFetch();
        },
        zoomend: () => {
            recordActivity();
            setZoom(map.getZoom());
            debouncedFetch();
        },
        popupclose: () => {
            suppressNextMapClickRef.current = true;
            setTimeout(() => {
                suppressNextMapClickRef.current = false;
            }, 100);
        },
        click: (e) => {
            recordActivity();
            const target = e.originalEvent?.target as HTMLElement | null;
            if (
                target?.closest(
                    '.leaflet-marker-icon, .leaflet-popup, .leaflet-popup-content, .leaflet-interactive'
                )
            ) {
                return;
            }
            if (suppressNextMapClickRef.current) {
                suppressNextMapClickRef.current = false;
                return;
            }
            if (onVesselSelect) onVesselSelect(null);
        },
        dragstart: recordActivity,
        mousedown: recordActivity,
    });

    useEffect(() => {
        const handleGlobalClick = () => recordActivity();
        window.addEventListener('click', handleGlobalClick);

        const interval = setInterval(() => {
            if (Date.now() - lastActivity > IDLE_THRESHOLD) {
                setIsIdle(true);
            }
        }, 5000);

        return () => {
            window.removeEventListener('click', handleGlobalClick);
            clearInterval(interval);
        };
    }, [lastActivity, recordActivity]);

    useEffect(() => {
        const initializeMapData = async () => {
            await fetchWindowVessels(true);
            await fetchTrackedSearchVessels();
        };

        initializeMapData();

        pollTimer.current = setInterval(() => fetchWindowVessels(), 15000);
        trackedTimer.current = setInterval(() => fetchTrackedSearchVessels(), 300000);

        return () => {
            if (fetchTimer.current) clearTimeout(fetchTimer.current);
            if (pollTimer.current) clearInterval(pollTimer.current);
            if (trackedTimer.current) clearInterval(trackedTimer.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [fetchWindowVessels, fetchTrackedSearchVessels]);

    const visibleVessels = useMemo(() => {
        const filtered: ClusteredVessel[] = [];

        const minDistancePx = zoom < 4 ? 25 : zoom < 9 ? 30 : zoom < 12 ? 25 : zoom < 15 ? 15 : 0;

        if (minDistancePx === 0) {
            return windowVessels.map((v) => ({
                ...v,
                isCluster: false,
                clusterCount: 1,
                sumLat: v.lat,
                sumLng: v.lng,
            }));
        }

        windowVessels.forEach((vessel) => {
            // Selected vessels bypass clustering to remain interactive
            if (vessel.mmsi === selectedMmsi) {
                filtered.push({
                    ...vessel,
                    isCluster: false,
                    clusterCount: 1,
                    sumLat: vessel.lat,
                    sumLng: vessel.lng,
                });
                return;
            }

            // Convert geographical coordinates to screen pixels for distance comparison
            const pos = map.latLngToLayerPoint([vessel.lat, vessel.lng]);
            const clusterIndex = filtered.findIndex((f) => {
                const fPos = map.latLngToLayerPoint([f.lat, f.lng]);
                const dist = Math.sqrt(Math.pow(pos.x - fPos.x, 2) + Math.pow(pos.y - fPos.y, 2));
                return dist < minDistancePx;
            });

            if (clusterIndex !== -1) {
                filtered[clusterIndex].isCluster = true;
                filtered[clusterIndex].clusterCount++;
                filtered[clusterIndex].sumLat += vessel.lat;
                filtered[clusterIndex].sumLng += vessel.lng;
            } else {
                filtered.push({
                    ...vessel,
                    isCluster: false,
                    clusterCount: 1,
                    sumLat: vessel.lat,
                    sumLng: vessel.lng,
                });
            }
        });

        return filtered.map((v) => {
            const isActualCluster = v.isCluster && v.clusterCount > 1;
            return {
                ...v,
                isCluster: isActualCluster,
                lat: isActualCluster ? v.sumLat / v.clusterCount : v.lat,
                lng: isActualCluster ? v.sumLng / v.clusterCount : v.lng,
            };
        });
    }, [windowVessels, map, zoom, selectedMmsi]);

    const getAreaName = useCallback((lat: number, lng: number, currentZoom: number) => {
        if (currentZoom <= 3) return 'WORLD OVERVIEW';

        // High Latitude / Polar
        if (lat > 75) return 'ARCTIC REGION';
        if (lat < -60) return 'SOUTHERN OCEAN';

        // North America
        if (lat > 15 && lat < 75 && lng > -170 && lng < -50) {
            if (lat > 25 && lat < 50) {
                if (lng > -130 && lng < -115) return 'US WEST COAST';
                if (lng > -85 && lng < -65) return 'US EAST COAST';
                if (lng > -98 && lng < -80 && lat < 31) return 'GULF OF MEXICO';
            }
            if (lat > 50) return 'CANADA / ALASKA';
            if (lat < 25) return 'CENTRAL AMERICA';
            return 'NORTH AMERICA';
        }

        // Caribbean
        if (lat > 10 && lat < 28 && lng > -98 && lng < -55) {
            return 'CARIBBEAN SEA';
        }

        // South America
        if (lat > -60 && lat < 15 && lng > -95 && lng < -30) {
            return 'SOUTH AMERICA';
        }

        // Europe
        if (lat > 35 && lat < 75 && lng > -25 && lng < 45) {
            if (lat > 30 && lat < 47 && lng > -6 && lng < 42) return 'MEDITERRANEAN SEA';
            if (lat > 50 && lat < 62 && lng > -10 && lng < 10) return 'NORTHERN EUROPE';
            if (lat > 55 && lat < 70 && lng > 10 && lng < 35) return 'BALTIC SEA';
            return 'EUROPE';
        }

        // Africa
        if (lat > -38 && lat < 38 && lng > -25 && lng < 55) {
            if (lat > 12 && lat < 30 && lng > 32 && lng < 45) return 'RED SEA';
            if (lat > -5 && lat < 15 && lng > -20 && lng < 15) return 'GULF OF GUINEA';
            return 'AFRICA';
        }

        // Asia
        if (lat > -10 && lat < 80 && lng > 50 && lng < 180) {
            if (lat > 10 && lat < 30 && lng > 50 && lng < 78) return 'ARABIAN SEA';
            if (lat > 5 && lat < 28 && lng > 78 && lng < 100) return 'BAY OF BENGAL';
            if (lat > -5 && lat < 25 && lng > 100 && lng < 125) return 'SOUTH CHINA SEA';
            if (lat > 20 && lat < 55 && lng > 120 && lng < 155) return 'EAST ASIA';
            if (lat > 50) return 'RUSSIA / NORTH ASIA';
            return 'ASIA';
        }

        // Oceania / Australia
        if (lat > -50 && lat < 10 && lng > 110 && lng < 180) {
            if (lat < -10) return 'AUSTRALIA / NZ';
            return 'OCEANIA';
        }

        // Oceans (General)
        if (lat > 0) {
            if (lng > -80 && lng < 0) return 'NORTH ATLANTIC';
            if (lng > 120 || lng < -120) return 'NORTH PACIFIC';
            if (lng > 40 && lng < 110) return 'INDIAN OCEAN';
        } else {
            if (lng > -70 && lng < 20) return 'SOUTH ATLANTIC';
            if (lng > 120 || lng < -100) return 'SOUTH PACIFIC';
            if (lng > 20 && lng < 115) return 'INDIAN OCEAN';
        }

        return 'WORLD OVERVIEW';
    }, []);

    useEffect(() => {
        if (onUpdate) {
            const totalRenderedShips = visibleVessels.reduce((acc, v) => acc + v.clusterCount, 0);
            const center = map.getCenter();
            onUpdate({
                renderedIcons: visibleVessels.length,
                totalRenderedShips,
                trackedShips: trackedCount,
                trackedVessels: trackedSearchVessels,
                currentArea: getAreaName(center.lat, center.lng, zoom),
            });
        }
    }, [visibleVessels, trackedCount, trackedSearchVessels, onUpdate, map, zoom, getAreaName]);

    const createVesselIcon = (course: number, isCluster: boolean, isSelected: boolean) => {
        const color = isSelected ? '#ef4444' : 'white';
        const shadowColor = isSelected ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.4)';

        const singleIconHtml = renderToString(
            <FaLocationArrow
                style={{
                    color,
                    width: '16px',
                    height: '16px',
                    transform: 'rotate(-45deg)',
                    filter: 'drop-shadow(0 0 1px black)',
                }}
            />
        );

        const clusterIconHtml = renderToString(
            <div
                style={{ position: 'relative', width: '22px', height: '22px', overflow: 'visible' }}
            >
                <FaLocationArrow
                    style={{
                        color,
                        width: '18px',
                        height: '18px',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: 'rotate(-45deg)',
                        filter: 'drop-shadow(0 0 1px black)',
                    }}
                />
                <FaLocationArrow
                    style={{
                        color: shadowColor,
                        width: '14px',
                        height: '14px',
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        transform: 'rotate(-45deg)',
                        filter: 'drop-shadow(0 0 1px black)',
                    }}
                />
            </div>
        );

        return L.divIcon({
            className: 'vessel-icon-container',
            html: `
                <div style="transform: rotate(${course}deg); display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
                    ${isCluster ? clusterIconHtml : singleIconHtml}
                </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24],
        });
    };

    const handleClusterInteraction = useCallback(
        (vessel: ClusteredVessel) => {
            const now = Date.now();
            const last = lastClusterInteractionRef.current;
            if (last && last.mmsi === vessel.mmsi && now - last.at < 250) return;
            lastClusterInteractionRef.current = { mmsi: vessel.mmsi, at: now };

            suppressNextMapClickRef.current = true;
            if (onVesselSelect) onVesselSelect(null);
            if (onClusterZoomNotice) onClusterZoomNotice();
            const nextZoom = Math.min(Math.max(map.getZoom() + 2, 11), 16);
            map.flyTo([vessel.lat, vessel.lng], nextZoom, {
                duration: 0.7,
                easeLinearity: 0.25,
            });
        },
        [map, onVesselSelect, onClusterZoomNotice]
    );

    const handleMarkerClick = (vessel: ClusteredVessel, e: L.LeafletMouseEvent) => {
        if (vessel.isCluster) {
            if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
            handleClusterInteraction(vessel);
            return;
        }
        suppressNextMapClickRef.current = true;
        if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
        if (onVesselSelect) {
            onVesselSelect(vessel);
        }
    };

    return (
        <>
            {isIdle && (
                <div
                    className={`fixed inset-0 z-2000 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm animate-in fade-in cursor-pointer p-4 transition-all duration-500 ${sidebarOpen ? 'sm:right-[400px]' : ''}`}
                    onClick={recordActivity}
                >
                    <div className="bg-zinc-950/90 border border-amber-500/50 p-6 shadow-2xl flex flex-col items-center gap-4 text-center max-w-xs w-full animate-in zoom-in-95 duration-300">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[12px] font-bold text-amber-500 uppercase tracking-[0.2em]">
                                Live Updates Paused
                            </span>
                            <p className="text-[11px] leading-relaxed text-zinc-400">
                                Global vessel tracking is currently paused due to inactivity to
                                conserve system resources.
                            </p>
                        </div>

                        <button
                            onClick={recordActivity}
                            className="w-full bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold px-6 py-2.5 transition-all active:scale-95 uppercase tracking-wider shadow-lg shadow-amber-500/20"
                        >
                            Resume Tracking
                        </button>

                        <span className="text-[9px] text-zinc-600">(Inactive for 2 minutes)</span>
                    </div>
                </div>
            )}

            {visibleVessels
                .filter((v) => showAll || v.mmsi === selectedMmsi)
                .map((vessel) => (
                    <Marker
                        key={vessel.mmsi}
                        position={[vessel.lat, vessel.lng]}
                        interactive={true}
                        bubblingMouseEvents={false}
                        riseOnHover={true}
                        icon={createVesselIcon(
                            vessel.course || 0,
                            vessel.isCluster,
                            vessel.mmsi === selectedMmsi
                        )}
                        eventHandlers={{
                            mousedown: (e) => handleMarkerClick(vessel, e),
                            click: (e) => handleMarkerClick(vessel, e),
                        }}
                    />
                ))}
        </>
    );
}

interface Port {
    name: string;
    country: string;
    code: string;
    lat: number;
    lng: number;
}

function PortLayer() {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    const [bounds, setBounds] = useState(map.getBounds());

    useMapEvents({
        zoomend: () => {
            setZoom(map.getZoom());
            setBounds(map.getBounds());
        },
        moveend: () => setBounds(map.getBounds()),
    });

    const visiblePorts = useMemo(() => {
        if (zoom < 6) return [];

        const ports = portsData as unknown as Port[];
        const filtered: Port[] = [];
        const minDistancePx = zoom < 7 ? 25 : zoom < 10 ? 15 : 0;

        ports.forEach((port) => {
            if (!bounds.contains([port.lat, port.lng])) return;

            const pos = map.latLngToLayerPoint([port.lat, port.lng]);
            const tooClose =
                minDistancePx > 0 &&
                filtered.some((f) => {
                    const fPos = map.latLngToLayerPoint([f.lat, f.lng]);
                    const dist = Math.sqrt(
                        Math.pow(pos.x - fPos.x, 2) + Math.pow(pos.y - fPos.y, 2)
                    );
                    return dist < minDistancePx;
                });

            if (!tooClose) {
                filtered.push(port);
            }
        });

        return filtered;
    }, [map, zoom, bounds]);

    const portIcon = L.divIcon({
        className: 'port-icon-container',
        html: renderToString(
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '48px',
                    height: '48px',
                    color: '#22d3ee',
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                }}
            >
                <FaAnchor style={{ width: '14px', height: '14px' }} />
            </div>
        ),
        iconSize: [48, 48],
        iconAnchor: [24, 24],
    });

    return (
        <>
            {visiblePorts.map((port: Port, idx: number) => (
                <Marker
                    key={`port-${port.code}-${idx}`}
                    position={[port.lat, port.lng]}
                    title={`Port: ${port.name} (${port.code})`}
                    icon={portIcon}
                >
                    <Popup closeButton={false} minWidth={200}>
                        <div className="bg-zinc-950 border border-white/20 shadow-2xl p-4 min-w-[200px]">
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 mb-2">
                                <span className="font-bold text-xs uppercase tracking-wider text-cyan-400 truncate">
                                    {port.name}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        map.closePopup();
                                    }}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                    title="Close"
                                >
                                    <FaXmark className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-tight">
                                {port.country}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono mt-1 opacity-60">
                                {port.code}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}

interface City {
    name: string;
    country: string;
    lat: number;
    lng: number;
}

function CityLayer() {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    const [bounds, setBounds] = useState(map.getBounds());

    useMapEvents({
        zoomend: () => {
            setZoom(map.getZoom());
            setBounds(map.getBounds());
        },
        moveend: () => setBounds(map.getBounds()),
    });

    const visibleCities = useMemo(() => {
        if (zoom < 8) return [];

        const cities = citiesData as unknown as City[];
        const filtered: City[] = [];
        const minDistancePx = zoom < 10 ? 50 : zoom < 12 ? 30 : zoom < 14 ? 15 : 0;
        const MAX_CITIES = 250;

        for (let i = 0; i < cities.length; i++) {
            const city = cities[i];

            if (
                city.lat < bounds.getSouth() ||
                city.lat > bounds.getNorth() ||
                city.lng < bounds.getWest() ||
                city.lng > bounds.getEast()
            ) {
                continue;
            }

            if (minDistancePx > 0) {
                const pos = map.latLngToLayerPoint([city.lat, city.lng]);
                const tooClose = filtered.some((f) => {
                    const fPos = map.latLngToLayerPoint([f.lat, f.lng]);
                    const distSq = Math.pow(pos.x - fPos.x, 2) + Math.pow(pos.y - fPos.y, 2);
                    return distSq < minDistancePx * minDistancePx;
                });

                if (tooClose) continue;
            }

            filtered.push(city);
            if (filtered.length >= MAX_CITIES) break;
        }

        return filtered;
    }, [map, zoom, bounds]);

    const cityIcon = L.divIcon({
        className: 'city-icon-container',
        html: renderToString(
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '48px',
                    height: '48px',
                    color: '#22c55e',
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                }}
            >
                <FaCity style={{ width: '12px', height: '12px' }} />
            </div>
        ),
        iconSize: [48, 48],
        iconAnchor: [24, 24],
    });

    return (
        <>
            {visibleCities.map((city: City, idx: number) => (
                <Marker
                    key={`city-${city.name}-${idx}`}
                    position={[city.lat, city.lng]}
                    title={`City: ${city.name}, ${COUNTRY_NAMES[city.country] || city.country}`}
                    icon={cityIcon}
                >
                    <Popup closeButton={false} minWidth={150}>
                        <div className="bg-zinc-950 border border-white/20 shadow-2xl p-4 min-w-[150px]">
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 mb-2">
                                <span className="font-bold text-xs uppercase tracking-wider text-green-400 truncate">
                                    {city.name}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        map.closePopup();
                                    }}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                    title="Close"
                                >
                                    <FaXmark className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-tight">
                                {COUNTRY_NAMES[city.country] || city.country}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono mt-1 opacity-60">
                                {city.country}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}

function LayerControl({
    showVessels,
    setShowVessels,
    showPorts,
    setShowPorts,
    showCities,
    setShowCities,
}: {
    showVessels: boolean;
    setShowVessels: (v: boolean) => void;
    showPorts: boolean;
    setShowPorts: (v: boolean) => void;
    showCities: boolean;
    setShowCities: (v: boolean) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="absolute left-4 bottom-12 z-1000 flex flex-col items-start gap-2 pointer-events-auto">
            {isOpen && (
                <div className="bg-zinc-950 border border-white/20 p-4 shadow-2xl flex flex-col gap-4 min-w-[200px] animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                                Map Layers
                            </span>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-zinc-500 hover:text-white transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                                title="Close"
                            >
                                <FaXmark className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setShowVessels(!showVessels)}
                                className="flex items-center justify-between group cursor-pointer"
                            >
                                <span
                                    className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${showVessels ? 'text-white' : 'text-zinc-600'}`}
                                >
                                    Vessels
                                </span>
                                <div
                                    className={`w-8 h-4 border transition-colors relative ${showVessels ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}
                                >
                                    <div
                                        className={`absolute top-0.5 bottom-0.5 w-3 transition-all ${showVessels ? 'right-0.5 bg-black' : 'left-0.5 bg-zinc-800'}`}
                                    />
                                </div>
                            </button>

                            <button
                                onClick={() => setShowPorts(!showPorts)}
                                className="flex items-center justify-between group cursor-pointer"
                            >
                                <span
                                    className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${showPorts ? 'text-white' : 'text-zinc-600'}`}
                                >
                                    Ports
                                </span>
                                <div
                                    className={`w-8 h-4 border transition-colors relative ${showPorts ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}
                                >
                                    <div
                                        className={`absolute top-0.5 bottom-0.5 w-3 transition-all ${showPorts ? 'right-0.5 bg-black' : 'left-0.5 bg-zinc-800'}`}
                                    />
                                </div>
                            </button>

                            <button
                                onClick={() => setShowCities(!showCities)}
                                className="flex items-center justify-between group cursor-pointer"
                            >
                                <span
                                    className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${showCities ? 'text-white' : 'text-zinc-600'}`}
                                >
                                    Cities / Towns
                                </span>
                                <div
                                    className={`w-8 h-4 border transition-colors relative ${showCities ? 'bg-white border-white' : 'border-zinc-800 bg-transparent'}`}
                                >
                                    <div
                                        className={`absolute top-0.5 bottom-0.5 w-3 transition-all ${showCities ? 'right-0.5 bg-black' : 'left-0.5 bg-zinc-800'}`}
                                    />
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border-b border-white/10 pb-2">
                            Legend
                        </span>
                        <div className="flex flex-col gap-2.5">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 bg-zinc-900 border border-white/10 flex items-center justify-center">
                                    <FaLocationArrow className="w-2.5 h-2.5 text-white -rotate-45" />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">
                                    Tracked Vessel
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 bg-zinc-900 border border-white/10 flex items-center justify-center relative">
                                    <FaLocationArrow className="w-2.5 h-2.5 text-white -rotate-45" />
                                    <FaLocationArrow className="w-2.5 h-2.5 text-white/40 -rotate-45 absolute translate-x-1 translate-y-1" />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">
                                    Vessel Cluster
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 bg-zinc-900 border border-white/10 flex items-center justify-center">
                                    <FaAnchor className="w-2.5 h-2.5 text-cyan-400" />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">
                                    International Port
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 bg-zinc-900 border border-white/10 flex items-center justify-center">
                                    <FaCity className="w-2.5 h-2.5 text-green-500" />
                                </div>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">
                                    City / Town
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-10 h-10 border flex items-center justify-center transition-all shadow-2xl active:scale-95 ${isOpen ? 'bg-white text-black border-white' : 'bg-zinc-950 text-white border-white/20 hover:bg-zinc-900'}`}
                title="Map Layers & Legend"
            >
                <FaLayerGroup className="w-4 h-4" />
            </button>
        </div>
    );
}

function ZoomControls() {
    const map = useMap();

    return (
        <div className="absolute right-4 bottom-12 z-1000 flex flex-col gap-1 pointer-events-auto">
            <button
                onClick={() => map.zoomIn()}
                className="w-10 h-10 bg-zinc-950 border border-white/20 flex items-center justify-center text-white hover:bg-zinc-900 transition-colors shadow-2xl active:scale-95"
                title="Zoom In"
            >
                <FaPlus className="w-4 h-4" />
            </button>
            <button
                onClick={() => map.zoomOut()}
                className="w-10 h-10 bg-zinc-950 border border-white/20 flex items-center justify-center text-white hover:bg-zinc-900 transition-colors shadow-2xl active:scale-95"
                title="Zoom Out"
            >
                <FaMinus className="w-4 h-4" />
            </button>
        </div>
    );
}

function MapViewHandler({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();

    useEffect(() => {
        map.flyTo(center, zoom, {
            duration: 1.5,
            easeLinearity: 0.25,
        });
    }, [center, zoom, map]);

    return null;
}

interface MapDisplayProps {
    center?: [number, number];
    zoom?: number;
    onFleetUpdate?: (stats: {
        renderedIcons: number;
        totalRenderedShips: number;
        trackedShips: number;
        trackedVessels: Vessel[];
        currentArea: string;
    }) => void;
    selectedMmsi: number | null;
    onVesselSelect?: (vessel: Vessel | null) => void;
    onClusterZoomNotice?: () => void;
    historyPositions?: HistoryPosition[];
    showHistory?: boolean;
    showWaypoints?: boolean;
    selectedWaypointKey?: string | null;
    sidebarOpen?: boolean;
}

export default function MapDisplay({
    center = [20, 0],
    zoom = 3,
    onFleetUpdate,
    selectedMmsi,
    onVesselSelect,
    onClusterZoomNotice,
    historyPositions = [],
    showHistory = false,
    showWaypoints = true,
    selectedWaypointKey = null,
    sidebarOpen = false,
}: MapDisplayProps) {
    const [showVessels, setShowVessels] = useState(true);
    const [showPorts, setShowPorts] = useState(false);
    const [showCities, setShowCities] = useState(false);

    return (
        <div className="fixed inset-0 z-0 bg-zinc-950">
            <MapContainer
                center={center}
                zoom={zoom}
                minZoom={3}
                maxBounds={MAX_BOUNDS}
                maxBoundsViscosity={1.0}
                zoomControl={false}
                style={{ height: '100%', width: '100%', background: '#09090b' }}
                className="sist-map"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> | Port Data: <a href="https://datacatalog.worldbank.org/search/dataset/0038118/global-international-ports">World Bank</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                {showPorts && <PortLayer />}
                {showCities && <CityLayer />}
                <FleetLayer
                    onUpdate={onFleetUpdate}
                    selectedMmsi={selectedMmsi}
                    onVesselSelect={onVesselSelect}
                    onClusterZoomNotice={onClusterZoomNotice}
                    showAll={showVessels}
                    sidebarOpen={sidebarOpen}
                />
                <TrajectoryLayer
                    positions={historyPositions}
                    show={showHistory}
                    showWaypoints={showWaypoints}
                    selectedWaypointKey={selectedWaypointKey}
                />
                <MapViewHandler center={center} zoom={zoom} />
                <ZoomControls />
                <LayerControl
                    showVessels={showVessels}
                    setShowVessels={setShowVessels}
                    showPorts={showPorts}
                    setShowPorts={setShowPorts}
                    showCities={showCities}
                    setShowCities={setShowCities}
                />
            </MapContainer>

            <div className="pointer-events-none absolute inset-0 z-1 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
        </div>
    );
}
function WaypointMarker({
    p,
    isSelected,
    createWaypointIcon,
    children,
}: {
    p: HistoryPosition & { mergedCount: number };
    isSelected: boolean;
    createWaypointIcon: (course: number) => L.DivIcon;
    children: ReactNode;
}) {
    const markerRef = useRef<L.Marker | L.CircleMarker>(null);

    useEffect(() => {
        if (isSelected && markerRef.current) {
            const timer = setTimeout(() => {
                markerRef.current?.openPopup();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isSelected]);

    if (p.mergedCount > 1) {
        return (
            <CircleMarker
                ref={markerRef as React.Ref<L.CircleMarker>}
                center={[Number(p.lat), Number(p.lng)]}
                radius={4}
                pathOptions={{
                    fillColor: '#f4f4f5',
                    fillOpacity: 0.8,
                    color: '#09090b',
                    weight: 1,
                }}
            >
                {children}
            </CircleMarker>
        );
    }

    return (
        <Marker
            ref={markerRef as React.Ref<L.Marker>}
            position={[Number(p.lat), Number(p.lng)]}
            icon={createWaypointIcon(Number(p.course) || 0)}
        >
            {children}
        </Marker>
    );
}

function TrajectoryLayer({
    positions,
    show,
    showWaypoints,
    selectedWaypointKey,
}: {
    positions: HistoryPosition[];
    show: boolean;
    showWaypoints: boolean;
    selectedWaypointKey?: string | null;
}) {
    const merged = useMemo(() => {
        if (!show || !positions || positions.length === 0) return [];
        const result: (HistoryPosition & { mergedCount: number })[] = [];
        positions.forEach((p) => {
            if (result.length === 0) {
                result.push({ ...p, mergedCount: 1 });
                return;
            }
            const last = result[result.length - 1];
            const dist = Math.sqrt(
                Math.pow(Number(p.lat) - Number(last.lat), 2) +
                    Math.pow(Number(p.lng) - Number(last.lng), 2)
            );
            if (dist < 0.0005) {
                last.mergedCount++;
            } else {
                result.push({ ...p, mergedCount: 1 });
            }
        });
        return result;
    }, [positions, show]);

    if (!show || !positions || positions.length === 0) return null;

    const path = positions.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]);

    const createWaypointIcon = (course: number) => {
        return L.divIcon({
            className: 'waypoint-icon-container',
            html: `
                <div style="transform: rotate(${course}deg); display: flex; align-items: center; justify-content: center; opacity: 0.8;">
                    <svg viewBox="0 0 448 512" style="width: 12px; height: 12px; transform: rotate(-45deg); filter: drop-shadow(0 0 1px black);" fill="#f4f4f5">
                        <path d="M429.6 92.1c4.9-11.9 2.1-25.6-7-34.7s-22.8-11.9-34.7-7l-352 144c-14.2 5.8-22.2 20.8-19.3 35.8s16.1 25.8 31.4 25.8H224V432c0 15.3 10.8 28.4 25.8 31.4s30-5.1 35.8-19.3l144-352z"/>
                    </svg>
                </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
        });
    };

    return (
        <>
            <Polyline
                positions={path}
                pathOptions={{
                    color: '#f4f4f5',
                    weight: 2,
                    dashArray: '5, 10',
                    opacity: 0.6,
                }}
            />
            {showWaypoints &&
                merged
                    .filter((p) => !p.isLatest)
                    .map((p, i) => (
                        <WaypointMarker
                            key={`${p.recorded_at}-${i}`}
                            p={p}
                            isSelected={selectedWaypointKey === p.recorded_at}
                            createWaypointIcon={createWaypointIcon}
                        >
                            <Popup closeButton={false} minWidth={220} className="sist-popup">
                                <div className="bg-zinc-950 border border-white/20 shadow-2xl p-4 min-w-[220px]">
                                    <div className="flex flex-col gap-1 border-b border-white/10 pb-2 mb-2">
                                        <span className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-200">
                                            {p.mergedCount > 1
                                                ? 'Stationary Block'
                                                : 'Waypoint Detail'}
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-500">
                                            {new Date(p.recorded_at).toLocaleTimeString('en-GB', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                day: '2-digit',
                                                month: 'short',
                                                timeZone: 'Europe/London',
                                            })}
                                        </span>
                                    </div>
                                    {p.mergedCount > 1 && (
                                        <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <FaLayerGroup className="w-2.5 h-2.5 text-zinc-600" />
                                            {p.mergedCount} Records in this area
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[8px] text-zinc-600 uppercase font-black tracking-tighter">
                                                Speed
                                            </span>
                                            <span className="text-[11px] font-black text-zinc-300">
                                                {Number(p.speed).toFixed(1)} kn
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-0.5 text-right">
                                            <span className="text-[8px] text-zinc-600 uppercase font-black tracking-tighter">
                                                Course
                                            </span>
                                            <span className="text-[11px] font-black text-zinc-300">
                                                {Number(p.course).toFixed(0)}°
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                        <span className="text-[9px] text-zinc-600 font-mono">
                                            {Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)}
                                        </span>
                                    </div>
                                </div>
                            </Popup>
                        </WaypointMarker>
                    ))}
        </>
    );
}
