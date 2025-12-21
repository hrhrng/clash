import { Hono } from 'hono';
import type { Env } from '../types';
import { getAssetUrl } from '../utils';

const assetRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /upload
 * Upload files to R2 storage
 */
assetRoutes.post('/', async (c) => {
  const formData = await c.req.formData();
  const fileEntry = formData.get('file');
  const projectId = formData.get('projectId') as string;

  if (!fileEntry || typeof fileEntry === 'string' || !projectId) {
    return c.json({ error: 'Missing file or projectId' }, 400);
  }

  const file = fileEntry as File;

  // Generate storage key
  const timestamp = Date.now();
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `projects/${projectId}/assets/${timestamp}-${sanitizedFileName}`;

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await c.env.ASSETS.put(objectKey, arrayBuffer, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
  });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    type: 'upload',
    objectKey,
    size: arrayBuffer.byteLength,
  }));

  const assetUrl = getAssetUrl(c.env, objectKey);

  return c.json({
    storageKey: objectKey,
    url: assetUrl,
  });
});

/**
 * GET /assets/*
 * Serve files from R2 storage
 */
assetRoutes.get('/*', async (c) => {
  // Remove leading '/assets/' to get the object key
  const path = c.req.path;
  const objectKey = path.startsWith('/assets/') 
    ? path.slice('/assets/'.length) 
    : path.slice(1);

  console.log(`[Assets] GET path='${path}' resolvedKey='${objectKey}'`);

  if (!objectKey) {
    return c.text('Missing asset key', 400);
  }

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

export { assetRoutes };
