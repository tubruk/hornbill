# Stage 1: Build the React frontend
FROM oven/bun:1.3.14 AS frontend-builder
ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA
WORKDIR /app

# Copy lockfile, configs, and workspace manifests
COPY package.json bun.lock tsconfig.json ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies with frozen lockfile
RUN bun install --frozen-lockfile

# Copy source code and build frontend
COPY packages/core ./packages/core
COPY apps/web ./apps/web
RUN bun run --filter hornbill-web build

# Stage 2: Build final runner
FROM oven/bun:1.3.14
ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA
WORKDIR /app

# Install curl for entrypoint healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy Trailbase binary from official image
COPY --from=trailbase/trailbase:latest /app/trail /usr/local/bin/trail

# Copy workspace configs and lockfiles first for production caching
COPY package.json bun.lock tsconfig.json ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install production dependencies
RUN bun install --production --frozen-lockfile

# Copy source code and built assets
COPY scripts/entrypoint.sh ./entrypoint.sh
COPY config ./config
COPY packages/core ./packages/core
COPY packages/db ./packages/db
COPY apps/api ./apps/api
COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

# Expose API port
EXPOSE 3000

# Set default envs
ENV HOST=0.0.0.0
ENV PORT=3000
ENV WEB_DIST_DIR=/app/apps/web/dist
ENV TRAILBASE_URL=http://localhost:4000
ENV NODE_ENV=production
ENV REGISTRATION_ENABLED=${REGISTRATION_ENABLED:-true}

# Run database + app entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:${PORT}/api/v1/ping || exit 1
