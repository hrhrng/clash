import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, HonoVariables } from './types';
import { generateRoutes } from './routes/generate';
import { assetRoutes } from './routes/assets';
import { thumbnailRoutes } from './routes/thumbnails';
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
// Note: Task execution has been migrated to Python API
// Tasks are submitted via NodeProcessor -> Python API /api/tasks/submit
app.route('/api/generate', generateRoutes);
app.route('/upload', assetRoutes);
app.route('/assets', assetRoutes);
app.route('/thumbnails', thumbnailRoutes);

export { app };
