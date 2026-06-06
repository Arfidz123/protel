"""
==============================================================================
STEP 1: SYNTHETIC DATA GENERATOR (Safe / Danger)
==============================================================================
Generate dataset simulasi 3 buoy dengan 3 fitur per buoy:
    - kecepatan_arus  : m/s, dari GPS
    - arah_arus       : derajat 0-360, dari GPS
    - wave_intensity  : skor 0-10+, dari MPU6050

Total fitur dasar: 3 fitur x 3 buoy = 9 fitur

Logika pelabelan:
    Safe   : arus lemah, arah seragam, gelombang tenang
    Danger : (a) pola rip - B2 lebih cepat & offshore, ATAU
             (b) storm   - semua kuat dan/atau gelombang ganas

Output: synthetic_buoy_data.csv
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta

OUTPUT_FILE = "synthetic_buoy_data.csv"
N_SAMPLES_PER_CLASS = 1500

# Konvensi pantai selatan Indonesia
SHORE_NORMAL = 180.0
ALONGSHORE_E = 90.0
ALONGSHORE_W = 270.0

np.random.seed(42)


def wrap_angle(angle):
    return angle % 360


def generate_safe(n):
    """Kondisi SAFE: arus lemah, arah seragam, ombak tenang."""
    samples = []
    for _ in range(n):
        # Kecepatan rendah-sedang
        kec_base = np.random.uniform(0.05, 0.28)
        kec = [max(0.01, kec_base + np.random.normal(0, 0.03)) for _ in range(3)]
        
        # Arah seragam dominan longshore
        base_dir = np.random.choice([ALONGSHORE_E, ALONGSHORE_W])
        arah = [wrap_angle(base_dir + np.random.normal(0, 20)) for _ in range(3)]
        
        # Wave intensity rendah (CALM): 0.05 - 1.0
        wave = [max(0.05, np.random.uniform(0.1, 0.9) + np.random.normal(0, 0.1)) for _ in range(3)]
        
        samples.append(build_sample(kec, arah, wave, "Safe"))
    return samples


def generate_danger(n):
    """Kondisi DANGER: rip current ATAU storm dengan gelombang besar."""
    samples = []
    for _ in range(n):
        scenario = np.random.choice(['rip', 'storm', 'rip_with_waves'], 
                                     p=[0.5, 0.25, 0.25])
        
        if scenario == 'rip':
            # POLA RIP: B2 lebih cepat ke offshore, gelombang sedang
            kec_base = np.random.uniform(0.4, 1.0)
            kec = [
                kec_base * 0.4 + np.random.normal(0, 0.05),
                kec_base * 1.3 + np.random.normal(0, 0.08),
                kec_base * 0.4 + np.random.normal(0, 0.05),
            ]
            arah_lr = np.random.choice([ALONGSHORE_E, ALONGSHORE_W])
            arah = [
                wrap_angle(arah_lr + np.random.normal(0, 20)),
                wrap_angle(SHORE_NORMAL + np.random.normal(0, 15)),
                wrap_angle(arah_lr + np.random.normal(0, 20)),
            ]
            # Wave sedang (gelombang tidak ekstrem, tapi B2 lebih intense karena rip)
            wave = [
                np.random.uniform(0.8, 1.8) + np.random.normal(0, 0.2),
                np.random.uniform(1.5, 2.8) + np.random.normal(0, 0.3),
                np.random.uniform(0.8, 1.8) + np.random.normal(0, 0.2),
            ]
        
        elif scenario == 'storm':
            # POLA STORM: semua kuat, arah chaotic, gelombang ganas
            kec_base = np.random.uniform(0.5, 1.3)
            kec = [kec_base + np.random.normal(0, 0.1) for _ in range(3)]
            base_dir = np.random.uniform(0, 360)
            arah = [wrap_angle(base_dir + np.random.normal(0, 40)) for _ in range(3)]
            # Wave intensity tinggi (ROUGH): 3 - 6
            wave = [np.random.uniform(3.0, 5.5) + np.random.normal(0, 0.5) for _ in range(3)]
        
        else:  # rip_with_waves
            # RIP + GELOMBANG BESAR: kombinasi paling bahaya
            kec_base = np.random.uniform(0.5, 1.1)
            kec = [
                kec_base * 0.5 + np.random.normal(0, 0.06),
                kec_base * 1.4 + np.random.normal(0, 0.08),
                kec_base * 0.5 + np.random.normal(0, 0.06),
            ]
            arah_lr = np.random.choice([ALONGSHORE_E, ALONGSHORE_W])
            arah = [
                wrap_angle(arah_lr + np.random.normal(0, 25)),
                wrap_angle(SHORE_NORMAL + np.random.normal(0, 20)),
                wrap_angle(arah_lr + np.random.normal(0, 25)),
            ]
            wave = [np.random.uniform(2.5, 4.5) + np.random.normal(0, 0.4) for _ in range(3)]
        
        # Clamp values
        kec = [max(0.3, k) for k in kec]
        wave = [max(0.5, w) for w in wave]
        
        samples.append(build_sample(kec, arah, wave, "Danger"))
    return samples


def build_sample(kec, arah, wave, label):
    """Build sample dict dengan 3 fitur per buoy."""
    sample = {}
    for i in range(3):
        nid = i + 1
        sample[f"b{nid}_kecepatan_arus"]   = round(kec[i], 4)
        sample[f"b{nid}_arah_arus"]        = round(arah[i], 2)
        sample[f"b{nid}_wave_intensity"]   = round(wave[i], 4)
    sample["label"] = label
    return sample


def main():
    print("=" * 60)
    print("SYNTHETIC DATA GENERATOR")
    print("Fitur: kecepatan arus + arah arus + wave intensity (per 3 buoy)")
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
    print(f"Fitur dasar: 9 (3 fitur x 3 buoy)")
    
    print("\n--- Statistik per kelas ---")
    print(df.groupby("label")[[
        "b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus",
        "b1_wave_intensity", "b2_wave_intensity", "b3_wave_intensity"
    ]].mean().round(3))


if __name__ == "__main__":
    main()
