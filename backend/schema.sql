-- ============================================================
-- DATABASE SCHEMA - Sensor Readings (3 device)
-- ============================================================
-- Jalankan di PostgreSQL:
--   psql -U postgres -d rip_current -f schema.sql
-- 
-- Atau via pgAdmin: paste isi file ini ke Query Tool, run.

-- Drop tabel lama (kalau ada)
DROP TABLE IF EXISTS sensor_readings CASCADE;

-- Buat tabel baru dengan 3 device
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

-- Index untuk performa query
CREATE INDEX idx_sensor_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_prediction ON sensor_readings(prediction);

-- Cek hasilnya
SELECT 'Tabel sensor_readings berhasil dibuat dengan 3 device' AS info;
\d sensor_readings;
