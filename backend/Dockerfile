# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps: libpq for psycopg2, gcc/g++ for ML native libs
RUN apt-get update && apt-get install -y \
    libpq-dev gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# ── Layer 1: core API dependencies (fast, cached independently) ──────────────
COPY requirements_base.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout=120 -r requirements_base.txt

# ── Layer 2: ML dependencies (large, separate layer for Docker cache) ─────────
COPY requirements_ml.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout=300 --retries=5 -r requirements_ml.txt

# Copy the rest of the backend source code
COPY . .

# Make the entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Single entrypoint handles: wait-for-db → migrate → seed (if empty) → serve
ENTRYPOINT ["/app/entrypoint.sh"]