import type { AIGCTask, TaskStatus, SubmitTaskRequest } from './types';

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task_${Date.now()}_${crypto.randomUUID()}`;
}

/**
 * Submit a new AIGC task to D1
 */
/**
 * Submit a new AIGC task to D1
 */
export async function submitTask(
  db: D1Database,
  request: SubmitTaskRequest & {
    taskId?: string;
    external_task_id?: string;
    external_service?: string;
    status?: TaskStatus;
  }
): Promise<AIGCTask> {
  const taskId = request.taskId || generateTaskId();
  const now = Date.now();

  const task: AIGCTask = {
    task_id: taskId,
    project_id: request.project_id,
    task_type: request.task_type,
    status: request.status || 'generating',
    params: JSON.stringify(request.params),
    external_task_id: request.external_task_id,
    external_service: request.external_service as any,
    created_at: now,
    updated_at: now,
    retry_count: 0,
    max_retries: 3,
  };

  await db
    .prepare(
      `INSERT INTO aigc_tasks (
        task_id, project_id, task_type, status, params,
        external_task_id, external_service,
        created_at, updated_at, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      task.task_id,
      task.project_id,
      task.task_type,
      task.status,
      task.params,
      task.external_task_id || null,
      task.external_service || null,
      task.created_at,
      task.updated_at,
      task.retry_count,
      task.max_retries
    )
    .run();

  console.log(`Task submitted: ${taskId}`);
  return task;
}

/**
 * Get task by ID
 */
export async function getTask(
  db: D1Database,
  taskId: string
): Promise<AIGCTask | null> {
  const result = await db
    .prepare('SELECT * FROM aigc_tasks WHERE task_id = ?')
    .bind(taskId)
    .first<AIGCTask>();

  return result || null;
}

/**
 * Get all pending/processing tasks for a project
 */
export async function getPendingTasks(
  db: D1Database,
  projectId: string
): Promise<AIGCTask[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM aigc_tasks
       WHERE project_id = ?
       AND status IN ('generating', 'pending', 'processing')
       ORDER BY created_at ASC`
    )
    .bind(projectId)
    .all<AIGCTask>();

  console.log(`[getPendingTasks] Project: ${projectId}, Results: ${results?.length || 0}`);
  if (results?.length === 0) {
     const check = await db.prepare("SELECT status FROM aigc_tasks WHERE project_id = ?").bind(projectId).all();
     console.log(`[getPendingTasks] All status for project: ${JSON.stringify(check.results)}`);
  }

  return results || [];
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  db: D1Database,
  taskId: string,
  status: TaskStatus,
  updates: {
    external_task_id?: string;
    external_service?: string;
    result_url?: string;
    result_data?: Record<string, any>;
    error_message?: string;
  } = {}
): Promise<void> {
  const now = Date.now();
  const completedAt = status === 'completed' || status === 'failed' ? now : undefined;

  const fields: string[] = ['status = ?', 'updated_at = ?'];
  const values: any[] = [status, now];

  if (completedAt) {
    fields.push('completed_at = ?');
    values.push(completedAt);
  }

  if (updates.external_task_id) {
    fields.push('external_task_id = ?');
    values.push(updates.external_task_id);
  }

  if (updates.external_service) {
    fields.push('external_service = ?');
    values.push(updates.external_service);
  }

  if (updates.result_url) {
    fields.push('result_url = ?');
    values.push(updates.result_url);
  }

  if (updates.result_data) {
    fields.push('result_data = ?');
    values.push(JSON.stringify(updates.result_data));
  }

  if (updates.error_message) {
    fields.push('error_message = ?');
    values.push(updates.error_message);
  }

  values.push(taskId);

  await db
    .prepare(`UPDATE aigc_tasks SET ${fields.join(', ')} WHERE task_id = ?`)
    .bind(...values)
    .run();

  console.log(`Task ${taskId} updated to ${status}`);
}

/**
 * Increment retry count (used for errors)
 */
export async function incrementRetry(
  db: D1Database,
  taskId: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE aigc_tasks
       SET retry_count = retry_count + 1, updated_at = ?
       WHERE task_id = ?`
    )
    .bind(Date.now(), taskId)
    .run();
}

/**
 * Touch task (update updated_at without incrementing retry)
 * Used for healthy pending tasks
 */
export async function touchTask(
  db: D1Database,
  taskId: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE aigc_tasks
       SET updated_at = ?
       WHERE task_id = ?`
    )
    .bind(Date.now(), taskId)
    .run();
}

/**
 * Get all tasks that need polling
 * (pending or processing, not exceeded max retries, not timed out)
 */
export async function getTasksForPolling(
  db: D1Database,
  projectId: string
): Promise<AIGCTask[]> {
  // Timeout: 2 hours (7200000 ms)
  const timeoutThreshold = Date.now() - 7200000;

  const { results } = await db
    .prepare(
      `SELECT * FROM aigc_tasks
       WHERE project_id = ?
       AND status IN ('generating', 'pending', 'processing')
       AND retry_count < max_retries
       AND created_at > ?
       ORDER BY created_at ASC
       LIMIT 50`
    )
    .bind(projectId, timeoutThreshold)
    .all<AIGCTask>();

  console.log(`[getTasksForPolling] Project: ${projectId}, Threshold: ${timeoutThreshold}, Results: ${results?.length || 0}`);
  if (results?.length === 0) {
      // Debug: check if any tasks exist at all for this project regardless of status
      const allTasks = await db.prepare('SELECT count(*) as count, status FROM aigc_tasks WHERE project_id = ? GROUP BY status').bind(projectId).all();
      console.log('[getTasksForPolling] Task counts by status:', JSON.stringify(allTasks.results));
  }
  
  return results || [];
}
