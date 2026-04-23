"""
01_clean_selling.py
-------------------
Cleans the raw SellingData.csv POS transaction log.
- Drops noise rows (SUB TOTAL, BALANCE, CASH, OTHER ITEM, BANK 3%, etc.)
- Assigns an approximate date to each bill ID by linearly interpolating
  bill_id → date across the 3-year range (March 2023 – March 2026)
- Outputs:  data/processed/selling_cleaned.csv
"""

import os
import sys
import pandas as pd
import numpy as np
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[3]  # project root
RAW_PATH  = REPO_ROOT / "data" / "raw" / "selling" / "SellingData.csv"
OUT_PATH  = REPO_ROOT / "data" / "processed" / "selling_cleaned.csv"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Column names (file has NO header)
COLS = [
    "bill_id",      # POS receipt number
    "store_id",     # always 1
    "unit_type",    # KG, NOS, DEPT, …
    "product_code", # internal product code (int)
    "product_name", # product description
    "unit_price",   # price per unit
    "quantity",     # qty sold
    "discount",     # discount amount
    "line_total",   # actual amount charged
    "running_balance"  # running balance on bill
]

# Rows whose product_name contains any of these substrings are noise
NOISE_PATTERNS = [
    r"^\*+\s*SUB TOTAL",
    r"^BALANCE$",
    r"^CASH$",
    r"^CHEQUE$",
    r"^CREDIT CARD",
    r"^BANK\s+\d",       # e.g. BANK 3%
    r"^OTHER ITEM$",
    r"^\s*$",            # blank names
]

DATE_START = pd.Timestamp("2023-03-01")
DATE_END   = pd.Timestamp("2026-03-31")


def main():
    print(f"[01] Loading raw selling data from: {RAW_PATH}")
    # Read in chunks for memory efficiency (file is ~58 MB / 1M rows)
    chunk_size = 200_000
    chunks = []
    for chunk in pd.read_csv(
        RAW_PATH,
        header=None,
        names=COLS,
        dtype={
            "bill_id":      str,
            "store_id":     str,
            "unit_type":    str,
            "product_code": str,
            "product_name": str,
            "unit_price":   float,
            "quantity":     float,
            "discount":     float,
            "line_total":   float,
            "running_balance": float,
        },
        on_bad_lines="skip",
        chunksize=chunk_size,
        low_memory=False
    ):
        chunks.append(chunk)

    df = pd.concat(chunks, ignore_index=True)
    print(f"[01] Raw rows loaded: {len(df):,}")

    # -----------------------------------------------------------------------
    # 1. Drop noise rows
    # -----------------------------------------------------------------------
    noise_mask = df["product_name"].str.strip().str.match(
        "|".join(NOISE_PATTERNS), case=False, na=True
    )
    df = df[~noise_mask].copy()
    print(f"[01] Rows after noise removal: {len(df):,}")

    # -----------------------------------------------------------------------
    # 2. Clean up string columns
    # -----------------------------------------------------------------------
    df["product_name"] = df["product_name"].str.strip()
    df["unit_type"]    = df["unit_type"].str.strip()
    df["bill_id"]      = df["bill_id"].str.strip()

    # -----------------------------------------------------------------------
    # 3. Drop rows with invalid numeric values
    # -----------------------------------------------------------------------
    df = df[df["unit_price"].notna() & (df["unit_price"] > 0)]
    df = df[df["quantity"].notna()  & (df["quantity"]   > 0)]
    df = df[df["product_name"].str.len() > 1]

    # -----------------------------------------------------------------------
    # 4. Assign approximate dates via bill_id linear interpolation
    #    We sort by bill_id (already sequential), then map rank → date range.
    # -----------------------------------------------------------------------
    df["bill_id_int"] = pd.to_numeric(df["bill_id"], errors="coerce")
    df = df.dropna(subset=["bill_id_int"])
    df["bill_id_int"] = df["bill_id_int"].astype(np.int64)

    # Use rank-based interpolation so dates spread evenly even when bill IDs
    # are clustered (e.g. runs of the same bill ID for multi-item receipts)
    total_days = (DATE_END - DATE_START).days
    rank_norm = df["bill_id_int"].rank(method="dense") - 1
    rank_max  = rank_norm.max()
    df["date"] = DATE_START + pd.to_timedelta(
        (rank_norm / max(rank_max, 1) * total_days).astype(int),
        unit="D"
    )

    df["year"]  = df["date"].dt.year
    df["month"] = df["date"].dt.month

    # -----------------------------------------------------------------------
    # 5. Final column selection & save
    # -----------------------------------------------------------------------
    keep = ["bill_id", "date", "year", "month",
            "product_code", "product_name", "unit_type",
            "unit_price", "quantity", "discount", "line_total"]
    df = df[keep]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)
    print(f"[01] Cleaned selling data saved → {OUT_PATH}")
    print(f"[01] Final shape: {df.shape}")
    print(f"[01] Date range: {df['date'].min()} → {df['date'].max()}")
    print(f"[01] Unique products: {df['product_name'].nunique()}")
    print(f"[01] Done ✓")


if __name__ == "__main__":
    main()
