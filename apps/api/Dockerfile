# syntax=docker/dockerfile:1

# Build stage: Install dependencies
FROM python:3.11-slim as builder

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies into /app/.venv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Copy application code
COPY . .

# Install the project
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ==============================================================================
# Runtime stage: Create minimal production image
# ==============================================================================
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    # Application defaults (can be overridden)
    ENVIRONMENT=production \
    DEBUG=false \
    LOG_LEVEL=INFO

# Install runtime dependencies (if any)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app /app/output /app/assets && \
    chown -R appuser:appuser /app

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv

# Copy application code
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Create necessary directories
RUN mkdir -p /app/output /app/assets

# Health check for FastAPI server
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8888/health || exit 1

# Expose port for FastAPI
EXPOSE 8888

# Default command: Run FastAPI server with uvicorn
CMD ["uvicorn", "master_clash.api.main:app", "--host", "0.0.0.0", "--port", "8888"]

# ==============================================================================
# Usage Examples:
# ==============================================================================
#
# Build:
#   docker build -t master-clash:latest .
#
# Run with environment variables:
#   docker run -d \
#     -e OPENAI_API_KEY=sk-xxx \
#     -e ENVIRONMENT=production \
#     -v $(pwd)/output:/app/output \
#     -v $(pwd)/assets:/app/assets \
#     master-clash:latest
#
# Run with .env file (NOT recommended for production):
#   docker run -d \
#     --env-file .env.production \
#     -v $(pwd)/output:/app/output \
#     master-clash:latest
#
# Run interactively:
#   docker run -it --rm \
#     -e OPENAI_API_KEY=sk-xxx \
#     master-clash:latest bash
#
# ==============================================================================
