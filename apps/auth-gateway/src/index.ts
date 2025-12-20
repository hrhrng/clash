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

    if (url.pathname === "/health") return new Response("OK", { status: 200 });

    // WebSocket Sync: /sync/:projectId -> service binding to loro-sync-server (which hosts DO)
    if (url.pathname.startsWith("/sync/")) {
      const projectId = url.pathname.split("/")[2];
      if (!projectId) return new Response("Missing project ID", { status: 400 });

      const userId = await getUserIdFromBetterAuth(request, env);
      if (!userId) return new Response("Unauthorized", { status: 401 });

      try {
        await assertProjectOwner(env, projectId, userId);
      } catch {
        return new Response("Forbidden", { status: 403 });
      }

      // Forward to the DO worker via service binding. Keep cookies so the downstream can optionally double-check.
      const upstreamUrl = new URL(request.url);
      upstreamUrl.host = "loro-sync-server";
      const upstreamRequest = new Request(upstreamUrl.toString(), request);
      return env.LORO_SYNC.fetch(upstreamRequest);
    }

    // Backend proxy: /api/backend/* -> {BACKEND_API_URL}/*
    if (url.pathname.startsWith("/api/backend/")) {
      if (!env.BACKEND_API_URL) return json({ error: "BACKEND_API_URL is not configured" }, 500);

      const userId = await getUserIdFromBetterAuth(request, env);
      if (!userId) return json({ error: "Unauthorized" }, 401);

      const restPath = url.pathname.replace("/api/backend", "");
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

    return new Response("Not Found", { status: 404 });
  },
};

