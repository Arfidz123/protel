-- ============================================================
-- DATABASE SCHEMA - Sensor Readings (3 device, dengan wave intensity)
-- ============================================================

DROP TABLE IF EXISTS sensor_readings CASCADE;

CREATE TABLE sensor_readings (
    id              SERIAL PRIMARY KEY,
    
    -- Device 1 (Buoy kiri)
    device1_speed   FLOAT,
    device1_dir     FLOAT,
    device1_wave    FLOAT,
    
    -- Device 2 (Buoy tengah)
    device2_speed   FLOAT,
    device2_dir     FLOAT,
    device2_wave    FLOAT,
    
    -- Device 3 (Buoy kanan)
    device3_speed   FLOAT,
    device3_dir     FLOAT,
    device3_wave    FLOAT,
    
    -- ML prediction
    prediction      VARCHAR(20),
    timestamp       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sensor_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_prediction ON sensor_readings(prediction);

SELECT 'Schema created with wave intensity support' AS info;
