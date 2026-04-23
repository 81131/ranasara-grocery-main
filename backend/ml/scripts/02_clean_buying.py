"""
02_clean_buying.py
------------------
Parses raw OCR invoice blobs from BuyingData.csv into structured records.
Each row in the input is a (file_name, raw_text) pair where raw_text is an
unstructured multi-line string from an invoice photo.

Extraction targets per invoice:
  - date       (various formats, year-corrected to 2023-2026)
  - supplier   (company name heuristic)
  - items[]    → product description, quantity, unit_price, total

Output:  data/processed/buying_cleaned.csv
"""

import re
import os
import csv
import pandas as pd
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_PATH  = REPO_ROOT / "data" / "raw" / "buying" / "BuyingData.csv"
OUT_PATH  = REPO_ROOT / "data" / "processed" / "buying_cleaned.csv"

# ---------------------------------------------------------------------------
# Date parsing helpers
# ---------------------------------------------------------------------------

DATE_PATTERNS = [
    r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})\b",   # DD/MM/YYYY or variants
    r"\b(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})\b",      # YYYY-MM-DD
]

def _correct_year(yr: int) -> int:
    """Fix obviously wrong years (OCR misreads). Pin to 2023-2026 range."""
    if yr < 100:
        yr += 2000
    if yr < 2020:
        yr = 2024   # fallback midpoint
    if yr > 2026:
        yr = 2026
    return yr

def extract_date(text: str):
    for pat in DATE_PATTERNS:
        m = re.search(pat, text)
        if m:
            g = m.groups()
            try:
                if len(g[2]) >= 4:   # last group is 4-digit year
                    d, mo, yr = int(g[0]), int(g[1]), int(g[2])
                else:                 # YYYY-MM-DD form
                    yr, mo, d = int(g[0]), int(g[1]), int(g[2])
                yr = _correct_year(yr)
                if 1 <= mo <= 12 and 1 <= d <= 31:
                    return datetime(yr, mo, min(d, 28)).date()
            except (ValueError, TypeError):
                continue
    return None


# ---------------------------------------------------------------------------
# Supplier name heuristic
# ---------------------------------------------------------------------------

COMPANY_KEYWORDS = [
    "STORE", "STORES", "TRADERS", "TRADING", "MERCHANTS", "WHOLESALE",
    "COMPANY", "AGENCIES", "AGENTS", "PVT", "LIMITED", "LTD", "ENTERPRISE",
    "MART", "MARKET", "SUPPLIERS", "DISTRIBUTION"
]

def extract_supplier(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for line in lines:
        upper = line.upper()
        if any(kw in upper for kw in COMPANY_KEYWORDS):
            # Exclude header-like lines
            if not any(skip in upper for skip in ["DATE", "QTY", "DESCRIPTION", "AMOUNT", "TOTAL"]):
                return line[:120]
    return "Unknown Supplier"


# ---------------------------------------------------------------------------
# Line-item parser
# ---------------------------------------------------------------------------

# Matches lines like:  "Suji   25   2400   60000"
#                      "RATA ALA  0.5  220  110"
ITEM_PATTERN = re.compile(
    r"^([A-Za-z][A-Za-z0-9\s\-/().]{2,40}?)\s+"  # description (3+ chars)
    r"(\d+(?:\.\d+)?)\s+"                          # quantity
    r"(\d{2,}(?:\.\d+)?)\s+"                       # unit price (≥10)
    r"(\d{3,}(?:\.\d+)?)$"                         # total (≥100)
)

def extract_items(text: str):
    items = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        m = ITEM_PATTERN.match(line)
        if m:
            desc  = m.group(1).strip()
            qty   = float(m.group(2))
            price = float(m.group(3))
            total = float(m.group(4))
            # Basic sanity: qty * price roughly ≈ total (within 20%)
            if qty > 0 and price > 0 and total > 0:
                calc = qty * price
                if abs(calc - total) / max(total, 1) < 0.25:
                    items.append({
                        "description": desc,
                        "quantity":    qty,
                        "unit_price":  price,
                        "total":       total,
                    })
    return items


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"[02] Loading buying data from: {RAW_PATH}")
    df = pd.read_csv(RAW_PATH)
    print(f"[02] Total invoice blobs: {len(df)}")

    records = []
    no_date = 0
    no_items = 0

    for _, row in df.iterrows():
        fname    = str(row.get("file_name", ""))
        raw_text = str(row.get("raw_text", ""))

        date     = extract_date(raw_text)
        supplier = extract_supplier(raw_text)
        items    = extract_items(raw_text)

        if not date:
            no_date += 1

        if not items:
            no_items += 1
            # Still record the invoice even without line items (supplier + date useful)
            records.append({
                "file_name":   fname,
                "date":        date,
                "supplier":    supplier,
                "description": None,
                "quantity":    None,
                "unit_price":  None,
                "total":       None,
            })
        else:
            for item in items:
                records.append({
                    "file_name":   fname,
                    "date":        date,
                    "supplier":    supplier,
                    **item,
                })

    out_df = pd.DataFrame(records)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUT_PATH, index=False)

    print(f"[02] Total output records: {len(out_df)}")
    print(f"[02] Invoices with no parsed date:  {no_date}")
    print(f"[02] Invoices with no parsed items: {no_items}")
    print(f"[02] Unique suppliers found: {out_df['supplier'].nunique()}")
    print(f"[02] Cleaned buying data saved → {OUT_PATH}")
    print(f"[02] Done ✓")


if __name__ == "__main__":
    main()
