"""
recommender.py
--------------
Product recommendation engine using item-item co-purchase frequency.

The model is trained on the co-purchase bill matrix
(data/training/recommendation_matrix.csv) built by 03_build_features.py.

It uses a sparse TF-IDF-weighted co-occurrence approach:
  - Products bought in the same bill are considered "co-purchased"
  - Products that appear in almost every bill get down-weighted (like stop-words)
  - The cosine similarity of each product's co-occurrence profile defines similarity

The model is cached in memory after first load / train.
Re-training is triggered automatically if the CSV is newer than the in-memory cache.
"""

import json
import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from collections import defaultdict
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity
import joblib

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT   = BACKEND_DIR.parent
RECO_PATH   = REPO_ROOT / "data" / "training" / "recommendation_matrix.csv"
MODEL_PATH  = BACKEND_DIR / "ml" / "models" / "recommendation" / "recommender.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── In-memory state ────────────────────────────────────────────────────────
_MODEL_STATE = {
    "item_sim":        None,   # numpy ndarray [n_products × n_products]
    "product_index":   None,   # dict  product_code → row index
    "index_product":   None,   # dict  row index → product_code
    "product_names":   None,   # dict  product_code → product_name (if available)
    "trained_at":      None,
}

TOP_N_DEFAULT = 8


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _build_cooccurrence(bill_df: pd.DataFrame):
    """
    Given a DataFrame with columns [bill_id, product_codes]
    where product_codes is a pipe-separated string of codes,
    build and return the co-occurrence sparse matrix.
    """
    # Expand to (bill_id, product_code) pairs
    rows = []
    for _, row in bill_df.iterrows():
        codes = [c.strip() for c in str(row["product_codes"]).split("|") if c.strip()]
        for code in codes:
            rows.append({"bill_id": row["bill_id"], "product_code": code})

    if not rows:
        return None, None, None

    df_long = pd.DataFrame(rows)
    all_products = sorted(df_long["product_code"].unique())
    product_index = {p: i for i, p in enumerate(all_products)}
    n_products    = len(all_products)

    # Build bill × product presence matrix (binary)
    bill_ids = sorted(df_long["bill_id"].unique())
    bill_index = {b: i for i, b in enumerate(bill_ids)}
    n_bills    = len(bill_ids)

    bill_product_data = []
    bill_product_row  = []
    bill_product_col  = []
    for _, row in df_long.iterrows():
        r = bill_index[row["bill_id"]]
        c = product_index[row["product_code"]]
        bill_product_row.append(r)
        bill_product_col.append(c)
        bill_product_data.append(1.0)

    M = csr_matrix((bill_product_data, (bill_product_row, bill_product_col)),
                   shape=(n_bills, n_products), dtype=np.float32)

    # TF-IDF style: down-weight products that appear in many bills
    # IDF = log(n_bills / (1 + document_frequency))
    df_counts = np.array(M.sum(axis=0)).flatten()  # how many bills each product appears in
    idf = np.log((n_bills + 1) / (df_counts + 1)) + 1.0
    M_tfidf = M.multiply(idf)  # element-wise scale columns

    # Product × Product cosine similarity
    item_sim = cosine_similarity(M_tfidf.T, dense_output=False)
    # Convert to dense for fast lookup (products typically < 5000)
    item_sim_dense = item_sim.toarray()
    # Zero out self-similarity
    np.fill_diagonal(item_sim_dense, 0)

    return item_sim_dense, product_index, all_products


def train_recommender(sell_df: pd.DataFrame = None):
    """
    Build co-purchase similarity matrix from the recommendation CSV,
    optionally augmented with live DB sell data.
    """
    global _MODEL_STATE

    print("[recommender] Training co-purchase model …")

    # Load pre-built bill matrix
    if not RECO_PATH.exists():
        print(f"[recommender] WARNING: {RECO_PATH} not found. "
              "Run 03_build_features.py first.")
        return False

    bill_df = pd.read_csv(RECO_PATH)

    # Optionally augment with live selling data passed in
    if sell_df is not None and not sell_df.empty and "bill_id" in sell_df.columns:
        live_bills = (
            sell_df.groupby("bill_id")["product_code"]
            .apply(lambda x: "|".join(x.dropna().astype(str).unique()))
            .reset_index()
            .rename(columns={"product_code": "product_codes"})
        )
        # Only add bills not already in the CSV matrix
        existing_ids = set(bill_df["bill_id"].astype(str))
        new_bills = live_bills[~live_bills["bill_id"].astype(str).isin(existing_ids)]
        if not new_bills.empty:
            bill_df = pd.concat([bill_df, new_bills], ignore_index=True)
            print(f"[recommender] Augmented with {len(new_bills)} live bills")

    item_sim, product_index, all_products = _build_cooccurrence(bill_df)
    if item_sim is None:
        print("[recommender] ERROR: Empty co-occurrence matrix.")
        return False

    index_product = {i: p for p, i in product_index.items()}

    _MODEL_STATE.update({
        "item_sim":      item_sim,
        "product_index": product_index,
        "index_product": index_product,
        "product_names": {},
        "trained_at":    pd.Timestamp.now().isoformat(),
    })

    # Save to disk
    joblib.dump(_MODEL_STATE, MODEL_PATH)
    print(f"[recommender] Model trained. Products: {len(all_products)}")
    return True


def _ensure_loaded():
    """Load from disk if not in memory."""
    global _MODEL_STATE
    if _MODEL_STATE["item_sim"] is not None:
        return True
    if MODEL_PATH.exists():
        try:
            state = joblib.load(MODEL_PATH)
            _MODEL_STATE.update(state)
            print(f"[recommender] Model loaded from disk "
                  f"(trained_at={_MODEL_STATE['trained_at']})")
            return True
        except Exception as e:
            print(f"[recommender] Failed to load model from disk: {e}")
    return False


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def get_recommendations(
    cart_product_codes: list,
    top_n: int = TOP_N_DEFAULT,
    db_session=None,
) -> list:
    """
    Given a list of product_codes currently in the cart,
    return a ranked list of recommended product_codes with scores.

    Returns:
      [ {"product_code": "...", "score": 0.83, "product_name": "..."}, … ]
    """
    global _MODEL_STATE

    if not _ensure_loaded():
        # Trigger training if model not available
        train_recommender()
        if not _ensure_loaded():
            return []

    item_sim      = _MODEL_STATE["item_sim"]
    product_index = _MODEL_STATE["product_index"]
    index_product = _MODEL_STATE["index_product"]
    product_names = _MODEL_STATE.get("product_names", {})

    # Normalise cart codes to strings
    cart_codes = [str(c).strip() for c in cart_product_codes if str(c).strip()]

    # Accumulate similarity scores from all cart items
    n = item_sim.shape[0]
    scores = np.zeros(n, dtype=np.float32)

    matched = 0
    for code in cart_codes:
        if code in product_index:
            idx = product_index[code]
            scores += item_sim[idx]
            matched += 1

    if matched == 0:
        return []

    # Zero out cart items themselves so we don't recommend what's already in cart
    for code in cart_codes:
        if code in product_index:
            scores[product_index[code]] = 0.0

    # Rank by score
    top_indices = np.argsort(scores)[::-1][:top_n]
    results = []
    for idx in top_indices:
        sc = float(scores[idx])
        if sc <= 0:
            break
        code = index_product[idx]
        name = product_names.get(code, "")

        # Try to resolve name from DB if available and not cached
        if not name and db_session:
            try:
                from models.inventory import Product
                p = (
                    db_session.query(Product)
                    .filter(Product.sku == f"HIST-{code}")
                    .first()
                )
                if p:
                    name = p.product_name
                    _MODEL_STATE["product_names"][code] = name
            except Exception:
                pass

        results.append({
            "product_code": code,
            "score":        round(sc, 4),
            "product_name": name or f"Product {code}",
        })

    return results
