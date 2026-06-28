require('dotenv').config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/predict';
const USE_ML_MODEL   = process.env.USE_ML_MODEL === 'true';

function formatPayload(sensorData) {
  return {
    device1_speed:           sensorData.device1Speed,
    device1_direction:       sensorData.device1Direction,
    device1_wave_intensity:  sensorData.device1WaveIntensity || 0,
    device2_speed:           sensorData.device2Speed,
    device2_direction:       sensorData.device2Direction,
    device2_wave_intensity:  sensorData.device2WaveIntensity || 0,
    device3_speed:           sensorData.device3Speed,
    device3_direction:       sensorData.device3Direction,
    device3_wave_intensity:  sensorData.device3WaveIntensity || 0,
    timestamp:               sensorData.timestamp,
  };
}

function parseResponse(responseData) {
  return responseData.prediction;
}

function localFallback(sensorData) {
  const avgSpeed = (sensorData.device1Speed + sensorData.device2Speed + sensorData.device3Speed) / 3;
  const avgWave = ((sensorData.device1WaveIntensity || 0) + (sensorData.device2WaveIntensity || 0) + (sensorData.device3WaveIntensity || 0)) / 3;
  
  const lrAvg = (sensorData.device1Speed + sensorData.device3Speed) / 2;
  const ripRatio = sensorData.device2Speed / (lrAvg + 0.001);
  
  if (avgSpeed > 0.5 || avgWave > 3.0 || ripRatio > 2.5) {
    return 'Danger';
  }
  return 'Safe';
}

async function getPrediction(sensorData) {
  if (!USE_ML_MODEL) {
    return localFallback(sensorData);
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
      throw new Error(`ML status ${response.status}`);
    }

    const data = await response.json();
    return parseResponse(data);
  } catch (err) {
    console.warn(`[ML] Fallback (${err.message})`);
    return localFallback(sensorData);
  }
}

module.exports = { getPrediction };
