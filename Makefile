.PHONY: install dev dev-web dev-api dev-sync dev-gateway dev-collab dev-full build test lint clean format setup db-web-local db-sync-local

# 安装所有依赖
install:
	@echo "Installing TypeScript dependencies..."
	pnpm install
	@echo "Installing Python dependencies..."
	uv sync

# 启动前端开发服务器 (with proxy for D1 network access)
dev-web:
	@echo "Starting frontend..."
	cd apps/web && HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1 pnpm dev

# 启动后端开发服务器 (with proxy for network access)
dev-api:
	@echo "Starting backend..."
	HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1 PYTHONPATH=apps/api/src uv run python -m uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8888

# 启动协作同步服务（Durable Object, with proxy for D1/R2 network access）
dev-sync: db-sync-local
	@echo "Starting loro sync server..."
	cd apps/loro-sync-server && HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1 pnpm dev

# 启动鉴权网关（生产建议用；with proxy for D1 network access）
dev-gateway:
	@echo "Starting auth gateway..."
	cd apps/auth-gateway && HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1 pnpm dev



# 数据库工具 (Local D1 for Web & Sync)
db-web-local:
	cd apps/web && pnpm db:migrate:local

db-sync-local:
	cd apps/loro-sync-server && pnpm db:migrate:local


# 同时启动前后端（使用并行执行）
dev:
	@echo "Starting all services..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8888"
	@$(MAKE) -j2 dev-web dev-api

# 前端 + 同步服务（协作开发最常用）
dev-collab:
	@echo "Starting services..."
	@echo "Frontend: http://localhost:3000"
	@echo "Sync:     http://localhost:8787 (ws: /sync/:projectId)"
	@$(MAKE) -j2 dev-web dev-sync

# 前端 + 后端 + 同步服务（全量本地）
dev-full:
	@echo "Starting services..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8888"
	@echo "Sync:     http://localhost:8787 (ws: /sync/:projectId)"
	@$(MAKE) -j3 dev-web dev-api dev-sync

# 最佳实践：通过 Auth Gateway 统一入口
# Gateway: http://localhost:8788 -> Frontend/API/Sync
dev-gateway-full:
	@echo "Starting services (API Gateway pattern)..."
	@echo ""
	@echo "   ┌─────────────────────────────────────────────┐"
	@echo "   │  Auth Gateway: http://localhost:8788        │"
	@echo "   │  ├─ /          → Frontend (:3000)          │"
	@echo "   │  ├─ /sync/*    → Loro Sync (:8787)         │"
	@echo "   │  ├─ /api/chat  → Python API (:8888)        │"
	@echo "   │  └─ /assets/*  → R2 Assets                 │"
	@echo "   └─────────────────────────────────────────────┘"
	@echo ""
	@HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1 $(MAKE) -j4 dev-sync dev-web dev-api dev-gateway

# 构建所有包
build:
	@echo "Building TypeScript packages..."
	pnpm turbo run build
	@echo "Verifying Python packages..."
	uv run pytest --collect-only || true

# 运行所有测试
test:
	@echo "Testing TypeScript packages..."
	pnpm turbo run test
	@echo "Testing Python packages..."
	uv run pytest || true

# Lint 所有代码
lint:
	@echo "Linting TypeScript..."
	pnpm turbo run lint
	@echo "Linting Python..."
	uv run ruff check .

# 格式化所有代码
format:
	@echo "Formatting TypeScript..."
	pnpm prettier --write "**/*.{ts,tsx,json,md}"
	@echo "Formatting Python..."
	uv run ruff format .

# 清理所有构建产物和依赖
clean:
	@echo "Cleaning TypeScript..."
	pnpm clean || true
	rm -rf node_modules .turbo
	rm -f apps/web/local.db*
	@echo "Cleaning Python..."
	rm -rf .venv uv.lock
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

# 开发环境设置
setup: install
	@echo "Monorepo setup complete!"
	@echo "Run 'make dev' to start development servers"
