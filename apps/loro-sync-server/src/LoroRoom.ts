import { LoroDoc } from 'loro-crdt';
import type { Env, AuthResult } from './types';
import { authenticateRequest } from './auth';
import { loadSnapshot, saveSnapshot } from './storage';
import { getAssetUrl } from './utils';

/**
 * Durable Object for managing a Loro sync room
 * Each project gets its own Durable Object instance
 */
export class LoroRoom {
  private state: DurableObjectState;
  private env: Env;
  private doc: LoroDoc;
  private clients: Set<WebSocket>;
  private projectId: string | null;
  private saveInterval: number | null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.doc = new LoroDoc();
    this.clients = new Set();
    this.projectId = null;
    this.saveInterval = null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Handle internal broadcast-task request
    if (url.pathname === '/broadcast-task' && request.method === 'POST') {
      try {
        const body = await request.json() as {
          task_id: string;
          result_url?: string;
          result_data?: Record<string, any>;
        };

        await this.broadcastTaskCompletion(body.task_id, {
          result_url: body.result_url,
          result_data: body.result_data,
        });

        return new Response('Task broadcasted', { status: 200 });
      } catch (error) {
        console.error('Broadcast task error:', error);
        return new Response('Broadcast failed', { status: 500 });
      }
    }

    // Handle internal trigger-task-polling request (called when new task is submitted)
    if (url.pathname === '/trigger-task-polling' && request.method === 'POST') {
      try {
        await this.triggerTaskPolling();
        return new Response('Task polling triggered', { status: 200 });
      } catch (error) {
        console.error('Trigger task polling error:', error);
        return new Response('Failed to trigger task polling', { status: 500 });
      }
    }

    // Handle HTTP requests (health check, etc.)
    return new Response('Loro Sync Server', { status: 200 });
  }

  /**
   * Handle WebSocket connection
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const projectIdFromQuery = url.searchParams.get('projectId');
    const pathParts = url.pathname.split('/');
    const projectIdFromPath = pathParts[pathParts.length - 1];

    const projectId = projectIdFromQuery || projectIdFromPath;

    console.log(`[LoroRoom] 🔌 New WebSocket connection request for project: ${projectId}`);

    if (!projectId || projectId === 'sync') {
      console.error('[LoroRoom] ❌ Missing project ID in URL');
      return new Response('Missing project ID in URL', { status: 400 });
    }

    let authResult: AuthResult;
    try {
      authResult = await authenticateRequest(request, this.env, projectId);
    } catch (error) {
      console.error('[LoroRoom] ❌ Auth failed:', error);
      return new Response('Unauthorized', { status: 401 });
    }

    console.log(`[LoroRoom] ✅ Auth success for project: ${authResult.projectId} (user: ${authResult.userId})`);

    // Initialize project if not already done
    if (!this.projectId) {
      console.log(`[LoroRoom] 🆕 Initializing new room for project: ${authResult.projectId}`);
      this.projectId = authResult.projectId;
      await this.loadDocument(authResult.projectId);
      await this.startPeriodicSave();
      
      // Check for pending tasks and recover polling if needed
      await this.checkAndRecoverPendingTasks(authResult.projectId);
      
      console.log(`[LoroRoom] ✅ Room initialized for project: ${authResult.projectId}`);
    }

    // Verify project ID matches
    if (this.projectId !== authResult.projectId) {
      console.error(`[LoroRoom] ❌ Project ID mismatch: expected ${this.projectId}, got ${authResult.projectId}`);
      return new Response('Project ID mismatch', { status: 403 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket
    server.accept();
    console.log(`[LoroRoom] ✅ WebSocket accepted for project: ${projectId}`);

    // Add client to the set
    this.clients.add(server);
    console.log(`[LoroRoom] 👥 Client added. Total clients: ${this.clients.size}`);

    // Send initial state to new client
    this.sendInitialState(server);

    // Handle messages
    server.addEventListener('message', (event) => {
      this.handleMessage(server, event.data as string | ArrayBuffer);
    });

    // Handle close
    server.addEventListener('close', () => {
      this.clients.delete(server);
      console.log(`[LoroRoom] 🔌 Client disconnected. Remaining clients: ${this.clients.size}`);
    });

    // Handle errors
    server.addEventListener('error', (error) => {
      console.error('[LoroRoom] ❌ WebSocket error:', error);
      this.clients.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Load Loro document from D1
   */
  private async loadDocument(projectId: string): Promise<void> {
    console.log(`[LoroRoom] 📂 Loading document for project: ${projectId}`);

    const snapshot = await loadSnapshot(this.env.DB, projectId);
    if (snapshot) {
      try {
        this.doc = LoroDoc.fromSnapshot(snapshot);
        console.log(`[LoroRoom] ✅ Loaded document snapshot for project ${projectId} (${snapshot.byteLength} bytes)`);
      } catch (error) {
        console.error(`[LoroRoom] ❌ Failed to import snapshot:`, error);
        this.doc = new LoroDoc();
        console.log(`[LoroRoom] 🆕 Created fresh document after snapshot import failure`);
      }
    } else {
      console.log(`[LoroRoom] 🆕 No existing snapshot for project ${projectId}, starting fresh`);
      this.doc = new LoroDoc();
    }
  }

  /**
   * Send initial document state to a new client
   */
  private sendInitialState(client: WebSocket): void {
    try {
      const snapshot = this.doc.export({ mode: 'snapshot' });
      const snapshotSize = snapshot.byteLength;
      console.log(`[LoroRoom] 📤 Sending initial state to client (${snapshotSize} bytes)`);
      client.send(snapshot);
      console.log(`[LoroRoom] ✅ Initial state sent successfully`);
    } catch (error) {
      console.error('[LoroRoom] ❌ Failed to send initial state:', error);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(sender: WebSocket, data: string | ArrayBuffer): void {
    try {
      // Expect binary data (Loro updates)
      if (typeof data === 'string') {
        console.warn('[LoroRoom] ⚠️ Received text message, expected binary');
        return;
      }

      // Apply updates to document
      const updates = new Uint8Array(data);
      const updateSize = updates.byteLength;
      console.log(`[LoroRoom] 📥 Received update from client (${updateSize} bytes)`);

      this.doc.import(updates);
      console.log(`[LoroRoom] ✅ Update applied to document. Version: ${this.doc.version().toJSON()}`);

      // Check for pending nodes that need processing
      this.processPendingNodes();

      // Broadcast to all other clients
      this.broadcast(updates, sender);
      console.log(`[LoroRoom] 📡 Update broadcasted to ${this.clients.size - 1} other clients`);

      // Save snapshot immediately for reliability during development/debugging
      // In production, this should be debounced
      this.saveDocumentSnapshot().catch(err => console.error('[LoroRoom] ❌ Failed to save snapshot after update:', err));
    } catch (error) {
      console.error('[LoroRoom] ❌ Failed to handle message:', error);
    }
  }

  /**
   * Check for pending nodes and trigger generation tasks
   */
  private async processPendingNodes(): Promise<void> {
    try {
      const nodesMap = this.doc.getMap('nodes');
      const allEntries = nodesMap.entries();
      
      console.log('[LoroRoom] 🔍 Checking for pending nodes...');
      
      let imageNodeCount = 0;
      let videoNodeCount = 0;
      let uploadedAssetCount = 0;
      
      for (const [nodeId, nodeData] of allEntries) {
        const data = nodeData as Record<string, any>;
        const status = data?.data?.status;
        const taskId = data?.data?.taskId;
        const nodeType = data?.type;
        const src = data?.data?.src;
        const description = data?.data?.description;
        
        // Debug: log ALL image and video nodes to see their actual status
        if (nodeType === 'image' || nodeType === 'video') {
          const logType = nodeType === 'image' ? '🖼️ Image Node' : '🎬 Video Node';
          console.log(`[LoroRoom] ${logType}: ${nodeId}`);
          console.log(`  - type: ${nodeType}`);
          console.log(`  - status: ${status}`);
          console.log(`  - taskId: ${taskId}`);
          console.log(`  - hasSrc: ${!!src}`);
          console.log(`  - hasDescription: ${!!description}`);
          console.log(`  - hasPrompt: ${!!(data?.data?.prompt || data?.data?.label)}`);
          console.log(`  - prompt: "${(data?.data?.prompt || data?.data?.label || '').substring(0, 50)}..."`);
          console.log(`  - passes check: ${(status === 'pending' || status === 'generating') && !taskId}`);
          
          if (nodeType === 'image') imageNodeCount++;
          if (nodeType === 'video') videoNodeCount++;
        }
        
        // Check for uploaded assets that need description generation
        // Condition: has src, status is 'completed', but no description yet, and not a generated asset (no taskId or taskId but old)
        if ((nodeType === 'image' || nodeType === 'video') && src && status === 'completed' && !description) {
          console.log(`[LoroRoom] 📤 Found uploaded asset without description: ${nodeId}`);
          uploadedAssetCount++;
          await this.generateDescriptionForAsset(nodeId, data, src, nodeType);
          continue;
        }
        
        // STRICT CHECK: Only process if status is 'pending' or 'generating' AND no taskId is assigned
        // This prevents re-processing nodes that are processing, completed, or failed (error)
        if ((status === 'pending' || status === 'generating') && !taskId) {
          console.log(`[LoroRoom] ✅ Found pending node without taskId: ${nodeId}`);
          
          const prompt = data?.data?.prompt || data?.data?.label || '';
          
          if ((nodeType === 'image' || nodeType === 'action-badge') && prompt) {
            console.log(`[LoroRoom] 🎨 Triggering image generation for node: ${nodeId} (type: ${nodeType})`);
            await this.processImageGeneration(nodeId, data);
          } else if (nodeType === 'video' && prompt) {
            console.log(`[LoroRoom] 🎬 Triggering video generation for node: ${nodeId}`);
            await this.processVideoGeneration(nodeId, data);
          } else {
            console.warn(`[LoroRoom] ⚠️ Skipping node - type: ${nodeType}, prompt: "${prompt.slice(0, 20)}"`);
          }
        }
      }
      
      console.log(`[LoroRoom] Summary: ${imageNodeCount} image nodes, ${videoNodeCount} video nodes, ${uploadedAssetCount} uploaded assets processed`);
    } catch (error) {
      console.error('[LoroRoom] ❌ Error processing pending nodes:', error);
    }
  }

  /**
   * Generate description for an uploaded asset
   */
  private async generateDescriptionForAsset(
    nodeId: string,
    nodeData: Record<string, any>,
    assetUrl: string,
    assetType: string
  ): Promise<void> {
    try {
      console.log(`[LoroRoom] 🤖 Generating description for uploaded ${assetType}: ${nodeId}`);
      
      // Get GCP credentials
      const clientEmail = this.env.GCP_CLIENT_EMAIL;
      const privateKey = this.env.GCP_PRIVATE_KEY;
      
      if (!clientEmail || !privateKey) {
        console.warn(`[LoroRoom] ⚠️ GCP credentials not configured, skipping description generation`);
        return;
      }
      
      // Get Gemini executor
      const { createExecutorFactory } = await import('./executors');
      const factory = createExecutorFactory(this.env as any);
      const geminiExecutor = factory.getExecutor('nano_banana') as any;
      
      if (!geminiExecutor || !geminiExecutor.generateDescription) {
        console.error('[LoroRoom] ❌ Gemini executor not available for description generation');
        return;
      }
      
      // Determine MIME type
      const mimeType = assetType === 'video' ? 'video/mp4' : 'image/png';
      
      // Generate description
      const description = await geminiExecutor.generateDescription(
        assetUrl,
        mimeType,
        clientEmail,
        privateKey
      );
      
      if (description) {
        console.log(`[LoroRoom] ✅ Description generated for uploaded ${assetType}: "${description.substring(0, 100)}..."`);
        
        // Update node with description
        console.log(`[LoroRoom] 📝 Updating node ${nodeId} with description (length: ${description.length})`);
        this.updateNodeData(nodeId, {
          description: description,
        });
        console.log(`[LoroRoom] ✅ Description update complete for ${nodeId}`);
      } else {
        console.warn(`[LoroRoom] ⚠️ Description generation returned null for ${nodeId}`);
      }
    } catch (error) {
      console.error(`[LoroRoom] ❌ Error generating description for uploaded asset:`, error);
      // Don't update node status - this is non-blocking
    }
  }

  /**
   * Process image generation for a pending node
   */
  private async processImageGeneration(nodeId: string, nodeData: Record<string, any>): Promise<void> {
    try {
      const prompt = nodeData?.data?.prompt || nodeData?.data?.label || '';
      const taskId = `img_${Date.now()}_${nodeId.slice(0, 8)}`;
      
      // Mark node as processing with taskId (so we don't process again)
      this.updateNodeData(nodeId, { taskId, status: 'generating' });
      
      // Get reference image URLs from node data
      // Support both explicit referenceImageUrls and upstreamNodeIds
      const referenceImageUrls: string[] = [];
      
      // Priority 1: Explicit referenceImageUrls
      if (nodeData?.data?.referenceImageUrls && Array.isArray(nodeData.data.referenceImageUrls)) {
        referenceImageUrls.push(...nodeData.data.referenceImageUrls);
        console.log(`[LoroRoom] 📎 Found ${nodeData.data.referenceImageUrls.length} explicit reference image URLs`);
      }
      
      // Priority 2: Extract from upstreamNodeIds
      if (nodeData?.data?.upstreamNodeIds && Array.isArray(nodeData.data.upstreamNodeIds)) {
        console.log(`[LoroRoom] 🔗 Checking ${nodeData.data.upstreamNodeIds.length} upstream nodes for images`);
        const nodesMap = this.doc.getMap('nodes');
        
        for (const upstreamId of nodeData.data.upstreamNodeIds) {
          try {
            const upstreamNode = nodesMap.get(upstreamId) as Record<string, any> | undefined;
            if (upstreamNode) {
              const upstreamType = upstreamNode.type;
              const upstreamData = upstreamNode.data || {};
              
              // Check if upstream node is an image with a URL/src
              if (upstreamType === 'image' && upstreamData.src) {
                referenceImageUrls.push(upstreamData.src);
                console.log(`[LoroRoom] 📎 Added reference image from upstream node ${upstreamId}: ${upstreamData.src.substring(0, 50)}...`);
              }
            }
          } catch (error) {
            console.warn(`[LoroRoom] ⚠️ Failed to read upstream node ${upstreamId}:`, error);
          }
        }
      }
      
      console.log(`[LoroRoom] 🎨 Total reference images collected: ${referenceImageUrls.length}`);
      
      // Get Gemini executor
      const { createExecutorFactory } = await import('./executors');
      const factory = createExecutorFactory(this.env as any);
      const executor = factory.getExecutor('nano_banana');
      
      if (!executor) {
        console.error('[LoroRoom] ❌ Gemini executor not available');
        this.updateNodeData(nodeId, { status: 'failed', error: 'Executor not available' });
        return;
      }
      
      // Execute generation
      console.log(`[LoroRoom] 🚀 Starting image generation: prompt="${prompt.slice(0, 50)}...", references=${referenceImageUrls.length}`);
      const result = await executor.submit({
        text: prompt,
        system_prompt: '',
        aspect_ratio: nodeData?.data?.aspectRatio || '16:9',
        base64_images: [],  // Empty for now, could be added later
        reference_image_urls: referenceImageUrls,  // ✅ Now passing reference images!
      });
      
      if (result.error) {
        console.error(`[LoroRoom] ❌ Image generation failed: ${result.error}`);
        this.updateNodeData(nodeId, { status: 'failed', error: result.error });
        return;
      }
      
      // Upload to R2 instead of storing base64 in Loro
      const base64 = result.result_data?.base64;
      const mimeType = result.result_data?.mimeType || 'image/png';
      
      if (!base64) {
        console.error('[LoroRoom] ❌ No image data in result');
        this.updateNodeData(nodeId, { status: 'failed', error: 'No image data' });
        return;
      }
      
      // Convert base64 to binary and upload to R2
      const binaryData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const extension = mimeType.split('/')[1] || 'png';
      const objectKey = `generated/${this.projectId}/${taskId}.${extension}`;
      
      try {
        await this.env.ASSETS.put(objectKey, binaryData, {
          httpMetadata: {
            contentType: mimeType,
          },
        });
        console.log(`[LoroRoom] ✅ Uploaded image to R2: ${objectKey} (${binaryData.length} bytes)`);
      } catch (uploadError) {
        console.error(`[LoroRoom] ❌ Failed to upload to R2:`, uploadError);
        this.updateNodeData(nodeId, { status: 'failed', error: 'Failed to upload image' });
        return;
      }
      
      // Construct public URL using R2 public URL (or localhost fallback)
      const publicUrl = getAssetUrl(this.env, objectKey);
      
      // Generate description for the image
      let description: string | null = null;
      try {
        console.log(`[LoroRoom] 🤖 Generating description for image...`);
        const geminiExecutor = executor as any; // Cast to access generateDescription method
        const clientEmail = this.env.GCP_CLIENT_EMAIL;
        const privateKey = this.env.GCP_PRIVATE_KEY;
        
        if (geminiExecutor.generateDescription && clientEmail && privateKey) {
          description = await geminiExecutor.generateDescription(publicUrl, mimeType, clientEmail, privateKey);
          if (description) {
            console.log(`[LoroRoom] ✅ Description generated: "${description.substring(0, 100)}..."`);
          } else {
            console.warn(`[LoroRoom] ⚠️ Description generation returned null`);
          }
        } else if (!clientEmail || !privateKey) {
          console.warn(`[LoroRoom] ⚠️ GCP credentials not configured, skipping description generation`);
        }
      } catch (error) {
        console.error(`[LoroRoom] ❌ Failed to generate description (non-blocking):`, error);
        // Continue - description is optional
      }
      
      console.log(`[LoroRoom] ✅ Image generation completed for node: ${nodeId}, URL: ${publicUrl}`);
      const updates: Record<string, any> = {
        status: 'completed',
        src: publicUrl,  // Store URL instead of base64!
        label: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),  // Use prompt as label
        taskId,
      };
      
      // Add description if available
      if (description) {
        updates.description = description;
      }
      
      this.updateNodeData(nodeId, updates);
    } catch (error) {
      console.error(`[LoroRoom] ❌ Error in processImageGeneration:`, error);
      this.updateNodeData(nodeId, { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Process video generation for a pending node
   */
  private async processVideoGeneration(nodeId: string, nodeData: Record<string, any>): Promise<void> {
    try {
      const prompt = nodeData?.data?.prompt || nodeData?.data?.label || '';
      const taskId = `vid_${Date.now()}_${nodeId.slice(0, 8)}`;
      const referenceImageUrls: string[] = nodeData?.data?.referenceImageUrls || [];
      const duration = nodeData?.data?.duration || 5;
      const model = nodeData?.data?.model || 'kling-v1';
      
      // Mark node as processing with taskId
      this.updateNodeData(nodeId, { taskId, status: 'generating' });
      
      // Get Kling executor
      const { createExecutorFactory } = await import('./executors');
      const factory = createExecutorFactory(this.env as any);
      const executor = factory.getExecutor('kling_video');
      
      if (!executor) {
        console.error('[LoroRoom] ❌ Kling executor not available');
        this.updateNodeData(nodeId, { status: 'failed', error: 'Executor not available' });
        return;
      }
      
      // Check for reference images
      if (referenceImageUrls.length === 0) {
        console.error('[LoroRoom] ❌ Video generation requires at least one reference image');
        this.updateNodeData(nodeId, { status: 'failed', error: 'No reference image provided' });
        return;
      }
      
      // Convert base64 images to R2 URLs
      const processedImageUrls: string[] = [];
      for (const imageUrl of referenceImageUrls) {
        if (imageUrl.startsWith('data:image/')) {
          // Upload base64 to R2
          console.log('[LoroRoom] 📤 Uploading base64 image to R2...');
          const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
          if (base64Match) {
            const format = base64Match[1];
            const base64Data = base64Match[2];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            const objectKey = `video-ref/${this.projectId}/${Date.now()}_${nodeId.slice(0, 8)}.${format === 'jpeg' ? 'jpg' : format}`;
            await this.env.ASSETS.put(objectKey, bytes.buffer, {
              httpMetadata: {
                contentType: `image/${format}`,
              },
            });
            
            // Construct public URL using R2 public URL (or localhost fallback)
            const publicUrl = getAssetUrl(this.env, objectKey);
            console.log(`[LoroRoom] ✅ Uploaded reference image to R2: ${publicUrl}`);
            processedImageUrls.push(publicUrl);
          } else {
            console.error('[LoroRoom] ❌ Invalid base64 image format');
          }
        } else {
          // Already a URL
          processedImageUrls.push(imageUrl);
        }
      }
      
      if (processedImageUrls.length === 0) {
        console.error('[LoroRoom] ❌ No valid reference images after processing');
        this.updateNodeData(nodeId, { status: 'failed', error: 'Failed to process reference images' });
        return;
      }
      
      console.log(`[LoroRoom] 🚀 Starting video generation: ${prompt.slice(0, 50)}...`);
      console.log(`[LoroRoom] 📷 Reference images: ${processedImageUrls.length}`);
      
      const result = await executor.submit({
        prompt,
        duration,
        model,
        image_path: processedImageUrls[0], // First image as start frame
        image_tail: processedImageUrls.length > 1 ? processedImageUrls[1] : undefined, // Second image as end frame (optional)
      });
      
      if (result.error) {
        console.error(`[LoroRoom] ❌ Video generation failed: ${result.error}`);
        this.updateNodeData(nodeId, { status: 'failed', error: result.error });
        return;
      }
      
      // Video is async, store external task ID for polling
      if (result.external_task_id) {
        console.log(`[LoroRoom] ⏳ Video task submitted: ${result.external_task_id}`);
        
        // Persist task to D1 so polling loop can pick it up
        const { submitTask } = await import('./tasks');
        await submitTask(this.env.DB, {
          project_id: this.projectId || 'unknown',
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

        this.updateNodeData(nodeId, {
          status: 'generating',
          externalTaskId: result.external_task_id,
          taskId,
        });
        
        // Trigger task polling
        await this.triggerTaskPolling();
      }
    } catch (error) {
      console.error(`[LoroRoom] ❌ Error in processVideoGeneration:`, error);
      this.updateNodeData(nodeId, { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Update node data in Loro document and broadcast
   */
  private updateNodeData(nodeId: string, updates: Record<string, any>): void {
    try {
      const versionBefore = this.doc.version();
      const nodesMap = this.doc.getMap('nodes');
      
      const existingNode = nodesMap.get(nodeId) as Record<string, any> | undefined;
      if (!existingNode) {
        console.warn(`[LoroRoom] ⚠️ Node not found for update: ${nodeId}`);
        return;
      }
      
      // Log position before merge
      console.log(`[LoroRoom] DEBUG: Updating node ${nodeId}, existing position:`, existingNode.position);
      
      // Merge updates into existing node data
      const updatedNode: Record<string, any> = {
        ...existingNode,
        data: {
          ...(existingNode.data || {}),
          ...updates,
        },
      };
      
      // Ensure position is preserved
      if (!updatedNode.position) {
        console.error(`[LoroRoom] ❌ CRITICAL: position missing after merge for node ${nodeId}! Restoring from existingNode.`);
        updatedNode.position = existingNode.position || { x: 0, y: 0 };
      }
      
      console.log(`[LoroRoom] DEBUG: Updated node ${nodeId}, new position:`, updatedNode.position);
      
      nodesMap.set(nodeId, updatedNode);
      
      const update = this.doc.export({
        mode: 'update',
        from: versionBefore,
      });
      
      this.broadcast(update);
      console.log(`[LoroRoom] 📤 Node updated and broadcasted: ${nodeId}`);
      
      // Save snapshot after server-side updates (critical for persistence!)
      this.saveDocumentSnapshot().catch(err => console.error('[LoroRoom] ❌ Failed to save snapshot after node update:', err));
    } catch (error) {
      console.error(`[LoroRoom] ❌ Error updating node data:`, error);
    }
  }

  /**
   * Broadcast update to all clients except sender
   */
  private broadcast(data: Uint8Array, sender?: WebSocket): void {
    let successCount = 0;
    let failCount = 0;

    for (const client of this.clients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
          successCount++;
        } catch (error) {
          console.error('[LoroRoom] ❌ Failed to broadcast to client:', error);
          this.clients.delete(client);
          failCount++;
        }
      }
    }

    if (successCount > 0 || failCount > 0) {
      console.log(`[LoroRoom] 📡 Broadcast complete: ${successCount} sent, ${failCount} failed`);
    }
  }

  /**
   * Start periodic snapshot saves (only snapshots, no task polling)
   */
  private async startPeriodicSave(): Promise<void> {
    console.log(`[LoroRoom] ⏰ Setting up periodic snapshot save for project: ${this.projectId}`);

    // Store project ID for alarm handler
    await this.state.storage.put('project_id', this.projectId);

    // Initialize snapshot timestamp
    await this.state.storage.put('last_snapshot_time', 0);

    // Schedule first alarm in 5 minutes for snapshot
    const nextAlarmTime = Date.now() + 5 * 60 * 1000;
    await this.state.storage.setAlarm(nextAlarmTime);

    console.log(`[LoroRoom] ✅ Periodic snapshot save started (every 5 min)`);
  }

  private isSaving: boolean = false;
  private needsSave: boolean = false;

  /**
   * Save current document snapshot to D1
   * Implements sequential saving to prevent race conditions
   */
  private async saveDocumentSnapshot(): Promise<void> {
    if (!this.projectId) {
      console.warn('[LoroRoom] ⚠️ Cannot save snapshot: no project ID');
      return;
    }

    // If already saving, mark that we need another save after the current one finishes
    if (this.isSaving) {
      this.needsSave = true;
      return;
    }

    this.isSaving = true;
    this.needsSave = false;

    console.log(`[LoroRoom] 💾 Saving document snapshot for project: ${this.projectId}`);

    try {
      const snapshot = this.doc.export({ mode: 'snapshot' });
      const version = this.doc.version().toString();
      const snapshotSize = snapshot.byteLength;

      await saveSnapshot(this.env.DB, this.projectId, snapshot, version);
      console.log(`[LoroRoom] ✅ Snapshot saved successfully (${snapshotSize} bytes, version: ${version})`);
    } catch (error) {
      console.error('[LoroRoom] ❌ Failed to save snapshot:', error);
    } finally {
      this.isSaving = false;
      
      // If another change happened while we were saving, save again
      if (this.needsSave) {
        // Use setTimeout to avoid recursion stack overflow and let the event loop breathe
        setTimeout(() => this.saveDocumentSnapshot(), 100);
      }
    }
  }

  /**
   * Alarm handler
   * Two types of alarms:
   * 1. Snapshot alarm (every 5 minutes) - for document persistence
   * 2. Task polling alarm (every 10 seconds) - triggered only when tasks are pending
   */
  async alarm(): Promise<void> {
    try {
      const alarmType = (await this.state.storage.get<string>('alarm_type')) || 'snapshot';

      if (alarmType === 'snapshot') {
        // Save snapshot
        console.log('[LoroRoom] Snapshot alarm triggered');
        await this.saveDocumentSnapshot();
        await this.state.storage.put('last_snapshot_time', Date.now());

        // Schedule next snapshot alarm in 5 minutes
        const nextAlarmTime = Date.now() + 5 * 60 * 1000;
        await this.state.storage.put('alarm_type', 'snapshot');
        await this.state.storage.setAlarm(nextAlarmTime);
      } else if (alarmType === 'task_polling') {
        // Poll pending tasks
        console.log('[LoroRoom] Task polling alarm triggered');
        const hasPendingTasks = await this.pollPendingTasks();

        if (hasPendingTasks) {
          // Still have pending tasks, schedule next poll in 10 seconds
          const nextAlarmTime = Date.now() + 10 * 1000;
          await this.state.storage.put('alarm_type', 'task_polling');
          await this.state.storage.setAlarm(nextAlarmTime);
          console.log('[LoroRoom] Scheduled next task poll in 10 seconds');
        } else {
          // No more pending tasks, switch back to snapshot-only mode
          console.log('[LoroRoom] No more pending tasks, switching to snapshot-only mode');
          const nextAlarmTime = Date.now() + 5 * 60 * 1000;
          await this.state.storage.put('alarm_type', 'snapshot');
          await this.state.storage.setAlarm(nextAlarmTime);
        }
      }
    } catch (error) {
      console.error('[LoroRoom] Error in alarm handler:', error);
      // On error, default to snapshot mode
      const nextAlarmTime = Date.now() + 5 * 60 * 1000;
      await this.state.storage.put('alarm_type', 'snapshot');
      await this.state.storage.setAlarm(nextAlarmTime);
    }
  }

  /**
   * Check for pending tasks on room init and recover polling if needed
   * This ensures polling resumes after Durable Object restarts
   */
  private async checkAndRecoverPendingTasks(projectId: string): Promise<void> {
    try {
      // Query if there are any pending/processing tasks for this project
      const { results } = await this.env.DB.prepare(
        `SELECT COUNT(*) as count FROM aigc_tasks
         WHERE project_id = ?
         AND status IN ('generating', 'pending', 'processing')
         AND retry_count < max_retries`
      )
        .bind(projectId)
        .all<{ count: number }>();
      
      const pendingCount = results?.[0]?.count || 0;
      
      if (pendingCount > 0) {
        console.log(`[LoroRoom] 🔄 Found ${pendingCount} pending tasks, recovering polling for project: ${projectId}`);
        
        // Switch to task polling mode
        await this.state.storage.put('alarm_type', 'task_poll');
        await this.state.storage.setAlarm(Date.now() + 5000); // Start polling in 5 seconds
      }
    } catch (error) {
      console.error('[LoroRoom] Error checking pending tasks:', error);
    }
  }

  /**
   * Poll pending tasks for this project
   * Returns true if there are still pending tasks, false otherwise
   */
  private async pollPendingTasks(): Promise<boolean> {
    try {
      // Get project ID from state
      const projectId = await this.state.storage.get<string>('project_id');
      if (!projectId) return false;

      // Query pending tasks from D1
      const { results } = await this.env.DB.prepare(
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

      console.log(`[LoroRoom] Found ${results.length} pending tasks for project ${projectId}`);

      // Import executors dynamically
      const { createExecutorFactory } = await import('./executors');
      const { updateTaskStatus, incrementRetry, touchTask } = await import('./tasks');
      const factory = createExecutorFactory(this.env as any);

      let stillHasPendingTasks = false;

      // Poll each task
      for (const task of results) {
        console.log(`[LoroRoom] Polling task ${task.task_id}: external_task_id=${task.external_task_id}, external_service=${task.external_service}`);
        if (!task.external_task_id || !task.external_service) {
          console.log(`[LoroRoom] Skipping task ${task.task_id}: missing external_task_id or external_service`);
          continue;
        }

        const executor = factory.getExecutorByService(task.external_service);
        if (!executor) continue;

        try {
          const pollResult = await executor.poll(task.external_task_id);

          if (pollResult.completed) {
            if (pollResult.error) {
              await updateTaskStatus(this.env.DB, task.task_id, 'failed', {
                error_message: pollResult.error,
              });
              console.log(`[LoroRoom] Task ${task.task_id} failed: ${pollResult.error}`);
              
              // Find and update the corresponding node in Loro doc
              const nodeId = this.findNodeIdByTaskId(task.task_id);
              if (nodeId) {
                this.updateNodeData(nodeId, { 
                  status: 'failed', 
                  error: pollResult.error 
                });
              }
            } else {
              await updateTaskStatus(this.env.DB, task.task_id, 'completed', {
                result_url: pollResult.result_url,
                result_data: pollResult.result_data,
              });
              console.log(`[LoroRoom] Task ${task.task_id} completed: ${pollResult.result_url}`);

              // Generate description for video
              let description: string | null = null;
              if (pollResult.result_url) {
                try {
                  console.log(`[LoroRoom] 🤖 Generating description for video...`);
                  const { createExecutorFactory } = await import('./executors');
                  const factory = createExecutorFactory(this.env as any);
                  const geminiExecutor = factory.getExecutor('nano_banana') as any;
                  const clientEmail = this.env.GCP_CLIENT_EMAIL;
                  const privateKey = this.env.GCP_PRIVATE_KEY;
                  
                  if (geminiExecutor && geminiExecutor.generateDescription && clientEmail && privateKey) {
                    description = await geminiExecutor.generateDescription(pollResult.result_url, 'video/mp4', clientEmail, privateKey);
                    if (description) {
                      console.log(`[LoroRoom] ✅ Video description generated: "${description.substring(0, 100)}..."`);
                    }
                  } else if (!clientEmail || !privateKey) {
                    console.warn(`[LoroRoom] ⚠️ GCP credentials not configured, skipping video description generation`);
                  }
                } catch (error) {
                  console.error(`[LoroRoom] ❌ Failed to generate video description (non-blocking):`, error);
                  // Continue - description is optional
                }
              }

              // Broadcast task completion
              await this.broadcastTaskCompletion(task.task_id, {
                result_url: pollResult.result_url,
                result_data: pollResult.result_data,
              });
              
              // Also update the node status directly
              const nodeId = this.findNodeIdByTaskId(task.task_id);
              if (nodeId) {
                 const resultData = pollResult.result_data || {};
                 const updates: Record<string, any> = { status: 'completed' };
                 
                 if (pollResult.result_url) {
                   updates.src = pollResult.result_url;
                 }
                 
                 // Update label with task prompt
                 if (task.params?.prompt) {
                   const prompt = task.params.prompt;
                   updates.label = prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');
                 }
                 
                 // Add description if available
                 if (description) {
                   updates.description = description;
                 }
                 
                 this.updateNodeData(nodeId, updates);
              }
            }
          } else {
            // Task still pending - just touch it to update timestamp
            // Do NOT increment retry count for normal pending state
            await touchTask(this.env.DB, task.task_id);
            stillHasPendingTasks = true;
          }
        } catch (error) {
          console.error(`[LoroRoom] Error polling task ${task.task_id}:`, error);
          
          // Increment retry count for actual errors
          await incrementRetry(this.env.DB, task.task_id);
          
          // Check if we exceeded max retries
          // Note: task object is stale, so we check task.retry_count + 1
          if (task.retry_count + 1 >= task.max_retries) {
             console.error(`[LoroRoom] Task ${task.task_id} exceeded max retries (${task.max_retries}), marking as failed`);
             await updateTaskStatus(this.env.DB, task.task_id, 'failed', {
                error_message: `Exceeded max retries: ${error instanceof Error ? error.message : String(error)}`,
             });
             
             const nodeId = this.findNodeIdByTaskId(task.task_id);
             if (nodeId) {
                this.updateNodeData(nodeId, { 
                  status: 'error', 
                  error: 'Task failed after multiple retries' 
                });
             }
          } else {
             stillHasPendingTasks = true;
          }
        }
      }

      return stillHasPendingTasks;
    } catch (error) {
      console.error('[LoroRoom] Error in pollPendingTasks:', error);
      return false;
    }
  }

  /**
   * Helper: Find node ID by task ID
   */
  private findNodeIdByTaskId(taskId: string): string | null {
    try {
      const nodesMap = this.doc.getMap('nodes');
      for (const [nodeId, nodeData] of nodesMap.entries()) {
        const data = nodeData as Record<string, any>;
        if (data?.data?.taskId === taskId) {
          return nodeId;
        }
      }
    } catch (error) {
      console.error('[LoroRoom] Error finding node by task ID:', error);
    }
    return null;
  }

  /**
   * Trigger task polling alarm (called when a new task is submitted)
   */
  async triggerTaskPolling(): Promise<void> {
    // Switch to task polling mode and schedule immediate alarm
    await this.state.storage.put('alarm_type', 'task_polling');
    const nextAlarmTime = Date.now() + 10 * 1000; // Poll in 10 seconds
    await this.state.storage.setAlarm(nextAlarmTime);
    console.log('[LoroRoom] Task polling alarm triggered, will poll in 10 seconds');
  }

  /**
   * Broadcast task completion to all connected clients via Loro
   */
  private async broadcastTaskCompletion(
    taskId: string,
    result: { result_url?: string; result_data?: Record<string, any> }
  ): Promise<void> {
    console.log(`[LoroRoom] 📢 Broadcasting task completion: ${taskId}`);

    try {
      // Store the version before the update
      const versionBefore = this.doc.version();

      // Update Loro document with task result
      // This assumes the Loro doc has a "tasks" map container
      const tasksMap = this.doc.getMap('tasks');
      tasksMap.set(taskId, {
        status: 'completed',
        result_url: result.result_url,
        result_data: result.result_data,
        completed_at: Date.now(),
      });

      console.log(`[LoroRoom] ✅ Task added to Loro document: ${taskId}`);

      // TODO: Also update corresponding node's status if it exists
      // This would require a task_id -> node_id mapping
      // For now, frontend/agent will handle node updates separately

      // Export the incremental update since the version before our change
      const update = this.doc.export({
        mode: 'update',
        from: versionBefore,
      });

      // Broadcast to all clients
      this.broadcast(update);

      console.log(`[LoroRoom] ✅ Task completion broadcasted: ${taskId}`);
    } catch (error) {
      console.error('[LoroRoom] ❌ Error broadcasting task completion:', error);
    }
  }

  /**
   * Helper: Add or update a node in the Loro document
   * This is an internal method for sync server use
   * Clients (frontend/agent) should write directly to the Loro map
   */
  private updateNode(nodeId: string, nodeData: Record<string, any>): void {
    try {
      const versionBefore = this.doc.version();
      const nodesMap = this.doc.getMap('nodes');

      nodesMap.set(nodeId, nodeData);

      const update = this.doc.export({
        mode: 'update',
        from: versionBefore,
      });

      this.broadcast(update);
      console.log(`Updated node: ${nodeId}`);
    } catch (error) {
      console.error('Error updating node:', error);
    }
  }

  /**
   * Helper: Add or update an edge in the Loro document
   * This is an internal method for sync server use
   * Clients (frontend/agent) should write directly to the Loro map
   */
  private updateEdge(edgeId: string, edgeData: Record<string, any>): void {
    try {
      const versionBefore = this.doc.version();
      const edgesMap = this.doc.getMap('edges');

      edgesMap.set(edgeId, edgeData);

      const update = this.doc.export({
        mode: 'update',
        from: versionBefore,
      });

      this.broadcast(update);
      console.log(`Updated edge: ${edgeId}`);
    } catch (error) {
      console.error('Error updating edge:', error);
    }
  }
}
