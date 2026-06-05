# Panduan Setup End-to-End — Tanpa Hardware

Panduan ini untuk menjalankan **3 service** sekaligus:
1. ML Service (Flask) — Anda yang handle
2. Backend (Node.js + Express) — repo Bintang yang Anda update
3. Frontend (React + Vite) — repo Bintang yang Anda update

Setelah semua jalan, mock data akan flow:
**Backend mock generator → ML Service Arhya → PostgreSQL → Frontend dashboard real-time**

---

## STEP 1: Setup ML Service (folder D:\Protel\)

### 1.1 Install Flask
```bash
cd D:\Protel
.\venv\Scripts\Activate.ps1
pip install flask flask-cors
```

### 1.2 Pastikan File Ada
Di folder `D:\Protel\`:
- `step1_generate_synthetic_data.py`
- `step2_feature_engineering.py`
- `step3_train_random_forest.py`
- `ml_server.py`
- `rip_current_model.joblib` (hasil training)

Kalau `rip_current_model.joblib` belum ada, jalankan dulu:
```bash
python step1_generate_synthetic_data.py
python step2_feature_engineering.py
python step3_train_random_forest.py
```

### 1.3 Jalankan ML Server
```bash
python ml_server.py
```

Output yang muncul:
```
[ML] Model loaded successfully
     Classes: ['Danger', 'Safe']
[Server] Listening on http://0.0.0.0:8000
```

**Biarkan terminal ini terbuka.** Buka terminal baru untuk step selanjutnya.

---

## STEP 2: Setup PostgreSQL

### 2.1 Install PostgreSQL
Download: https://www.postgresql.org/download/windows/

Saat install, set password user `postgres` ke `postgres` (sesuai konfigurasi default Bintang).

### 2.2 Buat Database
Buka pgAdmin atau psql:

```sql
CREATE DATABASE rip_current;
```

### 2.3 Buat Tabel (3 device)
Connect ke database `rip_current`, jalankan SQL:

```sql
DROP TABLE IF EXISTS sensor_readings CASCADE;

CREATE TABLE sensor_readings (
    id              SERIAL PRIMARY KEY,
    device1_speed   FLOAT,
    device1_dir     FLOAT,
    device2_speed   FLOAT,
    device2_dir     FLOAT,
    device3_speed   FLOAT,
    device3_dir     FLOAT,
    prediction      VARCHAR(20),
    timestamp       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sensor_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_prediction ON sensor_readings(prediction);
```

Atau cara cepat dari terminal (pastikan psql ada di PATH):
```bash
cd backend
psql -U postgres -d rip_current -f schema.sql
```

---

## STEP 3: Setup Backend Bintang

### 3.1 Clone/Copy Repo Bintang
Anda sudah punya folder `Protel-main/`.

### 3.2 Replace File dengan Versi Update
Replace file-file ini dengan yang dari folder `backend_bintang/`:

| File yang diganti | Lokasi |
|-------------------|--------|
| `index.js` | `Protel-main/backend/src/index.js` |
| `mlService.js` | `Protel-main/backend/mlService.js` |
| `seed.js` | `Protel-main/backend/seed.js` |

### 3.3 Buat File `.env`
Di folder `Protel-main/backend/`, buat file `.env`:

```
PORT=5000

DB_USER=postgres
DB_HOST=localhost
DB_NAME=rip_current
DB_PASSWORD=postgres
DB_PORT=5432

USE_ML_MODEL=true
ML_SERVICE_URL=http://localhost:8000/predict
```

### 3.4 Install Dependencies & Run
```bash
cd Protel-main/backend
npm install
node seed.js     # masukkan data dummy ke database
npm run dev      # jalankan backend
```

Output yang muncul:
```
Backend berjalan di http://localhost:5000
   ML Model: Aktif (call Arhya ML service)
   ML URL  : http://localhost:8000/predict
Terhubung ke PostgreSQL
[10:30:00] Data terkirim | AvgSpeed: 0.18 m/s | Prediksi: Safe
[10:30:05] Data terkirim | AvgSpeed: 0.78 m/s | Prediksi: Danger
```

Setiap 5 detik backend generate mock data, call ML service Arhya, simpan ke DB, broadcast ke frontend.

---

## STEP 4: Setup Frontend Bintang

### 4.1 Replace File Frontend
Replace file-file ini dengan yang dari folder `frontend_bintang/`:

| File yang diganti | Lokasi |
|-------------------|--------|
| `Dashboard.jsx` | `Protel-main/frontend/src/pages/Dashboard.jsx` |
| `History.jsx` | `Protel-main/frontend/src/pages/History.jsx` |
| `PredictionAlert.jsx` | `Protel-main/frontend/src/components/PredictionAlert.jsx` |
| `HistoryStats.jsx` | `Protel-main/frontend/src/components/HistoryStats.jsx` |
| `HistoryTable.jsx` | `Protel-main/frontend/src/components/HistoryTable.jsx` |

### 4.2 Install Dependencies & Run
```bash
cd Protel-main/frontend
npm install
npm run dev
```

Output yang muncul:
```
VITE v...  ready in ... ms
  Local: http://localhost:5173/
```

### 4.3 Buka Browser
Buka: http://localhost:5173/

Dashboard akan muncul. Setiap 5 detik akan auto-update dengan mock data baru.

---

## STEP 5: Verifikasi End-to-End

Pastikan **3 terminal terbuka** dan semua berjalan:

| Terminal | Folder | Command | Status |
|----------|--------|---------|--------|
| 1 | `D:\Protel\` | `python ml_server.py` | Listening :8000 |
| 2 | `Protel-main/backend` | `npm run dev` | Listening :5000 |
| 3 | `Protel-main/frontend` | `npm run dev` | Listening :5173 |

### Cek di Browser:
- http://localhost:5173/ → Dashboard React
- http://localhost:5173/history → History page
- http://localhost:5000/api/latest → Data terbaru JSON
- http://localhost:5000/api/stats → Statistik JSON
- http://localhost:8000/health → ML server health

### Cek di Log:

**Terminal ML server (port 8000):**
```
[10:30:05] Predict: Danger (conf: 95.50%) | D1: v=0.18 | D2: v=0.82 | D3: v=0.16
[10:30:10] Predict: Safe (conf: 100.00%) | D1: v=0.12 | D2: v=0.14 | D3: v=0.11
```

**Terminal backend (port 5000):**
```
[10:30:05] Data terkirim | AvgSpeed: 0.39 m/s | Prediksi: Danger
[10:30:10] Data terkirim | AvgSpeed: 0.12 m/s | Prediksi: Safe
```

**Dashboard browser:**
- Kalau Prediksi = Danger → muncul alert merah "BAHAYA - Potensi Rip Current"
- Kalau Prediksi = Safe → alert hijau "AMAN"

---

## TROUBLESHOOTING

### ML Server tidak load model
**Error:** `WARNING: rip_current_model.joblib tidak ditemukan!`

**Solusi:** Jalankan dulu training:
```bash
python step1_generate_synthetic_data.py
python step2_feature_engineering.py
python step3_train_random_forest.py
```

### Backend error "Gagal konek ke PostgreSQL"
**Solusi:**
1. Pastikan PostgreSQL service jalan di Services Windows
2. Cek password di `.env` benar
3. Pastikan database `rip_current` sudah dibuat

### Backend log "ML service merespons dengan status 500"
**Solusi:**
1. Cek ML server jalan di port 8000
2. Cek `USE_ML_MODEL=true` di `.env`
3. Test manual: `curl http://localhost:8000/health`

### Frontend tidak muncul data
**Solusi:**
1. Cek Console browser (F12) untuk error
2. Pastikan backend jalan di port 5000
3. Cek CORS — backend sudah allow origin `http://localhost:5173`

### Field `device3_speed` null di database
**Solusi:** Backend versi lama belum tahu device3. Update `index.js` dan `mlService.js`.

---

## ARSITEKTUR LENGKAP

```
[Mock Generator]
       |
       v 5 detik sekali
[Backend Express :5000]
       |
       v POST /predict
[ML Service Arhya :8000]
       |
       v return Safe/Danger
[Backend Express :5000]
       |
       +---> [PostgreSQL] (simpan history)
       |
       v Socket.IO emit
[Frontend React :5173]
       |
       v real-time update
[Dashboard Browser]
```

---

## NANTI SAAT HARDWARE SUDAH SIAP

Ganti **mock generator** (`generateMockData` di `index.js`) dengan **serial reader** dari gateway USB:

```javascript
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const port = new SerialPort({ path: 'COM3', baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

// Buffer untuk aggregate data dari 3 buoy dalam window 5 detik
let buffer = { 1: [], 2: [], 3: [] };

parser.on('data', (line) => {
  if (!line.startsWith('[JSON] ')) return;
  
  try {
    const data = JSON.parse(line.substring(7));
    if (data.node_id >= 1 && data.node_id <= 3) {
      buffer[data.node_id].push(data);
    }
  } catch (err) {}
});

// Tiap 5 detik, hitung rata-rata window dan kirim ke ML
setInterval(() => {
  if (buffer[1].length === 0 || buffer[2].length === 0 || buffer[3].length === 0) {
    return;  // belum cukup data
  }
  
  const avgSpeed = (nodeBuffer) => {
    const validSpeeds = nodeBuffer.filter(d => d.gps_valid).map(d => d.gps_speed);
    return validSpeeds.length > 0 ? validSpeeds.reduce((a, b) => a + b) / validSpeeds.length : 0;
  };
  
  const avgCourse = (nodeBuffer) => {
    // Circular mean dari arah
    const validCourses = nodeBuffer.filter(d => d.gps_valid).map(d => d.gps_course);
    if (validCourses.length === 0) return 0;
    const meanCos = validCourses.reduce((a, b) => a + Math.cos(b * Math.PI / 180), 0) / validCourses.length;
    const meanSin = validCourses.reduce((a, b) => a + Math.sin(b * Math.PI / 180), 0) / validCourses.length;
    return ((Math.atan2(meanSin, meanCos) * 180 / Math.PI) + 360) % 360;
  };
  
  const data = {
    device1Speed:     avgSpeed(buffer[1]),
    device1Direction: avgCourse(buffer[1]),
    device2Speed:     avgSpeed(buffer[2]),
    device2Direction: avgCourse(buffer[2]),
    device3Speed:     avgSpeed(buffer[3]),
    device3Direction: avgCourse(buffer[3]),
    timestamp:        new Date().toISOString(),
  };
  
  processAndSendData(data);
  
  // Reset buffer
  buffer = { 1: [], 2: [], 3: [] };
}, 5000);
```

Tapi ini nanti aja, fokus dulu integrasi software.
