/**
 * index.js — Backend Rip Current Detection
 * 
 * Support: 3 device dengan 3 fitur per device (speed, direction, wave_intensity)
 * Mode: mock | single | multi
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors  = require('cors');
const pool  = require('../db');
const { getPrediction } = require('../mlService');

const app  = express();
const PORT = process.env.PORT || 5000;
const MODE = process.env.MODE || 'mock';

const OFFLINE_TIMEOUT_MS = 30 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DATA_RETENTION_DAYS = 7;

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
let lastKnownPosition = null; // GPS terbaru

// ─── PROCESS & SAVE ─────────────────────────

const processAndSendData = async (data) => {
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

    // Simpan posisi GPS terbaru (jika ada)
    if (data.latitude && data.longitude) {
      lastKnownPosition = { latitude: data.latitude, longitude: data.longitude, timestamp: data.timestamp };
    }

    io.emit('sensorUpdate', { ...data, prediction });
    
    const avgSpeed = (data.device1Speed + data.device2Speed + data.device3Speed) / 3;
    const avgWave = ((data.device1WaveIntensity || 0) + (data.device2WaveIntensity || 0) + (data.device3WaveIntensity || 0)) / 3;
    console.log(`[${new Date().toLocaleTimeString()}] AvgSpeed=${avgSpeed.toFixed(2)} AvgWave=${avgWave.toFixed(2)} Pred=${prediction}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
};

// ─── OFFLINE DETECTION ──────────────────────
setInterval(() => {
  if (!lastDataTime) return;
  if (Date.now() - lastDataTime > OFFLINE_TIMEOUT_MS && isOnline) {
    isOnline = false;
    io.emit('systemStatus', { online: false, message: 'Hardware tidak terdeteksi' });
    console.log('Hardware OFFLINE');
  }
}, 5000);

// ─── AUTO-CLEANUP ───────────────────────────
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

// ─── REST API ───────────────────────────────

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
        ROUND(AVG(device2_speed)::numeric, 3) AS avg_speed_device2,
        ROUND(AVG(device3_speed)::numeric, 3) AS avg_speed_device3,
        ROUND(AVG(device1_wave)::numeric, 3)  AS avg_wave_device1,
        ROUND(AVG(device2_wave)::numeric, 3)  AS avg_wave_device2,
        ROUND(AVG(device3_wave)::numeric, 3)  AS avg_wave_device3,
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
    success: true, online: isOnline,
    lastDataTime: lastDataTime ? new Date(lastDataTime).toISOString() : null,
    mode: MODE,
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

// GET /api/location — posisi GPS terbaru untuk initial map load
app.get('/api/location', (req, res) => {
  res.json({ success: true, data: lastKnownPosition });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, mode: MODE, online: isOnline });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('systemStatus', { online: isOnline });
});

// ─── DATA SOURCES ───────────────────────────

function generateMockBuoyData(scenario) {
  if (scenario === 'rip') {
    return {
      d1Speed: +(Math.random() * 0.25 + 0.05).toFixed(3),
      d1Dir: 90 + Math.random() * 30 - 15,
      d1Wave: +(Math.random() * 1.0 + 0.8).toFixed(2),
      d2Speed: +(Math.random() * 0.6 + 0.5).toFixed(3),
      d2Dir: 180 + Math.random() * 30 - 15,
      d2Wave: +(Math.random() * 1.5 + 1.5).toFixed(2),
      d3Speed: +(Math.random() * 0.25 + 0.05).toFixed(3),
      d3Dir: 90 + Math.random() * 30 - 15,
      d3Wave: +(Math.random() * 1.0 + 0.8).toFixed(2),
    };
  } else {
    const baseSpeed = Math.random() * 0.2 + 0.05;
    const baseWave = Math.random() * 0.6 + 0.2;
    return {
      d1Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
      d1Dir: 90 + Math.random() * 30 - 15,
      d1Wave: +(baseWave + Math.random() * 0.2).toFixed(2),
      d2Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
      d2Dir: 90 + Math.random() * 30 - 15,
      d2Wave: +(baseWave + Math.random() * 0.2).toFixed(2),
      d3Speed: +(baseSpeed + Math.random() * 0.05).toFixed(3),
      d3Dir: 90 + Math.random() * 30 - 15,
      d3Wave: +(baseWave + Math.random() * 0.2).toFixed(2),
    };
  }
}

// MOCK mode: tanpa hardware
if (MODE === 'mock') {
  console.log('[MODE] MOCK — tanpa hardware');

  // Koordinat mock — ganti dengan koordinat pantai yang sesuai
  const MOCK_BASE_LAT = -8.0254;
  const MOCK_BASE_LNG = 110.3288;

  setInterval(() => {
    const isRip = Math.random() < 0.4;
    const d = generateMockBuoyData(isRip ? 'rip' : 'safe');
    processAndSendData({
      device1Speed: d.d1Speed, device1Direction: ((d.d1Dir % 360) + 360) % 360, device1WaveIntensity: d.d1Wave,
      device2Speed: d.d2Speed, device2Direction: ((d.d2Dir % 360) + 360) % 360, device2WaveIntensity: d.d2Wave,
      device3Speed: d.d3Speed, device3Direction: ((d.d3Dir % 360) + 360) % 360, device3WaveIntensity: d.d3Wave,
      timestamp: new Date().toISOString(),
      // GPS mock — simulasi pergerakan kecil di sekitar Parangtritis
      latitude:  parseFloat((MOCK_BASE_LAT + (Math.random() - 0.5) * 0.001).toFixed(6)),
      longitude: parseFloat((MOCK_BASE_LNG + (Math.random() - 0.5) * 0.001).toFixed(6)),
    });
  }, 5000);
}

// MULTI mode: terima data dari bridge_hardware.py
if (MODE === 'multi' || MODE === 'single') {
  console.log(`[MODE] ${MODE.toUpperCase()} — menunggu data dari bridge`);
  
  app.post('/api/sensor-data', async (req, res) => {
    try {
      await processAndSendData({
        ...req.body,
        timestamp: req.body.timestamp || new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

server.listen(PORT, () => {
  console.log(`\nBackend berjalan di http://localhost:${PORT}`);
  console.log(`   Mode: ${MODE.toUpperCase()}`);
  console.log(`   ML Model: ${process.env.USE_ML_MODEL === 'true' ? 'Aktif' : 'Nonaktif'}`);
  console.log(`   ML URL  : ${process.env.ML_SERVICE_URL || 'http://localhost:8000/predict'}\n`);
});