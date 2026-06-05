"""
==============================================================================
STEP 2: FEATURE ENGINEERING (2 kelas: Safe / Danger)
==============================================================================
Dari 6 fitur dasar (kecepatan + arah per 3 buoy), tambah fitur turunan.

PENTING: ARAH ARUS adalah CIRCULAR variable (0 dan 360 itu sama!).
Tidak bisa langsung dihitung selisih atau standar deviasi seperti angka biasa.

Solusi: gunakan komponen X, Y (cosinus, sinus) dari arah.

Fitur turunan:
KECEPATAN:
    - kec_mean        : rata-rata kecepatan 3 buoy
    - kec_std         : standar deviasi kecepatan
    - kec_max         : kecepatan maksimum
    - kec_diff_center : selisih kecepatan buoy tengah vs rata kiri-kanan
    - rip_speed_ratio : rasio (kalau > 1, buoy tengah lebih kuat)

ARAH:
    - dir_consistency : seberapa seragam arah antar 3 buoy (0-1)
    - dir_diff_center : selisih sudut buoy tengah vs rata kiri-kanan (derajat)
    - dir_offshore_b2 : seberapa dekat arah buoy 2 ke offshore (180 deg)

Total fitur: 6 dasar + 9 turunan = 15 fitur

Input : synthetic_buoy_data.csv
Output: features_engineered.csv
"""

import numpy as np
import pandas as pd

INPUT_FILE = "synthetic_buoy_data.csv"
OUTPUT_FILE = "features_engineered.csv"

SHORE_NORMAL = 180.0  # offshore direction


def angular_diff(a1, a2):
    """Selisih sudut yang mempertimbangkan circular."""
    diff = (a1 - a2 + 180) % 360 - 180
    return diff


def angular_diff_abs(a1, a2):
    """Selisih absolut sudut (0-180)."""
    return abs(angular_diff(a1, a2))


def circular_mean_std(angles_deg):
    """Hitung mean dan consistency untuk circular data."""
    angles_rad = np.deg2rad(angles_deg)
    mean_cos = np.mean(np.cos(angles_rad))
    mean_sin = np.mean(np.sin(angles_rad))
    mean_deg = np.rad2deg(np.arctan2(mean_sin, mean_cos)) % 360
    consistency = np.sqrt(mean_cos**2 + mean_sin**2)
    return mean_deg, consistency


def add_engineered_features(df):
    """Tambah fitur turunan."""
    
    # === Fitur KECEPATAN ===
    df["kec_mean"] = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].mean(axis=1)
    df["kec_std"] = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].std(axis=1)
    df["kec_max"] = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].max(axis=1)
    
    df["kec_diff_center"] = df["b2_kecepatan_arus"] - 0.5 * (df["b1_kecepatan_arus"] + df["b3_kecepatan_arus"])
    df["rip_speed_ratio"] = df["b2_kecepatan_arus"] / (0.5 * (df["b1_kecepatan_arus"] + df["b3_kecepatan_arus"]) + 1e-6)
    
    # === Fitur ARAH (handling circular) ===
    dir_consistency_list = []
    dir_mean_list = []
    dir_diff_center_list = []
    dir_offshore_b2_list = []
    
    for _, row in df.iterrows():
        angles = [row["b1_arah_arus"], row["b2_arah_arus"], row["b3_arah_arus"]]
        mean_deg, consistency = circular_mean_std(angles)
        
        dir_mean_list.append(mean_deg)
        dir_consistency_list.append(consistency)
        
        # Selisih arah buoy 2 vs rata-rata buoy 1 dan 3
        mean_lr, _ = circular_mean_std([row["b1_arah_arus"], row["b3_arah_arus"]])
        dir_diff = angular_diff_abs(row["b2_arah_arus"], mean_lr)
        dir_diff_center_list.append(dir_diff)
        
        # Seberapa dekat arah buoy 2 ke SHORE_NORMAL (offshore)
        offshore_alignment = 180 - angular_diff_abs(row["b2_arah_arus"], SHORE_NORMAL)
        dir_offshore_b2_list.append(offshore_alignment)
    
    df["dir_mean"] = dir_mean_list
    df["dir_consistency"] = dir_consistency_list
    df["dir_diff_center"] = dir_diff_center_list
    df["dir_offshore_b2"] = dir_offshore_b2_list
    
    return df


def main():
    print("=" * 60)
    print("FEATURE ENGINEERING - 2 Kelas (Safe / Danger)")
    print("=" * 60)
    
    df = pd.read_csv(INPUT_FILE)
    print(f"\n[Load] {len(df)} samples, {len(df.columns)} kolom asli")
    
    df = add_engineered_features(df)
    
    new_features = ["kec_mean", "kec_std", "kec_max", "kec_diff_center", "rip_speed_ratio",
                    "dir_mean", "dir_consistency", "dir_diff_center", "dir_offshore_b2"]
    print(f"[Engineer] +{len(new_features)} fitur turunan")
    print(f"  {', '.join(new_features)}")
    
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n[OK] Saved to {OUTPUT_FILE}")
    print(f"Total kolom akhir: {len(df.columns)}")
    
    print("\n--- Mean fitur per kelas ---")
    discriminative = ["kec_mean", "kec_diff_center", "rip_speed_ratio",
                      "dir_consistency", "dir_diff_center", "dir_offshore_b2"]
    print(df.groupby("label")[discriminative].mean().round(3))
    
    print("\n[INFO] Interpretasi:")
    print("  - kec_diff_center: POSITIF & BESAR untuk Danger (B2 lebih kuat)")
    print("  - rip_speed_ratio: > 2 untuk Danger (pola rip channel)")
    print("  - dir_consistency: RENDAH untuk Danger (arah tidak seragam)")
    print("  - dir_diff_center: BESAR untuk Danger (B2 beda arah dari B1, B3)")
    print("  - dir_offshore_b2: TINGGI untuk Danger (B2 mengarah offshore)")


if __name__ == "__main__":
    main()
