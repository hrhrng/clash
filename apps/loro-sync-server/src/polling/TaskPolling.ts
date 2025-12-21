/**
 * Task Polling Service
 * 
 * Handles periodic polling of:
 * - Kling video generation (async)
 * - Python API tasks (image gen, descriptions)
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { updateNodeData } from '../sync/NodeUpdater';
import { getTaskStatus } from '../clients/TaskClient';

/**
 * Check for pending tasks on room init and recover polling if needed
 * 
 * @param projectId - Project ID to check
 * @param env - Environment bindings
 * @param state - Durable Object state
 */
export async function checkAndRecoverPendingTasks(
  projectId: string,
  env: Env,
  state: DurableObjectState
): Promise<void> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM aigc_tasks
       WHERE project_id = ?
       AND status IN ('generating', 'pending', 'processing')
       AND retry_count < max_retries`
    )
      .bind(projectId)
      .all<{ count: number }>();
    
    const pendingCount = results?.[0]?.count || 0;
    
    if (pendingCount > 0) {
      console.log(`[TaskPolling] 🔄 Found ${pendingCount} pending tasks, recovering polling for project: ${projectId}`);
      
      // Switch to task polling mode
      await state.storage.put('alarm_type', 'task_poll');
      await state.storage.setAlarm(Date.now() + 2000);
    }
  } catch (error) {
    console.error('[TaskPolling] Error checking pending tasks:', error);
  }
}

/**
 * Poll pending tasks for a project
 * 
 * @param projectId - Project ID to poll
 * @param env - Environment bindings
 * @param doc - Loro document instance
 * @param broadcast - Function to broadcast updates
 * @returns true if there are still pending tasks, false otherwise
 */
export async function pollPendingTasks(
  projectId: string,
  env: Env,
  doc: LoroDoc,
  broadcast: (data: Uint8Array) => void
): Promise<boolean> {
  try {
    // Query pending tasks from D1
    const { results } = await env.DB.prepare(
      `SELECT * FROM aigc_tasks
       WHERE project_id = ?
       AND status IN ('generating', 'pending', 'processing')
       AND retry_count < max_retries
       ORDER BY created_at ASC
       LIMIT 10`
    )
      .bind(projectId)
      .all<any>();

    if (!results || results.length === 0) return false;

    console.log(`[TaskPolling] Found ${results.length} pending tasks for project ${projectId}`);

    // Import executors
    const { createExecutorFactory } = await import('../executors');
    const { updateTaskStatus, incrementRetry, touchTask } = await import('../tasks');
    const factory = createExecutorFactory(env as any);

    let stillHasPendingTasks = false;

    for (const task of results) {
      console.log(`[TaskPolling] Polling task ${task.task_id}: external_task_id=${task.external_task_id}, external_service=${task.external_service}`);
      if (!task.external_task_id || !task.external_service) {
        console.log(`[TaskPolling] Skipping task ${task.task_id}: missing external_task_id or external_service`);
        continue;
      }

      const executor = factory.getExecutorByService(task.external_service);
      if (!executor) continue;

      try {
        const pollResult = await executor.poll(task.external_task_id);

        if (pollResult.completed) {
          if (pollResult.error) {
            await updateTaskStatus(env.DB, task.task_id, 'failed', {
              error_message: pollResult.error,
            });
            console.log(`[TaskPolling] Task ${task.task_id} failed: ${pollResult.error}`);
            
            const nodeId = findNodeIdByTaskId(doc, task.task_id);
            if (nodeId) {
              updateNodeData(doc, nodeId, { 
                status: 'failed', 
                error: pollResult.error 
              }, broadcast);
            }
          } else {
            await updateTaskStatus(env.DB, task.task_id, 'completed', {
              result_url: pollResult.result_url,
              result_data: pollResult.result_data,
            });
            console.log(`[TaskPolling] Task ${task.task_id} completed: ${pollResult.result_url}`);

            let finalResultUrl = pollResult.result_url;
            let r2Key: string | null = null;

            // Upload video to R2 using S3 API
            if (finalResultUrl && finalResultUrl.startsWith('http')) {
              try {
                console.log(`[TaskPolling] 📥 Downloading video from Kling...`);
                const videoResp = await fetch(finalResultUrl);
                if (videoResp.ok) {
                    const videoBuf = await videoResp.arrayBuffer();
                    const objectKey = `projects/${projectId}/generated/${task.task_id}.mp4`;
                    
                    console.log(`[TaskPolling] 📤 Uploading video to R2: ${objectKey}`);
                    const { putObjectToR2 } = await import('../r2client');
                    await putObjectToR2(env, objectKey, videoBuf, 'video/mp4');
                    
                    r2Key = objectKey;
                    console.log(`[TaskPolling] ✅ Video mirrored to R2: ${r2Key}`);
                    
                    // Update task with R2 key
                    await updateTaskStatus(env.DB, task.task_id, 'completed', {
                        result_url: r2Key,
                        result_data: { ...pollResult.result_data, r2_key: objectKey },
                    });
                } else {
                    console.error(`[TaskPolling] ❌ Failed to download video: ${videoResp.status}`);
                }
              } catch (e) {
                console.error('[TaskPolling] ❌ Failed to mirror video to R2:', e);
              }
            }

            // Request description from Python API (async, non-blocking)
            if (r2Key && env.BACKEND_API_URL) {
              try {
                console.log(`[TaskPolling] 🤖 Requesting video description from Python API...`);
                const describeUrl = `${env.BACKEND_API_URL}/api/describe/submit`;
                const describeRes = await fetch(describeUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    r2_key: r2Key,
                    mime_type: 'video/mp4',
                    project_id: projectId,
                    node_id: findNodeIdByTaskId(doc, task.task_id),
                  }),
                });
                if (describeRes.ok) {
                  console.log(`[TaskPolling] ✅ Description request submitted to Python API`);
                } else {
                  console.warn(`[TaskPolling] ⚠️ Description request failed: ${describeRes.status}`);
                }
              } catch (error) {
                console.error(`[TaskPolling] ❌ Failed to request video description (non-blocking):`, error);
              }
            }
            
            // Update pollResult for broadcast - use R2 key if available
            pollResult.result_url = r2Key || finalResultUrl; 

            // Broadcast task completion via tasks map
            broadcastTaskCompletion(doc, task.task_id, {
              result_url: pollResult.result_url,
              result_data: pollResult.result_data,
            }, broadcast);
            
            // Update the node status
            const nodeId = findNodeIdByTaskId(doc, task.task_id);
            if (nodeId) {
              const updates: Record<string, any> = { status: 'completed' };
              
              // Store R2 key in src (frontend will resolve via proxy)
              if (pollResult.result_url) {
                updates.src = pollResult.result_url;
              }
              
              if (task.params?.prompt) {
                const prompt = task.params.prompt;
                updates.label = prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');
              }
              
              updateNodeData(doc, nodeId, updates, broadcast);
            }
          }
        } else {
          // Task still pending
          await touchTask(env.DB, task.task_id);
          stillHasPendingTasks = true;
        }
      } catch (error) {
        console.error(`[TaskPolling] Error polling task ${task.task_id}:`, error);
        
        await incrementRetry(env.DB, task.task_id);
        
        if (task.retry_count + 1 >= task.max_retries) {
          console.error(`[TaskPolling] Task ${task.task_id} exceeded max retries (${task.max_retries}), marking as failed`);
          await updateTaskStatus(env.DB, task.task_id, 'failed', {
            error_message: `Exceeded max retries: ${error instanceof Error ? error.message : String(error)}`,
          });
          
          const nodeId = findNodeIdByTaskId(doc, task.task_id);
          if (nodeId) {
            updateNodeData(doc, nodeId, { 
              status: 'error', 
              error: 'Task failed after multiple retries' 
            }, broadcast);
          }
        } else {
          stillHasPendingTasks = true;
        }
      }
    }

    return stillHasPendingTasks;
  } catch (error) {
    console.error('[TaskPolling] Error in pollPendingTasks:', error);
    return false;
  }
}

/**
 * Find node ID by task ID
 */
export function findNodeIdByTaskId(doc: LoroDoc, taskId: string): string | null {
  try {
    const nodesMap = doc.getMap('nodes');
    for (const [nodeId, nodeData] of nodesMap.entries()) {
      const data = nodeData as Record<string, any>;
      if (data?.data?.taskId === taskId) {
        return nodeId;
      }
    }
  } catch (error) {
    console.error('[TaskPolling] Error finding node by task ID:', error);
  }
  return null;
}

/**
 * Trigger task polling alarm
 */
export async function triggerTaskPolling(state: DurableObjectState): Promise<void> {
  await state.storage.put('alarm_type', 'task_polling');
  const nextAlarmTime = Date.now() + 2 * 1000;
  await state.storage.setAlarm(nextAlarmTime);
  console.log('[TaskPolling] Task polling alarm triggered, will poll in 2 seconds');
}

/**
 * Broadcast task completion to connected clients via Loro
 */
function broadcastTaskCompletion(
  doc: LoroDoc,
  taskId: string,
  result: { result_url?: string; result_data?: Record<string, any> },
  broadcast: (data: Uint8Array) => void
): void {
  console.log(`[TaskPolling] 📢 Broadcasting task completion: ${taskId}`);

  try {
    const versionBefore = doc.version();

    const tasksMap = doc.getMap('tasks');
    tasksMap.set(taskId, {
      status: 'completed',
      result_url: result.result_url,
      result_data: result.result_data,
      completed_at: Date.now(),
    });

    console.log(`[TaskPolling] ✅ Task added to Loro document: ${taskId}`);

    const update = doc.export({
      mode: 'update',
      from: versionBefore,
    });

    broadcast(update);
    console.log(`[TaskPolling] ✅ Task completion broadcasted: ${taskId}`);
  } catch (error) {
    console.error('[TaskPolling] ❌ Error broadcasting task completion:', error);
  }
}

/**
 * Poll pending description tasks from Python API
 * 
 * Checks nodes with descriptionTaskId and updates when complete
 */
export async function pollDescriptionTasks(
  projectId: string,
  env: Env,
  doc: LoroDoc,
  broadcast: (data: Uint8Array) => void
): Promise<boolean> {
  try {
    const nodesMap = doc.getMap('nodes');
    let hasPendingTasks = false;
    
    for (const [nodeId, nodeData] of nodesMap.entries()) {
      const data = nodeData as Record<string, any>;
      const taskId = data?.data?.taskId;
      const descriptionTaskId = data?.data?.descriptionTaskId;
      const description = data?.data?.description;
      
      // Poll description tasks
      if (descriptionTaskId && !description) {
        console.log(`[TaskPolling] 📍 Polling description task: ${descriptionTaskId}`);
        
        const result = await getTaskStatus(descriptionTaskId, env);
        
        if (!result) {
          hasPendingTasks = true;
          continue;
        }
        
        if (result.status === 'completed' && result.result_data?.description) {
          console.log(`[TaskPolling] ✅ Description ready: ${nodeId}`);
          updateNodeData(doc, nodeId, { 
            description: result.result_data.description,
            descriptionTaskId: null,
          }, broadcast);
        } else if (result.status === 'failed') {
          console.error(`[TaskPolling] ❌ Description failed: ${result.error}`);
          const currentRetry = data?.data?.descriptionRetryCount || 0;
          updateNodeData(doc, nodeId, { 
            descriptionTaskId: null,
            descriptionError: result.error,
            descriptionRetryCount: currentRetry + 1,
          }, broadcast);
        } else {
          hasPendingTasks = true;
        }
      }
      
      // Poll image generation tasks (from Python API)
      if (taskId && taskId.startsWith('task_') && data?.data?.status === 'generating') {
        console.log(`[TaskPolling] 📍 Polling image task: ${taskId}`);
        
        const result = await getTaskStatus(taskId, env);
        
        if (!result) {
          hasPendingTasks = true;
          continue;
        }
        
        if (result.status === 'completed') {
          console.log(`[TaskPolling] ✅ Task ready: ${nodeId}`);
          
          const updates: Record<string, any> = { 
            status: 'completed',
            taskId: null,
          };
          
          if (result.result_url) {
            updates.src = result.result_url;
          }
          
          if (result.result_data?.description) {
            updates.description = result.result_data.description;
          }
          
          updateNodeData(doc, nodeId, updates, broadcast);
        } else if (result.status === 'failed') {
          console.error(`[TaskPolling] ❌ Image failed: ${result.error}`);
          updateNodeData(doc, nodeId, { 
            status: 'failed',
            error: result.error,
            taskId: null,
          }, broadcast);
        } else {
          hasPendingTasks = true;
        }
      }
    }
    
    return hasPendingTasks;
  } catch (error) {
    console.error('[TaskPolling] ❌ Error polling Python tasks:', error);
    return false;
  }
}

