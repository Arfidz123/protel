/**
 * index.js - Backend Rip Current Detection
 * 
 * MODE=hardware: Baca 3 buoy REAL dari serial USB gateway
 * MODE=mock    : Generate data dummy tanpa hardware
 * 
 * Aggregate data per buoy, predict ML, simpan DB, broadcast Socket.IO
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors  = require('cors');
const pool  = require('../db');
const { getPrediction } = require('../mlService');

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app  = express();
const PORT = process.env.PORT || 5000;
const MODE = process.env.MODE || 'mock';
const SERIAL_PORT_PATH = process.env.SERIAL_PORT || 'COM3';
const SERIAL_BAUD = parseInt(process.env.SERIAL_BAUD || '115200');

const OFFLINE_TIMEOUT_MS    = 30 * 1000;
const CLEANUP_INTERVAL_MS   = 24 * 60 * 60 * 1000;
const DATA_RETENTION_DAYS   = 7;
const AGGREGATION_WINDOW_MS = 5000;   // aggregate tiap 5 detik

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'], credentials: true },
});

let lastDataTime = null;
let isOnline = false;
let serialBuffer = [];

// ════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════

function circularMean(angles) {
  if (angles.length === 0) return 0;
  const radians = angles.map(a => a * Math.PI / 180);
  const meanCos = radians.reduce((s, r) => s + Math.cos(r), 0) / radians.length;
  const meanSin = radians.reduce((s, r) => s + Math.sin(r), 0) / radians.length;
  return ((Math.atan2(meanSin, meanCos) * 180 / Math.PI) + 360) % 360;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function aggregateBuoy(samples) {
  if (samples.length === 0) return null;
  
  const validGps = samples.filter(d => d.gps_valid === 1);
  
  return {
    speed:     validGps.length > 0 ? mean(validGps.map(d => d.gps_speed)) : 0,
    direction: validGps.length > 0 ? circularMean(validGps.map(d => d.gps_course)) : 0,
    wave:      mean(samples.map(d => d.wave_intensity || 0)),
    latitude:  validGps.length > 0 ? mean(validGps.map(d => d.lat)) : 0,
    longitude: validGps.length > 0 ? mean(validGps.map(d => d.lon)) : 0,
    sampleCount: samples.length,
    gpsValidCount: validGps.length,
  };
}

// ════════════════════════════════════════════════════════════
//  PROCESS & SAVE
// ════════════════════════════════════════════════════════════

async function processAndSendData(data) {
  try {
    const prediction = await getPrediction(data);
    
    const query = `
      INSERT INTO sensor_readings
        (device1_speed, device1_dir, device1_wave, device1_lat, device1_lon,
         device2_speed, device2_dir, device2_wave, device2_lat, device2_lon,
         device3_speed, device3_dir, device3_wave, device3_lat, device3_lon,
         prediction, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id
    `;
    const values = [
      data.device1Speed, data.device1Direction, data.device1WaveIntensity || 0,
      data.device1Lat || 0, data.device1Lon || 0,
      data.device2Speed, data.device2Direction, data.device2WaveIntensity || 0,
      data.device2Lat || 0, data.device2Lon || 0,
      data.device3Speed, data.device3Direction, data.device3WaveIntensity || 0,
      data.device3Lat || 0, data.device3Lon || 0,
      prediction, data.timestamp,
    ];
    await pool.query(query, values);
    
    lastDataTime = Date.now();
    if (!isOnline) {
      isOnline = true;
      io.emit('systemStatus', { online: true, message: 'Hardware terhubung' });
      console.log('Hardware ONLINE');
    }
    
    io.emit('sensorUpdate', { ...data, prediction });
    
    console.log(`[${new Date().toLocaleTimeString()}] ` +
      `B1:${data.device1Speed.toFixed(2)}m/s/w${(data.device1WaveIntensity||0).toFixed(1)} | ` +
      `B2:${data.device2Speed.toFixed(2)}m/s/w${(data.device2WaveIntensity||0).toFixed(1)} | ` +
      `B3:${data.device3Speed.toFixed(2)}m/s/w${(data.device3WaveIntensity||0).toFixed(1)} | ` +
      `Pred=${prediction}`);
  } catch (err) {
    console.error('Error process:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
//  SERIAL READER
// ════════════════════════════════════════════════════════════

function startSerialReader() {
  console.log(`[Serial] Mencoba buka ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD} baud...`);
  
  const port = new SerialPort({ 
    path: SERIAL_PORT_PATH, 
    baudRate: SERIAL_BAUD,
    autoOpen: false,
  });
  
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  
  port.open((err) => {
    if (err) {
      console.log(`[Serial] Gagal: ${err.message}`);
      console.log(`[Serial] Retry dalam 10 detik...`);
      setTimeout(startSerialReader, 10000);
      return;
    }
    console.log(`[Serial] Connected to ${SERIAL_PORT_PATH}!`);
    console.log(`[Serial] Menunggu data dari 3 buoy via gateway...`);
  });
  
  parser.on('data', (line) => {
    line = line.trim();
    if (!line.startsWith('[JSON]')) return;
    
    try {
      const data = JSON.parse(line.substring(7).trim());
      if (data.node_id >= 1 && data.node_id <= 3) {
        serialBuffer.push(data);
      }
    } catch (e) {
      // ignore
    }
  });
  
  port.on('error', (err) => console.log(`[Serial] Error: ${err.message}`));
  port.on('close', () => {
    console.log(`[Serial] Port closed. Retry in 10s...`);
    setTimeout(startSerialReader, 10000);
  });
}

// Aggregate buffer tiap 5 detik
setInterval(async () => {
  if (serialBuffer.length === 0) return;
  
  const samplesByBuoy = {
    1: serialBuffer.filter(d => d.node_id === 1),
    2: serialBuffer.filter(d => d.node_id === 2),
    3: serialBuffer.filter(d => d.node_id === 3),
  };
  
  const buoy1 = aggregateBuoy(samplesByBuoy[1]);
  const buoy2 = aggregateBuoy(samplesByBuoy[2]);
  const buoy3 = aggregateBuoy(samplesByBuoy[3]);
  
  // Kalau salah satu buoy tidak ada data dalam window, skip
  if (!buoy1 || !buoy2 || !buoy3) {
    console.log(`[Skip] Data tidak lengkap: B1=${samplesByBuoy[1].length} B2=${samplesByBuoy[2].length} B3=${samplesByBuoy[3].length}`);
    serialBuffer = [];
    return;
  }
  
  await processAndSendData({
    device1Speed:         +buoy1.speed.toFixed(3),
    device1Direction:     +buoy1.direction.toFixed(1),
    device1WaveIntensity: +buoy1.wave.toFixed(3),
    device1Lat:           +buoy1.latitude.toFixed(6),
    device1Lon:           +buoy1.longitude.toFixed(6),
    
    device2Speed:         +buoy2.speed.toFixed(3),
    device2Direction:     +buoy2.direction.toFixed(1),
    device2WaveIntensity: +buoy2.wave.toFixed(3),
    device2Lat:           +buoy2.latitude.toFixed(6),
    device2Lon:           +buoy2.longitude.toFixed(6),
    
    device3Speed:         +buoy3.speed.toFixed(3),
    device3Direction:     +buoy3.direction.toFixed(1),
    device3WaveIntensity: +buoy3.wave.toFixed(3),
    device3Lat:           +buoy3.latitude.toFixed(6),
    device3Lon:           +buoy3.longitude.toFixed(6),
    
    timestamp: new Date().toISOString(),
  });
  
  serialBuffer = [];
}, AGGREGATION_WINDOW_MS);

// ════════════════════════════════════════════════════════════
//  OFFLINE DETECTION
// ════════════════════════════════════════════════════════════

setInterval(() => {
  if (!lastDataTime) return;
  if (Date.now() - lastDataTime > OFFLINE_TIMEOUT_MS && isOnline) {
    isOnline = false;
    io.emit('systemStatus', { online: false, message: 'Hardware tidak terdeteksi' });
    console.log('Hardware OFFLINE');
  }
}, 5000);

// ════════════════════════════════════════════════════════════
//  AUTO-CLEANUP
// ════════════════════════════════════════════════════════════

setInterval(async () => {
  try {
    const result = await pool.query(
      `DELETE FROM sensor_readings WHERE timestamp < NOW() - INTERVAL '${DATA_RETENTION_DAYS} days'`
    );
    if (result.rowCount > 0) console.log(`[Cleanup] ${result.rowCount} data lama dihapus`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}, CLEANUP_INTERVAL_MS);

// ════════════════════════════════════════════════════════════
//  REST API
// ════════════════════════════════════════════════════════════

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      'SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT $1', [limit]
    );
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/latest', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1');
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE prediction = 'Danger') AS total_danger,
        COUNT(*) FILTER (WHERE prediction = 'Safe')   AS total_safe,
        MAX(timestamp) AS last_reading
      FROM sensor_readings
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true, online: isOnline, mode: MODE,
    serial_port: SERIAL_PORT_PATH,
    lastDataTime: lastDataTime ? new Date(lastDataTime).toISOString() : null,
  });
});

app.delete('/api/history', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE sensor_readings RESTART IDENTITY');
    console.log('[Reset] History dihapus');
    io.emit('historyReset');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, mode: MODE, online: isOnline });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('systemStatus', { online: isOnline });
});

// ════════════════════════════════════════════════════════════
//  MOCK MODE
// ════════════════════════════════════════════════════════════

if (MODE === 'mock') {
  console.log('[MODE] MOCK — generate data tanpa hardware');
  
  setInterval(() => {
    const isRip = Math.random() < 0.4;
    let d1, d2, d3, w1, w2, w3, dir1, dir2, dir3;
    
    if (isRip) {
      d1 = Math.random() * 0.25 + 0.05;
      d2 = Math.random() * 0.4 + 0.6;
      d3 = Math.random() * 0.25 + 0.05;
      w1 = Math.random() * 1.0 + 0.8;
      w2 = Math.random() * 1.5 + 1.8;
      w3 = Math.random() * 1.0 + 0.8;
      dir1 = 90 + Math.random() * 30 - 15;
      dir2 = 180 + Math.random() * 30 - 15;
      dir3 = 90 + Math.random() * 30 - 15;
    } else {
      const bs = Math.random() * 0.2 + 0.05;
      const bw = Math.random() * 0.6 + 0.2;
      d1 = bs + Math.random() * 0.05;
      d2 = bs + Math.random() * 0.05;
      d3 = bs + Math.random() * 0.05;
      w1 = bw + Math.random() * 0.2;
      w2 = bw + Math.random() * 0.2;
      w3 = bw + Math.random() * 0.2;
      dir1 = 90 + Math.random() * 30 - 15;
      dir2 = 90 + Math.random() * 30 - 15;
      dir3 = 90 + Math.random() * 30 - 15;
    }
    
    processAndSendData({
      device1Speed: +d1.toFixed(3), device1Direction: ((dir1 % 360) + 360) % 360, device1WaveIntensity: +w1.toFixed(2),
      device1Lat: -7.289000, device1Lon: 112.798000,
      device2Speed: +d2.toFixed(3), device2Direction: ((dir2 % 360) + 360) % 360, device2WaveIntensity: +w2.toFixed(2),
      device2Lat: -7.289500, device2Lon: 112.798500,
      device3Speed: +d3.toFixed(3), device3Direction: ((dir3 % 360) + 360) % 360, device3WaveIntensity: +w3.toFixed(2),
      device3Lat: -7.290000, device3Lon: 112.799000,
      timestamp: new Date().toISOString(),
    });
  }, 5000);
}

// ════════════════════════════════════════════════════════════
//  HARDWARE MODE
// ════════════════════════════════════════════════════════════

if (MODE === 'hardware') {
  console.log('[MODE] HARDWARE — baca 3 buoy real dari serial USB');
  startSerialReader();
}

server.listen(PORT, () => {
  console.log(`\nBackend berjalan di http://localhost:${PORT}`);
  console.log(`   Mode: ${MODE.toUpperCase()}`);
  console.log(`   ML Model: ${process.env.USE_ML_MODEL === 'true' ? 'Aktif' : 'Nonaktif'}`);
  console.log(`   ML URL: ${process.env.ML_SERVICE_URL || 'http://localhost:8000/predict'}`);
  if (MODE === 'hardware') {
    console.log(`   Serial: ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD}`);
  }
  console.log();
});
