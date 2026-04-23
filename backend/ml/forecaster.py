"""
Refactored forecaster.py
------------------------
Now model-agnostic: loads the best serialised model from
backend/ml/models/demand/best_model.pkl (chosen by 06_select_best_model.py).

Falls back to Random Forest inline if no serialised model is found.
Hybrid training: pre-built CSV historical data + live DB data appended.
"""

import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent   # /app
REPO_ROOT   = BACKEND_DIR.parent
FEAT_PATH   = REPO_ROOT / "data" / "training" / "demand_features.csv"
MODEL_DIR   = BACKEND_DIR / "ml" / "models" / "demand"
META_PATH   = MODEL_DIR / "model_meta.json"
BEST_PKL    = MODEL_DIR / "best_model.pkl"

# ── Global state ───────────────────────────────────────────────────────────
_LATEST_INSIGHTS: list = []
_LAST_TRAINED:    str  = None
_BEST_MODEL_NAME: str  = "RandomForest"

FEATURE_COLS = [
    "year", "month", "month_sin", "month_cos", "is_festive_month",
    "avg_unit_price", "avg_buy_price", "price_to_cost_ratio",
    "discount_rate", "demand_lag1", "demand_lag3",
    "demand_roll3", "demand_volatility", "transaction_count",
]
TARGET = "total_qty_sold"
FESTIVE_MONTHS = {1, 4, 8, 12}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize(obj):
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return 0.0 if v != v else v
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def filter_outliers_iqr(df, column="avg_unit_price"):
    if df.empty or len(df) < 5:
        return df, 0
    Q1, Q3 = df[column].quantile(0.25), df[column].quantile(0.75)
    IQR = Q3 - Q1
    lo, hi = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
    initial = len(df)
    filtered = df[(df[column] >= lo) & (df[column] <= hi)]
    return filtered, initial - len(filtered)


def _load_best_model():
    """Load the serialised best model bundle from disk."""
    if BEST_PKL.exists():
        try:
            bundle = joblib.load(BEST_PKL)
            # Detect model type
            if META_PATH.exists():
                with open(META_PATH) as f:
                    meta = json.load(f)
                model_type = meta.get("best_model", "RandomForest")
            else:
                model_type = "RandomForest"
            return bundle, model_type
        except Exception as e:
            print(f"[forecaster] Could not load best model: {e} – falling back")
    return None, "RandomForest"


def _predict_with_bundle(bundle, model_type, X_df):
    """Run inference with the loaded bundle, handling different model types."""
    if model_type in ("Prophet", "SARIMA"):
        # These are aggregate models; return None to use the per-product fallback
        return None

    scaler  = bundle.get("scaler")
    model   = bundle.get("model")
    feats   = bundle.get("features", FEATURE_COLS)

    avail = [c for c in feats if c in X_df.columns]
    X = X_df[avail].fillna(0).values
    if scaler is not None:
        X = scaler.transform(X)
    return np.maximum(0, model.predict(X))


# ---------------------------------------------------------------------------
# Live DB data fetching
# ---------------------------------------------------------------------------

def _fetch_live_db_data(db_session):
    """
    Fetches order-item data from the live database and returns it as a
    DataFrame with the same shape as the historical feature CSV.
    """
    from sqlalchemy import text

    query = """
    SELECT
        p.product_name,
        sb.product_id,
        o.created_at        AS order_date,
        oi.quantity         AS qty,
        sb.retail_price     AS unit_price,
        sb.buying_price     AS buy_price
    FROM order_items oi
    JOIN orders       o  ON o.id       = oi.order_id
    JOIN stock_batches sb ON sb.id     = oi.batch_id
    JOIN products      p  ON p.id      = sb.product_id
    WHERE o.current_status != 'Cancelled'
    """
    try:
        live = pd.read_sql(text(query), db_session.bind)
        if live.empty:
            return pd.DataFrame()
        live["order_date"] = pd.to_datetime(live["order_date"], utc=True).dt.tz_localize(None)
        live["year"]  = live["order_date"].dt.year
        live["month"] = live["order_date"].dt.month
        live["month_sin"]       = np.sin(2 * np.pi * live["month"] / 12)
        live["month_cos"]       = np.cos(2 * np.pi * live["month"] / 12)
        live["is_festive_month"]= live["month"].isin(FESTIVE_MONTHS).astype(int)
        live["price_to_cost_ratio"] = (live["unit_price"] / live["buy_price"].replace(0, np.nan)).fillna(1.5).clip(1, 5)
        live["discount_rate"]   = 0.0

        monthly = live.groupby(["product_name", "year", "month"]).agg(
            total_qty_sold    = ("qty",        "sum"),
            avg_unit_price    = ("unit_price", "mean"),
            avg_buy_price     = ("buy_price",  "mean"),
            transaction_count = ("qty",        "count"),
        ).reset_index()

        monthly["month_sin"]        = np.sin(2 * np.pi * monthly["month"] / 12)
        monthly["month_cos"]        = np.cos(2 * np.pi * monthly["month"] / 12)
        monthly["is_festive_month"] = monthly["month"].isin(FESTIVE_MONTHS).astype(int)
        monthly["price_to_cost_ratio"] = (
            monthly["avg_unit_price"] / monthly["avg_buy_price"].replace(0, np.nan)
        ).fillna(1.5).clip(1, 5)
        monthly["discount_rate"] = 0.0

        grp = monthly.groupby("product_name")["total_qty_sold"]
        monthly["demand_lag1"]       = grp.shift(1).fillna(0)
        monthly["demand_lag3"]       = grp.shift(3).fillna(0)
        monthly["demand_roll3"]      = grp.transform(lambda s: s.rolling(3, min_periods=1).mean())
        monthly["demand_volatility"] = grp.transform(lambda s: s.rolling(3, min_periods=1).std().fillna(0))

        return monthly
    except Exception as e:
        print(f"[forecaster] Live DB fetch error: {e}")
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Main training / inference entry point
# ---------------------------------------------------------------------------

def train_forecaster(db_session):
    global _LATEST_INSIGHTS, _LAST_TRAINED, _BEST_MODEL_NAME

    from models.inventory import Product, StockBatch

    # ── Load historical CSV features ─────────────────────────────────────────
    hist_df = pd.DataFrame()
    if FEAT_PATH.exists():
        try:
            hist_df = pd.read_csv(FEAT_PATH, low_memory=False)
            print(f"[forecaster] Loaded {len(hist_df):,} historical feature rows")
        except Exception as e:
            print(f"[forecaster] Could not read feature CSV: {e}")

    # ── Fetch live DB data ────────────────────────────────────────────────────
    live_df = _fetch_live_db_data(db_session)
    if not live_df.empty:
        print(f"[forecaster] Live DB rows: {len(live_df):,}")

    # ── Merge historical + live ──────────────────────────────────────────────
    combined = pd.concat([hist_df, live_df], ignore_index=True) if not live_df.empty else hist_df

    if combined.empty:
        return {"status": "error", "message": "No data available for training."}

    combined = combined.dropna(subset=[TARGET])

    # ── Load best serialised model ───────────────────────────────────────────
    bundle, model_type = _load_best_model()
    _BEST_MODEL_NAME = model_type

    insights = []
    products = db_session.query(Product).all()
    current_date = datetime.now()

    for p in products:
        # Filter combined data for this product
        p_df = combined[combined["product_name"] == p.product_name].copy()

        if len(p_df) < 3:
            insights.append({
                "product_id":   p.id,
                "product_name": p.product_name,
                "status":       "Insufficient Data",
                "outliers_removed": 0,
                "history": [],
            })
            continue

        # Outlier removal on price column
        if "avg_unit_price" in p_df.columns:
            p_df, outliers_count = filter_outliers_iqr(p_df, "avg_unit_price")
        else:
            outliers_count = 0

        p_df = p_df.sort_values(["year", "month"])
        recent = p_df.tail(3)
        avg_price   = float(recent["avg_unit_price"].mean())  if "avg_unit_price" in recent else 0.0
        avg_buy     = float(recent["avg_buy_price"].mean())   if "avg_buy_price"  in recent else avg_price * 0.6
        avg_qty     = float(recent["total_qty_sold"].mean())
        avg_volatility = float(p_df["demand_volatility"].tail(3).mean()) if "demand_volatility" in p_df else 0.0

        # ── Predict next 1 / 3 / 6 months ──────────────────────────────────
        def _future_features(offset_months):
            future = current_date + timedelta(days=30 * offset_months)
            m = future.month
            return pd.DataFrame([{
                "year": future.year, "month": m,
                "month_sin":        np.sin(2 * np.pi * m / 12),
                "month_cos":        np.cos(2 * np.pi * m / 12),
                "is_festive_month": int(m in FESTIVE_MONTHS),
                "avg_unit_price":   avg_price,
                "avg_buy_price":    avg_buy,
                "price_to_cost_ratio": max(1.0, avg_price / max(avg_buy, 1)),
                "discount_rate":    0.0,
                "demand_lag1":      avg_qty,
                "demand_lag3":      avg_qty,
                "demand_roll3":     avg_qty,
                "demand_volatility": avg_volatility,
                "transaction_count": float(recent["transaction_count"].mean()) if "transaction_count" in recent else 1.0,
            }])

        def _predict_months(offset):
            total_pred = 0
            for i in range(1, offset + 1):
                if bundle and model_type not in ("Prophet", "SARIMA"):
                    preds = _predict_with_bundle(bundle, model_type, _future_features(i))
                    if preds is not None:
                        total_pred += max(0, float(preds[0]))
                    else:
                        total_pred += max(0, avg_qty)
                else:
                    # Fallback: simple rolling average
                    total_pred += max(0, avg_qty)
            return round(total_pred)

        pred_30d  = _predict_months(1)
        pred_90d  = _predict_months(3)
        pred_180d = _predict_months(6)

        # ── Confidence ───────────────────────────────────────────────────────
        conf_val = avg_volatility / max(pred_30d, 1)
        confidence = "High" if conf_val < 0.15 else ("Medium" if conf_val < 0.40 else "Low")

        # ── Financials ───────────────────────────────────────────────────────
        margin          = avg_price - avg_buy
        expected_profit = round(pred_30d * margin, 2)
        risk_margin     = avg_price - (avg_buy * 1.30)
        theoretical_loss = round(pred_30d * abs(risk_margin), 2) if risk_margin < 0 else 0

        # ── Expiry risk ───────────────────────────────────────────────────────
        upcoming_batches = db_session.query(StockBatch).filter(
            StockBatch.product_id == p.id,
            StockBatch.current_quantity > 0,
            StockBatch.expiry_date.isnot(None)
        ).all()

        total_live_qty    = sum(b.current_quantity for b in upcoming_batches) or 1
        expiring_soon_qty = sum(
            b.current_quantity for b in upcoming_batches
            if b.expiry_date and (b.expiry_date.replace(tzinfo=None) - current_date).days < 30
        )
        expiry_risk_score = round(expiring_soon_qty / total_live_qty, 2)
        
        # Determine shelf life from all historical and upcoming batches
        all_batches = db_session.query(StockBatch).filter(StockBatch.product_id == p.id).all()
        avg_batch_shelf   = round(
            np.mean([
                (b.expiry_date - b.manufacture_date).days
                for b in all_batches
                if b.expiry_date and b.manufacture_date
            ]) if any(b.expiry_date and b.manufacture_date for b in all_batches) else 90, 1
        )

        # ── Recommendation ────────────────────────────────────────────────────
        if expiring_soon_qty > 0:
            recommendation = f"URGENT CLEARANCE ({int(expiring_soon_qty)} units expiring)"
        elif risk_margin < 0 and theoretical_loss > expected_profit:
            recommendation = "DO NOT RESTOCK (HIGH RISK)"
        elif margin > 0.5 * avg_buy:
            recommendation = "BUY AND HOLD"
        else:
            recommendation = "BUY CAUTIOUSLY"

        history = [
            {
                "label":        f"{int(row['month'])}/{int(row['year'])}",
                "demand":       int(row["total_qty_sold"]),
                "buy_price":    round(float(row.get("avg_buy_price", 0)), 2),
                "retail_price": round(float(row.get("avg_unit_price", 0)), 2),
            }
            for _, row in p_df.iterrows()
        ]

        insights.append(_sanitize({
            "product_id":            p.id,
            "product_name":          p.product_name,
            "status":                "Active Forecast",
            "model_used":            _BEST_MODEL_NAME,
            "outliers_removed":      outliers_count,
            "predicted_demand":      pred_30d,
            "predicted_demand_30d":  pred_30d,
            "predicted_demand_90d":  pred_90d,
            "predicted_demand_180d": pred_180d,
            "optimal_buy_price":     round(avg_buy, 2),
            "expected_retail":       round(avg_price, 2),
            "expected_profit":       expected_profit,
            "theoretical_loss_risk": theoretical_loss,
            "avg_shelf_life_days":   avg_batch_shelf,
            "expiry_risk_score":     expiry_risk_score,
            "demand_volatility":     round(avg_volatility, 1),
            "confidence":            confidence,
            "recommendation":        recommendation,
            "history":               history,
        }))

    _LATEST_INSIGHTS = insights
    _LAST_TRAINED    = datetime.now().isoformat()
    return {
        "status":            "success",
        "model_used":        _BEST_MODEL_NAME,
        "insights_generated": len(insights),
        "timestamp":         _LAST_TRAINED,
    }


def get_insights(db_session):
    global _LATEST_INSIGHTS, _LAST_TRAINED
    if not _LATEST_INSIGHTS:
        train_forecaster(db_session)
    return {
        "last_trained": _LAST_TRAINED,
        "model_used":   _BEST_MODEL_NAME,
        "insights":     _LATEST_INSIGHTS,
    }
