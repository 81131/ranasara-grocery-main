"""
03_build_features.py
---------------------
Merges cleaned selling & buying data and engineers the feature set
used by all demand forecasting models.

Outputs:
  data/training/demand_features.csv   – monthly aggregated features per product
  data/training/recommendation_matrix.csv – co-purchase bill-level matrix
"""

import pandas as pd
import numpy as np
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SELL_PATH = REPO_ROOT / "data" / "processed" / "selling_cleaned.csv"
BUY_PATH  = REPO_ROOT / "data" / "processed" / "buying_cleaned.csv"
FEAT_PATH = REPO_ROOT / "data" / "training" / "demand_features.csv"
RECO_PATH = REPO_ROOT / "data" / "training" / "recommendation_matrix.csv"


def fuzzy_match_descriptions(sell_name: str, buy_descriptions: pd.Series) -> float:
    """Very lightweight token-overlap score for joining sell→buy on product name."""
    sell_tokens = set(sell_name.upper().split())
    best = 0.0
    for desc in buy_descriptions.dropna():
        buy_tokens = set(str(desc).upper().split())
        if not buy_tokens:
            continue
        overlap = len(sell_tokens & buy_tokens) / max(len(sell_tokens | buy_tokens), 1)
        if overlap > best:
            best = overlap
    return best


def main():
    print("[03] Loading cleaned selling data …")
    sell = pd.read_csv(SELL_PATH, parse_dates=["date"], low_memory=False)
    print(f"[03] Selling rows: {len(sell):,}  |  products: {sell['product_name'].nunique()}")

    print("[03] Loading cleaned buying data …")
    buy = pd.read_csv(BUY_PATH, parse_dates=["date"], low_memory=False)
    print(f"[03] Buying rows: {len(buy):,}")

    # -----------------------------------------------------------------------
    # 1. Aggregate selling data → monthly per-product totals
    # -----------------------------------------------------------------------
    sell["year_month"] = sell["date"].dt.to_period("M")

    monthly = sell.groupby(["product_name", "product_code", "year_month"]).agg(
        total_qty_sold     = ("quantity",   "sum"),
        avg_unit_price     = ("unit_price", "mean"),
        transaction_count  = ("bill_id",    "nunique"),
        total_discount     = ("discount",   "sum"),
        total_revenue      = ("line_total", "sum"),
    ).reset_index()

    monthly["year"]  = monthly["year_month"].dt.year
    monthly["month"] = monthly["year_month"].dt.month
    monthly["discount_rate"] = (
        monthly["total_discount"] / monthly["total_revenue"].replace(0, np.nan)
    ).fillna(0).clip(0, 1)

    # -----------------------------------------------------------------------
    # 2. Seasonal cyclical encoding
    # -----------------------------------------------------------------------
    monthly["month_sin"] = np.sin(2 * np.pi * monthly["month"] / 12)
    monthly["month_cos"] = np.cos(2 * np.pi * monthly["month"] / 12)

    # Holiday / festive months in Sri Lanka (April, December, January, August)
    FESTIVE_MONTHS = {1, 4, 8, 12}
    monthly["is_festive_month"] = monthly["month"].isin(FESTIVE_MONTHS).astype(int)

    # -----------------------------------------------------------------------
    # 3. Rolling demand features (lag-1, lag-3 month, rolling std)
    # -----------------------------------------------------------------------
    monthly = monthly.sort_values(["product_name", "year", "month"]).reset_index(drop=True)

    grp = monthly.groupby("product_name")["total_qty_sold"]
    monthly["demand_lag1"]   = grp.shift(1)
    monthly["demand_lag3"]   = grp.shift(3)
    monthly["demand_roll3"]  = grp.transform(lambda s: s.rolling(3, min_periods=1).mean())
    monthly["demand_volatility"] = grp.transform(lambda s: s.rolling(3, min_periods=1).std().fillna(0))

    # -----------------------------------------------------------------------
    # 4. Merge buy price from buying data (best-effort token-match)
    # -----------------------------------------------------------------------
    # Build a lookup: product_name (upper) → avg buy unit_price
    # Guard: description may be all-NaN if OCR found no line items
    buy_valid = buy[buy["unit_price"].notna() & (buy["unit_price"] > 0)].copy()
    has_descriptions = (
        "description" in buy_valid.columns
        and buy_valid["description"].notna().any()
        and buy_valid["description"].dtype == object
    )

    if has_descriptions:
        buy_valid["desc_upper"] = buy_valid["description"].str.upper().fillna("")
        buy_avg = (
            buy_valid.groupby("desc_upper")["unit_price"]
            .mean()
            .reset_index()
            .rename(columns={"desc_upper": "description", "unit_price": "avg_buy_price"})
        )
        monthly["product_upper"] = monthly["product_name"].str.upper()
        monthly = monthly.merge(
            buy_avg.rename(columns={"description": "product_upper", "avg_buy_price": "avg_buy_price_direct"}),
            on="product_upper",
            how="left"
        )
    else:
        print("[03] No OCR line items parsed — buy prices will use 60% sell-price fallback")
        monthly["product_upper"] = monthly["product_name"].str.upper()
        monthly["avg_buy_price_direct"] = np.nan

    # Fallback: for unmatched products, set buy price to 60% of sell price (typical supermarket margin)
    monthly["avg_buy_price"] = monthly["avg_buy_price_direct"].fillna(
        monthly["avg_unit_price"] * 0.60
    )
    monthly["price_to_cost_ratio"] = (
        monthly["avg_unit_price"] / monthly["avg_buy_price"].replace(0, np.nan)
    ).fillna(1.5).clip(1.0, 5.0)
    monthly["gross_margin"] = monthly["avg_unit_price"] - monthly["avg_buy_price"]

    # -----------------------------------------------------------------------
    # 5. Save demand features
    # -----------------------------------------------------------------------
    feature_cols = [
        "product_name", "product_code", "year", "month",
        "total_qty_sold", "avg_unit_price", "avg_buy_price",
        "transaction_count", "discount_rate", "total_revenue",
        "month_sin", "month_cos", "is_festive_month",
        "demand_lag1", "demand_lag3", "demand_roll3", "demand_volatility",
        "price_to_cost_ratio", "gross_margin",
    ]
    final = monthly[[c for c in feature_cols if c in monthly.columns]].copy()
    FEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
    final.to_csv(FEAT_PATH, index=False)
    print(f"[03] Demand features saved → {FEAT_PATH}  shape={final.shape}")

    # -----------------------------------------------------------------------
    # 6. Build co-purchase recommendation matrix (bill-level)
    # -----------------------------------------------------------------------
    print("[03] Building co-purchase recommendation matrix …")
    # Each row = one bill; value = pipe-separated product codes
    bill_products = (
        sell.groupby("bill_id")["product_code"]
        .apply(lambda x: "|".join(x.dropna().astype(str).unique()))
        .reset_index()
        .rename(columns={"product_code": "product_codes"})
    )
    # Filter bills with at least 2 products (meaningful co-purchase)
    bill_products = bill_products[
        bill_products["product_codes"].str.count(r"\|") >= 1
    ]
    bill_products.to_csv(RECO_PATH, index=False)
    print(f"[03] Recommendation bill matrix saved → {RECO_PATH}  shape={bill_products.shape}")
    print("[03] Done ✓")


if __name__ == "__main__":
    main()
