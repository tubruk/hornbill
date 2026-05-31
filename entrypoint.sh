#!/bin/bash
set -e

# Start Trailbase in the background
echo "Starting Trailbase database..."
/usr/local/bin/trail --data-dir /app/packages/db/traildepot run --address 0.0.0.0:4000 &

# Wait for Trailbase to start (applying migrations automatically on start)
echo "Waiting for Trailbase to be healthy..."
until curl -s http://localhost:4000/api/records/v1/accounts > /dev/null 2>&1; do
  sleep 0.5
done
echo "Trailbase is ready and migrations have been applied."

# Start Hono BFF API in Bun (replaces shell process as PID 1)
echo "Starting Hornbill API BFF..."
exec bun run /app/apps/api/src/index.ts
