export interface Env {
  // D1 Database for project ownership checks
  DB: D1Database;

  // Service Bindings
  LORO_SYNC: Fetcher;   // loro-sync-server
  FRONTEND?: Fetcher;   // Next.js frontend (production)

  // URL-based proxies (local development)
  BACKEND_API_URL?: string;   // Python API (e.g., http://localhost:8000)
  FRONTEND_URL?: string;      // Frontend (e.g., http://localhost:3000)

  // Better Auth config
  BETTER_AUTH_ORIGIN?: string;
  BETTER_AUTH_BASE_PATH?: string;
}
