/**
 * index.js - Backend Rip Current Detection
 * 
 * NEW: Backend baca data dari gateway USB LANGSUNG (tanpa Python bridge).
 *      Mock 2 buoy lainnya berdasarkan data buoy 1 real.
 *      Otomatis deteksi hardware aktif/tidak.
 * 
 * Cara pakai:
 *   1. Set MODE=multi di .env
 *   2. Set SERIAL_PORT di .env (cek di Device Manager, misal COM3)
 *   3. npm install (otomatis install serialport)
 *   4. node src/index.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors  = require('cors');
const pool  = require('../db');
const { getPrediction } = require('../mlService');

// === SERIAL PORT ===
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app  = express();
const PORT = process.env.PORT || 5000;
const MODE = process.env.MODE || 'mock';
const SERIAL_PORT_PATH = process.env.SERIAL_PORT || 'COM3';
const SERIAL_BAUD = parseInt(process.env.SERIAL_BAUD || '115200');

const OFFLINE_TIMEOUT_MS  = 30 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DATA_RETENTION_DAYS = 7;
const AGGREGATION_WINDOW_MS = 5000;   // aggregate data tiap 5 detik

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
let serialBuffer = [];  // simpan paket dari hardware dalam 5 detik

// ════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════

function circularMean(angles) {
  if (angles.length === 0) return 0;
  const radians = angles.map(a => a * Math.PI / 180);
  const meanCos = radians.reduce((sum, r) => sum + Math.cos(r), 0) / radians.length;
  const meanSin = radians.reduce((sum, r) => sum + Math.sin(r), 0) / radians.length;
  return ((Math.atan2(meanSin, meanCos) * 180 / Math.PI) + 360) % 360;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// Mock buoy 2 dan 3 berdasarkan kondisi buoy 1 real
function generateMockBuoys(buoy1) {
  const s1 = buoy1.speed;
  const d1 = buoy1.direction;
  const w1 = buoy1.wave;
  
  // Kondisi "kuat" = potensi rip current atau storm
  const isRough = (s1 > 0.4) || (w1 > 2.0);
  
  if (isRough) {
    // Pola rip: B1 longshore, B2 di tengah (kuat ke offshore), B3 longshore
    return {
      buoy2: {
        speed: s1 * (2.0 + Math.random() * 1.5) + Math.random() * 0.2,
        direction: 180 + (Math.random() * 30 - 15),  // offshore
        wave: w1 * (1.2 + Math.random() * 0.4) + Math.random() * 0.3,
      },
      buoy3: {
        speed: Math.max(0.01, s1 + (Math.random() * 0.1 - 0.05)),
        direction: ((d1 + 180) % 360) + (Math.random() * 40 - 20),  // opposite longshore
        wave: Math.max(0.05, w1 + (Math.random() * 0.4 - 0.2)),
      }
    };
  } else {
    // Kondisi tenang: semua buoy mirip
    return {
      buoy2: {
        speed: Math.max(0.01, s1 + (Math.random() * 0.1 - 0.05)),
        direction: d1 + (Math.random() * 60 - 30),
        wave: Math.max(0.05, w1 + (Math.random() * 0.3 - 0.15)),
      },
      buoy3: {
        speed: Math.max(0.01, s1 + (Math.random() * 0.1 - 0.05)),
        direction: d1 + (Math.random() * 60 - 30),
        wave: Math.max(0.05, w1 + (Math.random() * 0.3 - 0.15)),
      }
    };
  }
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

// ════════════════════════════════════════════════════════════
//  PROCESS & SAVE
// ════════════════════════════════════════════════════════════

async function processAndSendData(data) {
  try {
    const prediction = await getPrediction(data);
    
    const query = `
      INSERT INTO sensor_readings
        (device1_speed, device1_dir, device1_wave,
         device2_speed, device2_dir, device2_wave,
         device3_speed, device3_dir, device3_wave,
         prediction, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
    `;
    const values = [
      data.device1Speed, data.device1Direction, data.device1WaveIntensity || 0,
      data.device2Speed, data.device2Direction, data.device2WaveIntensity || 0,
      data.device3Speed, data.device3Direction, data.device3WaveIntensity || 0,
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
    
    const avgSpeed = (data.device1Speed + data.device2Speed + data.device3Speed) / 3;
    console.log(`[${new Date().toLocaleTimeString()}] Speed=${avgSpeed.toFixed(2)} Pred=${prediction}`);
  } catch (err) {
    console.error('Error process:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
//  SERIAL READER (auto-detect hardware aktif)
// ════════════════════════════════════════════════════════════

function startSerialReader() {
  console.log(`[Serial] Mencoba buka port ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD} baud...`);
  
  const port = new SerialPort({ 
    path: SERIAL_PORT_PATH, 
    baudRate: SERIAL_BAUD,
    autoOpen: false,
  });
  
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  
  port.open((err) => {
    if (err) {
      console.log(`[Serial] Gagal buka port: ${err.message}`);
      console.log(`[Serial] Retry dalam 10 detik...`);
      setTimeout(startSerialReader, 10000);
      return;
    }
    console.log(`[Serial] Connected to ${SERIAL_PORT_PATH}!`);
    console.log(`[Serial] Menunggu data dari gateway...`);
  });
  
  parser.on('data', (line) => {
    line = line.trim();
    
    // Hanya proses baris yang prefix [JSON]
    if (!line.startsWith('[JSON]')) return;
    
    try {
      const jsonStr = line.substring(7).trim();
      const data = JSON.parse(jsonStr);
      
      // Simpan ke buffer untuk aggregate nanti
      if (data.node_id === 1 || data.node_id === 2 || data.node_id === 3) {
        serialBuffer.push(data);
      }
    } catch (e) {
      // Abaikan baris yang tidak valid JSON
    }
  });
  
  port.on('error', (err) => {
    console.log(`[Serial] Error: ${err.message}`);
  });
  
  port.on('close', () => {
    console.log(`[Serial] Port closed. Retrying in 10s...`);
    setTimeout(startSerialReader, 10000);
  });
}

// Aggregate buffer tiap 5 detik dan kirim ke processAndSendData
setInterval(async () => {
  if (serialBuffer.length === 0) return;
  
  // Filter data dari node 1
  const node1Samples = serialBuffer.filter(d => d.node_id === 1);
  
  if (node1Samples.length === 0) {
    serialBuffer = [];
    return;
  }
  
  // Aggregate buoy 1 (real data)
  const validGps = node1Samples.filter(d => d.gps_valid === 1);
  
  const buoy1 = {
    speed: validGps.length > 0 ? mean(validGps.map(d => d.gps_speed)) : 0,
    direction: validGps.length > 0 ? circularMean(validGps.map(d => d.gps_course)) : 0,
    wave: mean(node1Samples.map(d => d.wave_intensity || 0)),
  };
  
  // Generate mock buoy 2 dan 3 berdasarkan buoy 1
  const { buoy2, buoy3 } = generateMockBuoys(buoy1);
  
  await processAndSendData({
    device1Speed:         +buoy1.speed.toFixed(3),
    device1Direction:     +buoy1.direction.toFixed(1),
    device1WaveIntensity: +buoy1.wave.toFixed(3),
    
    device2Speed:         +buoy2.speed.toFixed(3),
    device2Direction:     +normalizeAngle(buoy2.direction).toFixed(1),
    device2WaveIntensity: +buoy2.wave.toFixed(3),
    
    device3Speed:         +buoy3.speed.toFixed(3),
    device3Direction:     +normalizeAngle(buoy3.direction).toFixed(1),
    device3WaveIntensity: +buoy3.wave.toFixed(3),
    
    timestamp: new Date().toISOString(),
  });
  
  // Reset buffer untuk window berikutnya
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
        ROUND(AVG(device1_speed)::numeric, 3) AS avg_speed_device1,
        ROUND(AVG(device1_wave)::numeric, 3)  AS avg_wave_device1,
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
    online: isOnline,
    mode: MODE,
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
//  MOCK MODE (kalau MODE=mock, tanpa hardware)
// ════════════════════════════════════════════════════════════

if (MODE === 'mock') {
  console.log('[MODE] MOCK — generate data tanpa hardware');
  
  function generateFullMock() {
    const isRip = Math.random() < 0.4;
    if (isRip) {
      const baseSpeed = Math.random() * 0.4 + 0.4;
      return {
        device1Speed: +(Math.random() * 0.25 + 0.05).toFixed(3),
        device1Direction: normalizeAngle(90 + Math.random() * 30 - 15),
        device1WaveIntensity: +(Math.random() * 1.0 + 0.8).toFixed(2),
        device2Speed: +(baseSpeed + Math.random() * 0.2).toFixed(3),
        device2Direction: normalizeAngle(180 + Math.random() * 30 - 15),
        device2WaveIntensity: +(Math.random() * 1.5 + 1.5).toFixed(2),
        device3Speed: +(Math.random() * 0.25 + 0.05).toFixed(3),
        device3Direction: normalizeAngle(90 + Math.random() * 30 - 15),
        device3WaveIntensity: +(Math.random() * 1.0 + 0.8).toFixed(2),
        timestamp: new Date().toISOString(),
      };
    } else {
      const baseSpeed = Math.random() * 0.2 + 0.05;
      const baseWave = Math.random() * 0.6 + 0.2;
      return {
        device1Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
        device1Direction: normalizeAngle(90 + Math.random() * 30 - 15),
        device1WaveIntensity: +(baseWave + Math.random() * 0.2).toFixed(2),
        device2Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
        device2Direction: normalizeAngle(90 + Math.random() * 30 - 15),
        device2WaveIntensity: +(baseWave + Math.random() * 0.2).toFixed(2),
        device3Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
        device3Direction: normalizeAngle(90 + Math.random() * 30 - 15),
        device3WaveIntensity: +(baseWave + Math.random() * 0.2).toFixed(2),
        timestamp: new Date().toISOString(),
      };
    }
  }
  
  setInterval(() => {
    processAndSendData(generateFullMock());
  }, 5000);
}

// ════════════════════════════════════════════════════════════
//  HARDWARE MODE (MODE=hardware, baca serial USB)
// ════════════════════════════════════════════════════════════

if (MODE === 'hardware') {
  console.log('[MODE] HARDWARE — baca data real dari serial USB');
  console.log(`[MODE] Mock 2 buoy lainnya berdasarkan buoy 1 real`);
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
