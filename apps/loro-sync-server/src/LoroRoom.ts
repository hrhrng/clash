import { LoroDoc } from 'loro-crdt';
import type { Env, AuthResult } from './types';
import { authenticateRequest } from './auth';
import { loadSnapshot, saveSnapshot } from './storage';
import { processPendingNodes } from './processors/NodeProcessor';
import { 
  checkAndRecoverPendingTasks, 
  pollPendingTasks,
  pollDescriptionTasks,
  triggerTaskPolling as triggerPollingService,
  findNodeIdByTaskId 
} from './polling/TaskPolling';
import { updateNodeData, updateNode, updateEdge } from './sync/NodeUpdater';

/**
 * Durable Object for managing a Loro sync room
 * Each project gets its own Durable Object instance
 * 
 * This is a thin orchestrator that delegates to specialized modules:
 * - processors/NodeProcessor.ts - Node processing logic
 * - generators/*.ts - Image/video generation
 * - polling/TaskPolling.ts - Async task polling
 * - sync/NodeUpdater.ts - Loro document updates
 */
export class LoroRoom {
  private state: DurableObjectState;
  private env: Env;
  private doc: LoroDoc;
  private clients: Set<WebSocket>;
  private projectId: string | null;
  private saveInterval: number | null;
  private isSaving: boolean = false;
  private needsSave: boolean = false;
  private initPromise: Promise<void> | null = null;

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

    // Handle internal trigger-task-polling request
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
    if (!this.initPromise) {
      this.initPromise = (async () => {
        console.log(`[LoroRoom] 🆕 Initializing new room for project: ${authResult.projectId}`);
        this.projectId = authResult.projectId;
        await this.loadDocument(authResult.projectId);
        await this.startPeriodicSave();
        
        // Check for pending tasks and recover polling if needed
        await checkAndRecoverPendingTasks(authResult.projectId, this.env, this.state);
        
        console.log(`[LoroRoom] ✅ Room initialized for project: ${authResult.projectId}`);
      })();
    }

    // Wait for initialization to complete
    await this.initPromise;

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
  private async handleMessage(sender: WebSocket, data: string | ArrayBuffer): Promise<void> {
    // Ensure room is initialized before processing updates
    if (this.initPromise) {
      await this.initPromise;
    }

    try {
      if (typeof data === 'string') {
        console.warn('[LoroRoom] ⚠️ Received text message, expected binary');
        return;
      }

      const updates = new Uint8Array(data);
      const updateSize = updates.byteLength;
      console.log(`[LoroRoom] 📥 Received update from client (${updateSize} bytes)`);

      this.doc.import(updates);
      console.log(`[LoroRoom] ✅ Update applied to document. Version: ${this.doc.version().toJSON()}`);

      // Check for pending nodes (using extracted module)
      processPendingNodes(
        this.doc,
        this.env,
        this.projectId || '',
        (data) => this.broadcast(data),
        () => this.triggerTaskPolling()
      );

      // Broadcast to all other clients
      this.broadcast(updates, sender);
      console.log(`[LoroRoom] 📡 Update broadcasted to ${this.clients.size - 1} other clients`);

      // Save snapshot
      this.saveDocumentSnapshot().catch(err => 
        console.error('[LoroRoom] ❌ Failed to save snapshot after update:', err)
      );
    } catch (error) {
      console.error('[LoroRoom] ❌ Failed to handle message:', error);
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
   * Start periodic snapshot saves
   */
  private async startPeriodicSave(): Promise<void> {
    console.log(`[LoroRoom] ⏰ Setting up periodic snapshot save for project: ${this.projectId}`);

    await this.state.storage.put('project_id', this.projectId);
    await this.state.storage.put('last_snapshot_time', 0);

    const nextAlarmTime = Date.now() + 5 * 60 * 1000;
    await this.state.storage.setAlarm(nextAlarmTime);

    console.log(`[LoroRoom] ✅ Periodic snapshot save started (every 5 min)`);
  }

  /**
   * Save current document snapshot to D1
   */
  private async saveDocumentSnapshot(): Promise<void> {
    if (!this.projectId) {
      console.warn('[LoroRoom] ⚠️ Cannot save snapshot: no project ID');
      return;
    }

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
      
      if (this.needsSave) {
        setTimeout(() => this.saveDocumentSnapshot(), 100);
      }
    }
  }

  /**
   * Alarm handler for periodic tasks
   */
  async alarm(): Promise<void> {
    try {
      const alarmType = (await this.state.storage.get<string>('alarm_type')) || 'snapshot';

      if (alarmType === 'snapshot') {
        console.log('[LoroRoom] Snapshot alarm triggered');
        await this.saveDocumentSnapshot();
        await this.state.storage.put('last_snapshot_time', Date.now());

        const nextAlarmTime = Date.now() + 5 * 60 * 1000;
        await this.state.storage.put('alarm_type', 'snapshot');
        await this.state.storage.setAlarm(nextAlarmTime);
      } else if (alarmType === 'task_polling') {
        console.log('[LoroRoom] Task polling alarm triggered');
        
        // Poll AIGC tasks (video generation, etc.)
        const hasPendingAIGCTasks = await pollPendingTasks(
          this.projectId || '',
          this.env,
          this.doc,
          (data) => this.broadcast(data)
        );
        
        // Poll description tasks (from Python API)
        const hasPendingDescriptionTasks = await pollDescriptionTasks(
          this.projectId || '',
          this.env,
          this.doc,
          (data) => this.broadcast(data)
        );

        const hasPendingTasks = hasPendingAIGCTasks || hasPendingDescriptionTasks;

        if (hasPendingTasks) {
          const nextAlarmTime = Date.now() + 2 * 1000;
          await this.state.storage.put('alarm_type', 'task_polling');
          await this.state.storage.setAlarm(nextAlarmTime);
          console.log('[LoroRoom] Scheduled next task poll in 2 seconds');
        } else {
          console.log('[LoroRoom] No more pending tasks, switching to snapshot-only mode');
          const nextAlarmTime = Date.now() + 5 * 60 * 1000;
          await this.state.storage.put('alarm_type', 'snapshot');
          await this.state.storage.setAlarm(nextAlarmTime);
        }
      }
    } catch (error) {
      console.error('[LoroRoom] Error in alarm handler:', error);
      const nextAlarmTime = Date.now() + 5 * 60 * 1000;
      await this.state.storage.put('alarm_type', 'snapshot');
      await this.state.storage.setAlarm(nextAlarmTime);
    }
  }

  /**
   * Trigger task polling
   */
  async triggerTaskPolling(): Promise<void> {
    await triggerPollingService(this.state);
  }

  /**
   * Broadcast task completion to all connected clients
   */
  private async broadcastTaskCompletion(
    taskId: string,
    result: { result_url?: string; result_data?: Record<string, any> }
  ): Promise<void> {
    console.log(`[LoroRoom] 📢 Broadcasting task completion: ${taskId}`);

    try {
      const versionBefore = this.doc.version();

      const tasksMap = this.doc.getMap('tasks');
      tasksMap.set(taskId, {
        status: 'completed',
        result_url: result.result_url,
        result_data: result.result_data,
        completed_at: Date.now(),
      });

      console.log(`[LoroRoom] ✅ Task added to Loro document: ${taskId}`);

      const update = this.doc.export({
        mode: 'update',
        from: versionBefore,
      });

      this.broadcast(update);
      console.log(`[LoroRoom] ✅ Task completion broadcasted: ${taskId}`);
    } catch (error) {
      console.error('[LoroRoom] ❌ Error broadcasting task completion:', error);
    }
  }
}
