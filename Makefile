.PHONY: install dev dev-web dev-api dev-sync dev-gateway dev-collab dev-full db-web-local db-sync-local build test lint clean format setup

# 安装所有依赖
install:
	@echo "Installing TypeScript dependencies..."
	pnpm install
	@echo "Installing Python dependencies..."
	uv sync

# 启动前端开发服务器
dev-web: db-web-local
	@echo "Starting frontend..."
	cd apps/web && pnpm dev

# 启动后端开发服务器
dev-api:
	@echo "Starting backend..."
	PYTHONPATH=apps/api/src uv run python -m uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8000

# 启动协作同步服务（Durable Object, 本地可直接跑，无需网关）
dev-sync: db-sync-local
	@echo "Starting loro sync server..."
	cd apps/loro-sync-server && pnpm dev

# 启动鉴权网关（生产建议用；本地一般不需要）
dev-gateway:
	@echo "Starting auth gateway..."
	cd apps/auth-gateway && pnpm dev

# 本地数据库迁移（Web: sqlite）
db-web-local:
	@echo "Migrating web local sqlite..."
	cd apps/web && pnpm db:bootstrap:local

# 本地数据库迁移（Sync: D1 local）
db-sync-local:
	@echo "Migrating sync server local D1..."
	cd apps/loro-sync-server && pnpm db:migrate:local

# 同时启动前后端（使用并行执行）
dev:
	@echo "Starting all services..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000"
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
	@echo "Backend:  http://localhost:8000"
	@echo "Sync:     http://localhost:8787 (ws: /sync/:projectId)"
	@$(MAKE) -j3 dev-web dev-api dev-sync

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
	@echo "Cleaning Python..."
	rm -rf .venv uv.lock
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

# 开发环境设置
setup: install
	@echo "Monorepo setup complete!"
	@echo "Run 'make dev' to start development servers"
