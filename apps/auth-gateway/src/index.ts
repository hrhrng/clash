/**
 * Auth Gateway - API Gateway Pattern
 * 
 * Single entry point for all services:
 * - /health       → Health check (public)
 * - /assets/*     → R2 assets via Loro Sync (public)
 * - /sync/*       → Loro Sync WebSocket (auth required)
 * - /api/chat/*   → Python API (auth required)
 * - /*            → Frontend (public)
 */

import type { Env } from "./types";
import { assertProjectOwner, getUserIdFromBetterAuth } from "./auth";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withUserHeader(headers: Headers, userId: string): Headers {
  const next = new Headers(headers);
  next.set("x-user-id", userId);
  return next;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // === Public Routes ===

    // Health check
    if (path === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Assets: /assets/* -> Loro Sync /assets/*
    if (path.startsWith("/assets/")) {
      return env.LORO_SYNC.fetch(request);
    }

    // === Authenticated Routes ===

    // WebSocket Sync: /sync/:projectId -> Loro Sync Server
    if (path.startsWith("/sync/")) {
      const projectId = path.split("/")[2];
      if (!projectId) return new Response("Missing project ID", { status: 400 });

      const userId = await getUserIdFromBetterAuth(request, env);
      if (!userId) return new Response("Unauthorized", { status: 401 });

      try {
        await assertProjectOwner(env, projectId, userId);
      } catch {
        return new Response("Forbidden", { status: 403 });
      }

      return env.LORO_SYNC.fetch(request);
    }

    // Python API: /api/chat/* -> Backend
    if (path.startsWith("/api/chat/")) {
      if (!env.BACKEND_API_URL) {
        return json({ error: "BACKEND_API_URL is not configured" }, 500);
      }

      const userId = await getUserIdFromBetterAuth(request, env);
      if (!userId) return json({ error: "Unauthorized" }, 401);

      // Forward to Python API
      const restPath = path.replace("/api/chat", "");
      const upstreamUrl = new URL(env.BACKEND_API_URL);
      upstreamUrl.pathname = restPath;
      upstreamUrl.search = url.search;

      const headers = withUserHeader(request.headers, userId);
      headers.delete("host");

      const upstreamRequest = new Request(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });

      return fetch(upstreamRequest);
    }

    // Loro Sync API routes: /api/generate/*, /upload/*, /tasks/*
    if (
      path.startsWith("/api/generate/") ||
      path.startsWith("/upload/") ||
      path.startsWith("/tasks/") ||
      path.startsWith("/webhooks/")
    ) {
      return env.LORO_SYNC.fetch(request);
    }

    // === Frontend (fallback) ===

    // All other routes -> Frontend
    if (env.FRONTEND) {
      return env.FRONTEND.fetch(request);
    }

    // Local development: proxy to Next.js dev server
    if (env.FRONTEND_URL) {
      const upstreamUrl = new URL(env.FRONTEND_URL);
      upstreamUrl.pathname = path;
      upstreamUrl.search = url.search;

      const headers = new Headers(request.headers);
      headers.delete("host");

      const upstreamRequest = new Request(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });

      return fetch(upstreamRequest);
    }

    return new Response("Frontend not configured", { status: 500 });
  },
};
