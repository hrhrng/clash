import type { Env } from '../../types';
import { ExecutorRegistry } from './registry';
import { GeminiExecutor } from './gemini';
import { KlingExecutor } from './kling';
import type { TaskType, ExternalService, TaskExecutor, ExecutionResult } from './types';

export type { ExecutionResult, TaskType, ExternalService, TaskExecutor };

/**
 * Create executor registry with all registered executors
 */
export function createExecutorRegistry(env: Env): ExecutorRegistry {
  const registry = new ExecutorRegistry();

  // Register Gemini executor (sync)
  const geminiExecutor = new GeminiExecutor({
    projectId: env.GCP_PROJECT_ID,
    location: env.GCP_LOCATION,
    clientEmail: env.GCP_CLIENT_EMAIL,
    privateKey: env.GCP_PRIVATE_KEY,
  });
  
  registry.register('gemini_image', geminiExecutor);
  registry.register('nano_banana', geminiExecutor);      // Legacy
  registry.register('nano_banana_pro', geminiExecutor);  // Legacy

  // Register Kling executor (polling)
  const klingExecutor = new KlingExecutor({
    accessKey: env.KLING_ACCESS_KEY,
    secretKey: env.KLING_SECRET_KEY,
  });
  
  registry.register('kling_video', klingExecutor);

  return registry;
}

/**
 * Legacy factory function for backward compatibility
 * TODO: Migrate callers to use createExecutorRegistry directly
 */
export function createExecutorFactory(env: Env): {
  getExecutor: (taskType: TaskType) => TaskExecutor | undefined;
  getExecutorByService: (service: ExternalService) => TaskExecutor | undefined;
} {
  const registry = createExecutorRegistry(env);

  return {
    getExecutor: (taskType: TaskType) => registry.get(taskType),
    getExecutorByService: (service: ExternalService) => registry.getByService(service),
  };
}
