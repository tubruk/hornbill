.PHONY: dev build lint typecheck coverage test docker-build docker-up docker-down clean install db-reset db-fixtures git-hooks

# Install workspace dependencies
install:
	@bun install

# Build all package bundles and applications
build: install
	@bun run --filter hornbill-web build
	@bun run --filter=@hornbill/cli build

# Run linters across all packages
lint:
	@bun run lint

# Run type checking across all packages
typecheck:
	@bun run typecheck

# Run unit tests across all packages
test:
	@bun test

# Run test coverage aggregation runner
coverage:
	@bun run coverage

# Launch local database and BFF API development servers
dev:
	@./scripts/dev.sh

# Docker commands
docker-build:
	@docker build -t hornbill:latest .

docker-up:
	@docker compose up -d

docker-down:
	@docker compose down

# Reset/drop local and containerized databases
db-reset:
	@echo "Resetting local development and Docker databases..."
	@rm -f ${TRAILBASE_DATA_DIR:-./data/hornbill}/*.db ${TRAILBASE_DATA_DIR:-./data/hornbill}/*.db-journal ${TRAILBASE_DATA_DIR:-./data/hornbill}/*.db-shm ${TRAILBASE_DATA_DIR:-./data/hornbill}/*.db-wal
	@echo "Database reset complete. Next launch will run migrations from scratch."

# Seed the database with yaml fixtures
db-fixtures:
	@echo "Seeding database with yaml fixtures..."
	@bun packages/db/seed.ts

# Symlink hooks from .githooks to .git/hooks
git-hooks:
	@echo "Installing git hooks..."
	@mkdir -p .git/hooks
	@for hook in .githooks/*; do \
		if [ -x "$$hook" ]; then \
			filename=$$(basename "$$hook"); \
			ln -sf ../../$$hook .git/hooks/$$filename; \
			echo "Linked $$filename -> $$hook"; \
		fi \
	done

# Clean up builds and modules
clean:
	@echo "Cleaning up build outputs and dependencies..."
	@rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/web/dist
