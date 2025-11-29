.PHONY: help setup dev dev-frontend dev-backend build clean install test db-setup db-migrate docker-build

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Master Clash - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Complete project setup (dependencies, env files, database)
	@echo "$(BLUE)Setting up Master Clash...$(NC)"
	@node scripts/setup.js

install: ## Install all dependencies
	@echo "$(BLUE)Installing root dependencies...$(NC)"
	npm install
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && npm install
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	cd backend && uv sync --all-groups
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

dev: ## Start both frontend and backend in development mode
	@echo "$(BLUE)Starting development servers...$(NC)"
	npm run dev

dev-frontend: ## Start only frontend development server
	@echo "$(BLUE)Starting frontend (Next.js)...$(NC)"
	cd frontend && npm run dev

dev-backend: ## Start only backend development server
	@echo "$(BLUE)Starting backend (FastAPI)...$(NC)"
	cd backend && make dev

build: ## Build both frontend and backend for production
	@echo "$(BLUE)Building frontend...$(NC)"
	cd frontend && npm run pages:build
	@echo "$(BLUE)Building backend...$(NC)"
	cd backend && docker build -t master-clash-backend:latest .
	@echo "$(GREEN)✓ Build complete$(NC)"

db-setup: ## Create and setup local D1 database
	@echo "$(BLUE)Creating D1 database...$(NC)"
	cd frontend && wrangler d1 create clash-flow-db
	@echo "$(YELLOW)Copy the database_id to frontend/wrangler.toml$(NC)"

db-migrate: ## Run database migrations locally
	@echo "$(BLUE)Running D1 migrations...$(NC)"
	cd frontend && wrangler d1 migrations apply clash-flow-db --local
	@echo "$(GREEN)✓ Migrations applied$(NC)"

db-migrate-prod: ## Run database migrations in production
	@echo "$(BLUE)Running D1 migrations (production)...$(NC)"
	cd frontend && wrangler d1 migrations apply clash-flow-db
	@echo "$(GREEN)✓ Production migrations applied$(NC)"

db-console: ## Open D1 database console
	@echo "$(BLUE)Opening D1 console...$(NC)"
	cd frontend && wrangler d1 console clash-flow-db --local

test: ## Run all tests (frontend + backend)
	@echo "$(BLUE)Running frontend tests...$(NC)"
	cd frontend && npm test
	@echo "$(BLUE)Running backend tests...$(NC)"
	cd backend && make test
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-frontend: ## Run frontend tests only
	cd frontend && npm test

test-backend: ## Run backend tests only
	cd backend && make test

lint: ## Lint all code (frontend + backend)
	@echo "$(BLUE)Linting frontend...$(NC)"
	cd frontend && npm run lint
	@echo "$(BLUE)Linting backend...$(NC)"
	cd backend && make lint
	@echo "$(GREEN)✓ Linting complete$(NC)"

format: ## Format all code (frontend + backend)
	@echo "$(BLUE)Formatting frontend...$(NC)"
	cd frontend && npm run format
	@echo "$(BLUE)Formatting backend...$(NC)"
	cd backend && make format
	@echo "$(GREEN)✓ Formatting complete$(NC)"

docker-build: ## Build backend Docker image
	@echo "$(BLUE)Building Docker image...$(NC)"
	cd backend && docker build -t master-clash-backend:latest .
	@echo "$(GREEN)✓ Docker image built$(NC)"

docker-run: ## Run backend Docker container
	@echo "$(BLUE)Running Docker container...$(NC)"
	cd backend && docker run -d -p 8000:8000 --env-file .env master-clash-backend:latest

deploy-frontend: ## Deploy frontend to Cloudflare Pages
	@echo "$(BLUE)Deploying frontend to Cloudflare Pages...$(NC)"
	cd frontend && wrangler pages deploy

deploy: ## Deploy both frontend and backend
	@echo "$(BLUE)Deploying frontend...$(NC)"
	cd frontend && wrangler pages deploy
	@echo "$(YELLOW)For backend deployment, see DEPLOYMENT.md$(NC)"

clean: ## Clean build artifacts and caches
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	rm -rf frontend/node_modules frontend/.next frontend/.wrangler frontend/out
	rm -rf backend/.venv backend/__pycache__ backend/.pytest_cache backend/.ruff_cache
	rm -rf node_modules
	@echo "$(GREEN)✓ Cleaned$(NC)"

logs-frontend: ## Show frontend logs (Cloudflare Pages)
	cd frontend && wrangler pages deployment tail

logs-backend: ## Show backend logs (Cloudflare Worker)
	wrangler tail master-clash-backend

status: ## Check project status
	@echo "$(BLUE)=== Master Clash Status ===$(NC)"
	@echo ""
	@echo "Frontend:"
	@cd frontend && npm list --depth=0 2>/dev/null | head -1 || echo "  $(YELLOW)Not installed$(NC)"
	@echo ""
	@echo "Backend:"
	@cd backend && uv pip list 2>/dev/null | head -5 || echo "  $(YELLOW)Not installed$(NC)"
	@echo ""
	@echo "Database:"
	@cd frontend && wrangler d1 list 2>/dev/null | grep clash-flow-db && echo "  $(GREEN)✓ D1 configured$(NC)" || echo "  $(YELLOW)Not configured$(NC)"

# Quick shortcuts
s: setup ## Shortcut for setup
d: dev ## Shortcut for dev
b: build ## Shortcut for build
t: test ## Shortcut for test
