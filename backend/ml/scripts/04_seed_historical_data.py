"""
04_seed_historical_data.py
---------------------------
Populates the PostgreSQL database with historical data extracted from
the cleaned SellingData and BuyingData CSVs.

Creates:
  1. One "dummy customer" user account (in-store purchase proxy)
  2. Suppliers extracted from buying invoices
  3. Products + StockBatches from SellingData (one batch per product, historical)
  4. Orders + OrderItems representing past transactions

Usage (run INSIDE the backend Docker container):
  docker exec -it grocery_fastapi_backend python /app/ml/scripts/04_seed_historical_data.py
"""

import os
import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Bootstrap path so we can import app modules
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[2]   # …/backend
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from models.inventory import Product, StockBatch, Category
from models.orders import Order, OrderItem
from models.suppliers import Supplier
from models.user import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

REPO_ROOT  = BACKEND_DIR.parent
SELL_PATH  = REPO_ROOT / "data" / "processed" / "selling_cleaned.csv"
BUY_PATH   = REPO_ROOT / "data" / "processed" / "buying_cleaned.csv"

DUMMY_EMAIL    = "dummy_customer@ransara.internal"
DUMMY_PASSWORD = "DummyCustomer2023!"
BATCH_SIZE     = 500   # DB commit batch size


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_or_create_dummy_customer(db):
    user = db.query(User).filter(User.email == DUMMY_EMAIL).first()
    if user:
        print(f"  [seed] Dummy customer already exists (id={user.user_id})")
        return user
    user = User(
        email         = DUMMY_EMAIL,
        password_hash = pwd_context.hash(DUMMY_PASSWORD),
        role          = "customer",
        first_name    = "In-Store",
        last_name     = "Customer",
        is_active     = True,
        is_deleted    = False,
    )
    db.add(user)
    db.flush()
    print(f"  [seed] Created dummy customer (id={user.user_id})")
    return user


def get_or_create_default_category(db):
    cat = db.query(Category).filter(Category.name == "General").first()
    if cat:
        return cat
    cat = Category(name="General", description="Seeded from historical data")
    db.add(cat)
    db.flush()
    return cat


def seed_suppliers(db, buy_df):
    """Insert unique suppliers from buying data. Returns {name → Supplier}."""
    unique_suppliers = (
        buy_df["supplier"]
        .dropna()
        .str.strip()
        .unique()
    )
    supplier_map = {}
    existing = {s.name: s for s in db.query(Supplier).all()}

    new_count = 0
    for name in unique_suppliers:
        if not name or name == "Unknown Supplier":
            continue
        if name in existing:
            supplier_map[name] = existing[name]
            continue
        sup = Supplier(name=name, address="Extracted from invoice OCR")
        db.add(sup)
        db.flush()
        supplier_map[name] = sup
        existing[name] = sup
        new_count += 1

    # Always ensure a "Historical Data" default supplier
    if "Historical Data" not in existing:
        default_sup = Supplier(name="Historical Data", address="Auto-seeded")
        db.add(default_sup)
        db.flush()
        supplier_map["Historical Data"] = default_sup
    else:
        supplier_map["Historical Data"] = existing["Historical Data"]

    print(f"  [seed] Suppliers: {new_count} new, {len(existing)} total")
    return supplier_map


def seed_products_and_batches(db, sell_df, supplier_map, default_category):
    """
    Insert one Product + one representative StockBatch per unique product_name.
    The StockBatch buying_price is estimated at 60% of avg sell price.
    Returns {product_name → (Product, StockBatch)}
    """
    default_supplier = supplier_map.get("Historical Data")

    # Aggregate: avg price & unit_type per product
    product_stats = (
        sell_df.groupby(["product_name", "product_code"])
        .agg(
            avg_price  = ("unit_price", "mean"),
            unit_type  = ("unit_type",  lambda x: x.mode()[0] if len(x) else "NOS"),
        )
        .reset_index()
    )

    existing_products = {p.sku: p for p in db.query(Product).all()}
    existing_batches  = {b.product_id: b for b in db.query(StockBatch).all()}
    product_map = {}
    new_products = 0
    new_batches  = 0

    for _, row in product_stats.iterrows():
        name        = str(row["product_name"]).strip()
        code        = str(row["product_code"]).strip()
        sku         = f"HIST-{code}"
        avg_price   = float(row["avg_price"]) if pd.notna(row["avg_price"]) else 100.0
        buy_price   = round(avg_price * 0.60, 2)
        unit_str    = str(row["unit_type"]).strip() or "NOS"

        if sku in existing_products:
            product = existing_products[sku]
        else:
            product = Product(
                supplier_id    = default_supplier.id,
                product_name   = name,
                sku            = sku,
                description    = f"Historically seeded from POS data (code {code})",
                unit_of_measure= unit_str,
            )
            product.categories.append(default_category)
            db.add(product)
            db.flush()
            existing_products[sku] = product
            new_products += 1

        if product.id not in existing_batches:
            batch = StockBatch(
                product_id      = product.id,
                batch_number    = f"HIST-BATCH-{code}",
                buying_price    = buy_price,
                retail_price    = round(avg_price, 2),
                current_quantity= 0.0,   # historical — stock already sold
            )
            db.add(batch)
            db.flush()
            existing_batches[product.id] = batch
            new_batches += 1
        else:
            batch = existing_batches[product.id]

        product_map[name] = (product, batch)

    print(f"  [seed] Products: {new_products} new | Batches: {new_batches} new")
    return product_map


def seed_orders(db, sell_df, dummy_user_id, product_map):
    """
    Group SellingData by bill_id → one Order per bill,
    with OrderItems for each line.
    """
    existing_bill_ids = set()  # We use order notes to track; skip re-seeding
    # Use a marker column we'll store in payment_method field
    existing = db.query(Order.payment_method).filter(
        Order.payment_method.like("HIST-%")
    ).all()
    existing_bill_ids = {r[0].replace("HIST-", "") for r in existing}

    bills = sell_df.groupby("bill_id")
    total_orders = 0
    total_items  = 0
    skipped      = 0
    batch_orders = []

    for bill_id, bill_rows in bills:
        if str(bill_id) in existing_bill_ids:
            skipped += 1
            continue

        order_date = bill_rows["date"].iloc[0]
        subtotal   = float(bill_rows["line_total"].sum())

        order = Order(
            user_id         = dummy_user_id,
            subtotal_amount = subtotal,
            delivery_fee    = 0.0,
            total_amount    = subtotal,
            delivery_type   = "Store Pickup",
            current_status  = "Completed",
            payment_method  = f"HIST-{bill_id}",
            created_at      = pd.Timestamp(order_date).to_pydatetime().replace(tzinfo=timezone.utc),
        )
        db.add(order)
        db.flush()

        for _, item_row in bill_rows.iterrows():
            pname = str(item_row["product_name"]).strip()
            if pname not in product_map:
                continue
            _, batch = product_map[pname]
            oi = OrderItem(
                order_id          = order.id,
                batch_id          = batch.id,
                quantity          = float(item_row["quantity"]),
                price_at_purchase = float(item_row["unit_price"]),
            )
            db.add(oi)
            total_items += 1

        total_orders += 1
        if total_orders % BATCH_SIZE == 0:
            db.commit()
            print(f"  [seed] Committed {total_orders:,} orders so far …")

    db.commit()
    print(f"  [seed] Orders seeded: {total_orders:,}  |  items: {total_items:,}  |  skipped: {skipped:,}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("[04] Starting historical data seed …")

    print("[04] Loading cleaned datasets …")
    sell_df = pd.read_csv(SELL_PATH, parse_dates=["date"], low_memory=False)
    buy_df  = pd.read_csv(BUY_PATH,  low_memory=False)
    print(f"  Selling: {len(sell_df):,} rows | Buying: {len(buy_df):,} rows")

    db = SessionLocal()
    try:
        print("[04] Step 1/5 – Dummy customer …")
        dummy_user = get_or_create_dummy_customer(db)
        db.commit()

        print("[04] Step 2/5 – Default category …")
        default_cat = get_or_create_default_category(db)
        db.commit()

        print("[04] Step 3/5 – Suppliers …")
        supplier_map = seed_suppliers(db, buy_df)
        db.commit()

        print("[04] Step 4/5 – Products & stock batches …")
        product_map = seed_products_and_batches(db, sell_df, supplier_map, default_cat)
        db.commit()

        print("[04] Step 5/5 – Historical orders …")
        seed_orders(db, sell_df, dummy_user.user_id, product_map)

        print("[04] ✓ Historical seed complete!")
    except Exception as e:
        db.rollback()
        print(f"[04] ✗ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
