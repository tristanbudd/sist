import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FaPlus, FaMinus, FaXmark } from 'react-icons/fa6';
import L from 'leaflet';
import axios from 'axios';
import portsData from '../../data/ports.json';

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
}

const IGNORED_VESSEL_NAMES = ['--'];

function normalizeVessels(raw: Vessel[]): Vessel[] {
    const byMmsi = new Map<number, Vessel>();

    for (const vessel of raw) {
        const trimmedName = (vessel.name || '').trim().toUpperCase();

        // Ignore ships with placeholder names
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
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [isIdle, setIsIdle] = useState(false);
    const suppressNextMapClickRef = useRef(false);
    const lastClusterInteractionRef = useRef<{ mmsi: number; at: number } | null>(null);
    const IDLE_THRESHOLD = 120000;

    const recordActivity = useCallback(() => {
        setLastActivity(Date.now());
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
            setZoom(currentZoom);

            try {
                // TODO: Change to relative path once finished with dev
                const response = await axios.get('https://sist.tristanbudd.com/api/vessels', {
                    signal: controller.signal,
                    params: {
                        sw_lat: bounds.getSouthWest().lat,
                        sw_lng: bounds.getSouthWest().lng,
                        ne_lat: bounds.getNorthEast().lat,
                        ne_lng: bounds.getNorthEast().lng,
                        age_minutes: 60,
                    },
                });
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
                const response = await axios.get('https://sist.tristanbudd.com/api/vessels', {
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
            debouncedFetch();
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
        const interval = setInterval(() => {
            if (Date.now() - lastActivity > IDLE_THRESHOLD) {
                setIsIdle(true);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [lastActivity]);

    useEffect(() => {
        fetchWindowVessels(true);
        fetchTrackedSearchVessels();

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
        const minDistancePx = zoom < 6 ? 10 : zoom < 11 ? 6 : 0;

        if (minDistancePx === 0) {
            return windowVessels.map((v) => ({ ...v, isCluster: false, clusterCount: 1 }));
        }

        windowVessels.forEach((vessel) => {
            const pos = map.latLngToLayerPoint([vessel.lat, vessel.lng]);
            const clusterIndex = filtered.findIndex((f) => {
                const fPos = map.latLngToLayerPoint([f.lat, f.lng]);
                const dist = Math.sqrt(Math.pow(pos.x - fPos.x, 2) + Math.pow(pos.y - fPos.y, 2));
                return dist < minDistancePx;
            });

            if (clusterIndex !== -1) {
                filtered[clusterIndex].isCluster = true;
                filtered[clusterIndex].clusterCount++;
            } else {
                filtered.push({ ...vessel, isCluster: false, clusterCount: 1 });
            }
        });

        return filtered;
    }, [windowVessels, map, zoom]);

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
        const singleArrow = `
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
        `;
        const doubleArrow = `
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
            <path d="M12 8L7 20L12 18L17 20L12 8Z" opacity="0.6" />
        `;

        const color = isSelected ? '#ef4444' : 'white';

        return L.divIcon({
            className: 'vessel-icon-container',
            html: `
                <div style="transform: rotate(${course}deg); display: flex; align-items: center; justify-content: center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" stroke="black" stroke-width="1">
                        ${isCluster ? doubleArrow : singleArrow}
                    </svg>
                </div>
            `,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
    };

    const handleClusterInteraction = (vessel: ClusteredVessel) => {
        const now = Date.now();
        const last = lastClusterInteractionRef.current;
        if (last && last.mmsi === vessel.mmsi && now - last.at < 250) return;
        lastClusterInteractionRef.current = { mmsi: vessel.mmsi, at: now };

        suppressNextMapClickRef.current = true;
        if (onVesselSelect) onVesselSelect(null);
        if (onClusterZoomNotice) onClusterZoomNotice();
        const nextZoom = Math.min(Math.max(map.getZoom() + 2, 11), 14);
        map.flyTo([vessel.lat, vessel.lng], nextZoom, {
            duration: 0.7,
            easeLinearity: 0.25,
        });
    };

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
                    className="fixed inset-0 z-2000 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-500 cursor-pointer p-4"
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

                        <span className="text-[9px] text-zinc-600 italic">
                            (Inactive for 2 minutes)
                        </span>
                    </div>
                </div>
            )}

            {visibleVessels.map((vessel) => (
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

interface PortFeature {
    type: string;
    properties: {
        Country: string;
        Function: string;
        LOCODE: string;
        Name: string;
        NameWoDiac: string;
        Status: string;
        outflows: number;
    };
    geometry: {
        type: string;
        coordinates: [number, number];
    };
}

function PortLayer() {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());

    useMapEvents({
        zoomend: () => setZoom(map.getZoom()),
    });

    const visiblePorts = useMemo(() => {
        if (zoom < 6) return [];

        const portsDataTyped = portsData as unknown as { features: PortFeature[] };
        const filtered: PortFeature[] = [];
        const minDistancePx = zoom < 7 ? 25 : zoom < 10 ? 15 : 0;

        if (minDistancePx === 0) return portsDataTyped.features;

        portsDataTyped.features.forEach((port) => {
            const pos = map.latLngToLayerPoint([
                port.geometry.coordinates[1],
                port.geometry.coordinates[0],
            ]);
            const tooClose = filtered.some((f) => {
                const fPos = map.latLngToLayerPoint([
                    f.geometry.coordinates[1],
                    f.geometry.coordinates[0],
                ]);
                const dist = Math.sqrt(Math.pow(pos.x - fPos.x, 2) + Math.pow(pos.y - fPos.y, 2));
                return dist < minDistancePx;
            });

            if (!tooClose) {
                filtered.push(port);
            }
        });

        return filtered;
    }, [map, zoom]);

    const portIcon = L.divIcon({
        className: 'port-icon-container',
        html: `
            <div style="display: flex; align-items: center; justify-content: center; color: #22d3ee; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3m0 2a1 1 0 0 0-1 1 1 1 0 0 0 1 1 1 1 0 0 0 1-1 1 1 0 0 0-1-1m7 12h-2c0-2.76-2.24-5-5-5s-5 2.24-5 5H5c0-3.53 2.61-6.43 6-6.92V8h2v1.08c3.39.49 6 3.39 6 6.92m-7 6c-3.87 0-7-3.13-7-7h2a5 5 0 0 0 5 5 5 5 0 0 0 5-5h2c0 3.87-3.13 7-7 7z"/>
                </svg>
            </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });

    return (
        <>
            {visiblePorts.map((port: PortFeature, idx: number) => (
                <Marker
                    key={`port-${port.properties.LOCODE}-${idx}`}
                    position={[port.geometry.coordinates[1], port.geometry.coordinates[0]]}
                    icon={portIcon}
                >
                    <Popup closeButton={false} minWidth={200}>
                        <div className="bg-zinc-950 border border-white/20 shadow-2xl p-4 min-w-[200px]">
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 mb-2">
                                <span className="font-bold text-xs uppercase tracking-wider text-cyan-400 truncate">
                                    {port.properties.Name}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        map.closePopup();
                                    }}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    <FaXmark className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-tight">
                                {port.properties.Country}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono mt-1 opacity-60">
                                {port.properties.LOCODE}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
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
}

export default function MapDisplay({
    center = [20, 0],
    zoom = 3,
    onFleetUpdate,
    selectedMmsi,
    onVesselSelect,
    onClusterZoomNotice,
}: MapDisplayProps) {
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

                <PortLayer />
                <FleetLayer
                    onUpdate={onFleetUpdate}
                    selectedMmsi={selectedMmsi}
                    onVesselSelect={onVesselSelect}
                    onClusterZoomNotice={onClusterZoomNotice}
                />
                <MapViewHandler center={center} zoom={zoom} />
                <ZoomControls />
            </MapContainer>

            <div className="pointer-events-none absolute inset-0 z-1 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
        </div>
    );
}
