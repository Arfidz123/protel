"""
==============================================================================
BRIDGE HARDWARE - Buoy USB ke Backend (mode 1 buoy real + 2 mock)
==============================================================================
Baca data real dari gateway USB, aggregate dalam window 5 detik,
generate mock untuk buoy 2 & 3, kirim ke backend Bintang.

DIPAKAI UNTUK: Integrasi end-to-end dengan 1 buoy real.

Cara pakai:
    1. Pastikan gateway terhubung via USB
    2. Cek COM port di Device Manager (misal COM3)
    3. Edit SERIAL_PORT di bawah
    4. Pastikan backend Bintang jalan di port 5000 dengan MODE=multi
    5. Pastikan ML server jalan di port 8000
    6. Jalankan: python bridge_hardware.py
"""

import json
import time
import math
import requests
import random
from collections import defaultdict
from datetime import datetime

try:
    import serial
except ImportError:
    print("ERROR: pyserial tidak terinstall")
    print("Install: pip install pyserial requests")
    exit(1)


# ==================== KONFIGURASI ====================

SERIAL_PORT = "COM3"           # <<< UBAH sesuai port gateway Anda
BAUD_RATE = 115200
BACKEND_URL = "http://localhost:5000/api/sensor-data"
WINDOW_SECONDS = 5


# ==================== STATE ====================

buffer = defaultdict(list)  # buffer[node_id] = [data1, data2, ...]
last_send_time = time.time()


# ==================== UTILS ====================

def circular_mean(angles_deg):
    if not angles_deg:
        return 0.0
    rad = [math.radians(a) for a in angles_deg]
    mean_cos = sum(math.cos(r) for r in rad) / len(rad)
    mean_sin = sum(math.sin(r) for r in rad) / len(rad)
    return (math.degrees(math.atan2(mean_sin, mean_cos)) + 360) % 360


def aggregate_buoy_1():
    """Hitung mean dari buffer buoy 1 (real data)."""
    samples = buffer.get(1, [])
    valid = [s for s in samples if s.get('gps_valid', 0) == 1]
    
    # Wave intensity tidak butuh GPS valid (data MPU selalu ada)
    wave_samples = [s for s in samples if 'wave_intensity' in s]
    
    if not valid and not wave_samples:
        return None
    
    # Speed & course dari GPS valid
    if valid:
        speeds = [s['gps_speed'] for s in valid]
        courses = [s['gps_course'] for s in valid]
        speed = sum(speeds) / len(speeds)
        direction = circular_mean(courses)
    else:
        speed = 0.0
        direction = 0.0
    
    # Wave intensity dari semua sample
    if wave_samples:
        waves = [s['wave_intensity'] for s in wave_samples]
        wave = sum(waves) / len(waves)
    else:
        wave = 0.0
    
    return {'speed': speed, 'direction': direction, 'wave': wave}


def generate_mock_buoy(real_buoy_1):
    """Generate data mock untuk buoy 2 & 3 berdasarkan buoy 1.
    
    Logika:
    - Kalau buoy 1 kondisi 'kuat' (speed > 0.4 atau wave > 2), 
      mungkin ini rip current -> generate B2 sebagai 'center' (lebih ekstrem)
    - Kalau buoy 1 kondisi tenang, generate B2 & B3 sama-sama tenang
    """
    s1 = real_buoy_1['speed']
    d1 = real_buoy_1['direction']
    w1 = real_buoy_1['wave']
    
    # Determinasi skenario berdasarkan kondisi buoy 1
    is_rough = (s1 > 0.4) or (w1 > 2.0)
    
    if is_rough:
        # Generate seolah B1 di pinggir (longshore), B2 di tengah (rip), B3 di pinggir lain
        # B2 mock: lebih cepat, arah offshore (180), wave lebih intense
        b2 = {
            'speed':     s1 * random.uniform(2.0, 3.5) + random.uniform(0, 0.2),
            'direction': 180.0 + random.uniform(-15, 15),
            'wave':      w1 * random.uniform(1.2, 1.6) + random.uniform(0, 0.3),
        }
        # B3 mirip B1 (longshore di sisi lain)
        b3 = {
            'speed':     s1 + random.uniform(-0.05, 0.05),
            'direction': (d1 + 180) % 360 + random.uniform(-20, 20),  # opposite longshore
            'wave':      w1 + random.uniform(-0.2, 0.2),
        }
    else:
        # Kondisi tenang - semua buoy mirip
        b2 = {
            'speed':     max(0.01, s1 + random.uniform(-0.05, 0.05)),
            'direction': d1 + random.uniform(-30, 30),
            'wave':      max(0.05, w1 + random.uniform(-0.15, 0.15)),
        }
        b3 = {
            'speed':     max(0.01, s1 + random.uniform(-0.05, 0.05)),
            'direction': d1 + random.uniform(-30, 30),
            'wave':      max(0.05, w1 + random.uniform(-0.15, 0.15)),
        }
    
    # Wrap direction & ensure positive
    b2['direction'] = ((b2['direction'] % 360) + 360) % 360
    b3['direction'] = ((b3['direction'] % 360) + 360) % 360
    b2['speed'] = max(0.0, b2['speed'])
    b3['speed'] = max(0.0, b3['speed'])
    b2['wave'] = max(0.0, b2['wave'])
    b3['wave'] = max(0.0, b3['wave'])
    
    return b2, b3


def send_to_backend(b1, b2, b3):
    """Kirim ke backend Bintang."""
    payload = {
        'device1Speed':         round(b1['speed'], 3),
        'device1Direction':     round(b1['direction'], 1),
        'device1WaveIntensity': round(b1['wave'], 3),
        'device2Speed':         round(b2['speed'], 3),
        'device2Direction':     round(b2['direction'], 1),
        'device2WaveIntensity': round(b2['wave'], 3),
        'device3Speed':         round(b3['speed'], 3),
        'device3Direction':     round(b3['direction'], 1),
        'device3WaveIntensity': round(b3['wave'], 3),
        'timestamp':            datetime.now().isoformat(),
    }
    
    try:
        response = requests.post(BACKEND_URL, json=payload, timeout=3)
        if response.status_code == 200:
            t = datetime.now().strftime('%H:%M:%S')
            print(f"[{t}] REAL D1: v={payload['device1Speed']:.2f}m/s w={payload['device1WaveIntensity']:.2f} | "
                  f"MOCK D2: v={payload['device2Speed']:.2f} w={payload['device2WaveIntensity']:.2f} | "
                  f"MOCK D3: v={payload['device3Speed']:.2f} w={payload['device3WaveIntensity']:.2f}")
        else:
            print(f"[ERROR] Backend response {response.status_code}")
    except Exception as e:
        print(f"[ERROR] Gagal kirim: {e}")


def main():
    global last_send_time
    
    print("=" * 60)
    print("  BRIDGE HARDWARE - 1 buoy real + 2 mock")
    print("=" * 60)
    print(f"  Serial Port : {SERIAL_PORT}")
    print(f"  Baud Rate   : {BAUD_RATE}")
    print(f"  Backend URL : {BACKEND_URL}")
    print(f"  Window      : {WINDOW_SECONDS} detik")
    print("=" * 60)
    print()
    
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"Connected to {SERIAL_PORT}\n")
    except Exception as e:
        print(f"ERROR: Tidak bisa buka {SERIAL_PORT}: {e}")
        print("Cek di Device Manager port gateway Anda.")
        return
    
    print("Menunggu data dari gateway...\n")
    
    try:
        while True:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            
            if not line.startswith('[JSON] '):
                continue
            
            try:
                data = json.loads(line[7:])
                node_id = data.get('node_id')
                if node_id in [1, 2, 3]:
                    buffer[node_id].append(data)
            except json.JSONDecodeError:
                continue
            
            # Cek waktu kirim
            now = time.time()
            if now - last_send_time >= WINDOW_SECONDS:
                b1 = aggregate_buoy_1()
                
                if b1 is not None:
                    b2, b3 = generate_mock_buoy(b1)
                    send_to_backend(b1, b2, b3)
                else:
                    print(f"[SKIP] Belum ada data dari buoy 1")
                
                # Reset buffer
                buffer.clear()
                last_send_time = now
    
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        ser.close()


if __name__ == '__main__':
    main()
