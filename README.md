# Master Clash

AI-powered video production platform with multi-agent orchestration.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start all services (API Gateway pattern - recommended)
make dev-gateway-full
```

Entry point: **http://localhost:8788** (Auth Gateway)

## Architecture

```
用户 → Auth Gateway (:8788)
          │
          ├─ /             → Frontend (Next.js :3000)
          ├─ /sync/*       → Loro Sync (Durable Object :8787)
          ├─ /api/chat/*   → Python API (FastAPI :8000)
          ├─ /assets/*     → R2 Storage
          └─ /api/generate → Loro Sync (AIGC Tasks)
          
          ┌───────────────────────────────────────────────────────┐
          │                     Storage Layer                     │
          ├─────────────┬─────────────┬─────────────┬────────────┤
          │     D1      │     R2      │    Loro     │  AI APIs   │
          │   (SQLite)  │  (Assets)   │   (CRDT)    │ (Gemini/   │
          │             │             │             │  Kling)    │
          └─────────────┴─────────────┴─────────────┴────────────┘
```

## Project Structure

```
master-clash/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # Python FastAPI backend
│   │   └── src/master_clash/
│   │       ├── loro_sync/      # Loro CRDT client
│   │       ├── workflow/       # LangGraph agents + tools
│   │       └── tools/          # AI tools (Kling, Gemini)
│   ├── loro-sync-server/       # Cloudflare Durable Object
│   │   └── src/
│   │       ├── generators/     # Image/Video generation
│   │       ├── polling/        # Task polling
│   │       └── processors/     # Node processing
│   └── auth-gateway/           # Authentication
├── packages/
│   ├── shared-types/           # Shared TypeScript/Python types
│   │   ├── src/                # Zod schemas
│   │   └── python/             # Generated Python types
│   └── remotion-*/             # Video components
└── Makefile                    # Dev commands
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TailwindCSS, React Flow |
| Backend | Python 3.12, FastAPI, LangGraph, LangChain |
| Sync | Loro CRDT, Cloudflare Durable Objects |
| Database | Cloudflare D1 (SQLite), R2 (Storage) |
| AI | Google Gemini, Kling AI |
| Auth | Better Auth |

## Development

### Prerequisites

- Node.js 20+, pnpm
- Python 3.12+, uv
- Wrangler CLI

### Commands

```bash
# Full stack development
make dev-full

# Individual services
make dev-api        # Python API only
make dev-sync       # Loro sync server only

# Type checking
pnpm --filter loro-sync-server tsc --noEmit
uv run ruff check apps/api/

# Generate shared Python types
pnpm --filter @clash/shared-types generate:python
```

### Environment Variables

Copy `.env.example` files and configure:

| Service | File | Key Variables |
|---------|------|---------------|
| API | `apps/api/.env` | `GOOGLE_API_KEY`, `KLING_*` |
| Sync | `apps/loro-sync-server/.dev.vars` | `WORKER_PUBLIC_URL`, `GCP_*` |
| Web | `apps/web/.env.local` | `DATABASE_URL`, `AUTH_*` |

## Deployment

### Cloudflare Workers (Sync Server)

```bash
cd apps/loro-sync-server
wrangler deploy
```

Set secrets:
```bash
wrangler secret put GCP_PROJECT_ID
wrangler secret put WORKER_PUBLIC_URL  # Your deployed worker URL
```

### Python API (Container)

```bash
cd apps/api
docker build -t master-clash-api .
# Deploy to your container platform
```

## License

MIT
