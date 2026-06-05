/**
 * mlService.js
 * 
 * Modul untuk komunikasi dengan ML service Arhya (Flask di port 8000).
 * Update untuk 3 device.
 */

require('dotenv').config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/predict';
const USE_ML_MODEL   = process.env.USE_ML_MODEL === 'true';

// ─────────────────────────────────────────────
// FORMAT DATA YANG DIKIRIM KE ML SERVICE
// Sesuai API contract ML service Arhya: 3 device
// ─────────────────────────────────────────────
function formatPayload(sensorData) {
  return {
    device1_speed:     sensorData.device1Speed,
    device1_direction: sensorData.device1Direction,
    device2_speed:     sensorData.device2Speed,
    device2_direction: sensorData.device2Direction,
    device3_speed:     sensorData.device3Speed,
    device3_direction: sensorData.device3Direction,
    timestamp:         sensorData.timestamp,
  };
}

// ML service return: { prediction: "Safe" | "Danger", confidence, ... }
function parseResponse(responseData) {
  return responseData.prediction;
}

// ─────────────────────────────────────────────
// FALLBACK: prediksi lokal jika ML service down
// ─────────────────────────────────────────────
function localFallback(sensorData) {
  const avgSpeed = (sensorData.device1Speed + sensorData.device2Speed + sensorData.device3Speed) / 3;
  
  // Cek pola rip: B2 jauh lebih cepat dari B1, B3
  const lrAvg = (sensorData.device1Speed + sensorData.device3Speed) / 2;
  const ripRatio = sensorData.device2Speed / (lrAvg + 0.001);
  
  // Danger jika: kecepatan rata-rata tinggi ATAU ada pola rip
  if (avgSpeed > 0.5 || ripRatio > 2.5) {
    return 'Danger';
  }
  return 'Safe';
}

// ─────────────────────────────────────────────
// FUNGSI UTAMA - dipanggil dari index.js
// ─────────────────────────────────────────────
async function getPrediction(sensorData) {
  if (!USE_ML_MODEL) {
    const prediction = localFallback(sensorData);
    console.log(`[ML] Menggunakan prediksi lokal: ${prediction}`);
    return prediction;
  }

  try {
    const payload = formatPayload(sensorData);

    const response = await fetch(ML_SERVICE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`ML service merespons dengan status ${response.status}`);
    }

    const data = await response.json();
    const prediction = parseResponse(data);

    // Log confidence kalau ada
    if (data.confidence !== undefined) {
      console.log(`[ML] Prediksi: ${prediction} (confidence: ${(data.confidence * 100).toFixed(1)}%)`);
    } else {
      console.log(`[ML] Prediksi: ${prediction}`);
    }
    
    return prediction;

  } catch (err) {
    console.warn(`[ML] Gagal hubungi ML service: ${err.message}`);
    console.warn(`[ML] Pakai prediksi lokal sebagai fallback.`);
    return localFallback(sensorData);
  }
}

module.exports = { getPrediction };
