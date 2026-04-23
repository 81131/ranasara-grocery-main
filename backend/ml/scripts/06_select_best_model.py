"""
06_select_best_model.py
------------------------
Reads all model metrics JSONs from model_accuracy/*/metrics.json,
ranks them by a composite score (lower is better), and serialises:

  backend/ml/models/demand/best_model.pkl   – the winning model artifact
  backend/ml/models/demand/model_meta.json  – metadata (which model won, scores)

Composite score = 0.4 * normalised_RMSE + 0.4 * normalised_MAPE + 0.2 * (1 - normalised_R2)

Usage:
  docker exec -it grocery_fastapi_backend python /app/ml/scripts/06_select_best_model.py
"""

import json
import shutil
import numpy as np
import pandas as pd
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT   = BACKEND_DIR.parent
ACC_DIR     = REPO_ROOT / "model_accuracy"
MODEL_DIR   = BACKEND_DIR / "ml" / "models" / "demand"
META_PATH   = MODEL_DIR / "model_meta.json"

# Maps model name → pkl filename inside MODEL_DIR
PKL_MAP = {
    "LinearRegression": "linear_regression.pkl",
    "RandomForest":     "random_forest.pkl",
    "XGBoost":          "xgboost.pkl",
    "LightGBM":         "lightgbm.pkl",
    "Prophet":          "prophet.pkl",
    "SARIMA":           "sarima.pkl",
}


def load_all_metrics():
    records = []
    for model_name, pkl_name in PKL_MAP.items():
        metrics_path = ACC_DIR / model_name / "metrics.json"
        pkl_path     = MODEL_DIR / pkl_name
        if not metrics_path.exists():
            print(f"  [06] {model_name}: metrics.json not found – skipping")
            continue
        if not pkl_path.exists():
            print(f"  [06] {model_name}: pkl not found – skipping")
            continue
        with open(metrics_path) as f:
            m = json.load(f)
        m["pkl_path"] = str(pkl_path)
        records.append(m)
    return pd.DataFrame(records)


def composite_score(row, norms):
    """Lower composite score = better model."""
    rmse_n  = norms["RMSE"].get(row["model"], 1.0)
    mape_n  = norms["MAPE%"].get(row["model"], 1.0) if row.get("MAPE%") else 1.0
    r2_n    = 1 - norms["R2"].get(row["model"], 0.0)   # higher R2 = better, invert
    return 0.4 * rmse_n + 0.4 * mape_n + 0.2 * r2_n


def main():
    print("[06] Reading model metrics …")
    df = load_all_metrics()
    if df.empty:
        print("[06] ✗ No metrics found. Run 05_train_models.py first.")
        return

    print(df[["model", "MAE", "RMSE", "MAPE%", "R2"]].to_string(index=False))

    # Normalise metrics 0–1 across available models
    norms = {}
    for col in ["RMSE", "MAPE%", "R2"]:
        if col not in df.columns:
            norms[col] = {r["model"]: 0.5 for _, r in df.iterrows()}
            continue
        vals = df[col].fillna(df[col].median())
        mn, mx = vals.min(), vals.max()
        if mx - mn < 1e-6:
            norms[col] = {r["model"]: 0.5 for _, r in df.iterrows()}
        else:
            norms[col] = {
                row["model"]: float((row[col] - mn) / (mx - mn))
                for _, row in df.iterrows()
                if pd.notna(row.get(col))
            }

    df["composite_score"] = df.apply(lambda r: composite_score(r, norms), axis=1)
    df = df.sort_values("composite_score")

    best = df.iloc[0]
    print(f"\n[06] 🏆 Best model: {best['model']}  (composite={best['composite_score']:.4f})")

    # Copy best model pkl to best_model.pkl
    src = Path(best["pkl_path"])
    dst = MODEL_DIR / "best_model.pkl"
    shutil.copy2(src, dst)
    print(f"[06] Copied {src.name} → {dst}")

    # Save metadata
    meta = {
        "best_model":       best["model"],
        "composite_score":  round(float(best["composite_score"]), 4),
        "metrics": {
            "MAE":   best.get("MAE"),
            "RMSE":  best.get("RMSE"),
            "MAPE%": best.get("MAPE%"),
            "WAPE%": best.get("WAPE%"),
            "R2":    best.get("R2"),
        },
        "ranking": df[["model", "composite_score", "RMSE", "MAPE%", "R2"]].to_dict(orient="records"),
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2, default=str)
    print(f"[06] Model metadata saved → {META_PATH}")
    print("[06] ✓ Done")


if __name__ == "__main__":
    main()
