import type { Env } from "./types";

type BetterAuthGetSessionResponse =
  | {
      session: unknown;
      user: { id: string } & Record<string, unknown>;
    }
  | null;

export async function getUserIdFromBetterAuth(request: Request, env: Env): Promise<string | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!cookie && !authorization) return null;

  const origin = env.BETTER_AUTH_ORIGIN ?? new URL(request.url).origin;
  const basePath = env.BETTER_AUTH_BASE_PATH ?? "/api/better-auth";
  const sessionUrl = new URL(`${origin}${basePath}/get-session`);

  const res = await fetch(sessionUrl.toString(), {
    method: "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
      accept: "application/json",
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as unknown as BetterAuthGetSessionResponse;
  return data?.user?.id ?? null;
}

export async function assertProjectOwner(env: Env, projectId: string, userId: string): Promise<void> {
  const { results } = await env.DB.prepare("SELECT owner_id FROM project WHERE id = ? LIMIT 1")
    .bind(projectId)
    .all();

  const ownerId = (results?.[0] as any)?.owner_id as string | null | undefined;
  if (!ownerId || ownerId !== userId) {
    throw new Error("Forbidden");
  }
}

