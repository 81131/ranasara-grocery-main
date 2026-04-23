#!/usr/bin/env bash
# =============================================================================
# run_ml_pipeline.sh  —  Manual ML Pipeline Re-Runner
# =============================================================================
# The pipeline runs automatically on first startup via entrypoint.sh.
# Use this script ONLY when you want to force a full re-run manually,
# e.g. after uploading new training data.
#
# Run from the HOST machine:
#   docker exec grocery_fastapi_backend bash /app/ml/scripts/run_ml_pipeline.sh
#
# To also re-seed the database (clears and re-inserts historical orders):
#   docker exec grocery_fastapi_backend bash /app/ml/scripts/run_ml_pipeline.sh --reseed
# =============================================================================

set -e

SCRIPTS="/app/ml/scripts"
RESEED=false

for arg in "$@"; do
    [ "$arg" = "--reseed" ] && RESEED=true
done

echo "══════════════════════════════════════════════════"
echo "  Ransara ML Pipeline  (manual re-run)"
[ "$RESEED" = true ] && echo "  Mode: FULL re-seed + retrain"
echo "══════════════════════════════════════════════════"

echo "── Step 1/6: Clean selling data"
python3 "$SCRIPTS/01_clean_selling.py"

echo "── Step 2/6: Parse buying invoices"
python3 "$SCRIPTS/02_clean_buying.py"

echo "── Step 3/6: Build training features"
python3 "$SCRIPTS/03_build_features.py"

if [ "$RESEED" = true ]; then
    echo "── Step 4/6: Seeding historical DB records (--reseed)"
    python3 "$SCRIPTS/04_seed_historical_data.py"
else
    echo "── Step 4/6: Skipping DB seed (use --reseed to re-insert orders)"
fi

echo "── Step 5/6: Train forecasting models"
python3 "$SCRIPTS/05_train_models.py"

echo "── Step 6/6: Select best model"
python3 "$SCRIPTS/06_select_best_model.py"

echo ""
echo "✓ Done. Best model → /app/ml/models/demand/best_model.pkl"
