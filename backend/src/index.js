/**
 * index.js - Backend Rip Current Detection
 * 
 * OPSI B: FLEKSIBEL
 * - Tampilkan data buoy yang ada (yang nyala)
 * - Kalau buoy mati, pakai data terakhir (last known)
 * - ML tetap predict selama ada minimal 1 buoy ada data
 * - Track status tiap buoy: ONLINE / STALE / OFFLINE / NEVER_SEEN
 * 
 * MODE=hardware: Baca 3 buoy dari serial USB
 * MODE=mock    : Generate data dummy tanpa hardware
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

// Timing constants
const OFFLINE_TIMEOUT_MS    = 30 * 1000;   // 30s tanpa data = OFFLINE
const STALE_TIMEOUT_MS      = 10 * 1000;   // 10s tanpa data = STALE (data lama)
const CLEANUP_INTERVAL_MS   = 24 * 60 * 60 * 1000;
const DATA_RETENTION_DAYS   = 7;
const AGGREGATION_WINDOW_MS = 5000;

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

// ════════════════════════════════════════════════════════════
//  STATE PER BUOY
// ════════════════════════════════════════════════════════════

// Track data terakhir dan kapan terakhir terlihat untuk tiap buoy
const buoyState = {
  1: { lastData: null, lastSeenTime: null, status: 'NEVER_SEEN' },
  2: { lastData: null, lastSeenTime: null, status: 'NEVER_SEEN' },
  3: { lastData: null, lastSeenTime: null, status: 'NEVER_SEEN' },
};

let serialBuffer = [];
let lastSystemAlive = null;  // last time SETIAP buoy kirim data

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

function aggregateBuoySamples(samples) {
  if (samples.length === 0) return null;
  
  const validGps = samples.filter(d => d.gps_valid === 1);
  
  // === DEBUG LOG: Print raw GPS data dari hardware ===
  const buoyId = samples[0].node_id;
  console.log(`[DEBUG Buoy${buoyId}] ${samples.length} sample(s) | ${validGps.length} GPS valid`);
  samples.forEach((s, i) => {
    console.log(`  Sample ${i}: gps_valid=${s.gps_valid}, lat=${s.lat}, lon=${s.lon}, speed=${s.gps_speed}, course=${s.gps_course}`);
  });
  
  const result = {
    speed:     validGps.length > 0 ? mean(validGps.map(d => d.gps_speed)) : 0,
    direction: validGps.length > 0 ? circularMean(validGps.map(d => d.gps_course)) : 0,
    wave:      mean(samples.map(d => d.wave_intensity || 0)),
    latitude:  validGps.length > 0 ? mean(validGps.map(d => d.lat)) : 0,
    longitude: validGps.length > 0 ? mean(validGps.map(d => d.lon)) : 0,
  };
  
  console.log(`[DEBUG Buoy${buoyId}] Aggregated: lat=${result.latitude}, lon=${result.longitude}, speed=${result.speed.toFixed(3)}`);
  return result;
}

// Hitung status buoy berdasarkan waktu last seen
function calculateBuoyStatus(lastSeenTime) {
  if (!lastSeenTime) return 'NEVER_SEEN';
  const elapsed = Date.now() - lastSeenTime;
  if (elapsed < AGGREGATION_WINDOW_MS + 1000) return 'ONLINE';
  if (elapsed < STALE_TIMEOUT_MS) return 'ONLINE';
  if (elapsed < OFFLINE_TIMEOUT_MS) return 'STALE';
  return 'OFFLINE';
}

// ════════════════════════════════════════════════════════════
//  PROCESS & SAVE
// ════════════════════════════════════════════════════════════

async function processAndSendData(payload, prediction) {
  try {
    const query = `
      INSERT INTO sensor_readings
        (device1_speed, device1_dir, device1_wave, device1_lat, device1_lon,
         device2_speed, device2_dir, device2_wave, device2_lat, device2_lon,
         device3_speed, device3_dir, device3_wave, device3_lat, device3_lon,
         prediction, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id
    `;
    const values = [
      payload.device1Speed, payload.device1Direction, payload.device1WaveIntensity || 0,
      payload.device1Lat || 0, payload.device1Lon || 0,
      payload.device2Speed, payload.device2Direction, payload.device2WaveIntensity || 0,
      payload.device2Lat || 0, payload.device2Lon || 0,
      payload.device3Speed, payload.device3Direction, payload.device3WaveIntensity || 0,
      payload.device3Lat || 0, payload.device3Lon || 0,
      prediction, payload.timestamp,
    ];
    await pool.query(query, values);
  } catch (err) {
    console.error('Error save DB:', err.message);
  }
}

// Build payload dari buoyState dengan status indicator
function buildPayload() {
  const status1 = calculateBuoyStatus(buoyState[1].lastSeenTime);
  const status2 = calculateBuoyStatus(buoyState[2].lastSeenTime);
  const status3 = calculateBuoyStatus(buoyState[3].lastSeenTime);
  
  const d1 = buoyState[1].lastData;
  const d2 = buoyState[2].lastData;
  const d3 = buoyState[3].lastData;
  
  return {
    // Buoy 1
    device1Speed:         d1?.speed     || 0,
    device1Direction:     d1?.direction || 0,
    device1WaveIntensity: d1?.wave      || 0,
    device1Lat:           d1?.latitude  || 0,
    device1Lon:           d1?.longitude || 0,
    device1Status:        status1,
    
    // Buoy 2
    device2Speed:         d2?.speed     || 0,
    device2Direction:     d2?.direction || 0,
    device2WaveIntensity: d2?.wave      || 0,
    device2Lat:           d2?.latitude  || 0,
    device2Lon:           d2?.longitude || 0,
    device2Status:        status2,
    
    // Buoy 3
    device3Speed:         d3?.speed     || 0,
    device3Direction:     d3?.direction || 0,
    device3WaveIntensity: d3?.wave      || 0,
    device3Lat:           d3?.latitude  || 0,
    device3Lon:           d3?.longitude || 0,
    device3Status:        status3,
    
    timestamp: new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════
//  AGGREGATION CYCLE (tiap 5 detik)
// ════════════════════════════════════════════════════════════

setInterval(async () => {
  const now = Date.now();
  
  // Group samples per buoy dari window 5 detik terakhir
  const samplesByBuoy = {
    1: serialBuffer.filter(d => d.node_id === 1),
    2: serialBuffer.filter(d => d.node_id === 2),
    3: serialBuffer.filter(d => d.node_id === 3),
  };
  
  // Update state per buoy: kalau ada sample baru → update lastData
  let anyBuoyHasNewData = false;
  for (let id = 1; id <= 3; id++) {
    if (samplesByBuoy[id].length > 0) {
      const aggregated = aggregateBuoySamples(samplesByBuoy[id]);
      if (aggregated) {
        buoyState[id].lastData = aggregated;
        buoyState[id].lastSeenTime = now;
        anyBuoyHasNewData = true;
      }
    }
  }
  
  // Update status semua buoy (refresh tiap cycle)
  for (let id = 1; id <= 3; id++) {
    buoyState[id].status = calculateBuoyStatus(buoyState[id].lastSeenTime);
  }
  
  // Clear buffer untuk window berikutnya
  serialBuffer = [];
  
  // Cek apakah ada minimal 1 buoy yang pernah kirim data
  const buoysWithData = [1, 2, 3].filter(id => buoyState[id].lastData !== null);
  
  if (buoysWithData.length === 0) {
    // Belum ada buoy sama sekali yang kirim data
    return;
  }
  
  // Build payload dengan data terbaru (gabungan fresh + last known)
  const payload = buildPayload();
  
  // Predict ML (akan tetap jalan walaupun ada data yang last known)
  const prediction = await getPrediction(payload);
  
  // Save ke DB
  await processAndSendData(payload, prediction);
  
  // System tracking
  if (anyBuoyHasNewData) {
    lastSystemAlive = now;
  }
  
  // Broadcast ke frontend
  io.emit('sensorUpdate', { ...payload, prediction });
  
  // Log status
  const statusStr = `B1=${buoyState[1].status} B2=${buoyState[2].status} B3=${buoyState[3].status}`;
  console.log(`[${new Date().toLocaleTimeString()}] ${statusStr} | Pred=${prediction}`);
}, AGGREGATION_WINDOW_MS);

// ════════════════════════════════════════════════════════════
//  STATUS BROADCAST (tiap 5s, kirim status tiap buoy)
// ════════════════════════════════════════════════════════════

setInterval(() => {
  const status = {
    buoy1: calculateBuoyStatus(buoyState[1].lastSeenTime),
    buoy2: calculateBuoyStatus(buoyState[2].lastSeenTime),
    buoy3: calculateBuoyStatus(buoyState[3].lastSeenTime),
  };
  
  const anyOnline = Object.values(status).some(s => s === 'ONLINE');
  const allOnline = Object.values(status).every(s => s === 'ONLINE');
  
  io.emit('buoyStatus', {
    ...status,
    anyOnline,
    allOnline,
  });
}, 5000);

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
    console.log(`[Serial] Menunggu data dari buoy via gateway...`);
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
    success: true,
    mode: MODE,
    buoys: {
      1: { status: calculateBuoyStatus(buoyState[1].lastSeenTime), lastSeen: buoyState[1].lastSeenTime },
      2: { status: calculateBuoyStatus(buoyState[2].lastSeenTime), lastSeen: buoyState[2].lastSeenTime },
      3: { status: calculateBuoyStatus(buoyState[3].lastSeenTime), lastSeen: buoyState[3].lastSeenTime },
    },
    serial_port: SERIAL_PORT_PATH,
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
  res.json({ success: true, mode: MODE });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  // Kirim status awal
  socket.emit('buoyStatus', {
    buoy1: calculateBuoyStatus(buoyState[1].lastSeenTime),
    buoy2: calculateBuoyStatus(buoyState[2].lastSeenTime),
    buoy3: calculateBuoyStatus(buoyState[3].lastSeenTime),
  });
});

// ════════════════════════════════════════════════════════════
//  MOCK MODE
// ════════════════════════════════════════════════════════════

if (MODE === 'mock') {
  console.log('[MODE] MOCK — generate data tanpa hardware');
  
  // Simulasi: generate data untuk semua 3 buoy
  setInterval(() => {
    const isRip = Math.random() < 0.4;
    const now = Date.now();
    
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
    
    // Simulasi paket dari 3 buoy (push ke serialBuffer)
    serialBuffer.push({
      node_id: 1, gps_speed: d1, gps_course: ((dir1 % 360) + 360) % 360,
      wave_intensity: w1, lat: -7.289, lon: 112.798, gps_valid: 1
    });
    serialBuffer.push({
      node_id: 2, gps_speed: d2, gps_course: ((dir2 % 360) + 360) % 360,
      wave_intensity: w2, lat: -7.2895, lon: 112.7985, gps_valid: 1
    });
    serialBuffer.push({
      node_id: 3, gps_speed: d3, gps_course: ((dir3 % 360) + 360) % 360,
      wave_intensity: w3, lat: -7.29, lon: 112.799, gps_valid: 1
    });
  }, 1500);
}

// ════════════════════════════════════════════════════════════
//  HARDWARE MODE
// ════════════════════════════════════════════════════════════

if (MODE === 'hardware') {
  console.log('[MODE] HARDWARE — baca buoy real dari serial USB');
  console.log('       Mode FLEKSIBEL: tampilkan buoy yang ada, last-known untuk yang mati');
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
