-- DATABASE SCHEMA - Sensor Readings (3 buoy real + posisi map) 

DROP TABLE IF EXISTS sensor_readings CASCADE;

CREATE TABLE sensor_readings (
    id              SERIAL PRIMARY KEY,
    
    -- Buoy 1
    device1_speed   FLOAT,
    device1_dir     FLOAT,
    device1_wave    FLOAT,
    device1_lat     FLOAT,
    device1_lon     FLOAT,
    
    -- Buoy 2
    device2_speed   FLOAT,
    device2_dir     FLOAT,
    device2_wave    FLOAT,
    device2_lat     FLOAT,
    device2_lon     FLOAT,
    
    -- Buoy 3
    device3_speed   FLOAT,
    device3_dir     FLOAT,
    device3_wave    FLOAT,
    device3_lat     FLOAT,
    device3_lon     FLOAT,
    
    -- ML prediction
    prediction      VARCHAR(20),
    timestamp       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sensor_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_prediction ON sensor_readings(prediction);

SELECT 'Schema updated: 3 buoy real + positions for map' AS info;
