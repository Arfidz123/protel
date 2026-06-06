"""
==============================================================================
DATA COLLECTOR - Kumpulkan Data Real dari Hardware
==============================================================================
Script ini PASIF mendengarkan data dari gateway USB dan menyimpan ke CSV
untuk training ulang ML model dengan data REAL.

DIPAKAI: Saat water test di kolam/pantai.

Cara pakai:
    1. Pastikan gateway terhubung via USB
    2. Edit SERIAL_PORT di bawah (cek di Device Manager)
    3. Jalankan dengan label:
       python data_collector.py --label safe     (saat kondisi tenang)
       python data_collector.py --label danger   (saat kondisi rip/storm)
    4. Tekan Ctrl+C untuk berhenti
    5. Data tersimpan di real_data_<label>_<tanggal>.csv

Setelah collect data Safe dan Danger:
    6. Gabungkan dengan synthetic data
    7. Training ulang model dengan data nyata
"""

import argparse
import json
import csv
import sys
from datetime import datetime

try:
    import serial
except ImportError:
    print("ERROR: pyserial tidak terinstall")
    print("Install: pip install pyserial")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Collect real data dari hardware')
    parser.add_argument('--port', default='COM3', help='Serial port (default: COM3)')
    parser.add_argument('--baud', type=int, default=115200, help='Baud rate')
    parser.add_argument('--label', choices=['safe', 'danger'], required=True,
                        help='Label untuk semua data yang dikumpulkan saat ini')
    args = parser.parse_args()
    
    timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f"real_data_{args.label}_{timestamp_str}.csv"
    
    print("=" * 60)
    print("  DATA COLLECTOR - Real Hardware Data")
    print("=" * 60)
    print(f"  Serial port : {args.port}")
    print(f"  Baud rate   : {args.baud}")
    print(f"  Label       : {args.label.upper()}")
    print(f"  Output      : {output_file}")
    print()
    print(f"  Pastikan kondisi saat record memang {args.label.upper()}")
    print("  Tekan Ctrl+C untuk berhenti")
    print("=" * 60)
    print()
    
    try:
        ser = serial.Serial(args.port, args.baud, timeout=1)
        print(f"Connected to {args.port}")
    except Exception as e:
        print(f"ERROR: Tidak bisa buka {args.port}: {e}")
        return
    
    csv_file = open(output_file, 'w', newline='', encoding='utf-8')
    writer = csv.writer(csv_file)
    
    writer.writerow([
        'timestamp_local', 'node_id', 'packet_num',
        'accel_x', 'accel_y', 'accel_z',
        'gyro_x', 'gyro_y', 'gyro_z',
        'latitude', 'longitude',
        'gps_speed', 'gps_course', 'gps_valid',
        'rssi', 'snr', 'label'
    ])
    
    count = 0
    valid_count = 0
    
    print("Menunggu data dari gateway...\n")
    
    try:
        while True:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            
            if not line.startswith('[JSON] '):
                continue
            
            try:
                data = json.loads(line[7:])
            except json.JSONDecodeError:
                continue
            
            now = datetime.now().isoformat()
            
            writer.writerow([
                now, data.get('node_id', 0), data.get('pkt', 0),
                data.get('ax', 0), data.get('ay', 0), data.get('az', 0),
                data.get('gx', 0), data.get('gy', 0), data.get('gz', 0),
                data.get('lat', 0), data.get('lon', 0),
                data.get('gps_speed', 0), data.get('gps_course', 0),
                data.get('gps_valid', 0),
                data.get('rssi', 0), data.get('snr', 0),
                args.label,
            ])
            csv_file.flush()
            
            count += 1
            if data.get('gps_valid', 0) == 1:
                valid_count += 1
            
            if count % 10 == 0:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                      f"Recorded: {count} ({valid_count} GPS valid) | "
                      f"node={data.get('node_id')} | "
                      f"speed={data.get('gps_speed', 0):.2f}m/s | "
                      f"course={data.get('gps_course', 0):.0f}deg")
    
    except KeyboardInterrupt:
        print(f"\n\nStopped. Total recorded: {count} ({valid_count} GPS valid)")
        print(f"Data saved to: {output_file}")
    finally:
        ser.close()
        csv_file.close()


if __name__ == '__main__':
    main()
