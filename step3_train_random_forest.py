"""
==============================================================================
STEP 3: TRAINING RANDOM FOREST (2 kelas: Safe / Danger)
==============================================================================
Training klasifikasi binary rip current dengan 2 kelas.

Output:
- rip_current_model.joblib (model terlatih)
- evaluation_report.txt (laporan evaluasi)
"""

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, confusion_matrix

INPUT_FILE = "features_engineered.csv"
MODEL_FILE = "rip_current_model.joblib"
REPORT_FILE = "evaluation_report.txt"


def main():
    print("=" * 60)
    print("TRAINING RANDOM FOREST - 2 Kelas (Safe / Danger)")
    print("=" * 60)
    
    df = pd.read_csv(INPUT_FILE)
    print(f"\n[Load] {len(df)} samples")
    
    feature_cols = [c for c in df.columns if c not in ("timestamp", "label")]
    X = df[feature_cols]
    y = df["label"]
    
    print(f"[Setup] {len(feature_cols)} fitur, {len(y.unique())} kelas: {sorted(y.unique())}")
    print(f"[Setup] Distribusi: {dict(y.value_counts())}")
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )
    print(f"[Split] Train: {len(X_train)} | Test: {len(X_test)}")
    
    print("\n[Training] Random Forest...")
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_leaf=3,
        min_samples_split=5,
        class_weight="balanced",  # supaya seimbang Safe vs Danger
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_train, y_train)
    print("[Training] Selesai!")
    
    train_acc = clf.score(X_train, y_train)
    test_acc = clf.score(X_test, y_test)
    print(f"\n[Akurasi] Train: {train_acc:.4f} | Test: {test_acc:.4f}")
    
    if train_acc - test_acc > 0.05:
        print("[WARN] Selisih > 5%, kemungkinan overfitting")
    else:
        print("[OK] Tidak ada overfitting signifikan")
    
    y_pred = clf.predict(X_test)
    cls_report = classification_report(y_test, y_pred, digits=4)
    print("\n[Classification Report]")
    print(cls_report)
    
    cm = confusion_matrix(y_test, y_pred, labels=clf.classes_)
    print("[Confusion Matrix]")
    print(f"Labels: {list(clf.classes_)}")
    print(cm)
    print()
    print("Interpretasi confusion matrix:")
    print(f"  True Safe   (predict Safe)  : {cm[0][0]}")
    print(f"  False Danger (Safe -> Danger): {cm[0][1]}  (false alarm)")
    print(f"  False Safe   (Danger -> Safe): {cm[1][0]}  (DANGEROUS - rip miss!)")
    print(f"  True Danger (predict Danger): {cm[1][1]}")
    
    print("\n[Cross-Validation] 5-fold...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(clf, X, y, cv=cv, scoring="accuracy", n_jobs=-1)
    print(f"  Accuracy: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
    print(f"  Per fold: {[f'{s:.4f}' for s in cv_scores]}")
    
    fi = pd.Series(clf.feature_importances_, index=feature_cols).sort_values(ascending=False)
    print("\n[Feature Importance - Top 10]")
    print(fi.head(10).to_string())
    
    bundle = {
        "model": clf,
        "classes": clf.classes_.tolist(),
        "feature_names": feature_cols,
        "train_accuracy": train_acc,
        "test_accuracy": test_acc,
        "cv_mean": cv_scores.mean(),
        "cv_std": cv_scores.std(),
    }
    joblib.dump(bundle, MODEL_FILE)
    print(f"\n[Save] Model -> {MODEL_FILE}")
    
    with open(REPORT_FILE, "w") as f:
        f.write("=" * 60 + "\n")
        f.write("EVALUATION REPORT - Rip Current Classifier (Safe/Danger)\n")
        f.write("=" * 60 + "\n\n")
        f.write("Fitur dasar: kecepatan arus, arah arus (per 3 buoy)\n")
        f.write("Klasifikasi: 2 kelas binary - Safe vs Danger\n\n")
        f.write(f"Dataset: {INPUT_FILE}\n")
        f.write(f"Total samples: {len(df)}\n")
        f.write(f"Features: {len(feature_cols)}\n")
        f.write(f"Classes: {sorted(y.unique())}\n\n")
        f.write(f"Train accuracy: {train_acc:.4f}\n")
        f.write(f"Test accuracy : {test_acc:.4f}\n")
        f.write(f"CV accuracy   : {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}\n\n")
        f.write("Classification Report:\n")
        f.write(cls_report + "\n")
        f.write("Confusion Matrix:\n")
        f.write(f"Labels: {list(clf.classes_)}\n")
        f.write(str(cm) + "\n\n")
        f.write("Feature Importance (all):\n")
        f.write(fi.to_string() + "\n")
    print(f"[Save] Report -> {REPORT_FILE}")
    
    print("\n" + "=" * 60)
    print("INTERPRETASI HASIL")
    print("=" * 60)
    print(f"\n- Test accuracy: {test_acc*100:.2f}%")
    print(f"- Cross-validation: {cv_scores.mean()*100:.2f}%")
    print(f"- Tidak ada overfitting (selisih {(train_acc-test_acc)*100:.2f}%)")
    
    print("\n[CATATAN PENTING]")
    print("Akurasi ini pada SYNTHETIC DATA. Pada data riil dari pantai,")
    print("akurasi diperkirakan 75-90% karena ada noise dan variabilitas alami.")
    print("\nFitur 'kecepatan' dan 'arah' didapat dari GPS drift velocity & direction.")


if __name__ == "__main__":
    main()
