import { Hono } from 'hono';
import type { Env, AIGCTask } from '../types';
import type { ExternalService } from '../lib/executor';
import { updateTaskStatus } from '../tasks';
import { createExecutorFactory } from '../lib/executor';

const webhookRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /webhooks/:service
 * Handle webhook callbacks from external services (e.g., Kling)
 */
webhookRoutes.post('/:service', async (c) => {
  const service = c.req.param('service') as ExternalService;
  const body = await c.req.json<any>();

  // TODO: Verify webhook signature for security

  const externalTaskId = body.task_id || body.id;
  if (!externalTaskId) {
    return c.json({ error: 'Missing task_id in webhook payload' }, 400);
  }

  // Find task by external_task_id
  const { results } = await c.env.DB
    .prepare('SELECT * FROM aigc_tasks WHERE external_task_id = ? AND external_service = ?')
    .bind(externalTaskId, service)
    .all<AIGCTask>();

  if (!results || results.length === 0) {
    return c.json({ error: 'Task not found for external_task_id' }, 404);
  }

  const task = results[0];

  // Get executor for this service
  const factory = createExecutorFactory(c.env);
  const executor = factory.getExecutorByService(service);

  if (!executor || !('processWebhook' in executor)) {
    return c.json({ error: `No executor found for service: ${service}` }, 400);
  }

  // Process webhook via executor
  const executionResult = await executor.processWebhook!(body);

  if (executionResult.completed) {
    if (executionResult.error) {
      await updateTaskStatus(c.env.DB, task.task_id, 'failed', {
        error_message: executionResult.error,
      });
    } else {
      await updateTaskStatus(c.env.DB, task.task_id, 'completed', {
        result_url: executionResult.resultUrl,
        result_data: executionResult.resultData as Record<string, any>,
      });

      // Broadcast completion to Loro Room
      const id = c.env.LORO_ROOM.idFromName(task.project_id);
      const stub = c.env.LORO_ROOM.get(id);
      await stub.fetch(
        new Request('http://internal/broadcast-task', {
          method: 'POST',
          body: JSON.stringify({
            task_id: task.task_id,
            result_url: executionResult.resultUrl,
            result_data: executionResult.resultData,
          }),
        })
      );
    }
  }

  return c.json({ success: true });
});

export { webhookRoutes };
