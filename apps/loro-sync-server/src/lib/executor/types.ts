/**
 * Executor type definitions
 * Abstracts different task completion modes: sync, polling, webhook
 */

/**
 * Task completion mode
 */
export type CompletionMode = 'sync' | 'polling' | 'webhook' | 'hybrid';

/**
 * External service identifiers
 */
export type ExternalService = 'gemini' | 'kling' | 'runway' | 'suno';

/**
 * Execution result returned by executors
 */
export interface ExecutionResult {
  /** Whether the task has completed (success or failure) */
  completed: boolean;
  
  /** External task ID for polling/webhook tracking */
  externalTaskId?: string;
  
  /** External service name */
  externalService?: ExternalService;
  
  /** Result URL (e.g., generated image/video URL) */
  resultUrl?: string;
  
  /** Additional result data */
  resultData?: Record<string, unknown>;
  
  /** Error message if failed */
  error?: string;
  
  /** Generated description of the asset */
  description?: string;
}

/**
 * Base executor interface
 */
export interface BaseExecutor {
  /** Service name */
  readonly serviceName: ExternalService;
  
  /** Completion mode */
  readonly completionMode: CompletionMode;
}

/**
 * Sync executor - returns result immediately
 */
export interface SyncExecutor extends BaseExecutor {
  readonly completionMode: 'sync';
  
  /** Execute task and return result immediately */
  execute(params: Record<string, unknown>): Promise<ExecutionResult>;
}

/**
 * Polling executor - submit task, then poll for result
 */
export interface PollingExecutor extends BaseExecutor {
  readonly completionMode: 'polling';
  
  /** Submit task to external service */
  submit(params: Record<string, unknown>): Promise<ExecutionResult>;
  
  /** Poll task status from external service */
  poll(externalTaskId: string): Promise<ExecutionResult>;
}

/**
 * Webhook executor - submit task, result delivered via callback
 */
export interface WebhookExecutor extends BaseExecutor {
  readonly completionMode: 'webhook';
  
  /** Submit task to external service */
  submit(params: Record<string, unknown>): Promise<ExecutionResult>;
  
  /** Process webhook callback from external service */
  processWebhook(payload: unknown): Promise<ExecutionResult>;
}

/**
 * Hybrid executor - supports multiple completion modes
 */
export interface HybridExecutor extends BaseExecutor {
  readonly completionMode: 'hybrid';
  
  /** Submit task */
  submit(params: Record<string, unknown>): Promise<ExecutionResult>;
  
  /** Poll task status (optional) */
  poll?(externalTaskId: string): Promise<ExecutionResult>;
  
  /** Process webhook callback (optional) */
  processWebhook?(payload: unknown): Promise<ExecutionResult>;
}

/**
 * Union type for all executor types
 */
export type TaskExecutor = SyncExecutor | PollingExecutor | WebhookExecutor | HybridExecutor;

/**
 * Task types supported by the system
 */
export type TaskType = 
  | 'gemini_image'      // Gemini image generation
  | 'kling_video'       // Kling video generation
  | 'runway_video'      // Runway video generation (future)
  | 'suno_audio'        // Suno audio generation (future)
  | 'nano_banana'       // Legacy: Gemini image
  | 'nano_banana_pro';  // Legacy: Gemini image pro

/**
 * Executor constructor options
 */
export interface ExecutorOptions {
  apiKey?: string;
  apiUrl?: string;
  projectId?: string;
  location?: string;
  clientEmail?: string;
  privateKey?: string;
  accessKey?: string;
  secretKey?: string;
}
