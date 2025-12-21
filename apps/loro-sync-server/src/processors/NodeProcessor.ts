/**
 * Node Processor - Task Submission Only
 * 
 * All tasks use the same pattern:
 * 1. NodeProcessor spots a node needing work
 * 2. Submit to /api/tasks/submit (writes to DB, starts background processing)
 * 3. Store task_id in node's pendingTask field
 * 4. TaskPolling will poll DB and update Loro Doc when complete
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { updateNodeData } from '../sync/NodeUpdater';

type AssetStatus = 'uploading' | 'generating' | 'completed' | 'fin' | 'failed';
type NodeType = 'image' | 'video';

/**
 * Process pending nodes - submit tasks to API/DB
 */
export async function processPendingNodes(
  doc: LoroDoc,
  env: Env,
  projectId: string,
  broadcast: (data: Uint8Array) => void,
  triggerPolling: () => Promise<void>
): Promise<void> {
  try {
    const nodesMap = doc.getMap('nodes');
    let submitted = false;

    for (const [nodeId, nodeData] of nodesMap.entries()) {
      const data = nodeData as Record<string, any>;
      const nodeType = data?.type as NodeType;
      const innerData = data?.data || {};

      if (!['image', 'video'].includes(nodeType)) continue;

      const status = innerData.status as AssetStatus;
      const src = innerData.src;
      const description = innerData.description;
      const pendingTask = innerData.pendingTask;

      // Skip if already has a pending task
      if (pendingTask) continue;

      // Case 1: generating + no src -> submit generation task
      if (status === 'generating' && !src) {
        console.log(`[NodeProcessor] 🚀 Submitting ${nodeType}_gen for ${nodeId.slice(0, 8)}`);
        
        const taskType = nodeType === 'image' ? 'image_gen' : 'video_gen';
        const params: Record<string, any> = {
          prompt: innerData.prompt || innerData.label || '',
        };

        if (nodeType === 'video') {
          const imageR2Key = innerData.referenceImageUrls?.[0];
          if (!imageR2Key) {
            updateNodeData(doc, nodeId, { status: 'failed', error: 'No source image' }, broadcast);
            continue;
          }
          params.image_r2_key = imageR2Key;
          params.duration = innerData.duration || 5;
        }

        const result = await submitTask(env, taskType, projectId, nodeId, params);
        
        if (result.task_id) {
          updateNodeData(doc, nodeId, { pendingTask: result.task_id }, broadcast);
          submitted = true;
        } else {
          updateNodeData(doc, nodeId, { status: 'failed', error: result.error }, broadcast);
        }
      }

      // Case 2: completed + has src + no description -> submit description task
      if (status === 'completed' && src && !description) {
        console.log(`[NodeProcessor] 📝 Submitting description for ${nodeId.slice(0, 8)}`);
        
        const taskType = nodeType === 'image' ? 'image_desc' : 'video_desc';
        const params = {
          r2_key: src,
          mime_type: nodeType === 'image' ? 'image/png' : 'video/mp4',
        };

        const result = await submitTask(env, taskType, projectId, nodeId, params);
        
        if (result.task_id) {
          updateNodeData(doc, nodeId, { pendingTask: result.task_id }, broadcast);
          submitted = true;
        } else {
          // Don't fail, just skip description
          updateNodeData(doc, nodeId, { status: 'fin' }, broadcast);
        }
      }
    }

    if (submitted) {
      await triggerPolling();
    }
  } catch (error) {
    console.error('[NodeProcessor] ❌ Error:', error);
  }
}

/**
 * Submit task to Python API
 */
async function submitTask(
  env: Env,
  taskType: string,
  projectId: string,
  nodeId: string,
  params: Record<string, any>
): Promise<{ task_id?: string; error?: string }> {
  try {
    // Build callback URL pointing to Loro Sync Server's /update-node endpoint
    const baseUrl = env.LORO_SYNC_URL || env.WORKER_PUBLIC_URL;
                   
    const callbackUrl = baseUrl 
      ? `${baseUrl}/sync/${projectId}/update-node`
      : null;

    const response = await fetch(`${env.BACKEND_API_URL}/api/tasks/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: taskType,
        project_id: projectId,
        node_id: nodeId,
        params: params,
        callback_url: callbackUrl,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { error: `HTTP ${response.status}: ${text}` };
    }

    const result = await response.json() as { task_id?: string };
    return { task_id: result.task_id };
  } catch (e) {
    return { error: String(e) };
  }
}

