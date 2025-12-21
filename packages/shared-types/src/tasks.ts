/**
 * Task Types - Zod schemas for AIGC task management
 * 
 * Atomic tasks are executed by Python API synchronously.
 * Orchestration (retry, sequencing) is handled by Durable Objects.
 */

import { z } from 'zod';

// =============================================================================
// Atomic Task Types (executed by Python API)
// =============================================================================

export const AtomicTaskTypeSchema = z.enum([
  'image_gen',   // Generate image with Gemini
  'video_gen',   // Generate video with Kling
  'description', // Generate description for asset
]);
export type AtomicTaskType = z.infer<typeof AtomicTaskTypeSchema>;

// === Image Generation Params ===
export const ImageGenParamsSchema = z.object({
  prompt: z.string(),
  model: z.string().default('gemini-2.0-flash-preview-image-generation'),
  aspect_ratio: z.string().optional(),
});
export type ImageGenParams = z.infer<typeof ImageGenParamsSchema>;

// === Video Generation Params ===
export const VideoGenParamsSchema = z.object({
  prompt: z.string(),
  image_r2_key: z.string(), // Source image R2 key
  duration: z.number().default(5),
  model: z.string().default('kling-v1'),
});
export type VideoGenParams = z.infer<typeof VideoGenParamsSchema>;

// === Description Generation Params ===
export const DescriptionParamsSchema = z.object({
  r2_key: z.string(),
  mime_type: z.string(),
});
export type DescriptionParams = z.infer<typeof DescriptionParamsSchema>;

// === Discriminated Union for Atomic Task Request ===
export const AtomicTaskRequestSchema = z.discriminatedUnion('task_type', [
  z.object({ task_type: z.literal('image_gen'), params: ImageGenParamsSchema }),
  z.object({ task_type: z.literal('video_gen'), params: VideoGenParamsSchema }),
  z.object({ task_type: z.literal('description'), params: DescriptionParamsSchema }),
]);
export type AtomicTaskRequest = z.infer<typeof AtomicTaskRequestSchema>;

// === Atomic Task Result (from Python API) ===
export const AtomicTaskResultSchema = z.object({
  success: z.boolean(),
  r2_key: z.string().optional(),           // Result asset R2 key
  external_task_id: z.string().optional(), // For async tasks (Kling)
  data: z.record(z.any()).optional(),      // Additional data (description text, etc)
  error: z.string().optional(),
});
export type AtomicTaskResult = z.infer<typeof AtomicTaskResultSchema>;

// =============================================================================
// DO State Types (for orchestration)
// =============================================================================

export const DOStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
]);
export type DOStepStatus = z.infer<typeof DOStepStatusSchema>;

// DO execution state (persisted in storage for re-entrancy)
export const DOStateSchema = z.object({
  task_id: z.string(),
  project_id: z.string(),
  node_id: z.string(),
  current_step: z.string(),
  step_status: DOStepStatusSchema,
  retry_count: z.number().default(0),
  max_retries: z.number().default(3),
  // Intermediate results from previous steps
  results: z.record(z.any()).default({}),
  error: z.string().optional(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type DOState = z.infer<typeof DOStateSchema>;

// =============================================================================
// Legacy Types (for backward compatibility)
// =============================================================================

// === Task Type (legacy, use AtomicTaskType for new code) ===
export const TaskTypeSchema = z.enum([
  'kling_video',
  'nano_banana',
  'nano_banana_pro',
  'gemini_image',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

// === Task Status ===
export const TaskStatusSchema = z.enum([
  'pending',
  'generating',
  'completed',
  'failed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// === External Service ===
export const ExternalServiceSchema = z.enum([
  'kling',
  'gemini',
  'vertex',
]);
export type ExternalService = z.infer<typeof ExternalServiceSchema>;

// === AIGC Task (D1 record - only task_id needed for new system) ===
export const AIGCTaskSchema = z.object({
  task_id: z.string(),
  project_id: z.string(),
  task_type: TaskTypeSchema,
  status: TaskStatusSchema,
  external_task_id: z.string().optional(),
  external_service: ExternalServiceSchema.optional(),
  params: z.string(), // JSON string
  result_url: z.string().optional(),
  result_data: z.string().optional(), // JSON string
  error_message: z.string().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  completed_at: z.number().optional(),
  retry_count: z.number(),
  max_retries: z.number(),
});
export type AIGCTask = z.infer<typeof AIGCTaskSchema>;

// === Task Submission ===
export const SubmitTaskRequestSchema = z.object({
  project_id: z.string(),
  task_type: TaskTypeSchema,
  params: z.record(z.string(), z.any()),
});
export type SubmitTaskRequest = z.infer<typeof SubmitTaskRequestSchema>;

export const SubmitTaskResponseSchema = z.object({
  task_id: z.string(),
  status: TaskStatusSchema,
  created_at: z.number(),
});
export type SubmitTaskResponse = z.infer<typeof SubmitTaskResponseSchema>;
