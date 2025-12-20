import { useEffect, useRef, useCallback, useState } from 'react';
import { LoroDoc, UndoManager } from 'loro-crdt';
import { Node, Edge } from 'reactflow';

interface LoroSyncOptions {
  projectId: string;
  syncServerUrl: string;
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  onTaskUpdate?: (taskId: string, taskData: any) => void;
}

export interface UseLoroSyncReturn {
  doc: LoroDoc | null;
  connected: boolean;
  addNode: (nodeId: string, nodeData: any) => void;
  updateNode: (nodeId: string, nodeData: any) => void;
  removeNode: (nodeId: string) => void;
  addEdge: (edgeId: string, edgeData: any) => void;
  updateEdge: (edgeId: string, edgeData: any) => void;
  removeEdge: (edgeId: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// IndexedDB helpers
const DB_NAME = 'loro-sync-db';
const STORE_NAME = 'snapshots';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const saveToDB = async (projectId: string, snapshot: Uint8Array): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(snapshot, projectId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[useLoroSync] Failed to save to IndexedDB:', err);
  }
};

const loadFromDB = async (projectId: string): Promise<Uint8Array | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(projectId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (err) {
    console.error('[useLoroSync] Failed to load from IndexedDB:', err);
    return undefined;
  }
};

const deleteFromDB = async (projectId: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(projectId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[useLoroSync] Failed to delete from IndexedDB:', err);
  }
};

/**
 * Custom hook for Loro CRDT sync with the sync server
 * Manages WebSocket connection and document synchronization
 */
export function useLoroSync(options: LoroSyncOptions): UseLoroSyncReturn {
  const {
    projectId,
    syncServerUrl,
    onNodesChange,
    onEdgesChange,
    onTaskUpdate,
  } = options;

  const [doc] = useState(() => new LoroDoc());
  const [undoManager] = useState(() => new UndoManager(doc, {}));

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isLoadedFromLocal, setIsLoadedFromLocal] = useState(false);

  // Update undo/redo state
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoManager.canUndo());
    setCanRedo(undoManager.canRedo());
  }, [undoManager]);

  // Load from local storage on mount
  useEffect(() => {
    let mounted = true;
    const loadLocal = async () => {
      console.log(`[useLoroSync] 📂 Loading local snapshot for project: ${projectId}`);
      const snapshot = await loadFromDB(projectId);
      if (mounted && snapshot) {
        try {
          doc.import(snapshot);
          console.log(`[useLoroSync] ✅ Loaded local snapshot (${snapshot.byteLength} bytes)`);
          setIsLoadedFromLocal(true);
          updateUndoRedoState();
        } catch (err) {
          console.error('[useLoroSync] ❌ Failed to import local snapshot:', err);
        }
      } else {
        console.log('[useLoroSync] 🆕 No local snapshot found');
      }
    };
    loadLocal();
    return () => { mounted = false; };
  }, [projectId, doc, updateUndoRedoState]);

  // Subscribe to document changes
  useEffect(() => {
    console.log('[useLoroSync] Subscribing to document changes');

    const unsubscribe = doc.subscribe((event: any) => {
      // Save to local storage (debounced)
      if (event.local || event.remote) {
        const snapshot = doc.export({ mode: 'snapshot' });
        // Simple debounce: clear previous timeout if exists
        if ((window as any)._loroSaveTimeout) {
          clearTimeout((window as any)._loroSaveTimeout);
        }
        (window as any)._loroSaveTimeout = setTimeout(() => {
          saveToDB(projectId, snapshot).catch(err => console.error('Failed to save local snapshot:', err));
        }, 1000);

        // Update undo/redo state on every change
        updateUndoRedoState();
      }

      // Convert Loro maps to ReactFlow format
      const nodesMap = doc.getMap('nodes');
      const edgesMap = doc.getMap('edges');
      const tasksMap = doc.getMap('tasks');

      // Process nodes
      if (onNodesChange) {
        const nodes: Node[] = [];
        for (const [key, value] of nodesMap.entries()) {
          nodes.push({
            id: key,
            ...(value as any),
          });
        }
        onNodesChange(nodes);
      }

      // Process edges
      if (onEdgesChange) {
        const edges: Edge[] = [];
        for (const [key, value] of edgesMap.entries()) {
          edges.push({
            id: key,
            ...(value as any),
          });
        }
        onEdgesChange(edges);
      }

      // Process task updates
      if (onTaskUpdate) {
        for (const [key, value] of tasksMap.entries()) {
          onTaskUpdate(key, value);
        }
      }
    });

    return () => {
      console.log('[useLoroSync] Unsubscribing from document changes');
      unsubscribe();
    };
  }, [doc, onNodesChange, onEdgesChange, onTaskUpdate, projectId, updateUndoRedoState]);

  // WebSocket connection state
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isUnmountingRef = useRef(false);

  // Send local changes to server
  const sendUpdate = useCallback((update: Uint8Array) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`[useLoroSync] 📤 Sending update to server (${update.byteLength} bytes)`);
      ws.send(update);
    } else {
      console.error(`[useLoroSync] ❌ Cannot send update: WebSocket not connected (state: ${ws?.readyState})`);
    }
  }, []);

  // Connect function
  const connect = useCallback(() => {
    if (isUnmountingRef.current) return;

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
    }

    const wsUrl = `${syncServerUrl}/sync/${projectId}`;
    console.log(`[useLoroSync] 🔌 Connecting to ${wsUrl} (attempt ${retryCountRef.current + 1})`);

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (isUnmountingRef.current) {
        ws.close();
        return;
      }
      console.log(`[useLoroSync] ✅ Connected to sync server (project: ${projectId})`);
      setConnected(true);
      retryCountRef.current = 0;

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Placeholder for app-level ping
        }
      }, 30000);
    };

    ws.onmessage = async (event) => {
      try {
        const update = new Uint8Array(event.data);
        doc.import(update);
      } catch (error: any) {
        console.error('[useLoroSync] ❌ Error importing update:', error);
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('Checksum mismatch') || errorMessage.includes('corrupted') || errorMessage.includes('Decode error')) {
          console.error('[useLoroSync] 🚨 Critical: Local document corrupted. Resetting...');
          await deleteFromDB(projectId);
          window.location.reload();
        }
      }
    };

    ws.onerror = (error) => {
      console.error('[useLoroSync] ❌ WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log(`[useLoroSync] 🔌 Disconnected (code: ${event.code})`);
      setConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (!isUnmountingRef.current) {
        scheduleReconnect();
      }
    };
  }, [projectId, syncServerUrl, doc]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    const delay = Math.min(500 * Math.pow(1.5, retryCountRef.current), 5000);
    console.log(`[useLoroSync] ⏳ Reconnecting in ${delay}ms...`);
    reconnectTimeoutRef.current = setTimeout(() => {
      retryCountRef.current++;
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();
    return () => {
      isUnmountingRef.current = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connect]);

  // Helper methods for modifying the document
  const addNode = useCallback((nodeId: string, nodeData: any) => {
    console.log(`[useLoroSync] Adding node: ${nodeId}`);
    const versionBefore = doc.version();
    const nodesMap = doc.getMap('nodes');
    nodesMap.set(nodeId, nodeData);
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const updateNode = useCallback((nodeId: string, nodeData: any) => {
    console.log(`[useLoroSync] Updating node: ${nodeId}`);
    const versionBefore = doc.version();
    const nodesMap = doc.getMap('nodes');
    const existing = nodesMap.get(nodeId) as any;
    nodesMap.set(nodeId, {
      ...existing,
      ...nodeData,
      data: { ...(existing?.data || {}), ...(nodeData.data || {}) },
    });
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const removeNode = useCallback((nodeId: string) => {
    console.log(`[useLoroSync] Removing node: ${nodeId}`);
    const versionBefore = doc.version();
    const nodesMap = doc.getMap('nodes');
    nodesMap.delete(nodeId);
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const addEdge = useCallback((edgeId: string, edgeData: any) => {
    console.log(`[useLoroSync] Adding edge: ${edgeId}`);
    const versionBefore = doc.version();
    const edgesMap = doc.getMap('edges');
    edgesMap.set(edgeId, edgeData);
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const updateEdge = useCallback((edgeId: string, edgeData: any) => {
    console.log(`[useLoroSync] Updating edge: ${edgeId}`);
    const versionBefore = doc.version();
    const edgesMap = doc.getMap('edges');
    const existing = edgesMap.get(edgeId) as any;
    edgesMap.set(edgeId, { ...existing, ...edgeData });
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const removeEdge = useCallback((edgeId: string) => {
    console.log(`[useLoroSync] Removing edge: ${edgeId}`);
    const versionBefore = doc.version();
    const edgesMap = doc.getMap('edges');
    edgesMap.delete(edgeId);
    const update = doc.export({ mode: 'update', from: versionBefore });
    sendUpdate(update);
  }, [doc, sendUpdate]);

  const undo = useCallback(() => {
    if (undoManager.canUndo()) {
      const versionBefore = doc.version();
      undoManager.undo();
      const update = doc.export({ mode: 'update', from: versionBefore });
      if (update.length > 0) sendUpdate(update);
      updateUndoRedoState();
      console.log('[useLoroSync] ↩️ Undo performed');
    }
  }, [doc, undoManager, sendUpdate, updateUndoRedoState]);

  const redo = useCallback(() => {
    if (undoManager.canRedo()) {
      const versionBefore = doc.version();
      undoManager.redo();
      const update = doc.export({ mode: 'update', from: versionBefore });
      if (update.length > 0) sendUpdate(update);
      updateUndoRedoState();
      console.log('[useLoroSync] ↪️ Redo performed');
    }
  }, [doc, undoManager, sendUpdate, updateUndoRedoState]);

  return {
    doc,
    connected,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    removeEdge,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
