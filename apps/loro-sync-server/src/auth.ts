import type { AuthResult, Env, JWTPayload } from './types';

/**
 * Verify JWT token using Web Crypto API
 * Note: This is a simplified version. In production, use a proper JWT library
 * or implement full JWT verification with crypto.subtle
 */
export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload> {
  try {
    // Parse JWT (format: header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode payload (base64url)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // TODO: In production, verify signature using crypto.subtle
    // For now, we'll just validate the payload structure
    if (!payload.sub || !payload.projectId) {
      throw new Error('Invalid JWT payload: missing required fields');
    }

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new Error('JWT token expired');
    }

    return payload as JWTPayload;
  } catch (error) {
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract token from WebSocket request
 */
export function extractTokenFromRequest(request: Request): string | null {
  // Try query parameter first
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token');
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  // Try Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

type BetterAuthGetSessionResponse =
  | {
      session: unknown;
      user: { id: string } & Record<string, unknown>;
    }
  | null;

async function getBetterAuthSession(request: Request, env: Env): Promise<BetterAuthGetSessionResponse> {
  const cookie = request.headers.get('cookie') ?? '';
  const authorization = request.headers.get('authorization') ?? '';

  if (!cookie && !authorization) return null;

  const origin = env.BETTER_AUTH_ORIGIN ?? new URL(request.url).origin;
  const basePath = env.BETTER_AUTH_BASE_PATH ?? '/api/better-auth';
  const sessionUrl = new URL(`${origin}${basePath}/get-session`);

  const res = await fetch(sessionUrl.toString(), {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
      accept: 'application/json',
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== 'object') return null;

  const maybeUser = (data as any).user;
  if (!maybeUser || typeof maybeUser !== 'object') return null;

  const id = (maybeUser as any).id;
  if (typeof id !== 'string' || id.length === 0) return null;

  return data as BetterAuthGetSessionResponse;
}

async function assertProjectOwner(env: Env, projectId: string, userId: string): Promise<void> {
  // Only enforce when we have a DB binding available (production).
  if (!env.DB) return;

  const { results } = await env.DB
    .prepare('SELECT owner_id FROM project WHERE id = ? LIMIT 1')
    .bind(projectId)
    .all();

  const ownerId = (results?.[0] as any)?.owner_id as string | null | undefined;
  if (!ownerId || ownerId !== userId) {
    throw new Error('Forbidden');
  }
}

export async function authenticateRequest(request: Request, env: Env, projectId: string): Promise<AuthResult> {
  const session = await getBetterAuthSession(request, env);
  if (session?.user?.id) {
    if (env.ENVIRONMENT !== 'development') {
      await assertProjectOwner(env, projectId, session.user.id);
    }
    return { userId: session.user.id, projectId };
  }

  const token = extractTokenFromRequest(request);
  if (token && env.JWT_SECRET) {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload.projectId !== projectId) {
      throw new Error('Project ID mismatch');
    }
    if (env.ENVIRONMENT !== 'development') {
      await assertProjectOwner(env, projectId, payload.sub);
    }
    return { userId: payload.sub, projectId: payload.projectId };
  }

  if (env.ENVIRONMENT === 'development') {
    return { userId: 'dev-user', projectId };
  }

  throw new Error('Unauthorized');
}
