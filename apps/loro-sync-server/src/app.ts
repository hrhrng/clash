import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, HonoVariables } from './types';
import { generateRoutes } from './routes/generate';
import { taskRoutes } from './routes/tasks';
import { webhookRoutes } from './routes/webhooks';
import { assetRoutes } from './routes/assets';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/error-handler';

// Create Hono app with environment bindings and variables
const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Global middleware
app.use('*', cors());
app.use('*', loggerMiddleware());
app.onError(errorHandler);

// Health check
app.get('/health', (c) => c.text('OK'));

// Route mounting
app.route('/api/generate', generateRoutes);
app.route('/tasks', taskRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/upload', assetRoutes);
app.route('/assets', assetRoutes);

export { app };
