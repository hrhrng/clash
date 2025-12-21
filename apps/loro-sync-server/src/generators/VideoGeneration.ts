/**
 * Video Generation Module
 * 
 * Handles video generation using Kling AI and manages async task submission.
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { getAssetUrl } from '../utils';
import { updateNodeData } from '../sync/NodeUpdater';

/**
 * Process video generation for a pending node
 * 
 * @param nodeId - ID of the node to process
 * @param nodeData - Node data object
 * @param doc - Loro document instance
 * @param env - Environment bindings
 * @param projectId - Current project ID
 * @param broadcast - Function to broadcast updates
 * @param triggerPolling - Function to trigger task polling
 */
export async function processVideoGeneration(
  nodeId: string,
  nodeData: Record<string, any>,
  doc: LoroDoc,
  env: Env,
  projectId: string,
  broadcast: (data: Uint8Array) => void,
  triggerPolling: () => Promise<void>
): Promise<void> {
  try {
    const prompt = nodeData?.data?.prompt || nodeData?.data?.label || '';
    const taskId = `vid_${Date.now()}_${nodeId.slice(0, 8)}`;
    const duration = nodeData?.data?.duration || 5;
    const model = nodeData?.data?.model || 'kling-v1';
    
    // Get reference image URLs from node data
    // These are R2 keys (e.g., "projects/xxx/assets/yyy.png") from connected upstream image nodes
    const referenceImageUrls: string[] = nodeData?.data?.referenceImageUrls || [];
    
    console.log(`[VideoGeneration] 🎬 Starting video generation for node: ${nodeId}`);
    console.log(`[VideoGeneration] 📎 Reference images: ${referenceImageUrls.length}`);
    
    if (referenceImageUrls.length === 0) {
      console.error('[VideoGeneration] ❌ Video generation requires at least one reference image');
      updateNodeData(doc, nodeId, { status: 'failed', error: 'No reference image provided' }, broadcast);
      return;
    }
    
    // Mark node as processing with taskId
    updateNodeData(doc, nodeId, { taskId, status: 'generating' }, broadcast);
    
    // Get Kling executor
    const { createExecutorFactory } = await import('../executors');
    const factory = createExecutorFactory(env as any);
    const executor = factory.getExecutor('kling_video');
    
    if (!executor) {
      console.error('[VideoGeneration] ❌ Kling executor not available');
      updateNodeData(doc, nodeId, { status: 'failed', error: 'Executor not available' }, broadcast);
      return;
    }
    
    // Use the first reference image (R2 key or URL)
    const imageSrc = referenceImageUrls[0];
    console.log(`[VideoGeneration] 📥 Processing source image: ${String(imageSrc).substring(0, 80)}...`);
    
    let base64Image: string;
    
    try {
      let imageBuffer: ArrayBuffer;
      
      if (imageSrc.startsWith('http')) {
        // It's a URL - fetch it directly
        console.log(`[VideoGeneration] 🌐 Fetching from URL: ${imageSrc.substring(0, 80)}...`);
        const response = await fetch(imageSrc);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        imageBuffer = await response.arrayBuffer();
      } else {
        // It's an R2 key - use S3 API
        console.log(`[VideoGeneration] 🗄️ Fetching from R2 via S3 API: ${imageSrc}`);
        const { getObjectFromR2 } = await import('../r2client');
        const result = await getObjectFromR2(env, imageSrc);
        imageBuffer = result.buffer;
      }

      // Convert to base64
      const bytes = new Uint8Array(imageBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Image = btoa(binary);
      console.log(`[VideoGeneration] 📦 Converted to base64 (${base64Image.length} chars)`);

    } catch (error) {
      console.error('[VideoGeneration] ❌ Failed to process source image:', error);
      updateNodeData(doc, nodeId, { status: 'failed', error: `Image processing failed: ${error instanceof Error ? error.message : String(error)}` }, broadcast);
      return;
    }
    
    console.log(`[VideoGeneration] 🚀 Starting video generation: ${prompt.slice(0, 50)}...`);
    
    // Pass base64 to executor
    const result = await executor.submit({
      prompt,
      duration,
      model,
      image_base64: base64Image,
    });
    
    if (result.error) {
      console.error(`[VideoGeneration] ❌ Video generation failed: ${result.error}`);
      updateNodeData(doc, nodeId, { status: 'failed', error: result.error }, broadcast);
      return;
    }
    
    // Video is async, store external task ID for polling
    if (result.external_task_id) {
      console.log(`[VideoGeneration] ⏳ Video task submitted: ${result.external_task_id}`);
      
      // Persist task to D1 so polling loop can pick it up
      const { submitTask } = await import('../tasks');
      await submitTask(env.DB, {
        project_id: projectId || 'unknown',
        task_type: 'kling_video',
        params: {
          prompt,
          duration,
        },
        taskId,
        external_task_id: result.external_task_id,
        external_service: 'kling',
        status: 'generating',
      });

      updateNodeData(doc, nodeId, {
        status: 'generating',
        externalTaskId: result.external_task_id,
        taskId,
      }, broadcast);
      
      // Trigger task polling
      await triggerPolling();
    }
  } catch (error) {
    console.error(`[VideoGeneration] ❌ Error in processVideoGeneration:`, error);
    updateNodeData(doc, nodeId, { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }, broadcast);
  }
}
