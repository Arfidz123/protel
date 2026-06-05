"""
==============================================================================
ML SERVICE - Flask Server untuk Backend Bintang
==============================================================================
HTTP server yang expose endpoint POST /predict.
Backend Bintang (Node.js) akan memanggil endpoint ini setiap ada data sensor.

ARSITEKTUR:
    [Buoy Hardware] -> [Gateway USB] -> [ML Service ini :8000] <- [Backend Bintang :5000]
                                                  ^
                                                  |
                                          POST /predict
                                          dengan data 3 device

ENDPOINT:
    POST /predict
        Input  : { device1_speed, device1_direction,
                   device2_speed, device2_direction,
                   device3_speed, device3_direction,
                   timestamp }
        Output : { prediction: "Safe" | "Danger",
                   confidence: 0.0-1.0,
                   probability_safe: 0.0-1.0,
                   probability_danger: 0.0-1.0 }
    
    GET /health
        Output : { status: "ok", model_loaded: true/false }

Cara pakai:
    pip install flask flask-cors
    python ml_server.py
    
    Server listen di http://localhost:8000
"""

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
    print(f"ERROR: Library tidak terinstall: {e}")
    print("Install: pip install flask flask-cors numpy pandas scikit-learn joblib")
    sys.exit(1)


# ==================== KONFIGURASI ====================

PORT = 8000
MODEL_FILE = "rip_current_model.joblib"
SHORE_NORMAL = 180.0  # offshore direction

app = Flask(__name__)
CORS(app)  # supaya backend Bintang bisa call

# Load model saat startup
model_bundle = None
model = None
feature_names = None
classes = None


def load_model():
    """Load model joblib saat startup."""
    global model_bundle, model, feature_names, classes
    
    if not Path(MODEL_FILE).exists():
        print(f"WARNING: {MODEL_FILE} tidak ditemukan!")
        print(f"         Jalankan dulu: python step3_train_random_forest.py")
        return False
    
    try:
        model_bundle = joblib.load(MODEL_FILE)
        model = model_bundle["model"]
        feature_names = model_bundle["feature_names"]
        classes = model_bundle["classes"]
        
        print(f"[ML] Model loaded successfully")
        print(f"     Classes: {classes}")
        print(f"     Features: {len(feature_names)}")
        print(f"     Test accuracy: {model_bundle.get('test_accuracy', 'N/A')}")
        return True
    except Exception as e:
        print(f"ERROR loading model: {e}")
        return False


# ==================== FEATURE ENGINEERING ====================
# HARUS PERSIS SAMA dengan step2_feature_engineering.py

def circular_mean_std(angles_deg):
    """Hitung mean dan consistency untuk circular data."""
    angles_rad = np.deg2rad(angles_deg)
    mean_cos = np.mean(np.cos(angles_rad))
    mean_sin = np.mean(np.sin(angles_rad))
    mean_deg = np.rad2deg(np.arctan2(mean_sin, mean_cos)) % 360
    consistency = np.sqrt(mean_cos**2 + mean_sin**2)
    return mean_deg, consistency


def angular_diff_abs(a1, a2):
    """Selisih absolut sudut (0-180)."""
    diff = (a1 - a2 + 180) % 360 - 180
    return abs(diff)


def build_feature_vector(d1_speed, d1_dir, d2_speed, d2_dir, d3_speed, d3_dir):
    """Bangun feature vector LENGKAP sesuai training step2_feature_engineering.py.
    
    HARUS persis sama dengan saat training!
    """
    feat = {}
    
    # === Fitur dasar per buoy ===
    feat["b1_kecepatan_arus"] = d1_speed
    feat["b1_arah_arus"]      = d1_dir
    feat["b2_kecepatan_arus"] = d2_speed
    feat["b2_arah_arus"]      = d2_dir
    feat["b3_kecepatan_arus"] = d3_speed
    feat["b3_arah_arus"]      = d3_dir
    
    # === Fitur agregat KECEPATAN ===
    speeds = [d1_speed, d2_speed, d3_speed]
    feat["kec_mean"] = float(np.mean(speeds))
    feat["kec_std"]  = float(np.std(speeds, ddof=1)) if len(speeds) > 1 else 0.0
    feat["kec_max"]  = float(max(speeds))
    feat["kec_diff_center"] = d2_speed - 0.5 * (d1_speed + d3_speed)
    feat["rip_speed_ratio"] = d2_speed / (0.5 * (d1_speed + d3_speed) + 1e-6)
    
    # === Fitur agregat ARAH (circular) ===
    angles = [d1_dir, d2_dir, d3_dir]
    mean_deg, consistency = circular_mean_std(angles)
    feat["dir_mean"] = float(mean_deg)
    feat["dir_consistency"] = float(consistency)
    
    mean_lr, _ = circular_mean_std([d1_dir, d3_dir])
    feat["dir_diff_center"] = float(angular_diff_abs(d2_dir, mean_lr))
    feat["dir_offshore_b2"] = float(180 - angular_diff_abs(d2_dir, SHORE_NORMAL))
    
    return feat


# ==================== ENDPOINTS ====================

@app.route("/predict", methods=["POST"])
def predict():
    """Endpoint utama: terima data 3 device, return prediction Safe/Danger."""
    
    if model is None:
        return jsonify({
            "error": "Model belum dimuat",
            "prediction": "Safe"  # fallback aman
        }), 500
    
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400
    
    # Validasi field
    required_fields = [
        "device1_speed", "device1_direction",
        "device2_speed", "device2_direction",
        "device3_speed", "device3_direction"
    ]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({
            "error": f"Field hilang: {missing}",
            "required": required_fields
        }), 400
    
    try:
        # Extract data
        d1_speed = float(data["device1_speed"])
        d1_dir   = float(data["device1_direction"])
        d2_speed = float(data["device2_speed"])
        d2_dir   = float(data["device2_direction"])
        d3_speed = float(data["device3_speed"])
        d3_dir   = float(data["device3_direction"])
        
        # Build features
        feat = build_feature_vector(d1_speed, d1_dir, d2_speed, d2_dir, d3_speed, d3_dir)
        X = pd.DataFrame([feat])[feature_names]
        
        # Predict
        proba = model.predict_proba(X)[0]
        idx = int(np.argmax(proba))
        prediction = classes[idx]  # langsung "Safe" atau "Danger"
        confidence = float(proba[idx])
        
        # Probabilitas per kelas
        proba_dict = {cls: float(p) for cls, p in zip(classes, proba)}
        proba_safe   = proba_dict.get("Safe", 0.0)
        proba_danger = proba_dict.get("Danger", 0.0)
        
        # Log ke console
        timestamp = data.get("timestamp", datetime.now().isoformat())
        print(f"[{datetime.now().strftime('%H:%M:%S')}] "
              f"Predict: {prediction} "
              f"(conf: {confidence:.2%}) "
              f"| D1: v={d1_speed:.2f} | D2: v={d2_speed:.2f} | D3: v={d3_speed:.2f}")
        
        response = {
            "prediction": prediction,
            "confidence": confidence,
            "probability_safe": proba_safe,
            "probability_danger": proba_danger,
            "timestamp": timestamp
        }
        
        return jsonify(response), 200
    
    except Exception as e:
        print(f"[ERROR] Predict failed: {e}")
        return jsonify({
            "error": str(e),
            "prediction": "Safe"  # fallback aman saat error
        }), 500


@app.route("/health", methods=["GET"])
def health():
    """Endpoint health check."""
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "classes": classes if classes else [],
        "feature_count": len(feature_names) if feature_names else 0,
        "timestamp": datetime.now().isoformat()
    })


@app.route("/", methods=["GET"])
def index():
    """Halaman info default."""
    return jsonify({
        "service": "Rip Current ML Service",
        "version": "1.0.0",
        "classes": ["Safe", "Danger"],
        "endpoints": {
            "POST /predict": "Predict rip current dari data 3 device",
            "GET /health": "Health check",
            "GET /": "Info"
        },
        "expected_input": {
            "device1_speed": "float (m/s)",
            "device1_direction": "float (deg 0-360)",
            "device2_speed": "float (m/s)",
            "device2_direction": "float (deg 0-360)",
            "device3_speed": "float (m/s)",
            "device3_direction": "float (deg 0-360)",
            "timestamp": "string (optional, ISO format)"
        },
        "output_format": {
            "prediction": "Safe | Danger",
            "confidence": "float 0.0-1.0",
            "probability_safe": "float 0.0-1.0",
            "probability_danger": "float 0.0-1.0"
        }
    })


# ==================== MAIN ====================

if __name__ == "__main__":
    print("=" * 60)
    print("  RIP CURRENT ML SERVICE")
    print("=" * 60)
    print()
    
    if not load_model():
        print("\n[WARN] Server tetap berjalan, tapi /predict akan return fallback")
        print("       Jalankan dulu: python step3_train_random_forest.py")
    
    print()
    print(f"[Server] Listening on http://0.0.0.0:{PORT}")
    print(f"[Server] Backend Bintang call: POST http://localhost:{PORT}/predict")
    print(f"[Server] Health check: GET http://localhost:{PORT}/health")
    print()
    print("Tekan Ctrl+C untuk berhenti")
    print("=" * 60)
    
    app.run(host="0.0.0.0", port=PORT, debug=False)
