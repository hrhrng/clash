import { Hono } from 'hono';
import type { Env } from '../types';
import { getAssetUrl } from '../utils';

const thumbnailRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /thumbnails/*
 * Generate or serve thumbnail for video assets
 *
 * For now, this is a simple implementation that returns the original video
 * and relies on the browser to extract the first frame using #t=0.1
 *
 * Future enhancements:
 * - Server-side frame extraction
 * - Cloudflare Stream integration
 * - Media Transformations API
 */
thumbnailRoutes.get('/*', async (c) => {
  const path = c.req.path;
  const objectKey = path.startsWith('/thumbnails/')
    ? path.slice('/thumbnails/'.length)
    : path.slice(1);

  console.log(`[Thumbnails] GET path='${path}' resolvedKey='${objectKey}'`);

  if (!objectKey) {
    return c.text('Missing asset key', 400);
  }

  // Check if a pre-generated thumbnail exists
  const thumbnailKey = objectKey.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg');
  const thumbnailObject = await c.env.ASSETS.get(`thumbnails/${thumbnailKey}`);

  if (thumbnailObject) {
    console.log(`[Thumbnails] Found cached thumbnail: thumbnails/${thumbnailKey}`);
    const contentType = thumbnailObject.httpMetadata?.contentType || 'image/jpeg';

    return new Response(thumbnailObject.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // No thumbnail found - for now, return a placeholder or the original video
  // In production, you would:
  // 1. Extract first frame from video
  // 2. Generate thumbnail using external service
  // 3. Cache the result in R2

  console.log(`[Thumbnails] No cached thumbnail found for ${objectKey}, falling back to original asset`);

  // Fallback: return original video (browser will handle with #t=0.1)
  const object = await c.env.ASSETS.get(objectKey);
  if (!object) {
    return c.text('Asset not found', 404);
  }

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

export { thumbnailRoutes };
