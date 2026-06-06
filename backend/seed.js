// seed.js - Sample data dengan wave intensity

const pool = require('./db');

const seedData = async () => {
  // Format: [d1_speed, d1_dir, d1_wave, d2_speed, d2_dir, d2_wave, d3_speed, d3_dir, d3_wave, prediction]
  const dummyReadings = [
    // === SAFE (arus tenang + ombak kecil) ===
    [0.08, 88,  0.5, 0.10, 92, 0.6, 0.09, 90, 0.5, 'Safe'],
    [0.12, 90,  0.7, 0.14, 88, 0.8, 0.11, 92, 0.6, 'Safe'],
    [0.15, 270, 0.4, 0.13, 268, 0.5, 0.14, 272, 0.4, 'Safe'],
    [0.18, 89,  0.9, 0.20, 91, 1.0, 0.19, 90, 0.8, 'Safe'],
    
    // === DANGER (pola rip) ===
    [0.15, 92,  1.5, 0.78, 180, 2.4, 0.18, 88, 1.4, 'Danger'],
    [0.20, 270, 1.8, 0.95, 175, 2.8, 0.22, 268, 1.6, 'Danger'],
    [0.18, 89,  1.4, 0.85, 185, 2.5, 0.16, 90, 1.3, 'Danger'],
    
    // === DANGER (storm dengan gelombang besar) ===
    [0.85, 200, 4.2, 0.92, 195, 4.5, 0.88, 205, 4.1, 'Danger'],
    [0.95, 160, 4.8, 1.10, 158, 5.0, 1.05, 162, 4.6, 'Danger'],
  ];

  try {
    console.log('Memasukkan data dummy...');
    
    for (const data of dummyReadings) {
      await pool.query(
        `INSERT INTO sensor_readings 
           (device1_speed, device1_dir, device1_wave,
            device2_speed, device2_dir, device2_wave,
            device3_speed, device3_dir, device3_wave,
            prediction) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        data
      );
    }

    console.log(`Berhasil! ${dummyReadings.length} data dummy dimasukkan.`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
};

seedData();
