/**
 * index.js
 * 
 * Backend untuk sistem deteksi rip current.
 * Update untuk 3 device (sesuai sistem ML Arhya).
 * 
 * Flow:
 *   Mock data (sekarang) atau Gateway USB (nanti)
 *   -> ML Service Arhya (http://localhost:8000/predict)
 *   -> Simpan ke PostgreSQL
 *   -> Broadcast ke frontend via Socket.IO
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

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─────────────────────────────────────────────
// LOGIKA UTAMA: Process & Send Data
// ─────────────────────────────────────────────
const processAndSendData = async (data) => {
  try {
    // Call ML service untuk dapat prediksi
    const prediction = await getPrediction(data);

    // Simpan ke database (3 device)
    const query = `
      INSERT INTO sensor_readings
        (device1_speed, device1_dir,
         device2_speed, device2_dir,
         device3_speed, device3_dir,
         prediction, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const values = [
      data.device1Speed, data.device1Direction,
      data.device2Speed, data.device2Direction,
      data.device3Speed, data.device3Direction,
      prediction,
      data.timestamp,
    ];

    await pool.query(query, values);

    // Broadcast ke frontend via Socket.IO
    io.emit('sensorUpdate', { ...data, prediction });
    
    const avgSpeed = (data.device1Speed + data.device2Speed + data.device3Speed) / 3;
    console.log(`[${new Date().toLocaleTimeString()}] Data terkirim | AvgSpeed: ${avgSpeed.toFixed(2)} m/s | Prediksi: ${prediction}`);

  } catch (err) {
    console.error('Error menyimpan data:', err.message);
  }
};

// ─────────────────────────────────────────────
// REST API ROUTES
// ─────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await pool.query(
      'SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error ambil history:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/latest', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error ambil data terbaru:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE prediction = 'Danger')    AS total_danger,
        COUNT(*) FILTER (WHERE prediction = 'Safe')      AS total_safe,
        ROUND(AVG(device1_speed)::numeric, 3)            AS avg_speed_device1,
        ROUND(AVG(device2_speed)::numeric, 3)            AS avg_speed_device2,
        ROUND(AVG(device3_speed)::numeric, 3)            AS avg_speed_device3,
        MAX(timestamp)                                   AS last_reading
      FROM sensor_readings
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error ambil stats:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Backend berjalan normal', timestamp: new Date() });
});

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client terhubung: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Client terputus: ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
// SIMULASI DATA SENSOR (setiap 5 detik)
// Mode dev: generate mock data realistis untuk test integrasi
// dengan ML service Arhya tanpa hardware.
// 
// Skenario mock:
//   - 60% random kondisi Safe (kecepatan rendah, arah seragam)
//   - 40% random kondisi Danger (pola rip: B2 lebih cepat, arah offshore)
// ─────────────────────────────────────────────

function generateMockData() {
  const isRip = Math.random() < 0.4;  // 40% chance scenario Danger
  
  let d1Speed, d1Dir, d2Speed, d2Dir, d3Speed, d3Dir;
  
  if (isRip) {
    // POLA RIP CURRENT: B2 (tengah) jauh lebih cepat ke offshore
    d1Speed = +(Math.random() * 0.25 + 0.05).toFixed(3);     // 0.05-0.3 m/s
    d2Speed = +(Math.random() * 0.6 + 0.5).toFixed(3);       // 0.5-1.1 m/s (KUAT)
    d3Speed = +(Math.random() * 0.25 + 0.05).toFixed(3);     // 0.05-0.3 m/s
    
    const alongshoreBase = Math.random() < 0.5 ? 90 : 270;  // E or W
    d1Dir = Math.floor(alongshoreBase + (Math.random() * 30 - 15));
    d2Dir = Math.floor(180 + (Math.random() * 30 - 15));    // OFFSHORE (180)
    d3Dir = Math.floor(alongshoreBase + (Math.random() * 30 - 15));
  } else {
    // KONDISI SAFE: arus tenang, arah seragam longshore
    const baseSpeed = Math.random() * 0.2 + 0.05;            // 0.05-0.25 m/s
    d1Speed = +(baseSpeed + (Math.random() * 0.06 - 0.03)).toFixed(3);
    d2Speed = +(baseSpeed + (Math.random() * 0.06 - 0.03)).toFixed(3);
    d3Speed = +(baseSpeed + (Math.random() * 0.06 - 0.03)).toFixed(3);
    
    const alongshoreBase = Math.random() < 0.5 ? 90 : 270;
    d1Dir = Math.floor(alongshoreBase + (Math.random() * 40 - 20));
    d2Dir = Math.floor(alongshoreBase + (Math.random() * 40 - 20));
    d3Dir = Math.floor(alongshoreBase + (Math.random() * 40 - 20));
  }
  
  // Normalize direction ke 0-360
  d1Dir = ((d1Dir % 360) + 360) % 360;
  d2Dir = ((d2Dir % 360) + 360) % 360;
  d3Dir = ((d3Dir % 360) + 360) % 360;
  
  return {
    device1Speed: d1Speed,
    device1Direction: d1Dir,
    device2Speed: d2Speed,
    device2Direction: d2Dir,
    device3Speed: d3Speed,
    device3Direction: d3Dir,
    timestamp: new Date().toISOString(),
  };
}

setInterval(() => {
  const mockData = generateMockData();
  processAndSendData(mockData);
}, 5000);

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Backend berjalan di http://localhost:${PORT}`);
  console.log(`   ML Model: ${process.env.USE_ML_MODEL === 'true' ? 'Aktif (call Arhya ML service)' : 'Nonaktif (pakai prediksi lokal)'}`);
  console.log(`   ML URL  : ${process.env.ML_SERVICE_URL || 'http://localhost:8000/predict'}`);
  console.log(`   Frontend: http://localhost:5173`);
});
