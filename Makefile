.PHONY: dev build test docker-build docker-up docker-down clean install db-reset git-hooks

# Install workspace dependencies
install:
	@bun install

# Build all package bundles and applications
build: install
	@bun run --filter web build

# Run unit tests across all packages
test:
	@bun test

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
	@rm -f packages/db/traildepot/*.db packages/db/traildepot/*.db-journal packages/db/traildepot/*.db-shm packages/db/traildepot/*.db-wal
	@rm -f packages/db/traildepot/data/*.db packages/db/traildepot/data/*.db-journal packages/db/traildepot/data/*.db-shm packages/db/traildepot/data/*.db-wal
	@rm -rf data/
	@echo "Database reset complete. Next launch will run migrations from scratch."

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
