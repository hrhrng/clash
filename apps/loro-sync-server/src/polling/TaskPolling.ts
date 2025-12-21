/**
 * Task Polling Service
 * 
 * Unified polling approach:
 * 1. Scan Loro Doc for nodes with pendingTask field
 * 2. Query Python API for task status
 * 3. Update Loro Doc when complete
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { updateNodeData } from '../sync/NodeUpdater';

/**
 * Poll tasks for nodes that have pendingTask field
 * 
 * @returns true if there are still pending tasks
 */
export async function pollNodeTasks(
  doc: LoroDoc,
  env: Env,
  projectId: string,
  broadcast: (data: Uint8Array) => void
): Promise<boolean> {
  let hasPendingTasks = false;

  try {
    const nodesMap = doc.getMap('nodes');

    for (const [nodeId, nodeData] of nodesMap.entries()) {
      const data = nodeData as Record<string, any>;
      const innerData = data?.data || {};
      const pendingTask = innerData.pendingTask;

      if (!pendingTask) continue;

      console.log(`[TaskPolling] 🔍 Checking task ${pendingTask} for node ${nodeId.slice(0, 8)}`);

      // Query Python API for task status
      const taskStatus = await getTaskStatus(env, pendingTask);
      console.log(`[TaskPolling] 📊 Task ${pendingTask}: ${taskStatus.status}`);

      if (taskStatus.status === 'completed') {
        const updates: Record<string, any> = { 
          pendingTask: undefined // Clear pending task
        };

        // Handle different task types
        if (taskStatus.result_url) {
          // Generation task completed - update src and status
          updates.src = taskStatus.result_url;
          updates.status = 'completed';
          console.log(`[TaskPolling] ✅ Generation complete: ${taskStatus.result_url}`);
        } else if (taskStatus.result_data?.description) {
          // Description task completed - update description and status
          updates.description = taskStatus.result_data.description;
          updates.status = 'fin';
          console.log(`[TaskPolling] ✅ Description complete`);
        }

        updateNodeData(doc, nodeId, updates, broadcast);
      } else if (taskStatus.status === 'failed') {
        console.error(`[TaskPolling] ❌ Task failed: ${taskStatus.error}`);
        updateNodeData(doc, nodeId, { 
          pendingTask: undefined,
          status: 'failed',
          error: taskStatus.error 
        }, broadcast);
      } else {
        // Still pending/processing
        hasPendingTasks = true;
      }
    }
  } catch (error) {
    console.error('[TaskPolling] ❌ Error:', error);
  }

  return hasPendingTasks;
}

/**
 * Get task status from Python API
 */
async function getTaskStatus(
  env: Env,
  taskId: string
): Promise<{
  status: string;
  result_url?: string;
  result_data?: { description?: string };
  error?: string;
}> {
  try {
    const response = await fetch(`${env.BACKEND_API_URL}/api/tasks/${taskId}`);
    
    if (!response.ok) {
      return { status: 'failed', error: `HTTP ${response.status}` };
    }

    return await response.json();
  } catch (e) {
    return { status: 'failed', error: String(e) };
  }
}

/**
 * Trigger task polling alarm
 */
export async function triggerTaskPolling(state: DurableObjectState): Promise<void> {
  await state.storage.put('alarm_type', 'task_polling');
  await state.storage.setAlarm(Date.now() + 2000);
  console.log('[TaskPolling] ⏰ Scheduled poll in 2s');
}

/**
 * Check if any node has a pending task (for alarm scheduling)
 */
export function hasPendingTasks(doc: LoroDoc): boolean {
  try {
    const nodesMap = doc.getMap('nodes');
    for (const [, nodeData] of nodesMap.entries()) {
      const data = nodeData as Record<string, any>;
      if (data?.data?.pendingTask) {
        return true;
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}
