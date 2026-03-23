require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const DATA_ROOT = path.join(__dirname, 'data');

const cors = require('cors');
app.use(cors());

const rateLimit = require('express-rate-limit');

const dataRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs for /data file access
    standardHeaders: true, // Return rate limit info in the RateLimit-* headers
    legacyHeaders: false,  // Disable the deprecated X-RateLimit-* headers
});

// Health Check Endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Service Operational (SIST - Ship Intelligence & Suspicion Tracker)' });
});

/* Data Endpoint:
- Serves static files from the 'data' directory via /data/* (app.use)
- Handles direct file requests with error logging via /data/:filename (app.get)
 */
app.use('/data', express.static(DATA_ROOT));

app.get('/data/:filename', dataRequestLimiter, (req, res) => {
    const unsafeFilename = req.params.filename;
    const filePath = path.resolve(DATA_ROOT, unsafeFilename);

    // Ensure the resolved path is within the DATA_ROOT directory
    if (filePath !== DATA_ROOT && !filePath.startsWith(DATA_ROOT + path.sep)) {
        console.error(`Path traversal attempt blocked | Requested: ${unsafeFilename} | ResolvedPath: ${filePath} | Time: ${new Date().toLocaleString()}`);
        return res.status(403).json({
            error: 'Access denied',
            code: 403,
            requested: unsafeFilename
        });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`Error | Requested: ${unsafeFilename} | Path: ${filePath} | Message: ${err.message} | Time: ${new Date().toLocaleString()}`);
            return res.status(404).json({
                error: 'File not found',
                code: 404,
                requested: unsafeFilename,
                resolvedPath: filePath
            });
        }
        res.type(path.extname(filePath)).send(data);
    });
});

/* WebSocket Connection to AISStream.io:
- Connects to AISStream WebSocket for real-time ship data
- Requires AISSTREAM_API_KEY in environment variables
 */
const API_KEY = process.env.AISSTREAM_API_KEY;
const socket = new WebSocket("wss://stream.aisstream.io/v0/stream");

socket.on('open', () => {
    const subscription = {
        APIKey: API_KEY,
        BoundingBoxes: [[[-90, -180], [90, 180]]]
    };
    socket.send(JSON.stringify(subscription));
});

const shipPositions = {};
const latestShipData = {};

function addShipPosition(mmsi, position) {
    if (!shipPositions[mmsi]) shipPositions[mmsi] = [];

    shipPositions[mmsi].unshift({
        latitude: position.Latitude,
        longitude: position.Longitude,
        timestamp: Date.now()
    });

    if (shipPositions[mmsi].length > 100) shipPositions[mmsi].pop();

    // console.log(`Info | Updated position data for MMSI: ${mmsi} | Total positions stored: ${shipPositions[mmsi].length} | Time: ${new Date().toLocaleString()}`);

    latestShipData[mmsi] = {
        Cog: position.Cog,
        CommunicationState: position.CommunicationState,
        Latitude: position.Latitude,
        Longitude: position.Longitude,
        MessageID: position.MessageID,
        NavigationalStatus: position.NavigationalStatus,
        PositionAccuracy: position.PositionAccuracy,
        Raim: position.Raim,
        RateOfTurn: position.RateOfTurn,
        RepeatIndicator: position.RepeatIndicator,
        Sog: position.Sog,
        Spare: position.Spare,
        SpecialManoeuvreIndicator: position.SpecialManoeuvreIndicator,
        Timestamp: position.Timestamp,
        TrueHeading: position.TrueHeading,
        UserID: position.UserID,
        Valid: position.Valid,
        lastUpdated: Date.now()
    };

    // console.log(`Info | Updated information data for MMSI: ${mmsi} | Data: ${JSON.stringify(latestShipData[mmsi])} | Time: ${new Date().toLocaleString()}`);
}

app.get('/ships/latest', (req, res) => {
    const minLat = parseFloat(req.query.minLat);
    const maxLat = parseFloat(req.query.maxLat);
    const minLng = parseFloat(req.query.minLng);
    const maxLng = parseFloat(req.query.maxLng);

    if ([minLat, maxLat, minLng, maxLng].some(v => isNaN(v))) {
        return res.status(400).json({ error: 'Invalid bounds' });
    }

    const visibleShips = {};
    for (const [mmsi, ship] of Object.entries(latestShipData)) {
        const lat = ship.Latitude;
        const lng = ship.Longitude;
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
            visibleShips[mmsi] = ship;
        }
    }

    res.json(visibleShips);
});

socket.on('message', (data) => {
    try {
        const message = JSON.parse(data);

        if (message.MessageType === 'PositionReport') {
            const position = message.Message.PositionReport;
            const mmsi = message.MetaData.MMSI;

            addShipPosition(mmsi, position);
        }

    } catch (err) {
        console.error(
            `Error | Received non-JSON AIS data | Message: ${err?.message} | Time: ${new Date().toLocaleString()}`,
            { err, data }
        );
    }
});

// Start the server (Keep this at the end)
server.listen(port, () => {
    const env = process.env.NODE_ENV || 'development';
    const host = server.address().address === '::' ? 'localhost' : server.address().address;
    const time = new Date().toLocaleString();

    console.log(`Success | Server listening on https://${host}:${port} [${env}] at ${time}`);
});