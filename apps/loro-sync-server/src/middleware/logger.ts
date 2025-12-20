import { createMiddleware } from 'hono/factory';
import type { Env, HonoVariables } from '../types';

/**
 * Structured logger middleware
 * Adds requestId and logs request/response info in JSON format for Logpush
 */
export const loggerMiddleware = () => {
  return createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(async (c, next) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();
    
    // Set requestId for use in handlers
    c.set('requestId', requestId);
    
    // Log request
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      requestId,
      type: 'request',
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
    }));

    await next();

    // Log response
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      requestId,
      type: 'response',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: `${Date.now() - start}ms`,
    }));
  });
};
