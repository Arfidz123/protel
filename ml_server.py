import sys
from datetime import datetime
from pathlib import Path

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
    import numpy as np
    import pandas as pd
    import joblib
except ImportError as e:
    print(f"ERROR: {e}")
    print("Install: pip install flask flask-cors numpy pandas scikit-learn joblib")
    sys.exit(1)

PORT = 8000
MODEL_FILE = "rip_current_model.joblib"
SHORE_NORMAL = 180.0

app = Flask(__name__)
CORS(app)

model_bundle = None
model = None
feature_names = None
classes = None


def load_model():
    global model_bundle, model, feature_names, classes
    
    if not Path(MODEL_FILE).exists():
        print(f"WARNING: {MODEL_FILE} tidak ditemukan!")
        return False
    
    try:
        model_bundle = joblib.load(MODEL_FILE)
        model = model_bundle["model"]
        feature_names = model_bundle["feature_names"]
        classes = model_bundle["classes"]
        
        print(f"[ML] Model loaded")
        print(f"     Classes: {classes}")
        print(f"     Features: {len(feature_names)}")
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def circular_mean_std(angles_deg):
    angles_rad = np.deg2rad(angles_deg)
    mean_cos = np.mean(np.cos(angles_rad))
    mean_sin = np.mean(np.sin(angles_rad))
    mean_deg = np.rad2deg(np.arctan2(mean_sin, mean_cos)) % 360
    consistency = np.sqrt(mean_cos**2 + mean_sin**2)
    return mean_deg, consistency


def angular_diff_abs(a1, a2):
    return abs((a1 - a2 + 180) % 360 - 180)


def build_feature_vector(d1_speed, d1_dir, d1_wave,
                         d2_speed, d2_dir, d2_wave,
                         d3_speed, d3_dir, d3_wave):
    """Build feature vector lengkap sesuai training."""
    feat = {}
    
    # Fitur dasar per buoy
    feat["b1_kecepatan_arus"] = d1_speed
    feat["b1_arah_arus"]      = d1_dir
    feat["b1_wave_intensity"] = d1_wave
    feat["b2_kecepatan_arus"] = d2_speed
    feat["b2_arah_arus"]      = d2_dir
    feat["b2_wave_intensity"] = d2_wave
    feat["b3_kecepatan_arus"] = d3_speed
    feat["b3_arah_arus"]      = d3_dir
    feat["b3_wave_intensity"] = d3_wave
    
    # Kecepatan agregat
    speeds = [d1_speed, d2_speed, d3_speed]
    feat["kec_mean"] = float(np.mean(speeds))
    feat["kec_std"]  = float(np.std(speeds, ddof=1)) if len(speeds) > 1 else 0.0
    feat["kec_max"]  = float(max(speeds))
    feat["kec_diff_center"] = d2_speed - 0.5 * (d1_speed + d3_speed)
    feat["rip_speed_ratio"] = d2_speed / (0.5 * (d1_speed + d3_speed) + 1e-6)
    
    # Arah agregat (circular)
    angles = [d1_dir, d2_dir, d3_dir]
    mean_deg, consistency = circular_mean_std(angles)
    feat["dir_mean"] = float(mean_deg)
    feat["dir_consistency"] = float(consistency)
    mean_lr, _ = circular_mean_std([d1_dir, d3_dir])
    feat["dir_diff_center"] = float(angular_diff_abs(d2_dir, mean_lr))
    feat["dir_offshore_b2"] = float(180 - angular_diff_abs(d2_dir, SHORE_NORMAL))
    
    # Wave intensity agregat (BARU)
    waves = [d1_wave, d2_wave, d3_wave]
    feat["wave_mean"] = float(np.mean(waves))
    feat["wave_max"]  = float(max(waves))
    feat["wave_diff_center"] = d2_wave - 0.5 * (d1_wave + d3_wave)
    
    return feat


@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model belum dimuat", "prediction": "Safe"}), 500
    
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400
    
    required = [
        "device1_speed", "device1_direction", "device1_wave_intensity",
        "device2_speed", "device2_direction", "device2_wave_intensity",
        "device3_speed", "device3_direction", "device3_wave_intensity"
    ]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Field hilang: {missing}", "required": required}), 400
    
    try:
        feat = build_feature_vector(
            float(data["device1_speed"]), float(data["device1_direction"]), float(data["device1_wave_intensity"]),
            float(data["device2_speed"]), float(data["device2_direction"]), float(data["device2_wave_intensity"]),
            float(data["device3_speed"]), float(data["device3_direction"]), float(data["device3_wave_intensity"]),
        )
        X = pd.DataFrame([feat])[feature_names]
        
        proba = model.predict_proba(X)[0]
        idx = int(np.argmax(proba))
        prediction = classes[idx]
        confidence = float(proba[idx])
        
        proba_dict = {cls: float(p) for cls, p in zip(classes, proba)}
        
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {prediction} ({confidence:.1%}) | "
              f"D1: v={data['device1_speed']:.2f},w={data['device1_wave_intensity']:.2f} | "
              f"D2: v={data['device2_speed']:.2f},w={data['device2_wave_intensity']:.2f} | "
              f"D3: v={data['device3_speed']:.2f},w={data['device3_wave_intensity']:.2f}")
        
        return jsonify({
            "prediction": prediction,
            "confidence": confidence,
            "probability_safe": proba_dict.get("Safe", 0.0),
            "probability_danger": proba_dict.get("Danger", 0.0),
            "timestamp": data.get("timestamp", datetime.now().isoformat())
        }), 200
    except Exception as e:
        print(f"[ERROR] {e}")
        return jsonify({"error": str(e), "prediction": "Safe"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "classes": classes if classes else [],
        "feature_count": len(feature_names) if feature_names else 0,
    })


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "Rip Current ML Service v2 (with wave intensity)",
        "endpoints": ["POST /predict", "GET /health"],
        "input_format": {
            "device1_speed": "float (m/s)",
            "device1_direction": "float (deg 0-360)",
            "device1_wave_intensity": "float (score 0-10+)",
            "device2_speed": "float",
            "device2_direction": "float",
            "device2_wave_intensity": "float",
            "device3_speed": "float",
            "device3_direction": "float",
            "device3_wave_intensity": "float",
        },
        "output_format": {
            "prediction": "Safe | Danger",
            "confidence": "float 0-1",
            "probability_safe": "float 0-1",
            "probability_danger": "float 0-1",
        }
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  RIP CURRENT ML SERVICE v2 (Kecepatan + Arah + Wave)")
    print("=" * 60)
    print()
    
    if not load_model():
        print("[WARN] Model belum trained. Jalankan: python step3_train_random_forest.py")
    
    print()
    print(f"[Server] http://localhost:{PORT}")
    print(f"[Server] POST {PORT}/predict")
    print(f"[Server] GET  {PORT}/health")
    print()
    
    app.run(host="0.0.0.0", port=PORT, debug=False)
