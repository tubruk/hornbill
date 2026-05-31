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

# Run trail from its packages directory
$TRAIL_BIN --data-dir packages/db/traildepot run --address 127.0.0.1:4000 &

echo "Waiting for database to run migrations and start..."
until curl -s http://127.0.0.1:4000/api/records/v1/accounts >/dev/null 2>&1; do
  sleep 0.5
done

echo "Database is ready on http://127.0.0.1:4000"

# Boot Hono BFF API and Vite Web App concurrently
exec bun run dev
