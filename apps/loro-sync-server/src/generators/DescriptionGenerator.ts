/**
 * Description Generator
 * 
 * Submits description tasks to Python API and handles polling.
 * Python API does the actual R2 fetch + Google Files API + Gemini work.
 */

import type { Env } from '../types';

export interface DescriptionTaskResult {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  description?: string;
  error?: string;
}

/**
 * Submit a description generation task to Python API
 */
export async function submitDescriptionTask(
  r2Key: string,
  mimeType: string,
  projectId: string,
  nodeId: string,
  env: Env
): Promise<string | null> {
  const backendUrl = env.BACKEND_API_URL || 'http://localhost:8000';
  
  try {
    console.log(`[DescriptionGenerator] 📤 Submitting task for ${nodeId} (${r2Key})`);
    
    const response = await fetch(`${backendUrl}/api/describe/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        r2_key: r2Key,
        mime_type: mimeType,
        project_id: projectId,
        node_id: nodeId,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[DescriptionGenerator] ❌ Submit failed: ${response.status} - ${error}`);
      return null;
    }
    
    const result = await response.json() as { task_id: string };
    console.log(`[DescriptionGenerator] ✅ Task submitted: ${result.task_id}`);
    return result.task_id;
  } catch (error) {
    console.error(`[DescriptionGenerator] ❌ Submit error:`, error);
    return null;
  }
}

/**
 * Poll description task status from Python API
 */
export async function pollDescriptionTask(
  taskId: string,
  env: Env
): Promise<DescriptionTaskResult> {
  const backendUrl = env.BACKEND_API_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${backendUrl}/api/describe/${taskId}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      console.error(`[DescriptionGenerator] ❌ Poll failed: ${response.status}`);
      return { taskId, status: 'failed', error: `HTTP ${response.status}` };
    }
    
    const result = await response.json() as DescriptionTaskResult;
    console.log(`[DescriptionGenerator] 📊 Task ${taskId} status: ${result.status}`);
    return result;
  } catch (error) {
    console.error(`[DescriptionGenerator] ❌ Poll error:`, error);
    return { taskId, status: 'failed', error: String(error) };
  }
}

/**
 * Extract R2 key from asset URL
 * 
 * Examples:
 * - "http://localhost:8787/assets/projects/abc/file.mp4" -> "projects/abc/file.mp4"
 * - "https://worker.dev/assets/projects/abc/file.mp4" -> "projects/abc/file.mp4"
 * - "https://pub-xxx.r2.dev/projects/abc/file.mp4" -> "projects/abc/file.mp4"
 */
export function extractR2KeyFromUrl(assetUrl: string): string | null {
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
  
  console.warn(`[DescriptionGenerator] ⚠️ Cannot extract R2 key from: ${assetUrl}`);
  return null;
}
