# Stage 1: Build the React frontend
FROM oven/bun:1.1.18 AS frontend-builder
WORKDIR /app

# Copy lockfile, configs, and packages
COPY package.json bun.lockb tsconfig.json ./
COPY packages/core ./packages/core
COPY apps/web ./apps/web

# Install dependencies and build
RUN bun install
RUN bun run --filter web build

# Stage 2: Build final runner
FROM oven/bun:1.1.18
WORKDIR /app

# Install curl for entrypoint healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy Trailbase binary from official image
COPY --from=trailbase/trailbase:latest /app/trail /usr/local/bin/trail

# Copy source and configurations
COPY package.json bun.lockb tsconfig.json ./
COPY scripts/entrypoint.sh ./entrypoint.sh
COPY config ./config
COPY packages/core ./packages/core
COPY packages/db ./packages/db
COPY apps/api ./apps/api
COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

# Install production dependencies
RUN bun install --production

# Expose API and Database ports
EXPOSE 3000
EXPOSE 4000

# Set default envs
ENV PORT=3000
ENV TRAILBASE_URL=http://localhost:4000
ENV NODE_ENV=production
ENV REGISTRATION_ENABLED=${REGISTRATION_ENABLED:-true}

# Run database + app entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:${PORT}/api/v1/ping || exit 1
