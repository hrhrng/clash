import type { Env, ExternalService } from './types';
import { createLogger, type Logger } from './lib/logger';
import { createExecutorFactory, type ExecutionResult } from './executors';

/**
 * Task state stored in Durable Object storage
 */
interface TaskState {
  projectId: string;
  nodeId: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  executorType: string;
  externalTaskId?: string;
  externalService?: ExternalService;
  params: Record<string, unknown>;
  resultUrl?: string;
  resultData?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * TaskDO - Durable Object for managing individual AIGC tasks
 * 
 * ID scheme: "{projectId}:{nodeId}"
 * 
 * Responsibilities:
 * - Store task state
 * - Execute task via appropriate executor
 * - Poll external services using alarms
 * - Notify LoroRoom on completion
 */
export class TaskDO {
  private state: DurableObjectState;
  private env: Env;
  private logger: Logger;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.logger = createLogger('TaskDO');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/submit':
          return this.handleSubmit(request);
        case '/status':
          return this.handleStatus();
        case '/webhook':
          return this.handleWebhook(request);
        case '/cancel':
          return this.handleCancel();
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      this.logger.error('Request handling failed', error as Error);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Submit a new task
   */
  private async handleSubmit(request: Request): Promise<Response> {
    const body = await request.json() as {
      projectId: string;
      nodeId: string;
      executorType: string;
      params: Record<string, unknown>;
    };

    // Check if task already exists
    const existingTask = await this.state.storage.get<TaskState>('task');
    if (existingTask && existingTask.status === 'generating') {
      this.logger.warn('Task already in progress', { 
        taskId: `${body.projectId}:${body.nodeId}` 
      });
      return Response.json({ 
        error: 'Task already in progress',
        status: existingTask.status,
      }, { status: 409 });
    }

    const now = Date.now();
    const task: TaskState = {
      projectId: body.projectId,
      nodeId: body.nodeId,
      status: 'pending',
      executorType: body.executorType,
      params: body.params,
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    };

    await this.state.storage.put('task', task);
    this.logger.info('Task submitted', { 
      projectId: body.projectId, 
      nodeId: body.nodeId,
      executorType: body.executorType,
    });

    // Execute task
    await this.executeTask(task);

    // Fetch updated state
    const updatedTask = await this.state.storage.get<TaskState>('task');

    return Response.json({
      status: updatedTask?.status,
      externalTaskId: updatedTask?.externalTaskId,
    });
  }

  /**
   * Get current task status
   */
  private async handleStatus(): Promise<Response> {
    const task = await this.state.storage.get<TaskState>('task');
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    return Response.json({
      status: task.status,
      resultUrl: task.resultUrl,
      resultData: task.resultData,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    });
  }

  /**
   * Handle webhook callback from external service
   */
  private async handleWebhook(request: Request): Promise<Response> {
    const task = await this.state.storage.get<TaskState>('task');
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    const payload = await request.json();
    const factory = createExecutorFactory(this.env as any);
    const executor = factory.getExecutor(task.executorType as any);

    if (!executor) {
      return Response.json({ error: 'Executor not found' }, { status: 500 });
    }

    const result = await executor.processWebhook(payload);
    await this.handleExecutionResult(task, result);

    return Response.json({ success: true });
  }

  /**
   * Cancel a running task
   */
  private async handleCancel(): Promise<Response> {
    const task = await this.state.storage.get<TaskState>('task');
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }

    await this.state.storage.put('task', {
      ...task,
      status: 'failed',
      error: 'Cancelled by user',
      updatedAt: Date.now(),
    } as TaskState);

    // Clear any pending alarms
    await this.state.storage.deleteAlarm();

    return Response.json({ success: true });
  }

  /**
   * Execute task using appropriate executor
   */
  private async executeTask(task: TaskState): Promise<void> {
    const factory = createExecutorFactory(this.env as any);
    const executor = factory.getExecutor(task.executorType as any);

    if (!executor) {
      this.logger.error('Executor not found', undefined, { 
        executorType: task.executorType 
      });
      await this.state.storage.put('task', {
        ...task,
        status: 'failed',
        error: `Executor not found: ${task.executorType}`,
        updatedAt: Date.now(),
      } as TaskState);
      return;
    }

    try {
      // Update status to generating
      await this.state.storage.put('task', {
        ...task,
        status: 'generating',
        updatedAt: Date.now(),
      } as TaskState);

      const result = await executor.submit(task.params as Record<string, any>);
      await this.handleExecutionResult(task, result);
    } catch (error) {
      this.logger.error('Task execution failed', error as Error);
      await this.state.storage.put('task', {
        ...task,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: task.retryCount + 1,
        updatedAt: Date.now(),
      } as TaskState);
    }
  }

  /**
   * Handle execution result (sync or async)
   */
  private async handleExecutionResult(
    task: TaskState,
    result: ExecutionResult
  ): Promise<void> {
    const now = Date.now();

    if (result.completed) {
      if (result.error) {
        // Task failed
        await this.state.storage.put('task', {
          ...task,
          status: 'failed',
          error: result.error,
          updatedAt: now,
          completedAt: now,
        } as TaskState);
        this.logger.info('Task failed', { 
          nodeId: task.nodeId, 
          error: result.error 
        });
      } else {
        // Task succeeded
        await this.state.storage.put('task', {
          ...task,
          status: 'completed',
          resultUrl: result.result_url,
          resultData: result.result_data,
          updatedAt: now,
          completedAt: now,
        } as TaskState);
        this.logger.info('Task completed', { 
          nodeId: task.nodeId, 
          resultUrl: result.result_url,
        });
      }

      // Notify LoroRoom
      await this.notifyLoroRoom(task, result);
    } else {
      // Async task - store external task ID and schedule polling
      await this.state.storage.put('task', {
        ...task,
        status: 'generating',
        externalTaskId: result.external_task_id,
        externalService: result.external_service as ExternalService,
        updatedAt: now,
      } as TaskState);

      // Schedule polling alarm in 10 seconds
      await this.state.storage.setAlarm(now + 10_000);
      this.logger.info('Task polling scheduled', { 
        nodeId: task.nodeId, 
        externalTaskId: result.external_task_id,
      });
    }
  }

  /**
   * Alarm handler - poll external service for task status
   */
  async alarm(): Promise<void> {
    const task = await this.state.storage.get<TaskState>('task');
    if (!task || task.status !== 'generating' || !task.externalTaskId) {
      return;
    }

    this.logger.info('Polling task', { 
      nodeId: task.nodeId, 
      externalTaskId: task.externalTaskId,
    });

    const factory = createExecutorFactory(this.env as any);
    const executor = task.externalService 
      ? factory.getExecutorByService(task.externalService)
      : factory.getExecutor(task.executorType as any);

    if (!executor) {
      this.logger.error('Executor not found for polling');
      return;
    }

    try {
      const result = await executor.poll(task.externalTaskId);

      if (result.completed) {
        await this.handleExecutionResult(task, result);
      } else if (result.error) {
        // Polling error - increment retry count
        const newRetryCount = task.retryCount + 1;
        if (newRetryCount >= task.maxRetries) {
          await this.state.storage.put('task', {
            ...task,
            status: 'failed',
            error: `Max retries exceeded: ${result.error}`,
            retryCount: newRetryCount,
            updatedAt: Date.now(),
          } as TaskState);
          await this.notifyLoroRoom(task, { completed: true, error: result.error });
        } else {
          await this.state.storage.put('task', {
            ...task,
            retryCount: newRetryCount,
            updatedAt: Date.now(),
          } as TaskState);
          // Exponential backoff: 10s, 20s, 40s...
          await this.state.storage.setAlarm(Date.now() + 10_000 * Math.pow(2, newRetryCount));
        }
      } else {
        // Still processing - continue polling
        await this.state.storage.put('task', {
          ...task,
          updatedAt: Date.now(),
        } as TaskState);
        await this.state.storage.setAlarm(Date.now() + 10_000);
      }
    } catch (error) {
      this.logger.error('Polling failed', error as Error);
      // Schedule retry with backoff
      const newRetryCount = task.retryCount + 1;
      if (newRetryCount < task.maxRetries) {
        await this.state.storage.put('task', {
          ...task,
          retryCount: newRetryCount,
          updatedAt: Date.now(),
        } as TaskState);
        await this.state.storage.setAlarm(Date.now() + 10_000 * Math.pow(2, newRetryCount));
      }
    }
  }

  /**
   * Notify LoroRoom of task completion
   */
  private async notifyLoroRoom(
    task: TaskState,
    result: ExecutionResult
  ): Promise<void> {
    try {
      const id = this.env.LORO_ROOM.idFromName(task.projectId);
      const stub = this.env.LORO_ROOM.get(id);

      await stub.fetch(
        new Request('http://internal/task-completed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: task.nodeId,
            status: result.error ? 'failed' : 'completed',
            resultUrl: result.result_url,
            resultData: result.result_data,
            error: result.error,
          }),
        })
      );

      this.logger.info('LoroRoom notified', { 
        projectId: task.projectId, 
        nodeId: task.nodeId,
      });
    } catch (error) {
      this.logger.error('Failed to notify LoroRoom', error as Error);
    }
  }
}
