/**
 * Node Processor
 * 
 * Scans Loro document for pending nodes and dispatches tasks:
 * - Image gen/description → Python API (sync provider)
 * - Video gen → Kling (async, polled by Loro)
 * - Video description → Python API (sync provider)
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { processVideoGeneration } from '../generators/VideoGeneration';
import { submitTask, extractR2Key } from '../clients/TaskClient';
import { updateNodeData } from '../sync/NodeUpdater';

/**
 * Check for pending nodes and trigger generation tasks
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
    const allEntries = nodesMap.entries();
    
    console.log('[NodeProcessor] 🔍 Checking for pending nodes...');
    
    let imageNodeCount = 0;
    let videoNodeCount = 0;
    let descriptionTaskCount = 0;
    
    for (const [nodeId, nodeData] of allEntries) {
      const data = nodeData as Record<string, any>;
      const status = data?.data?.status;
      const taskId = data?.data?.taskId;
      const nodeType = data?.type;
      const src = data?.data?.src;
      const description = data?.data?.description;
      const descriptionTaskId = data?.data?.descriptionTaskId;
      const prompt = data?.data?.prompt || data?.data?.label || '';
      
      // Count nodes
      if (nodeType === 'image') imageNodeCount++;
      if (nodeType === 'video') videoNodeCount++;
      
      // ========================================
      // 1. Uploaded assets needing description
      // ========================================
      const storageKey = data?.data?.storageKey;
      
      const descriptionRetryCount = data?.data?.descriptionRetryCount || 0;
      
      if (
        (nodeType === 'image' || nodeType === 'video') && 
        (storageKey || src) && 
        status === 'completed' && 
        !description && 
        !descriptionTaskId &&
        descriptionRetryCount < 3
      ) {
        console.log(`[NodeProcessor] 📤 Asset needs description: ${nodeId}`);
        descriptionTaskCount++;
        
        // Use storageKey directly if available, otherwise try to extract from src
        const r2Key = storageKey || extractR2Key(src);
        if (!r2Key) {
          console.warn(`[NodeProcessor] ⚠️ No storageKey or valid src for ${nodeId}`);
          continue;
        }
        
        const taskType = nodeType === 'video' ? 'video_desc' : 'image_desc';
        const mimeType = nodeType === 'video' ? 'video/mp4' : 'image/png';
        
        console.log(`[NodeProcessor] 📤 Submitting ${taskType} for ${nodeId} with r2Key: ${r2Key}`);
        
        const newTaskId = await submitTask({
          task_type: taskType,
          project_id: projectId,
          node_id: nodeId,
          params: { r2_key: r2Key, mime_type: mimeType },
        }, env);
        
        if (newTaskId) {
          updateNodeData(doc, nodeId, { descriptionTaskId: newTaskId }, broadcast);
          await triggerPolling();
        }
        continue;
      }
      
      // ========================================
      // 2. Pending image generation
      // ========================================
      if (
        (nodeType === 'image' || nodeType === 'action-badge') &&
        (status === 'pending' || status === 'generating') &&
        !taskId &&
        prompt
      ) {
        console.log(`[NodeProcessor] 🎨 Image gen: ${nodeId}`);
        
        const newTaskId = await submitTask({
          task_type: 'image_gen',
          project_id: projectId,
          node_id: nodeId,
          params: { prompt },
        }, env);
        
        if (newTaskId) {
          updateNodeData(doc, nodeId, { taskId: newTaskId, status: 'generating' }, broadcast);
          await triggerPolling();
        }
        continue;
      }
      
      // ========================================
      // 3. Pending video generation (Kling)
      // ========================================
      if (
        nodeType === 'video' &&
        (status === 'pending' || status === 'generating') &&
        !taskId &&
        prompt
      ) {
        console.log(`[NodeProcessor] 🎬 Video gen: ${nodeId}`);
        await processVideoGeneration(nodeId, data, doc, env, projectId, broadcast, triggerPolling);
        continue;
      }
    }
    
    console.log(`[NodeProcessor] Summary: ${imageNodeCount} images, ${videoNodeCount} videos, ${descriptionTaskCount} descriptions`);
  } catch (error) {
    console.error('[NodeProcessor] ❌ Error:', error);
  }
}
