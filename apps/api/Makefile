.PHONY: help install dev format lint lint-fix typecheck test test-cov clean all check docker-build docker-run

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install:  ## Install all dependencies including dev tools
	uv sync --all-groups

dev:  ## Run FastAPI development server
	uv run uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8888

format:  ## Format code with ruff
	uv run ruff format .

lint:  ## Run linting checks
	uv run ruff check .

lint-fix:  ## Run linting with auto-fix
	uv run ruff check . --fix

typecheck:  ## Run type checking with mypy
	uv run mypy src/master_clash

test:  ## Run tests
	uv run pytest

test-cov:  ## Run tests with coverage report
	uv run pytest --cov --cov-report=html --cov-report=term

docker-build:  ## Build Docker image
	docker build -t master-clash-backend:latest .

docker-run:  ## Run Docker container
	docker run -d -p 8888:8888 --env-file .env master-clash-backend:latest

clean:  ## Clean up build artifacts and cache
	rm -rf build/ dist/ *.egg-info .pytest_cache .coverage htmlcov/ .ruff_cache .mypy_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

all: format lint typecheck test  ## Run all checks

check: lint typecheck test  ## Run all checks without formatting
