// seed.js
// Update untuk 3 device dengan skenario realistis

const pool = require('./db');

const seedData = async () => {
  // Format per row:
  // [device1_speed, device1_dir, device2_speed, device2_dir, device3_speed, device3_dir, prediction]
  const dummyReadings = [
    // === Skenario AMAN (arus tenang, arah seragam longshore) ===
    [0.08, 88,  0.10, 92,  0.09, 90,  'Safe'],
    [0.12, 90,  0.14, 88,  0.11, 92,  'Safe'],
    [0.15, 270, 0.13, 268, 0.14, 272, 'Safe'],
    [0.18, 89,  0.20, 91,  0.19, 90,  'Safe'],
    
    // === Skenario BAHAYA (pola RIP: B2 lebih cepat ke offshore) ===
    [0.15, 92,  0.78, 180, 0.18, 88,  'Danger'],  // rip jelas
    [0.20, 270, 0.95, 175, 0.22, 268, 'Danger'],  // rip kuat
    [0.18, 89,  0.85, 185, 0.16, 90,  'Danger'],  // rip
    [0.12, 91,  0.65, 178, 0.14, 92,  'Danger'],  // rip sedang
    
    // === Skenario BAHAYA (storm: semua buoy cepat) ===
    [0.85, 200, 0.92, 195, 0.88, 205, 'Danger'],
    [0.95, 160, 1.10, 158, 1.05, 162, 'Danger'],
  ];

  try {
    console.log('Sedang memasukkan data dummy...');
    
    for (const data of dummyReadings) {
      await pool.query(
        `INSERT INTO sensor_readings 
           (device1_speed, device1_dir, 
            device2_speed, device2_dir,
            device3_speed, device3_dir,
            prediction) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        data
      );
    }

    console.log(`Berhasil! ${dummyReadings.length} data dummy dimasukkan.`);
    console.log(`  Safe   : ${dummyReadings.filter(d => d[6] === 'Safe').length}`);
    console.log(`  Danger : ${dummyReadings.filter(d => d[6] === 'Danger').length}`);
  } catch (err) {
    console.error('Error saat seeding:', err.message);
  } finally {
    pool.end();
  }
};

seedData();
