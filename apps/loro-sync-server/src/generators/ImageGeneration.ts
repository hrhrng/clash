/**
 * Image Generation Module
 * 
 * Handles image generation using Gemini/Vertex AI and uploads to R2 storage.
 */

import { LoroDoc } from 'loro-crdt';
import type { Env } from '../types';
import { getAssetUrl } from '../utils';
import { updateNodeData } from '../sync/NodeUpdater';

/**
 * Process image generation for a pending node
 * 
 * @param nodeId - ID of the node to process
 * @param nodeData - Node data object
 * @param doc - Loro document instance
 * @param env - Environment bindings
 * @param projectId - Current project ID
 * @param broadcast - Function to broadcast updates
 */
export async function processImageGeneration(
  nodeId: string,
  nodeData: Record<string, any>,
  doc: LoroDoc,
  env: Env,
  projectId: string,
  broadcast: (data: Uint8Array) => void
): Promise<void> {
  try {
    const prompt = nodeData?.data?.prompt || nodeData?.data?.label || '';
    const taskId = `img_${Date.now()}_${nodeId.slice(0, 8)}`;
    
    // Mark node as processing with taskId (so we don't process again)
    updateNodeData(doc, nodeId, { taskId, status: 'generating' }, broadcast);
    
    // Get reference image URLs from node data
    const referenceImageUrls: string[] = [];
    
    // Priority 1: Explicit referenceImageUrls
    if (nodeData?.data?.referenceImageUrls && Array.isArray(nodeData.data.referenceImageUrls)) {
      referenceImageUrls.push(...nodeData.data.referenceImageUrls);
      console.log(`[ImageGeneration] 📎 Found ${nodeData.data.referenceImageUrls.length} explicit reference image URLs`);
    }
    
    // Priority 2: Extract from upstreamNodeIds
    if (nodeData?.data?.upstreamNodeIds && Array.isArray(nodeData.data.upstreamNodeIds)) {
      console.log(`[ImageGeneration] 🔗 Checking ${nodeData.data.upstreamNodeIds.length} upstream nodes for images`);
      const nodesMap = doc.getMap('nodes');
      
      for (const upstreamId of nodeData.data.upstreamNodeIds) {
        try {
          const upstreamNode = nodesMap.get(upstreamId) as Record<string, any> | undefined;
          if (upstreamNode) {
            const upstreamType = upstreamNode.type;
            const upstreamData = upstreamNode.data || {};
            
            // Check if upstream node is an image with a URL/src
            if (upstreamType === 'image' && upstreamData.src) {
              referenceImageUrls.push(upstreamData.src);
              console.log(`[ImageGeneration] 📎 Added reference image from upstream node ${upstreamId}: ${upstreamData.src.substring(0, 50)}...`);
            }
          }
        } catch (error) {
          console.warn(`[ImageGeneration] ⚠️ Failed to read upstream node ${upstreamId}:`, error);
        }
      }
    }
    
    console.log(`[ImageGeneration] 🎨 Total reference images collected: ${referenceImageUrls.length}`);
    
    // Get Gemini executor
    const { createExecutorFactory } = await import('../executors');
    const factory = createExecutorFactory(env as any);
    const executor = factory.getExecutor('nano_banana');
    
    if (!executor) {
      console.error('[ImageGeneration] ❌ Gemini executor not available');
      updateNodeData(doc, nodeId, { status: 'failed', error: 'Executor not available' }, broadcast);
      return;
    }
    
    // Execute generation
    console.log(`[ImageGeneration] 🚀 Starting image generation: prompt="${prompt.slice(0, 50)}...", references=${referenceImageUrls.length}`);
    const result = await executor.submit({
      text: prompt,
      system_prompt: '',
      aspect_ratio: nodeData?.data?.aspectRatio || '16:9',
      base64_images: [],
      reference_image_urls: referenceImageUrls,
    });
    
    if (result.error) {
      console.error(`[ImageGeneration] ❌ Image generation failed: ${result.error}`);
      updateNodeData(doc, nodeId, { status: 'failed', error: result.error }, broadcast);
      return;
    }
    
    // Upload to R2 instead of storing base64 in Loro
    const base64 = result.result_data?.base64;
    const mimeType = result.result_data?.mimeType || 'image/png';
    
    if (!base64) {
      console.error('[ImageGeneration] ❌ No image data in result');
      updateNodeData(doc, nodeId, { status: 'failed', error: 'No image data' }, broadcast);
      return;
    }
    
    // Convert base64 to binary and upload to R2
    const binaryData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const extension = mimeType.split('/')[1] || 'png';
    const objectKey = `projects/${projectId}/generated/${taskId}.${extension}`;
    
    try {
      await env.ASSETS.put(objectKey, binaryData, {
        httpMetadata: {
          contentType: mimeType,
        },
      });
      console.log(`[ImageGeneration] ✅ Uploaded image to R2: ${objectKey} (${binaryData.length} bytes)`);
    } catch (uploadError) {
      console.error(`[ImageGeneration] ❌ Failed to upload to R2:`, uploadError);
      updateNodeData(doc, nodeId, { status: 'failed', error: 'Failed to upload image' }, broadcast);
      return;
    }
    
    // Construct public URL
    const publicUrl = getAssetUrl(env, objectKey);
    
    // Request description from Python API (async, non-blocking)
    if (env.BACKEND_API_URL) {
      try {
        console.log(`[ImageGeneration] 🤖 Requesting description from Python API...`);
        const describeUrl = `${env.BACKEND_API_URL}/api/describe/submit`;
        const describeRes = await fetch(describeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            r2_key: objectKey,
            mime_type: mimeType,
            project_id: projectId,
            node_id: nodeId,
          }),
        });
        if (describeRes.ok) {
          console.log(`[ImageGeneration] ✅ Description request submitted to Python API`);
        } else {
          console.warn(`[ImageGeneration] ⚠️ Description request failed: ${describeRes.status}`);
        }
      } catch (error) {
        console.error(`[ImageGeneration] ❌ Failed to request description (non-blocking):`, error);
      }
    }
    
    console.log(`[ImageGeneration] ✅ Image generation completed for node: ${nodeId}, URL: ${publicUrl}`);
    const updates: Record<string, any> = {
      status: 'completed',
      src: objectKey, // Store R2 key instead of URL
      label: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
      taskId,
    };
    
    updateNodeData(doc, nodeId, updates, broadcast);
  } catch (error) {
    console.error(`[ImageGeneration] ❌ Error in processImageGeneration:`, error);
    updateNodeData(doc, nodeId, { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }, broadcast);
  }
}
