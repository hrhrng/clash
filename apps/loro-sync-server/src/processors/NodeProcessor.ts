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
import { MODEL_CARDS } from '@clash/shared-types';

const defaultImageModel = MODEL_CARDS.find((card) => card.kind === 'image')?.id ?? 'nano-banana-pro';
const defaultVideoModel = MODEL_CARDS.find((card) => card.kind === 'video')?.id ?? 'kling-image2video';
const defaultAudioModel = MODEL_CARDS.find((card) => card.kind === 'audio')?.id ?? 'minimax-tts';

const getModelCard = (modelId?: string) => MODEL_CARDS.find((card) => card.id === modelId);

type AssetStatus = 'uploading' | 'generating' | 'completed' | 'fin' | 'failed';
type NodeType = 'image' | 'video' | 'audio';

// Track nodes currently being processed to prevent duplicate submissions
const processingNodes = new Set<string>();

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

      if (!['image', 'video', 'audio'].includes(nodeType)) continue;

      const status = innerData.status as AssetStatus;
      const src = innerData.src;
      const description = innerData.description;
      const pendingTask = innerData.pendingTask;

      // Skip if already has a pending task
      if (pendingTask) continue;

      // Case 1: generating + no src -> submit generation task
      if (status === 'generating' && !src) {
        // Skip if already being processed (prevent race condition)
        const processingKey = `${nodeId}:gen`;
        if (processingNodes.has(processingKey)) {
          console.log(`[NodeProcessor] ⏭️ Skipping ${nodeId.slice(0, 8)} - already being processed`);
          continue;
        }
        processingNodes.add(processingKey);

        console.log(`[NodeProcessor] 🚀 Submitting ${nodeType}_gen for ${nodeId.slice(0, 8)}`);

        const taskType = nodeType === 'image' ? 'image_gen' : nodeType === 'video' ? 'video_gen' : 'audio_gen';
        const selectedModelId = (innerData.modelId || innerData.model) ??
          (nodeType === 'video' ? defaultVideoModel : nodeType === 'audio' ? defaultAudioModel : defaultImageModel);
        const modelParams = (innerData.modelParams || {}) as Record<string, any>;
        const referenceImages: string[] = Array.isArray(innerData.referenceImageUrls) ? innerData.referenceImageUrls : [];
        const modelCard = getModelCard(selectedModelId);
        const referenceMode = modelCard?.input.referenceMode || 'single';

        if (nodeType === 'video' && modelCard?.input.referenceImage === 'required') {
          const requiredCount = referenceMode === 'start_end' ? 2 : 1;
          if (referenceImages.length < requiredCount) {
            const msg = referenceMode === 'start_end'
              ? 'Two reference images (start/end) required for selected model'
              : 'Reference image required for selected model';
            updateNodeData(doc, nodeId, { status: 'failed', error: msg }, broadcast);
            continue;
          }
        }

        const params: Record<string, any> = {
          prompt: innerData.prompt || innerData.label || '',
          model: selectedModelId,
          model_params: modelParams,
          reference_images: referenceImages,
          reference_mode: referenceMode,
        };

        // Extract aspect ratio from modelParams or node data (fallback to 16:9)
        const aspectRatio = modelParams.aspect_ratio || innerData.aspectRatio || '16:9';

        if (nodeType === 'video') {
          if (referenceImages[0]) {
            params.image_r2_key = referenceImages[0];
          }
          const duration = modelParams.duration ?? innerData.duration ?? 5;
          params.duration = duration;
          params.aspect_ratio = aspectRatio;
          if (modelParams.negative_prompt) params.negative_prompt = modelParams.negative_prompt;
          if (modelParams.cfg_scale) params.cfg_scale = modelParams.cfg_scale;
          if (referenceMode === 'start_end' && referenceImages[1]) {
            params.tail_image_url = referenceImages[1];
          }
        } else if (nodeType === 'audio') {
          // Audio/TTS generation - no reference images or aspect ratio needed
          // Text comes from prompt field
        } else {
          // Image generation
          params.aspect_ratio = aspectRatio;
        }

        const result = await submitTask(env, taskType, projectId, nodeId, params);

        // Clear processing lock
        processingNodes.delete(processingKey);

        if (result.task_id) {
          console.log(`[NodeProcessor] ✅ Task submitted successfully: ${result.task_id} for node ${nodeId.slice(0, 8)}`);
          updateNodeData(doc, nodeId, { pendingTask: result.task_id }, broadcast);
          submitted = true;
        } else {
          console.error(`[NodeProcessor] ❌ Task submission failed for node ${nodeId.slice(0, 8)}: ${result.error}`);
          updateNodeData(doc, nodeId, { status: 'failed', error: result.error || 'Task submission failed' }, broadcast);
        }
      }

      // Case 2: completed + has src + no description -> submit description task
      // Skip audio nodes - they don't need descriptions
      if (status === 'completed' && src && !description && nodeType !== 'audio') {
        // Skip if already being processed (prevent race condition)
        const processingKey = `${nodeId}:desc`;
        if (processingNodes.has(processingKey)) {
          console.log(`[NodeProcessor] ⏭️ Skipping desc for ${nodeId.slice(0, 8)} - already being processed`);
          continue;
        }
        processingNodes.add(processingKey);

        console.log(`[NodeProcessor] 📝 Submitting description for ${nodeId.slice(0, 8)}`);

        const taskType = nodeType === 'image' ? 'image_desc' : 'video_desc';
        const params = {
          r2_key: src,
          mime_type: nodeType === 'image' ? 'image/png' : 'video/mp4',
        };

        const result = await submitTask(env, taskType, projectId, nodeId, params);
        
        // Clear processing lock
        processingNodes.delete(processingKey);
        
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

    console.log(`[NodeProcessor] 📤 Submitting task to ${env.BACKEND_API_URL}/api/tasks/submit`);
    console.log(`[NodeProcessor] 📋 Task details: type=${taskType}, project=${projectId}, node=${nodeId.slice(0, 8)}`);
    console.log(`[NodeProcessor] 📋 Params:`, JSON.stringify(params, null, 2));

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
      console.error(`[NodeProcessor] ❌ HTTP ${response.status} error submitting task: ${text}`);
      return { error: `HTTP ${response.status}: ${text}` };
    }

    const result = await response.json() as { task_id?: string };
    return { task_id: result.task_id };
  } catch (e) {
    console.error(`[NodeProcessor] ❌ Exception during task submission:`, e);
    return { error: String(e) };
  }
}
