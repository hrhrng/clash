import type { TaskExecutor, TaskType, ExternalService } from './types';

/**
 * Executor Registry
 * Manages registration and lookup of task executors
 */
export class ExecutorRegistry {
  private executors: Map<TaskType, TaskExecutor> = new Map();
  private serviceToExecutor: Map<ExternalService, TaskExecutor> = new Map();

  /**
   * Register an executor for a task type
   */
  register(taskType: TaskType, executor: TaskExecutor): this {
    this.executors.set(taskType, executor);
    this.serviceToExecutor.set(executor.serviceName, executor);
    return this;
  }

  /**
   * Get executor by task type
   */
  get(taskType: TaskType): TaskExecutor | undefined {
    return this.executors.get(taskType);
  }

  /**
   * Get executor by service name (for webhook processing)
   */
  getByService(serviceName: ExternalService): TaskExecutor | undefined {
    return this.serviceToExecutor.get(serviceName);
  }

  /**
   * Check if a task type is supported
   */
  has(taskType: TaskType): boolean {
    return this.executors.has(taskType);
  }

  /**
   * List all registered task types
   */
  listTaskTypes(): TaskType[] {
    return Array.from(this.executors.keys());
  }

  /**
   * List all registered services
   */
  listServices(): ExternalService[] {
    return Array.from(this.serviceToExecutor.keys());
  }
}

/**
 * Global executor registry instance
 */
export const executorRegistry = new ExecutorRegistry();
