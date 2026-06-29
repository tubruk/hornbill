#!/bin/bash
# Note: This script is intended to be run inside the Docker container as its ENTRYPOINT.
set -e

# Resolve TRAILBASE_DATA_DIR (fallback to ./data/hornbill)
DATA_DIR="${TRAILBASE_DATA_DIR:-./data/hornbill}"
mkdir -p "$DATA_DIR"
export TRAILBASE_DATA_DIR=$(realpath "$DATA_DIR")
echo "Using TRAILBASE_DATA_DIR: $TRAILBASE_DATA_DIR"

# Ensure config is present in the data directory
CONFIG_SRC="/app/config/config.textproto"
if [ ! -f "$CONFIG_SRC" ]; then
  CONFIG_SRC="$(pwd)/config/config.textproto"
fi
CONFIG_DST="$DATA_DIR/config.textproto"
mkdir -p "$(dirname "$CONFIG_DST")"
cp "$CONFIG_SRC" "$CONFIG_DST"

# Ensure migrations are copied into the data directory
MIGRATIONS_SRC="/app/packages/db/migrations"
if [ ! -d "$MIGRATIONS_SRC" ]; then
  MIGRATIONS_SRC="$(pwd)/packages/db/migrations"
fi
cp -r "$MIGRATIONS_SRC"/. "$DATA_DIR/migrations/"

# Start Trailbase in the background using the data directory from environment (loopback-only for security)
echo "Starting Trailbase database..."
/usr/local/bin/trail --data-dir "$DATA_DIR" run --address 127.0.0.1:4000 &

# Wait for Trailbase to start (applying migrations automatically on start)
echo "Waiting for Trailbase to be healthy..."
until curl -s http://localhost:4000/api/records/v1/accounts > /dev/null 2>&1; do
  sleep 0.5
done
echo "Trailbase is ready and migrations have been applied."

# Start Hono BFF API in Bun (replaces shell process as PID 1)
echo "Starting Hornbill API BFF..."
exec bun run /app/apps/api/src/index.ts
