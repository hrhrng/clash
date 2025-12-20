import type { ErrorHandler } from 'hono';
import type { Env, HonoVariables } from '../types';

/**
 * Global error handler
 * Catches all unhandled errors and returns structured JSON response
 */
export const errorHandler: ErrorHandler<{ Bindings: Env; Variables: HonoVariables }> = (err, c) => {
  const requestId = c.get('requestId') || 'unknown';
  
  // Log error
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    requestId,
    type: 'error',
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  }));

  // Return JSON error response
  return c.json(
    {
      error: err.message || 'Internal Server Error',
      requestId,
    },
    500
  );
};
