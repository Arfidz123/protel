import numpy as np
import pandas as pd

INPUT_FILE = "synthetic_buoy_data.csv"
OUTPUT_FILE = "features_engineered.csv"
SHORE_NORMAL = 180.0


def angular_diff_abs(a1, a2):
    return abs((a1 - a2 + 180) % 360 - 180)


def circular_mean_std(angles_deg):
    angles_rad = np.deg2rad(angles_deg)
    mean_cos = np.mean(np.cos(angles_rad))
    mean_sin = np.mean(np.sin(angles_rad))
    mean_deg = np.rad2deg(np.arctan2(mean_sin, mean_cos)) % 360
    consistency = np.sqrt(mean_cos**2 + mean_sin**2)
    return mean_deg, consistency


def add_engineered_features(df):
    # === KECEPATAN ===
    df["kec_mean"] = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].mean(axis=1)
    df["kec_std"]  = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].std(axis=1)
    df["kec_max"]  = df[["b1_kecepatan_arus", "b2_kecepatan_arus", "b3_kecepatan_arus"]].max(axis=1)
    df["kec_diff_center"] = df["b2_kecepatan_arus"] - 0.5 * (df["b1_kecepatan_arus"] + df["b3_kecepatan_arus"])
    df["rip_speed_ratio"] = df["b2_kecepatan_arus"] / (0.5 * (df["b1_kecepatan_arus"] + df["b3_kecepatan_arus"]) + 1e-6)
    
    # === ARAH (circular) ===
    dir_consistency_list = []
    dir_mean_list = []
    dir_diff_center_list = []
    dir_offshore_b2_list = []
    
    for _, row in df.iterrows():
        angles = [row["b1_arah_arus"], row["b2_arah_arus"], row["b3_arah_arus"]]
        mean_deg, consistency = circular_mean_std(angles)
        dir_mean_list.append(mean_deg)
        dir_consistency_list.append(consistency)
        
        mean_lr, _ = circular_mean_std([row["b1_arah_arus"], row["b3_arah_arus"]])
        dir_diff_center_list.append(angular_diff_abs(row["b2_arah_arus"], mean_lr))
        
        dir_offshore_b2_list.append(180 - angular_diff_abs(row["b2_arah_arus"], SHORE_NORMAL))
    
    df["dir_mean"] = dir_mean_list
    df["dir_consistency"] = dir_consistency_list
    df["dir_diff_center"] = dir_diff_center_list
    df["dir_offshore_b2"] = dir_offshore_b2_list
    
    # === WAVE INTENSITY ===
    df["wave_mean"] = df[["b1_wave_intensity", "b2_wave_intensity", "b3_wave_intensity"]].mean(axis=1)
    df["wave_max"]  = df[["b1_wave_intensity", "b2_wave_intensity", "b3_wave_intensity"]].max(axis=1)
    df["wave_diff_center"] = df["b2_wave_intensity"] - 0.5 * (df["b1_wave_intensity"] + df["b3_wave_intensity"])
    
    return df


def main():
    print("=" * 60)
    print("FEATURE ENGINEERING (dengan wave intensity)")
    print("=" * 60)
    
    df = pd.read_csv(INPUT_FILE)
    print(f"\n[Load] {len(df)} samples, {len(df.columns)} kolom asli")
    
    df = add_engineered_features(df)
    
    new_features = ["kec_mean", "kec_std", "kec_max", "kec_diff_center", "rip_speed_ratio",
                    "dir_mean", "dir_consistency", "dir_diff_center", "dir_offshore_b2",
                    "wave_mean", "wave_max", "wave_diff_center"]
    print(f"[Engineer] +{len(new_features)} fitur turunan")
    
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\n[OK] Saved to {OUTPUT_FILE}")
    print(f"Total kolom akhir: {len(df.columns)}")
    
    print("\n--- Mean fitur diskriminatif per kelas ---")
    discriminative = ["kec_diff_center", "rip_speed_ratio", "dir_consistency",
                      "dir_diff_center", "wave_mean", "wave_diff_center"]
    print(df.groupby("label")[discriminative].mean().round(3))


if __name__ == "__main__":
    main()
