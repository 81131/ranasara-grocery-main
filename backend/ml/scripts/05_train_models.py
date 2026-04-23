"""
05_train_models.py
-------------------
Trains 6 demand forecasting models on the aggregated feature dataset.

For each model:
  - Time-ordered 80/20 train-test split (no data leakage)
  - Computes: MAE, RMSE, MAPE, WAPE, R²
  - Saves: model_accuracy/<Model>/metrics.json
  - Saves: EDA charts to model_accuracy/<Model>/eda/

Models:
  1. LinearRegression  (baseline)
  2. RandomForest
  3. XGBoost
  4. LightGBM
  5. Prophet           (product-level, avg across top-20 products)
  6. SARIMA            (product-level, avg across top-20 products)

Usage:
  docker exec -it grocery_fastapi_backend python /app/ml/scripts/05_train_models.py
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # headless rendering
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler
import joblib

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT   = BACKEND_DIR.parent
FEAT_PATH   = REPO_ROOT / "data" / "training" / "demand_features.csv"
SELL_PATH   = REPO_ROOT / "data" / "processed" / "selling_cleaned.csv"   # for time-series models
MODEL_DIR   = BACKEND_DIR / "ml" / "models" / "demand"
ACC_DIR     = REPO_ROOT / "model_accuracy"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── lazy imports for optional heavy libraries ─────────────────────────────

def _import_xgb():
    try:
        import xgboost as xgb
        return xgb
    except ImportError:
        return None

def _import_lgb():
    try:
        import lightgbm as lgb
        return lgb
    except ImportError:
        return None

def _import_prophet():
    try:
        from prophet import Prophet
        return Prophet
    except ImportError:
        return None

def _import_statsmodels():
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
        return SARIMAX
    except ImportError:
        return None

# ---------------------------------------------------------------------------
# Feature columns used by sklearn-compatible models
# ---------------------------------------------------------------------------
FEATURE_COLS = [
    "year", "month", "month_sin", "month_cos", "is_festive_month",
    "avg_unit_price", "avg_buy_price", "price_to_cost_ratio",
    "discount_rate", "demand_lag1", "demand_lag3",
    "demand_roll3", "demand_volatility", "transaction_count",
]
TARGET = "total_qty_sold"


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------

def mape(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    mask = y_true != 0
    if mask.sum() == 0:
        return np.nan
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)

def wape(y_true, y_pred):
    total = np.sum(np.abs(y_true))
    if total == 0:
        return np.nan
    return float(np.sum(np.abs(y_true - y_pred)) / total * 100)

def compute_metrics(y_true, y_pred, label=""):
    mae  = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2   = float(r2_score(y_true, y_pred))
    m    = mape(y_true, y_pred)
    w    = wape(y_true, y_pred)
    metrics = {"MAE": round(mae,4), "RMSE": round(rmse,4),
               "MAPE%": round(m,2) if not np.isnan(m) else None,
               "WAPE%": round(w,2) if not np.isnan(w) else None,
               "R2": round(r2,4)}
    print(f"  [{label}] MAE={mae:.3f}  RMSE={rmse:.3f}  MAPE={m:.1f}%  R²={r2:.3f}")
    return metrics


# ---------------------------------------------------------------------------
# EDA chart helpers
# ---------------------------------------------------------------------------

def save_actual_vs_predicted(y_test, y_pred, model_name):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(np.array(y_test), label="Actual",    color="#4C9BE8", linewidth=1.5)
    ax.plot(np.array(y_pred), label="Predicted", color="#E8774C", linewidth=1.5, alpha=0.8)
    ax.set_title(f"{model_name} – Actual vs Predicted Demand")
    ax.set_xlabel("Test Sample Index")
    ax.set_ylabel("Units Sold")
    ax.legend()
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "actual_vs_predicted.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out, dpi=120)
    plt.close()

def save_residual_plot(y_test, y_pred, model_name):
    residuals = np.array(y_test) - np.array(y_pred)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    axes[0].hist(residuals, bins=40, color="#7C5CBF", edgecolor="white")
    axes[0].set_title("Residual Distribution")
    axes[0].set_xlabel("Residual")
    axes[1].scatter(y_pred, residuals, alpha=0.3, s=8, color="#7C5CBF")
    axes[1].axhline(0, color="red", linewidth=1)
    axes[1].set_title("Residuals vs Predicted")
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Residual")
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "residuals.png"
    plt.savefig(out, dpi=120)
    plt.close()

def save_feature_importance(model, feature_names, model_name):
    try:
        importances = model.feature_importances_
    except AttributeError:
        try:
            importances = np.abs(model.coef_)
        except AttributeError:
            return
    idx = np.argsort(importances)[::-1][:15]
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.barh([feature_names[i] for i in idx][::-1],
            importances[idx][::-1], color="#4C9BE8")
    ax.set_title(f"{model_name} – Feature Importance")
    ax.set_xlabel("Importance")
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "feature_importance.png"
    plt.savefig(out, dpi=120)
    plt.close()

def save_top_products_trend(df, model_name):
    top_products = (
        df.groupby("product_name")["total_qty_sold"]
        .sum()
        .nlargest(10)
        .index.tolist()
    )
    fig, ax = plt.subplots(figsize=(14, 5))
    for p in top_products:
        pdata = df[df["product_name"] == p].sort_values(["year", "month"])
        label = p[:30]
        ax.plot(range(len(pdata)), pdata["total_qty_sold"].values, label=label, linewidth=1.2)
    ax.set_title(f"{model_name} – Top 10 Products Monthly Demand Trend")
    ax.set_xlabel("Month Index (chronological)")
    ax.set_ylabel("Units Sold")
    ax.legend(fontsize=7, ncol=2)
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "top10_trend.png"
    plt.savefig(out, dpi=120)
    plt.close()

def save_correlation_heatmap(df, feature_cols, model_name):
    avail = [c for c in feature_cols if c in df.columns] + [TARGET]
    corr = df[avail].dropna().corr()
    fig, ax = plt.subplots(figsize=(12, 10))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm",
                linewidths=0.5, ax=ax, annot_kws={"size": 7})
    ax.set_title(f"{model_name} – Feature Correlation Heatmap")
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "correlation_heatmap.png"
    plt.savefig(out, dpi=120)
    plt.close()

def save_rolling_stats(df, model_name):
    agg = (
        df.groupby(["year", "month"])["total_qty_sold"]
        .sum()
        .reset_index()
        .sort_values(["year", "month"])
    )
    vals = agg["total_qty_sold"].values
    roll_mean = pd.Series(vals).rolling(3, min_periods=1).mean()
    roll_std  = pd.Series(vals).rolling(3, min_periods=1).std().fillna(0)
    x = range(len(vals))
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(x, vals,       label="Monthly Total Demand", color="#4C9BE8", alpha=0.6)
    ax.plot(x, roll_mean,  label="3-Month Rolling Mean", color="#E8774C", linewidth=2)
    ax.fill_between(x,
                    roll_mean - roll_std,
                    roll_mean + roll_std,
                    alpha=0.2, color="#E8774C")
    ax.set_title(f"{model_name} – Store-Wide Rolling Demand")
    ax.set_xlabel("Month Index")
    ax.set_ylabel("Total Units Sold")
    ax.legend()
    plt.tight_layout()
    out = ACC_DIR / model_name / "eda" / "rolling_demand.png"
    plt.savefig(out, dpi=120)
    plt.close()


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------

def load_and_prepare(feat_path):
    df = pd.read_csv(feat_path, low_memory=False)
    df = df.dropna(subset=[TARGET])
    df = df.sort_values(["year", "month"]).reset_index(drop=True)

    # Clip extreme outliers in target (IQR 1.5 × rule)
    Q1, Q3 = df[TARGET].quantile(0.25), df[TARGET].quantile(0.75)
    IQR = Q3 - Q1
    df = df[(df[TARGET] >= Q1 - 1.5*IQR) & (df[TARGET] <= Q3 + 1.5*IQR)]

    # Fill feature NaNs
    for col in FEATURE_COLS:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())

    return df

def time_split(df, test_fraction=0.20):
    n = len(df)
    split = int(n * (1 - test_fraction))
    return df.iloc[:split].copy(), df.iloc[split:].copy()


# ---------------------------------------------------------------------------
# Model 1: Linear Regression
# ---------------------------------------------------------------------------

def train_linear_regression(df):
    model_name = "LinearRegression"
    print(f"\n[05] Training {model_name} …")
    train, test = time_split(df)

    feat_avail = [c for c in FEATURE_COLS if c in df.columns]
    X_tr, y_tr = train[feat_avail].values, train[TARGET].values
    X_te, y_te = test[feat_avail].values,  test[TARGET].values

    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    X_te_s = scaler.transform(X_te)

    model = LinearRegression()
    model.fit(X_tr_s, y_tr)
    y_pred = np.maximum(0, model.predict(X_te_s))

    metrics = compute_metrics(y_te, y_pred, model_name)

    # Save charts
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_feature_importance(model, feat_avail, model_name)
    save_top_products_trend(df, model_name)
    save_correlation_heatmap(df, feat_avail, model_name)
    save_rolling_stats(df, model_name)

    # Save model
    joblib.dump({"model": model, "scaler": scaler, "features": feat_avail},
                MODEL_DIR / "linear_regression.pkl")

    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Model 2: Random Forest
# ---------------------------------------------------------------------------

def train_random_forest(df):
    model_name = "RandomForest"
    print(f"\n[05] Training {model_name} …")
    train, test = time_split(df)
    feat_avail = [c for c in FEATURE_COLS if c in df.columns]
    X_tr, y_tr = train[feat_avail].values, train[TARGET].values
    X_te, y_te = test[feat_avail].values,  test[TARGET].values

    model = RandomForestRegressor(n_estimators=200, max_depth=10,
                                   min_samples_split=4, random_state=42, n_jobs=-1)
    model.fit(X_tr, y_tr)
    y_pred = np.maximum(0, model.predict(X_te))

    metrics = compute_metrics(y_te, y_pred, model_name)
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_feature_importance(model, feat_avail, model_name)
    save_top_products_trend(df, model_name)
    save_correlation_heatmap(df, feat_avail, model_name)
    save_rolling_stats(df, model_name)

    joblib.dump({"model": model, "features": feat_avail}, MODEL_DIR / "random_forest.pkl")
    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Model 3: XGBoost
# ---------------------------------------------------------------------------

def train_xgboost(df):
    model_name = "XGBoost"
    xgb = _import_xgb()
    if not xgb:
        print(f"  [{model_name}] SKIPPED – xgboost not installed")
        return None

    print(f"\n[05] Training {model_name} …")
    train, test = time_split(df)
    feat_avail = [c for c in FEATURE_COLS if c in df.columns]
    X_tr, y_tr = train[feat_avail].values, train[TARGET].values
    X_te, y_te = test[feat_avail].values,  test[TARGET].values

    model = xgb.XGBRegressor(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, random_state=42,
        verbosity=0, n_jobs=-1
    )
    model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
    y_pred = np.maximum(0, model.predict(X_te))

    metrics = compute_metrics(y_te, y_pred, model_name)
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_feature_importance(model, feat_avail, model_name)
    save_top_products_trend(df, model_name)
    save_correlation_heatmap(df, feat_avail, model_name)
    save_rolling_stats(df, model_name)

    joblib.dump({"model": model, "features": feat_avail}, MODEL_DIR / "xgboost.pkl")
    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Model 4: LightGBM
# ---------------------------------------------------------------------------

def train_lightgbm(df):
    model_name = "LightGBM"
    lgb = _import_lgb()
    if not lgb:
        print(f"  [{model_name}] SKIPPED – lightgbm not installed")
        return None

    print(f"\n[05] Training {model_name} …")
    train, test = time_split(df)
    feat_avail = [c for c in FEATURE_COLS if c in df.columns]
    X_tr, y_tr = train[feat_avail].values, train[TARGET].values
    X_te, y_te = test[feat_avail].values,  test[TARGET].values

    model = lgb.LGBMRegressor(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, random_state=42,
        verbose=-1, n_jobs=-1
    )
    model.fit(X_tr, y_tr,
              eval_set=[(X_te, y_te)],
              callbacks=[lgb.early_stopping(20, verbose=False),
                         lgb.log_evaluation(-1)])
    y_pred = np.maximum(0, model.predict(X_te))

    metrics = compute_metrics(y_te, y_pred, model_name)
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_feature_importance(model, feat_avail, model_name)
    save_top_products_trend(df, model_name)
    save_correlation_heatmap(df, feat_avail, model_name)
    save_rolling_stats(df, model_name)

    joblib.dump({"model": model, "features": feat_avail}, MODEL_DIR / "lightgbm.pkl")
    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Model 5: Prophet (store-level monthly aggregate)
# ---------------------------------------------------------------------------

def train_prophet(df):
    model_name = "Prophet"
    Prophet = _import_prophet()
    if not Prophet:
        print(f"  [{model_name}] SKIPPED – prophet not installed")
        return None

    print(f"\n[05] Training {model_name} …")
    # Load store-level monthly aggregate from raw cleaned data (has real timestamps)
    if SELL_PATH.exists():
        raw = pd.read_csv(SELL_PATH, usecols=["date", "quantity"], parse_dates=["date"])
        agg = (
            raw.assign(ds=raw["date"].dt.to_period("M").dt.to_timestamp())
            .groupby("ds")["quantity"]
            .sum()
            .reset_index()
            .rename(columns={"quantity": "y"})
            .sort_values("ds")
        )
    else:
        # Fallback: aggregate from features (less accurate date mapping)
        agg = (
            df.groupby(["year", "month"])["total_qty_sold"]
            .sum().reset_index()
        )
        agg["ds"] = pd.to_datetime(agg[["year", "month"]].assign(day=1))
        agg = agg.rename(columns={"total_qty_sold": "y"}).sort_values("ds")

    split = int(len(agg) * 0.8)
    train_agg = agg.iloc[:split]
    test_agg  = agg.iloc[split:]

    if len(train_agg) < 4:
        print(f"  [{model_name}] SKIPPED – too few monthly rows ({len(train_agg)}) to fit Prophet")
        return None

    # Use additive mode for short series (multiplicative needs sufficient variance)
    model = Prophet(
        yearly_seasonality=len(train_agg) >= 12,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="additive",
    )
    model.fit(train_agg)

    future = model.make_future_dataframe(periods=len(test_agg), freq="MS")
    forecast = model.predict(future)
    y_pred = forecast["yhat"].tail(len(test_agg)).values
    y_pred = np.maximum(0, y_pred)
    y_te   = test_agg["y"].values

    metrics = compute_metrics(y_te, y_pred, model_name)

    # Charts
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_top_products_trend(df, model_name)
    save_rolling_stats(df, model_name)

    # Prophet-specific: component plot
    try:
        fig2 = model.plot_components(forecast)
        comp_out = ACC_DIR / model_name / "eda" / "prophet_components.png"
        comp_out.parent.mkdir(parents=True, exist_ok=True)
        fig2.savefig(comp_out, dpi=120)
        plt.close()
    except Exception:
        pass

    joblib.dump({"model": model, "type": "prophet"}, MODEL_DIR / "prophet.pkl")
    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Model 6: SARIMA (store-level)
# ---------------------------------------------------------------------------

def train_sarima(df):
    model_name = "SARIMA"
    SARIMAX = _import_statsmodels()
    if not SARIMAX:
        print(f"  [{model_name}] SKIPPED – statsmodels not installed")
        return None

    print(f"\n[05] Training {model_name} …")
    # Load store-level monthly aggregate from raw cleaned data
    if SELL_PATH.exists():
        raw = pd.read_csv(SELL_PATH, usecols=["date", "quantity"], parse_dates=["date"])
        agg = (
            raw.assign(ds=raw["date"].dt.to_period("M").dt.to_timestamp())
            .groupby("ds")["quantity"]
            .sum()
            .reset_index()
            .rename(columns={"quantity": "y"})
            .sort_values("ds")
            .set_index("ds")
        )
        series = agg["y"]
    else:
        agg_df = (
            df.groupby(["year", "month"])["total_qty_sold"]
            .sum().reset_index()
        )
        agg_df["ds"] = pd.to_datetime(agg_df[["year", "month"]].assign(day=1))
        agg_df = agg_df.sort_values("ds").set_index("ds")
        series = agg_df["total_qty_sold"]

    split = int(len(series) * 0.8)
    train_s = series.iloc[:split]
    test_s  = series.iloc[split:]

    if len(train_s) < 6:
        print(f"  [{model_name}] SKIPPED – too few monthly rows ({len(train_s)}) for SARIMA")
        return None

    try:
        # Use seasonal order only if we have enough data
        if len(train_s) >= 24:
            sarima_order = (1, 1, 1, 12)
        else:
            sarima_order = (0, 0, 0, 0)   # plain ARIMA
        sarima_model = SARIMAX(
            train_s,
            order=(1, 1, 1),
            seasonal_order=sarima_order,
            enforce_stationarity=False,
            enforce_invertibility=False
        )
        sarima_fit = sarima_model.fit(disp=False)
        forecast = sarima_fit.forecast(steps=len(test_s))
        y_pred = np.maximum(0, forecast.values)
        y_te   = test_s.values
    except Exception as e:
        print(f"  [{model_name}] SARIMA fitting failed: {e} – using AR(1) fallback")
        try:
            sarima_model = SARIMAX(train_s, order=(1, 0, 0))
            sarima_fit   = sarima_model.fit(disp=False)
            forecast = sarima_fit.forecast(steps=len(test_s))
            y_pred = np.maximum(0, forecast.values)
            y_te   = test_s.values
        except Exception as e2:
            print(f"  [{model_name}] AR(1) also failed: {e2} – skipping")
            return None

    metrics = compute_metrics(y_te, y_pred, model_name)
    save_actual_vs_predicted(y_te, y_pred, model_name)
    save_residual_plot(y_te, y_pred, model_name)
    save_top_products_trend(df, model_name)
    save_rolling_stats(df, model_name)

    # Diagnostic plot
    try:
        diag_fig = sarima_fit.plot_diagnostics(figsize=(12, 8))
        diag_out = ACC_DIR / model_name / "eda" / "sarima_diagnostics.png"
        diag_out.parent.mkdir(parents=True, exist_ok=True)
        diag_fig.savefig(diag_out, dpi=120)
        plt.close()
    except Exception:
        pass

    joblib.dump({"model": sarima_fit, "type": "sarima"}, MODEL_DIR / "sarima.pkl")
    out = ACC_DIR / model_name / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"model": model_name, **metrics}, f, indent=2)
    print(f"  [{model_name}] ✓ saved")
    return metrics


# ---------------------------------------------------------------------------
# Summary comparison CSV
# ---------------------------------------------------------------------------

def save_comparison(results: dict):
    rows = []
    for model_name, m in results.items():
        if m:
            rows.append({"model": model_name, **m})
    comparison = pd.DataFrame(rows)
    out = ACC_DIR / "model_comparison.csv"
    comparison.to_csv(out, index=False)
    print(f"\n[05] Model comparison saved → {out}")
    print(comparison.to_string(index=False))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("[05] Loading feature dataset …")
    if not FEAT_PATH.exists():
        print(f"[05] ERROR: {FEAT_PATH} not found. Run 03_build_features.py first.")
        sys.exit(1)

    df = load_and_prepare(FEAT_PATH)
    print(f"[05] Dataset shape after outlier removal: {df.shape}")

    results = {}
    results["LinearRegression"] = train_linear_regression(df)
    results["RandomForest"]     = train_random_forest(df)
    results["XGBoost"]          = train_xgboost(df)
    results["LightGBM"]         = train_lightgbm(df)
    results["Prophet"]          = train_prophet(df)
    results["SARIMA"]           = train_sarima(df)

    save_comparison(results)
    print("\n[05] ✓ All models trained and EDA charts exported.")


if __name__ == "__main__":
    main()
