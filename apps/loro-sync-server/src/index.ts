import { app } from './app';
import { LoroRoom } from './LoroRoom';
import type { Env } from './types';

/**
 * Main Worker handler
 * Routes WebSocket requests to Durable Objects, all other requests to Hono
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket endpoint: /sync/:projectId
    // Route directly to Durable Object
    if (url.pathname.startsWith('/sync/')) {
      const projectId = url.pathname.split('/')[2];
      if (!projectId) {
        return new Response('Missing project ID', { status: 400 });
      }

      // Get Durable Object instance for this project
      const id = env.LORO_ROOM.idFromName(projectId);
      const stub = env.LORO_ROOM.get(id);

      // Forward request to Durable Object
      return stub.fetch(request);
    }

    // All other requests go through Hono
    return app.fetch(request, env);
  },
};

// Export Durable Object classes
export { LoroRoom };
