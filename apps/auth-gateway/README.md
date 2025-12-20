# Auth Gateway Worker

Single entry-point worker that:

- Validates Better Auth session via `GET /api/better-auth/get-session`
- Enforces `project.owner_id` authorization (single-user: only access your own projects)
- Proxies:
  - `GET/WS /sync/:projectId` → `loro-sync-server` (service binding)
  - `HTTP /api/backend/*` → `BACKEND_API_URL` (Cloudflare Container)

## Required bindings

- D1: `DB` (same database as `apps/web` and `apps/loro-sync-server`)
- Service binding: `LORO_SYNC` → `loro-sync-server`

## Env vars

- `BETTER_AUTH_BASE_PATH` (default `/api/better-auth`)
- `BETTER_AUTH_ORIGIN` (optional, only if Better Auth is on a different origin)
- `BACKEND_API_URL` (required if using `/api/backend/*` proxy)

## Cloudflare Routes (recommended)

Use the same hostname and route different paths to different workers:

- `https://your-domain.example/*` → OpenNext worker (`apps/web`)
- `https://your-domain.example/sync/*` → `auth-gateway`
- `https://your-domain.example/api/backend/*` → `auth-gateway`

Keep `/api/better-auth/*` routed to the OpenNext worker so the gateway can call it without routing loops.

