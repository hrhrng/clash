import { Hono } from 'hono';
import type { Env, AIGCTask, SubmitTaskRequest } from '../types';
import { submitTask, getTask, updateTaskStatus } from '../tasks';
import { createExecutorFactory } from '../lib/executor';

const taskRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /tasks
 * Submit a new AIGC task
 */
taskRoutes.post('/', async (c) => {
  const body = await c.req.json<SubmitTaskRequest>();

  if (!body.project_id || !body.task_type || !body.params) {
    return c.json(
      { error: 'Missing required fields: project_id, task_type, params' },
      400
    );
  }

  // Create task record in D1
  const task = await submitTask(c.env.DB, body);

  // Get executor for this task type
  const factory = createExecutorFactory(c.env);
  const executor = factory.getExecutor(body.task_type);

  if (!executor) {
    await updateTaskStatus(c.env.DB, task.task_id, 'failed', {
      error_message: `No executor found for task type: ${body.task_type}`,
    });
    return c.json({ error: `Unsupported task type: ${body.task_type}` }, 400);
  }

  // Execute task via executor
  const executionResult = 'execute' in executor
    ? await executor.execute(body.params)
    : 'submit' in executor
    ? await executor.submit(body.params)
    : { completed: true, error: 'Executor not supported' };

  if (executionResult.completed) {
    if (executionResult.error) {
      await updateTaskStatus(c.env.DB, task.task_id, 'failed', {
        error_message: executionResult.error,
      });
    } else {
      await updateTaskStatus(c.env.DB, task.task_id, 'completed', {
        result_url: executionResult.resultUrl,
        result_data: executionResult.resultData as Record<string, any>,
        external_service: executionResult.externalService,
      });

      // Broadcast completion to Loro Room
      const id = c.env.LORO_ROOM.idFromName(body.project_id);
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
  } else {
    // Asynchronous task - will be polled by Durable Object alarm
    await updateTaskStatus(c.env.DB, task.task_id, 'generating', {
      external_task_id: executionResult.externalTaskId,
      external_service: executionResult.externalService,
    });

    // Trigger task polling alarm
    const id = c.env.LORO_ROOM.idFromName(body.project_id);
    const stub = c.env.LORO_ROOM.get(id);
    await stub.fetch(
      new Request('http://internal/trigger-task-polling', {
        method: 'POST',
      })
    );
  }

  return c.json(
    {
      task_id: task.task_id,
      status: task.status,
      created_at: task.created_at,
    },
    201
  );
});

/**
 * GET /tasks/:taskId
 * Get task status
 */
taskRoutes.get('/:taskId', async (c) => {
  const taskId = c.req.param('taskId');

  const task = await getTask(c.env.DB, taskId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(task);
});

export { taskRoutes };
