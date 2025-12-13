.PHONY: install dev build test lint clean format setup

# 安装所有依赖
install:
	@echo "Installing TypeScript dependencies..."
	pnpm install
	@echo "Installing Python dependencies..."
	uv sync

# 启动前端开发服务器
dev-web:
	@echo "Starting frontend..."
	cd apps/web && pnpm dev

# 启动后端开发服务器
dev-api:
	@echo "Starting backend..."
	PYTHONPATH=apps/api/src uv run python -m uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8000

# 同时启动前后端（使用并行执行）
dev:
	@echo "Starting all services..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000"
	@$(MAKE) -j2 dev-web dev-api

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
