# Master Clash API

Python backend service for Master Clash AI video production platform.

## Structure

```
src/master_clash/
├── api/              # FastAPI app + endpoints
├── loro_sync/        # Loro CRDT client (WebSocket)
│   ├── connection.py # WebSocket management
│   ├── nodes.py      # Node CRUD operations
│   ├── edges.py      # Edge CRUD operations
│   └── client.py     # Main client class
├── workflow/         # LangGraph multi-agent system
│   ├── middleware.py # Agent middleware
│   └── tools/        # Individual tools
│       ├── list_nodes.py
│       ├── create_node.py
│       ├── generation_node.py
│       └── ...
└── tools/            # AI service integrations
    ├── kling_video.py
    ├── nano_banana.py
    └── description.py
```

## Quick Start

```bash
# Install dependencies
uv sync

# Run development server
make dev

# Run with full stack
cd ../.. && make dev-full
```

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# AI Services
GOOGLE_API_KEY=...
KLING_ACCESS_KEY=...
KLING_SECRET_KEY=...

# Loro Sync
LORO_SYNC_URL=ws://localhost:8787

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
```

## API Endpoints

- `POST /chat/completions` - Chat with agent
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc

## Development

```bash
# Lint
uv run ruff check .

# Format
uv run ruff format .

# Type check
uv run mypy src/
```

## Shared Types

Import types from the shared package:

```python
from clash_types import CanvasNode, CanvasEdge, AIGCTask
```

Regenerate types when Zod schemas change:

```bash
pnpm --filter @clash/shared-types generate:python
```
