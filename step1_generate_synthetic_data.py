"""
==============================================================================
STEP 1: SYNTHETIC DATA GENERATOR (2 kelas: Safe / Danger)
==============================================================================
Generate dataset simulasi 3 buoy dengan 2 fitur dasar per buoy:
    - kecepatan_arus : kecepatan arus permukaan (m/s) dari GPS drift velocity
    - arah_arus      : arah arus dalam derajat (0-360) dari GPS drift direction

Total fitur dasar: 2 fitur x 3 buoy = 6 fitur

Threshold KECEPATAN (sesuai Moulton 2017 & Wahyudi 2024):
    Safe   : kecepatan < 0.3 m/s
    Danger : kecepatan >= 0.3 m/s (atau pola rip terdeteksi)

Konvensi ARAH ARUS:
    0/360 derajat   = Utara
    90 derajat      = Timur
    180 derajat     = Selatan (offshore untuk pantai selatan Indonesia)
    270 derajat     = Barat

Pola RIP CURRENT:
    - Buoy 1 dan 3 (kiri-kanan): arah longshore (sejajar pantai)
    - Buoy 2 (tengah, di rip channel): arah OFFSHORE (~180)
    - Kecepatan B2 jauh lebih tinggi dari B1, B3

Output: synthetic_buoy_data.csv
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta

OUTPUT_FILE = "synthetic_buoy_data.csv"
N_SAMPLES_PER_CLASS = 1500    # 1500 Safe + 1500 Danger = 3000 total

# Konvensi arah pantai selatan Indonesia
SHORE_NORMAL = 180.0  # arah offshore (ke laut lepas)
ALONGSHORE_E = 90.0   # arah timur (sejajar pantai)
ALONGSHORE_W = 270.0  # arah barat (sejajar pantai)

np.random.seed(42)


def wrap_angle(angle):
    """Pastikan angle dalam range 0-360."""
    return angle % 360


def generate_safe(n):
    """Kondisi SAFE: arus lemah-sedang, arah relatif seragam."""
    samples = []
    for _ in range(n):
        # Variasi kondisi safe: dari sangat tenang sampai sedang
        kec_base = np.random.uniform(0.05, 0.28)
        kec = [max(0.01, kec_base + np.random.normal(0, 0.03)) for _ in range(3)]
        
        # Arah relatif seragam, dominan longshore
        base_dir = np.random.choice([ALONGSHORE_E, ALONGSHORE_W])
        arah = [wrap_angle(base_dir + np.random.normal(0, 20)) for _ in range(3)]
        
        samples.append(build_sample(kec, arah, "Safe"))
    return samples


def generate_danger(n):
    """Kondisi DANGER: arus kuat dengan pola rip atau storm."""
    samples = []
    for _ in range(n):
        is_rip_pattern = np.random.random() < 0.7  # 70% rip, 30% storm
        
        if is_rip_pattern:
            # POLA RIP: kecepatan buoy tengah jauh lebih tinggi
            kec_base = np.random.uniform(0.4, 1.2)
            kec = [
                kec_base * 0.4 + np.random.normal(0, 0.05),  # B1: pelan
                kec_base * 1.3 + np.random.normal(0, 0.08),  # B2: KUAT
                kec_base * 0.4 + np.random.normal(0, 0.05),  # B3: pelan
            ]
            
            # POLA ARAH: B1,B3 longshore, B2 OFFSHORE
            arah_lr = np.random.choice([ALONGSHORE_E, ALONGSHORE_W])
            arah = [
                wrap_angle(arah_lr + np.random.normal(0, 20)),       # B1: longshore
                wrap_angle(SHORE_NORMAL + np.random.normal(0, 15)),  # B2: OFFSHORE!
                wrap_angle(arah_lr + np.random.normal(0, 20)),       # B3: longshore
            ]
        else:
            # POLA STORM: semua buoy kecepatan tinggi, arah chaotic
            kec_base = np.random.uniform(0.5, 1.3)
            kec = [kec_base + np.random.normal(0, 0.1) for _ in range(3)]
            base_dir = np.random.uniform(0, 360)
            arah = [wrap_angle(base_dir + np.random.normal(0, 40)) for _ in range(3)]
        
        kec = [max(0.3, k) for k in kec]
        samples.append(build_sample(kec, arah, "Danger"))
    return samples


def build_sample(kec, arah, label):
    """Build dict satu sample dengan data 3 buoy."""
    sample = {}
    for i in range(3):
        nid = i + 1
        sample[f"b{nid}_kecepatan_arus"] = round(kec[i], 4)
        sample[f"b{nid}_arah_arus"] = round(arah[i], 2)
    sample["label"] = label
    return sample


def main():
    print("=" * 60)
    print("SYNTHETIC DATA GENERATOR - 2 Kelas (Safe / Danger)")
    print("Fitur: kecepatan arus + arah arus (per 3 buoy)")
    print("=" * 60)
    
    print(f"\nGenerating {N_SAMPLES_PER_CLASS} samples per kelas...")
    
    safe = generate_safe(N_SAMPLES_PER_CLASS)
    danger = generate_danger(N_SAMPLES_PER_CLASS)
    
    print(f"  Safe   : {len(safe)} samples")
    print(f"  Danger : {len(danger)} samples")
    
    df = pd.DataFrame(safe + danger)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    
    base_time = datetime(2026, 4, 1, 8, 0, 0)
    df["timestamp"] = [base_time + timedelta(seconds=i*5) for i in range(len(df))]
    
    cols = ["timestamp"] + [c for c in df.columns if c not in ("timestamp", "label")] + ["label"]
    df = df[cols]
    
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n[OK] Saved to {OUTPUT_FILE}")
    print(f"Total samples: {len(df)}")
    print(f"Total fitur dasar: 6 (2 fitur x 3 buoy)")
    
    print("\n--- Preview ---")
    print(df.head())
    
    print("\n--- Statistik kecepatan per kelas ---")
    print(df.groupby("label")[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].mean().round(3))
    
    print("\n--- Statistik arah per kelas ---")
    print(df.groupby("label")[["b1_arah_arus", "b2_arah_arus", "b3_arah_arus"]].mean().round(1))
    
    print("\n[INFO] Perhatikan pola RIP (kelas Danger):")
    print("  - Buoy 2 kecepatan jauh lebih tinggi dari B1, B3")
    print("  - Buoy 2 arah ~180 (offshore), B1 & B3 arah ~90 atau ~270 (longshore)")


if __name__ == "__main__":
    main()
