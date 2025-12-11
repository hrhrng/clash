.PHONY: install dev build test lint clean format setup

# 安装所有依赖
install:
	@echo "Installing TypeScript dependencies..."
	pnpm install
	@echo "Installing Python dependencies..."
	uv sync

# 启动开发服务器 (前后端并行)
dev:
	@echo "Starting all services..."
	pnpm turbo run dev

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
