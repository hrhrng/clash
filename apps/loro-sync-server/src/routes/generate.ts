import { Hono } from 'hono';
import type { Env } from '../types';
import { createExecutorFactory } from '../lib/executor';

const generateRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/generate/image
 * Image generation via Gemini
 */
generateRoutes.post('/image', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    system_prompt?: string;
    aspect_ratio?: string;
    base64_images?: string[];
    reference_image_urls?: string[];
  }>();

  if (!body.prompt) {
    return c.json({ error: 'Missing required field: prompt' }, 400);
  }

  const factory = createExecutorFactory(c.env);
  const executor = factory.getExecutor('nano_banana');

  if (!executor) {
    return c.json({ error: 'Gemini executor not available' }, 500);
  }

  // Call execute for sync executor or submit for others
  const result = 'execute' in executor 
    ? await executor.execute({
        text: body.prompt,
        system_prompt: body.system_prompt || '',
        base64_images: body.base64_images || [],
        reference_image_urls: body.reference_image_urls || [],
        aspect_ratio: body.aspect_ratio || '16:9',
      })
    : await (executor as any).submit({
        text: body.prompt,
        system_prompt: body.system_prompt || '',
        base64_images: body.base64_images || [],
        reference_image_urls: body.reference_image_urls || [],
        aspect_ratio: body.aspect_ratio || '16:9',
      });

  if (result.error) {
    return c.json({ error: result.error }, 500);
  }

  const taskId = `img_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  return c.json({
    task_id: taskId,
    base64: result.resultData?.base64,
    url: result.resultUrl,
    model: 'gemini-2.5-flash-image',
  });
});

/**
 * POST /api/generate/video
 * Video generation via Kling
 */
generateRoutes.post('/video', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    base64_images?: string[];
    reference_image_urls?: string[];
    duration?: number;
    cfg_scale?: number;
  }>();

  if (!body.reference_image_urls?.length && !body.base64_images?.length) {
    return c.json({ error: 'Video generation requires at least one image' }, 400);
  }

  const factory = createExecutorFactory(c.env);
  const executor = factory.getExecutor('kling_video');

  if (!executor) {
    return c.json({ error: 'Kling executor not available' }, 500);
  }

  const result = 'submit' in executor
    ? await executor.submit({
        prompt: body.prompt || '',
        image_path: body.reference_image_urls?.[0] || '',
        tail_image_url: body.reference_image_urls?.[1],
        duration: body.duration || 5,
        cfg_scale: body.cfg_scale || 0.5,
      })
    : { completed: true, error: 'Executor does not support submit' };

  if (result.error) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({
    task_id: result.externalTaskId,
    duration: body.duration || 5,
  });
});

export { generateRoutes };
