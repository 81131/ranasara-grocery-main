#!/usr/bin/env bash
# =============================================================================
# entrypoint.sh  —  Ransara Supermarket Backend Startup
# =============================================================================
# This script is the single entrypoint for the backend Docker container.
#
# What it does:
#   1. Waits for PostgreSQL to be ready
#   2. Runs Alembic migrations (schema-only, always safe to re-run)
#   3. Checks whether the database already has historical data
#   4. If EMPTY  → runs the full 6-step ML pipeline automatically:
#                   clean → features → seed DB → train → select best model
#   5. If SEEDED → skips the pipeline (subsequent starts are instant)
#   6. Starts uvicorn with 4 workers for high-throughput production serving
#
# No manual steps needed on a fresh machine — just `docker compose up`.
# =============================================================================

set -e

SCRIPTS="/app/ml/scripts"
LOG_PREFIX="[startup]"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Wait for Postgres
# ─────────────────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Waiting for PostgreSQL…"
MAX_TRIES=30
COUNT=0
until python3 -c "
import os, psycopg2, sys
try:
    conn = psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', 'db'),
        port=os.environ.get('POSTGRES_PORT', 5432),
        dbname=os.environ.get('POSTGRES_DB', 'grocery_management'),
        user=os.environ.get('POSTGRES_USER', 'admin'),
        password=os.environ.get('POSTGRES_PASSWORD', ''),
        connect_timeout=3
    )
    conn.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    COUNT=$((COUNT + 1))
    if [ "$COUNT" -ge "$MAX_TRIES" ]; then
        echo "$LOG_PREFIX ✗ PostgreSQL not available after ${MAX_TRIES}s — aborting."
        exit 1
    fi
    echo "$LOG_PREFIX   … still waiting (${COUNT}/${MAX_TRIES})"
    sleep 1
done
echo "$LOG_PREFIX ✓ PostgreSQL is ready."

# ─────────────────────────────────────────────────────────────────────────────
# 2. Apply DB migrations
# ─────────────────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Running database migrations…"
python3 -c "
import sys; sys.path.insert(0, '/app')
from database import engine, Base
# Import all models so SQLAlchemy metadata is fully populated
import models.user, models.inventory, models.orders, models.suppliers
import models.feedback, models.feedback_product, models.cart, models.chat
Base.metadata.create_all(bind=engine)
print('  Tables OK.')
" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# 3. Check if DB already has seeded orders
# ─────────────────────────────────────────────────────────────────────────────
ORDER_COUNT=$(python3 -c "
import os, psycopg2
try:
    conn = psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', 'db'),
        port=os.environ.get('POSTGRES_PORT', 5432),
        dbname=os.environ.get('POSTGRES_DB', 'grocery_management'),
        user=os.environ.get('POSTGRES_USER', 'admin'),
        password=os.environ.get('POSTGRES_PASSWORD', ''),
        connect_timeout=5
    )
    cur = conn.cursor()
    cur.execute(\"SELECT COUNT(*) FROM orders\")
    print(cur.fetchone()[0])
    conn.close()
except Exception:
    print(0)
" 2>/dev/null || echo "0")

echo "$LOG_PREFIX Order count in DB: ${ORDER_COUNT}"

if [ "$ORDER_COUNT" -gt "1000" ]; then
    echo "$LOG_PREFIX ✓ Database already seeded (${ORDER_COUNT} orders). Skipping pipeline."
else
    echo "$LOG_PREFIX ● Database is empty or minimal. Running ML pipeline…"
    echo "$LOG_PREFIX   This takes ~10–20 minutes on first run. Subsequent starts are instant."
    echo ""

    # ── Step 1: Clean selling data ───────────────────────────────────────
    echo "$LOG_PREFIX ── Step 1/6: Cleaning selling data"
    python3 "$SCRIPTS/01_clean_selling.py"

    # ── Step 2: Parse buying invoices ────────────────────────────────────
    echo "$LOG_PREFIX ── Step 2/6: Parsing buying invoices"
    python3 "$SCRIPTS/02_clean_buying.py"

    # ── Step 3: Build training features ─────────────────────────────────
    echo "$LOG_PREFIX ── Step 3/6: Building training features"
    python3 "$SCRIPTS/03_build_features.py"

    # ── Step 4: Seed historical DB records ───────────────────────────────
    echo "$LOG_PREFIX ── Step 4/6: Seeding historical orders into PostgreSQL"
    python3 "$SCRIPTS/04_seed_historical_data.py"

    # ── Step 5: Train all 6 forecasting models ───────────────────────────
    echo "$LOG_PREFIX ── Step 5/6: Training forecasting models"
    python3 "$SCRIPTS/05_train_models.py"

    # ── Step 6: Select & persist best model ─────────────────────────────
    echo "$LOG_PREFIX ── Step 6/6: Selecting best model"
    python3 "$SCRIPTS/06_select_best_model.py"

    echo ""
    echo "$LOG_PREFIX ✓ ML pipeline complete!"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Start the API server
#    4 workers = parallelism for the heavy /orders/ and /ml/ endpoints.
#    Use --reload only in dev (detected via ENV). In production keep workers.
# ─────────────────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Starting Uvicorn (4 workers)…"
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \
    --timeout-keep-alive 75
