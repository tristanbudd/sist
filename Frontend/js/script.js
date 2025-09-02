const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-1.104394, 50.795280],
    zoom: 14
});

map.addControl(new maplibregl.NavigationControl());

function createShipFeature(ship) {
    const lng = ship.Longitude ?? ship.geometry?.coordinates[0];
    const lat = ship.Latitude ?? ship.geometry?.coordinates[1];
    const angle = (ship.TrueHeading ?? 0) * (Math.PI / 180);

    const sizePixels = 10;
    const center = map.project([lng, lat]);

    const coords = [
        [0, -sizePixels],   // tip
        [-sizePixels/2, sizePixels/2], // left
        [0, sizePixels/4],  // center stern
        [sizePixels/2, sizePixels/2], // right
        [0, -sizePixels]    // back to tip
    ].map(([x, y]) => {
        const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
        const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
        const p = { x: center.x + rotatedX, y: center.y + rotatedY };
        return map.unproject([p.x, p.y]).toArray(); // back to lat/lng
    });

    return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: { name: ship.ShipName || ship.UserID }
    };
}

map.on('move', updateVisibleShips);
map.on('zoom', updateVisibleShips);

async function updateVisibleShips() {
    if (!map.getSource('ships')) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    const response = await fetch(`http://localhost:3000/ships/latest?minLat=${bounds.getSouth()}&maxLat=${bounds.getNorth()}&minLng=${bounds.getWest()}&maxLng=${bounds.getEast()}`);
    const data = await response.json();

    // Regenerate polygon features each update
    const features = Object.values(data).map(ship => createShipFeature(ship, zoom));

    map.getSource('ships').setData({ type: "FeatureCollection", features });
}

setInterval(updateVisibleShips, 5000);

map.on('load', () => {
    map.addSource('ships', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });

    map.addLayer({
        id: 'ships-layer',
        type: 'fill',
        source: 'ships',
        paint: {
            'fill-color': '#ff0000',
            'fill-opacity': 0.8
        }
    });

    updateVisibleShips().then(() => {
        console.log('Success | Initial ship data loaded!');
    });
});