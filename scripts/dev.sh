#!/bin/bash
set -e

# Find local trail binary
TRAIL_BIN=$(command -v trail 2>/dev/null || ( [ -f "$HOME/.local/bin/trail" ] && echo "$HOME/.local/bin/trail" ) || ( [ -f "bin/trail" ] && echo "bin/trail" ))

if [ -z "$TRAIL_BIN" ]; then
  echo "=========================================================================="
  echo "Error: Trailbase binary ('trail') not found."
  echo "Please install it locally by running:"
  echo "  curl -sSL https://trailbase.io/install.sh | bash"
  echo "And restart your terminal, or place the executable in './bin/trail'."
  echo "=========================================================================="
  exit 1
fi

echo "============================================="
echo "Starting local Trailbase database server using $TRAIL_BIN..."
echo "============================================="

# Ensure background trail binary is stopped on exit (Ctrl+C)
trap 'echo -e "\nStopping local Trailbase database..."; kill $(jobs -p) 2>/dev/null || true; exit 0' INT

# Resolve TRAILBASE_DATA_DIR to realpath and export it
DATA_DIR="${TRAILBASE_DATA_DIR:-./data/hornbill}"
mkdir -p "$DATA_DIR"
export TRAILBASE_DATA_DIR=$(realpath "$DATA_DIR")
echo "Using TRAILBASE_DATA_DIR: $TRAILBASE_DATA_DIR"

# Copy Trailbase config into the data directory
CONFIG_SRC="$(pwd)/config/config.textproto"
CONFIG_DST="$TRAILBASE_DATA_DIR/config.textproto"
mkdir -p "$(dirname "$CONFIG_DST")"
cp "$CONFIG_SRC" "$CONFIG_DST"

# Copy Trailbase migrations into the data directory
mkdir -p "$TRAILBASE_DATA_DIR/migrations"
cp $(pwd)/packages/db/migrations/*.sql "$TRAILBASE_DATA_DIR/migrations/"

# Start Trailbase in the background
$TRAIL_BIN --data-dir "$TRAILBASE_DATA_DIR" run --address 127.0.0.1:4000 &

echo "Waiting for database to run migrations and start..."
until curl -s http://127.0.0.1:4000/api/records/v1/accounts >/dev/null 2>&1; do
  sleep 0.5
done

echo "Database is ready on http://127.0.0.1:4000"

# Boot Hono BFF API and Vite Web App concurrently
exec bun run dev
