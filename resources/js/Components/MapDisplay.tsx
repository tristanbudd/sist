import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FaPlus, FaMinus, FaShip, FaGaugeHigh, FaCompass } from 'react-icons/fa6';
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

interface Vessel {
    mmsi: number;
    imo?: number;
    name: string;
    lat: number;
    lng: number;
    speed: number;
    course: number;
    vessel_type_text: string;
    last_seen_at: string;
    destination?: string;
}

interface ClusteredVessel extends Vessel {
    isCluster: boolean;
    clusterCount: number;
}

function FleetLayer({
    onUpdate,
}: {
    onUpdate?: (stats: {
        renderedIcons: number;
        totalRenderedShips: number;
        trackedShips: number;
    }) => void;
}) {
    const map = useMap();
    const [vessels, setVessels] = useState<Vessel[]>([]);
    const [trackedCount, setTrackedCount] = useState(0);
    const [zoom, setZoom] = useState(map.getZoom());
    const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trackedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [isIdle, setIsIdle] = useState(false);
    const IDLE_THRESHOLD = 120000;

    const recordActivity = useCallback(() => {
        setLastActivity(Date.now());
        if (isIdle) setIsIdle(false);
    }, [isIdle]);

    const fetchVessels = useCallback(
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
                setVessels(response.data.data || []);
            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error('Failed to fetch fleet data:', error);
                setVessels([]);
            } finally {
                if (abortControllerRef.current === controller) {
                    abortControllerRef.current = null;
                }
            }
        },
        [map, isIdle]
    );

    const fetchTrackedCount = useCallback(async () => {
        if (isIdle) return;
        try {
            const response = await axios.get('https://sist.tristanbudd.com/api/vessels', {
                params: { age_minutes: 60 },
            });
            const data = response.data.data || [];
            setTrackedCount(data.length);
        } catch (error) {
            console.error('Failed to fetch global fleet count:', error);
        }
    }, [isIdle]);

    const debouncedFetch = useCallback(() => {
        if (fetchTimer.current) {
            clearTimeout(fetchTimer.current);
        }
        fetchTimer.current = setTimeout(() => {
            fetchVessels();
        }, 400);
    }, [fetchVessels]);

    useMapEvents({
        moveend: () => {
            recordActivity();
            debouncedFetch();
        },
        zoomend: () => {
            recordActivity();
            debouncedFetch();
        },
        click: recordActivity,
        dragstart: recordActivity,
        mousedown: recordActivity,
    });

    useEffect(() => {
        const interval = setInterval(() => {
            if (Date.now() - lastActivity > IDLE_THRESHOLD) {
                setIsIdle(true);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [lastActivity]);

    useEffect(() => {
        fetchVessels(true);
        fetchTrackedCount();

        pollTimer.current = setInterval(() => fetchVessels(), 15000);
        trackedTimer.current = setInterval(() => fetchTrackedCount(), 300000);

        return () => {
            if (fetchTimer.current) clearTimeout(fetchTimer.current);
            if (pollTimer.current) clearInterval(pollTimer.current);
            if (trackedTimer.current) clearInterval(trackedTimer.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [fetchVessels, fetchTrackedCount]);

    const visibleVessels = useMemo(() => {
        const filtered: ClusteredVessel[] = [];
        const minDistancePx = zoom < 6 ? 10 : zoom < 11 ? 6 : 0;

        if (minDistancePx === 0) {
            return vessels.map((v) => ({ ...v, isCluster: false, clusterCount: 1 }));
        }

        vessels.forEach((vessel) => {
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
    }, [vessels, map, zoom]);

    useEffect(() => {
        if (onUpdate) {
            const totalRenderedShips = visibleVessels.reduce((acc, v) => acc + v.clusterCount, 0);
            onUpdate({
                renderedIcons: visibleVessels.length,
                totalRenderedShips,
                trackedShips: Math.max(trackedCount, totalRenderedShips),
            });
        }
    }, [visibleVessels, trackedCount, onUpdate]);

    const createVesselIcon = (course: number, isCluster: boolean) => {
        const singleArrow = `
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
        `;
        const doubleArrow = `
            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
            <path d="M12 8L7 20L12 18L17 20L12 8Z" opacity="0.6" />
        `;

        return L.divIcon({
            className: 'vessel-icon-container',
            html: `
                <div style="transform: rotate(${course}deg); display: flex; align-items: center; justify-content: center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1">
                        ${isCluster ? doubleArrow : singleArrow}
                    </svg>
                </div>
            `,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
    };

    return (
        <>
            {isIdle && (
                <div className="absolute top-20 right-4 z-1000 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="bg-zinc-950/90 border border-amber-500/50 backdrop-blur-md px-3 py-2 rounded-lg shadow-2xl flex items-center gap-3">
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                                Updates Paused
                            </span>
                            <span className="text-[9px] text-zinc-500">Inactive for 2 minutes</span>
                        </div>
                        <button
                            onClick={recordActivity}
                            className="bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold px-2 py-1 rounded transition-colors active:scale-95"
                        >
                            Resume
                        </button>
                    </div>
                </div>
            )}
            {visibleVessels.map((vessel) => (
                <Marker
                    key={`${vessel.mmsi}-${vessel.isCluster}`}
                    position={[vessel.lat, vessel.lng]}
                    icon={createVesselIcon(vessel.course || 0, vessel.isCluster)}
                >
                    <Popup className="vessel-popup">
                        <div className="bg-zinc-950 text-white p-1 min-w-[200px]">
                            <div className="border-b border-white/10 pb-2 mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FaShip className="text-zinc-400" />
                                    <span className="font-bold text-xs uppercase tracking-wider">
                                        {vessel.isCluster
                                            ? 'Multiple Vessels'
                                            : vessel.name || 'Unknown'}
                                    </span>
                                </div>
                                {vessel.isCluster && (
                                    <span className="bg-white/10 px-1.5 py-0.5 text-[9px] font-black rounded">
                                        {vessel.clusterCount}
                                    </span>
                                )}
                            </div>

                            {!vessel.isCluster ? (
                                <div className="grid grid-cols-2 gap-y-2 text-[10px]">
                                    <div className="text-zinc-500 uppercase font-bold">Type</div>
                                    <div>{vessel.vessel_type_text || 'Unknown'}</div>

                                    <div className="text-zinc-500 uppercase font-bold flex items-center gap-1">
                                        <FaGaugeHigh /> Speed
                                    </div>
                                    <div>{vessel.speed?.toFixed(1) || '0.0'} kn</div>

                                    <div className="text-zinc-500 uppercase font-bold flex items-center gap-1">
                                        <FaCompass /> Course
                                    </div>
                                    <div>{vessel.course || '0'}°</div>

                                    <div className="text-zinc-500 uppercase font-bold">MMSI</div>
                                    <div className="font-mono">{vessel.mmsi}</div>

                                    {vessel.destination && (
                                        <>
                                            <div className="text-zinc-500 uppercase font-bold">
                                                Dest
                                            </div>
                                            <div className="truncate">{vessel.destination}</div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="text-[10px] text-zinc-400 italic py-1">
                                    Zoom in to separate individual vessels.
                                </div>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}

function PortLayer() {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());

    useMapEvents({
        zoomend: () => setZoom(map.getZoom()),
    });

    const visiblePorts = useMemo(() => {
        if (zoom < 6) return [];

        const filtered: any[] = [];
        const minDistancePx = zoom < 7 ? 25 : zoom < 10 ? 15 : 0;

        if (minDistancePx === 0) return portsData.features;

        portsData.features.forEach((port: any) => {
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
            {visiblePorts.map((port: any) => (
                <Marker
                    key={port.properties.LOCODE}
                    position={[port.geometry.coordinates[1], port.geometry.coordinates[0]]}
                    icon={portIcon}
                >
                    <Popup className="vessel-popup">
                        <div className="bg-zinc-950 text-white p-1 min-w-[150px]">
                            <div className="border-b border-white/10 pb-1 mb-1">
                                <span className="font-bold text-xs uppercase tracking-wider text-cyan-400">
                                    {port.properties.Name}
                                </span>
                            </div>
                            <div className="text-[10px] text-zinc-400">
                                {port.properties.Country}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono mt-1">
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
    }) => void;
}

export default function MapDisplay({ center = [20, 0], zoom = 3, onFleetUpdate }: MapDisplayProps) {
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

                <FleetLayer onUpdate={onFleetUpdate} />
                <PortLayer />
                <MapViewHandler center={center} zoom={zoom} />
                <ZoomControls />
            </MapContainer>

            <div className="pointer-events-none absolute inset-0 z-1 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
        </div>
    );
}
