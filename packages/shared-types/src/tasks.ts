/**
 * Task Types - Zod schemas for AIGC task management
 */

import { z } from 'zod';

// === Task Type ===
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

// === AIGC Task ===
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
