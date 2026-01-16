.PHONY: install dev dev-web dev-api dev-sync dev-gateway dev-collab dev-full build test lint clean format setup db-web-local db-sync-local check-tools help

#==============================================================================
# Configuration
#==============================================================================

# Ensure critical tools are in PATH (exported for all subprocesses)
export PATH = /opt/homebrew/bin:/opt/homebrew/sbin:$(HOME)/.langflow/uv:$(HOME)/.local/bin:$(HOME)/.bun/bin:$(HOME)/.cargo/bin:/usr/local/bin:/usr/bin:/bin

# Proxy settings (can be overridden via environment or CLI)
HTTP_PROXY ?= http://127.0.0.1:7897
HTTPS_PROXY ?= http://127.0.0.1:7897
NO_PROXY ?= localhost,127.0.0.1

# Color output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

#==============================================================================
# Help
#==============================================================================

help: ## Show this help message
	@echo "$(BLUE)Master Clash - Development Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(NC)"
	@echo "  HTTP_PROXY   - Proxy for HTTP requests (default: $(HTTP_PROXY))"
	@echo "  HTTPS_PROXY  - Proxy for HTTPS requests (default: $(HTTPS_PROXY))"
	@echo "  NO_PROXY     - Comma-separated list of bypassed hosts (default: $(NO_PROXY))"

#==============================================================================
# Prerequisites
#==============================================================================

check-tools: ## Verify required tools are installed
	@echo "$(BLUE)Checking required tools...$(NC)"
	@command -v pnpm >/dev/null 2>&1 || { echo "$(RED)Error: pnpm not found.$(NC)"; echo "$(YELLOW)Install: brew install pnpm$(NC)"; exit 1; }
	@command -v uv >/dev/null 2>&1 || { echo "$(RED)Error: uv not found.$(NC)"; echo "$(YELLOW)Expected at: ~/.langflow/uv/uv$(NC)"; exit 1; }
	@command -v turbo >/dev/null 2>&1 || { echo "$(YELLOW)Warning: turbo not found. Run 'pnpm install' first$(NC)"; }
	@echo "$(GREEN)✓ All required tools are installed$(NC)"

#==============================================================================
# Installation
#==============================================================================

install: check-tools ## Install all dependencies (TypeScript + Python)
	@echo "$(BLUE)Installing TypeScript dependencies...$(NC)"
	@pnpm install
	@echo "$(BLUE)Installing Python dependencies...$(NC)"
	@uv sync
	@echo "$(GREEN)✓ Installation complete$(NC)"

setup: install ## Alias for install (deprecated, use 'make install')
	@echo "$(YELLOW)'make setup' is deprecated. Use 'make install' instead.$(NC)"

#==============================================================================
# Database
#==============================================================================

db-web-local: ## Setup/migrate local D1 database for web app
	@echo "$(BLUE)Setting up local D1 database for web...$(NC)"
	@cd apps/web && pnpm db:migrate:local

db-sync-local: ## Setup/migrate local D1 database for sync server
	@echo "$(BLUE)Setting up local D1 database for sync server...$(NC)"
	@cd apps/loro-sync-server && pnpm db:migrate:local

db-local: db-web-local db-sync-local ## Setup all local D1 databases

#==============================================================================
# Development Servers
#==============================================================================

dev-web: ## Start frontend development server
	@echo "$(BLUE)Starting frontend on http://localhost:3000...$(NC)"
	@cd apps/web && HTTP_PROXY=$(HTTP_PROXY) HTTPS_PROXY=$(HTTPS_PROXY) NO_PROXY=$(NO_PROXY) pnpm dev

dev-api: ## Start backend (FastAPI) development server
	@echo "$(BLUE)Starting backend on http://localhost:8888...$(NC)"
	@HTTP_PROXY=$(HTTP_PROXY) HTTPS_PROXY=$(HTTPS_PROXY) NO_PROXY=$(NO_PROXY) PYTHONPATH=apps/api/src uv run python -m uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8888

dev-sync: db-sync-local ## Start Loro sync server (Durable Objects)
	@echo "$(BLUE)Starting sync server on http://localhost:8787...$(NC)"
	@cd apps/loro-sync-server && HTTP_PROXY=$(HTTP_PROXY) HTTPS_PROXY=$(HTTPS_PROXY) NO_PROXY=$(NO_PROXY) pnpm dev

dev-gateway: ## Start auth gateway
	@echo "$(BLUE)Starting auth gateway on http://localhost:8788...$(NC)"
	@cd apps/auth-gateway && HTTP_PROXY=$(HTTP_PROXY) HTTPS_PROXY=$(HTTPS_PROXY) NO_PROXY=$(NO_PROXY) pnpm dev

#==============================================================================
# Combined Development
#==============================================================================

dev: ## Start frontend + backend in parallel
	@echo "$(BLUE)Starting development environment...$(NC)"
	@echo "$(GREEN)Frontend:$(NC) http://localhost:3000"
	@echo "$(GREEN)Backend:$(NC)  http://localhost:8888"
	@echo ""
	@$(MAKE) -j2 dev-web dev-api

dev-collab: ## Start frontend + sync server (for collaborative editing)
	@echo "$(BLUE)Starting collaborative development environment...$(NC)"
	@echo "$(GREEN)Frontend:$(NC) http://localhost:3000"
	@echo "$(GREEN)Sync:$(NC)     http://localhost:8787 (ws: /sync/:projectId)"
	@echo ""
	@$(MAKE) -j2 dev-web dev-sync

dev-full: ## Start all services: frontend + backend + sync
	@echo "$(BLUE)Starting full development environment...$(NC)"
	@echo "$(GREEN)Frontend:$(NC) http://localhost:3000"
	@echo "$(GREEN)Backend:$(NC)  http://localhost:8888"
	@echo "$(GREEN)Sync:$(NC)     http://localhost:8787 (ws: /sync/:projectId)"
	@echo ""
	@$(MAKE) -j3 dev-web dev-api dev-sync

dev-gateway-full: ## Start all services behind auth gateway (recommended for production-like setup)
	@echo "$(BLUE)Starting full environment with API Gateway...$(NC)"
	@echo ""
	@echo "   ┌─────────────────────────────────────────────┐"
	@echo "   │  $(GREEN)Auth Gateway:$(NC) http://localhost:8788        │"
	@echo "   │  ├─ /          → Frontend (:3000)          │"
	@echo "   │  ├─ /sync/*    → Loro Sync (:8787)         │"
	@echo "   │  ├─ /api/chat  → Python API (:8888)        │"
	@echo "   │  └─ /assets/*  → R2 Assets                 │"
	@echo "   └─────────────────────────────────────────────┘"
	@echo ""
	@HTTP_PROXY=$(HTTP_PROXY) HTTPS_PROXY=$(HTTPS_PROXY) NO_PROXY=$(NO_PROXY) $(MAKE) -j4 dev-sync dev-web dev-api dev-gateway

#==============================================================================
# Build & Test
#==============================================================================

build: check-tools ## Build all packages
	@echo "$(BLUE)Building TypeScript packages...$(NC)"
	@pnpm turbo run build
	@echo "$(BLUE)Verifying Python packages...$(NC)"
	@uv run pytest --collect-only

test: check-tools ## Run all tests
	@echo "$(BLUE)Running TypeScript tests...$(NC)"
	@pnpm turbo run test
	@echo "$(BLUE)Running Python tests...$(NC)"
	@uv run pytest

test-web: ## Run frontend tests only
	@echo "$(BLUE)Running frontend tests...$(NC)"
	@cd apps/web && pnpm test

test-api: ## Run backend tests only
	@echo "$(BLUE)Running backend tests...$(NC)"
	@uv run pytest

#==============================================================================
# Code Quality
#==============================================================================

lint: check-tools ## Lint all code
	@echo "$(BLUE)Linting TypeScript...$(NC)"
	@pnpm turbo run lint
	@echo "$(BLUE)Linting Python...$(NC)"
	@uv run ruff check .

lint-web: ## Lint frontend only
	@echo "$(BLUE)Linting frontend...$(NC)"
	@cd apps/web && pnpm lint

lint-api: ## Lint backend only
	@echo "$(BLUE)Linting backend...$(NC)"
	@uv run ruff check apps/api

format: check-tools ## Format all code
	@echo "$(BLUE)Formatting TypeScript...$(NC)"
	@pnpm prettier --write "**/*.{ts,tsx,json,md}"
	@echo "$(BLUE)Formatting Python...$(NC)"
	@uv run ruff format .

format-check: ## Check if code is formatted (CI use)
	@echo "$(BLUE)Checking TypeScript formatting...$(NC)"
	@pnpm prettier --check "**/*.{ts,tsx,json,md}"
	@echo "$(BLUE)Checking Python formatting...$(NC)"
	@uv run ruff format --check .

#==============================================================================
# Cleanup
#==============================================================================

clean: ## Clean all build artifacts and dependencies
	@echo "$(BLUE)Cleaning TypeScript artifacts...$(NC)"
	@pnpm clean || true
	@rm -rf node_modules .turbo
	@rm -f apps/web/local.db*
	@rm -f apps/loro-sync-server/local.db*
	@echo "$(BLUE)Cleaning Python artifacts...$(NC)"
	@rm -rf .venv uv.lock
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean ## Clean everything including all .wrangler directories
	@echo "$(BLUE)Cleaning Wrangler caches...$(NC)"
	@find . -type d -name ".wrangler" -exec rm -rf {} + 2>/dev/null || true
	@echo "$(GREEN)✓ Deep cleanup complete$(NC)"

#==============================================================================
# Utilities
#==============================================================================

deps-tree: ## Show dependency tree for all packages
	@echo "$(BLUE)TypeScript dependencies:$(NC)"
	@pnpm list --depth 0
	@echo ""
	@echo "$(BLUE)Python dependencies:$(NC)"
	@uv pip list

update-deps: ## Update all dependencies
	@echo "$(BLUE)Updating TypeScript dependencies...$(NC)"
	@pnpm update --latest
	@echo "$(BLUE)Updating Python dependencies...$(NC)"
	@uv sync --upgrade

info: ## Show project information
	@echo "$(BLUE)Master Clash - Project Information$(NC)"
	@echo ""
	@echo "Project Root: $(shell pwd)"
	@echo "Git Branch: $$(git branch --show-current 2>/dev/null || echo 'Not a git repo')"
	@echo "Git Status: $$(git status --short 2>/dev/null | wc -l | tr -d ' ') files modified"
	@echo ""
	@echo "$(BLUE)Node Version:$(NC) $$(node --version 2>/dev/null || echo 'Not installed')"
	@echo "$(BLUE)PNPM Version:$(NC) $$(pnpm --version 2>/dev/null || echo 'Not installed')"
	@echo "$(BLUE)Python Version:$(NC) $$(python --version 2>/dev/null || echo 'Not installed')"
	@echo "$(BLUE)UV Version:$(NC) $$(uv --version 2>/dev/null || echo 'Not installed')"
	@echo ""
	@echo "$(BLUE)Environment:$(NC)"
	@echo "  HTTP_PROXY=$(HTTP_PROXY)"
	@echo "  HTTPS_PROXY=$(HTTPS_PROXY)"
	@echo "  NO_PROXY=$(NO_PROXY)"
