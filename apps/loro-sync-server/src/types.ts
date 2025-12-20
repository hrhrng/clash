/**
 * Cloudflare Worker Environment bindings
 */
export interface Env {
  // Durable Object bindings
  LORO_ROOM: DurableObjectNamespace;
  TASK_DO: DurableObjectNamespace;

  // D1 Database binding
  DB: D1Database;

  // R2 bucket for generated assets
  ASSETS: R2Bucket;

  // R2 public URL prefix (e.g., 'https://pub-xxx.r2.dev')
  // Required for Vertex AI to access uploaded assets
  R2_PUBLIC_URL?: string;

  // Environment variables
  ENVIRONMENT?: string;
  JWT_SECRET?: string;
  BETTER_AUTH_ORIGIN?: string;
  BETTER_AUTH_BASE_PATH?: string;

  // AIGC Service API credentials
  KLING_ACCESS_KEY?: string;
  KLING_SECRET_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string; // Cloudflare AI Gateway URL for Gemini
  
  // GCP Vertex AI credentials (service account)
  GCP_SERVICE_ACCOUNT_JSON?: string;
  GCP_PROJECT_ID?: string;
  GCP_LOCATION?: string; // e.g., 'us-central1'
  GCP_CLIENT_EMAIL?: string; // Service account email
  GCP_PRIVATE_KEY?: string; // Service account private key
}

/**
 * Hono context variables for middleware
 */
export interface HonoVariables {
  requestId: string;
}

/**
 * JWT Payload for authentication
 */
export interface JWTPayload {
  sub: string;        // User ID
  projectId: string;  // Project ID
  iat?: number;       // Issued at
  exp?: number;       // Expiration
}

/**
 * Auth result from onAuth hook
 */
export interface AuthResult {
  userId: string;
  projectId: string;
}

/**
 * Snapshot data from D1
 */
export interface SnapshotData {
  project_id: string;
  snapshot: ArrayBuffer;
  version: number;
  updated_at: number;
}

/**
 * AIGC Task types
 */
export type TaskType = 'kling_video' | 'nano_banana' | 'nano_banana_pro';
export type TaskStatus = 'generating' | 'completed' | 'failed';
export type ExternalService = 'kling' | 'gemini';

/**
 * AIGC Task stored in D1
 */
export interface AIGCTask {
  task_id: string;
  project_id: string;
  task_type: TaskType;
  status: TaskStatus;
  external_task_id?: string;
  external_service?: ExternalService;
  params: string; // JSON string
  result_url?: string;
  result_data?: string; // JSON string
  error_message?: string;
  created_at: number;
  updated_at: number;
  completed_at?: number;
  retry_count: number;
  max_retries: number;
}

/**
 * Task submission payload
 */
export interface SubmitTaskRequest {
  project_id: string;
  task_type: TaskType;
  params: Record<string, any>;
}

/**
 * Task submission response
 */
export interface SubmitTaskResponse {
  task_id: string;
  status: TaskStatus;
  created_at: number;
}
