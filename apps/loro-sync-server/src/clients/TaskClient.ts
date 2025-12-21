/**
 * Python API Client
 * 
 * Calls Python AIGC Provider for sync tasks (image gen, descriptions).
 */

import type { Env } from '../types';

export type TaskType = 'image_gen' | 'image_desc' | 'video_desc';

export interface TaskSubmitRequest {
  task_type: TaskType;
  project_id: string;
  node_id: string;
  params: Record<string, any>;
}

export interface TaskStatusResponse {
  task_id: string;
  task_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  result_data?: Record<string, any>;
  error?: string;
  project_id?: string;
  node_id?: string;
}

/**
 * Submit a task to Python API
 */
export async function submitTask(
  request: TaskSubmitRequest,
  env: Env
): Promise<string | null> {
  const backendUrl = env.BACKEND_API_URL || 'http://localhost:8000';
  
  try {
    console.log(`[TaskClient] 📤 Submitting ${request.task_type} for node ${request.node_id}`);
    
    const response = await fetch(`${backendUrl}/api/tasks/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[TaskClient] ❌ Submit failed: ${response.status} - ${error}`);
      return null;
    }
    
    const result = await response.json() as { task_id: string };
    console.log(`[TaskClient] ✅ Task submitted: ${result.task_id}`);
    return result.task_id;
  } catch (error) {
    console.error(`[TaskClient] ❌ Submit error:`, error);
    return null;
  }
}

/**
 * Get task status from Python API
 */
export async function getTaskStatus(
  taskId: string,
  env: Env
): Promise<TaskStatusResponse | null> {
  const backendUrl = env.BACKEND_API_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${backendUrl}/api/tasks/${taskId}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      console.error(`[TaskClient] ❌ Status failed: ${response.status}`);
      return null;
    }
    
    const result = await response.json() as TaskStatusResponse;
    console.log(`[TaskClient] 📊 Task ${taskId}: ${result.status}`);
    return result;
  } catch (error) {
    console.error(`[TaskClient] ❌ Status error:`, error);
    return null;
  }
}

/**
 * Extract R2 key from asset URL
 * 
 * Supports these formats:
 * - /assets/projects/xxx/assets/file.png → projects/xxx/assets/file.png
 * - https://pub-xxx.r2.dev/projects/xxx/assets/file.png → projects/xxx/assets/file.png
 * - projects/xxx/assets/file.png → projects/xxx/assets/file.png
 */
export function extractR2Key(assetUrl: string): string | null {
  // Format 1: /assets/... (local loro-sync endpoint)
  const assetsMatch = assetUrl.match(/\/assets\/(.+)$/);
  if (assetsMatch) {
    return assetsMatch[1];
  }
  
  // Format 2: R2 public URL (https://pub-xxx.r2.dev/projects/...)
  const r2PublicMatch = assetUrl.match(/r2\.dev\/(projects\/.+)$/);
  if (r2PublicMatch) {
    return r2PublicMatch[1];
  }
  
  // Format 3: Already a key
  if (assetUrl.startsWith('projects/')) {
    return assetUrl;
  }
  
  console.warn(`[TaskClient] ⚠️ Cannot extract R2 key from: ${assetUrl}`);
  return null;
}
