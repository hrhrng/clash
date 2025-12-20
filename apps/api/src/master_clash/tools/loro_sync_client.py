"""
Loro CRDT sync client for Python Agent

This module provides a client for connecting to the Loro sync server
and manipulating the canvas state (nodes, edges, tasks) in real-time.

Installation:
    uv add loro websockets

Usage:
    # Async version
    client = LoroSyncClient(project_id="proj_123", sync_server_url="ws://localhost:8787")
    await client.connect()
    client.add_node("node_123", {...})
    await client.disconnect()

    # Sync version (for non-async contexts)
    with LoroSyncClientSync(project_id="proj_123") as client:
        client.add_node("node_123", {...})
"""

import asyncio
import logging
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlencode

import websockets
from loro import ExportMode, LoroDoc

logger = logging.getLogger(__name__)


class LoroSyncClient:
    """
    WebSocket client for syncing Loro CRDT documents with the sync server.

    Usage:
        client = LoroSyncClient(
            project_id="proj_123",
            token="jwt_token",
            sync_server_url="ws://localhost:8787"
        )

        await client.connect()

        # Add a node
        client.add_node("node_image_cat", {
            "id": "node_image_cat",
            "type": "action-badge-image",
            "position": {"x": 100, "y": 200},
            "data": {
                "label": "Generated Cat",
                "status": "running"
            }
        })

        # Add an edge
        client.add_edge("e-upstream-node_image_cat", {
            "id": "e-upstream-node_image_cat",
            "source": "upstream_node",
            "target": "node_image_cat",
            "type": "default"
        })

        await client.disconnect()
    """

    def __init__(
        self,
        project_id: str,
        token: Optional[str] = None,
        sync_server_url: str = "ws://localhost:8787",
        on_update: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.project_id = project_id
        self.token = token
        self.sync_server_url = sync_server_url
        self.on_update = on_update

        self.doc = LoroDoc()
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self._pending_sends: set[asyncio.Task[None]] = set()
        # Track the event loop where WebSocket was created to avoid cross-loop issues
        self._ws_loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self):
        """
        Connect to the sync server via WebSocket and start syncing.
        """
        # Build WebSocket URL with token (if provided)
        if self.token:
            params = {"token": self.token}
            ws_url = f"{self.sync_server_url}/sync/{self.project_id}?{urlencode(params)}"
        else:
            ws_url = f"{self.sync_server_url}/sync/{self.project_id}"

        logger.info(f"[LoroSyncClient] 🔌 Connecting to {ws_url}")
        logger.info(f"[LoroSyncClient] Project ID: {self.project_id}")

        try:
            # Avoid inheriting system proxy env vars (e.g. ALL_PROXY) which can break
            # localhost WebSocket connections and require extra deps like python-socks.
            # Increase max_size to handle large Loro document states (default is 1MB)
            self.ws = await websockets.connect(
                ws_url, 
                proxy=None,
                max_size=100 * 1024 * 1024,  # 100MB limit
            )
            self.connected = True
            # Save the event loop where WebSocket was created
            self._ws_loop = asyncio.get_running_loop()
            logger.info(f"[LoroSyncClient] ✅ Connected to sync server (project: {self.project_id})")

            # Wait for initial state snapshot from server
            # Increased timeout for large documents (can be 19MB+)
            try:
                initial_msg = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
                initial_data = bytes(initial_msg)
                logger.info(f"[LoroSyncClient] 📥 Received initial state ({len(initial_data)} bytes)")
                self.doc.import_(initial_data)
                logger.info(f"[LoroSyncClient] ✅ Applied initial state from server")
            except asyncio.TimeoutError:
                logger.warning("[LoroSyncClient] ⚠️ Timeout waiting for initial state")
            except Exception as e:
                logger.error(f"[LoroSyncClient] ❌ Failed to import initial state: {e}")

            # Start listening for subsequent updates
            asyncio.create_task(self._listen())
            logger.info("[LoroSyncClient] Started listening for updates from server")

        except Exception as e:
            logger.error(f"[LoroSyncClient] ❌ Connection failed: {e}")
            raise

    async def disconnect(self):
        """
        Disconnect from the sync server.
        """
        if self.ws:
            await self._flush_pending_sends()
            await self.ws.close()
            self.connected = False
            logger.info(f"[LoroSyncClient] 🔌 Disconnected from sync server (project: {self.project_id})")

    async def _flush_pending_sends(self, timeout_s: float = 2.0) -> None:
        if not self._pending_sends:
            return

        pending = list(self._pending_sends)
        try:
            await asyncio.wait_for(asyncio.gather(*pending, return_exceptions=True), timeout=timeout_s)
        except asyncio.TimeoutError:
            logger.warning(
                f"[LoroSyncClient] ⚠️ Timed out flushing {len(pending)} pending send(s) before disconnect"
            )

    async def _listen(self):
        """
        Listen for updates from the sync server and apply them to the local document.
        Auto-reconnects on connection loss.
        """
        if not self.ws:
            logger.warning("[LoroSyncClient] ⚠️ Cannot listen: WebSocket not initialized")
            return

        logger.info("[LoroSyncClient] 👂 Listening for updates from server...")

        try:
            async for message in self.ws:
                # Apply update from server
                update = bytes(message)
                update_size = len(update)
                logger.info(f"[LoroSyncClient] 📥 Received update from server ({update_size} bytes)")

                self.doc.import_(update)
                logger.debug("[LoroSyncClient] ✅ Applied update from server")

                # Trigger callback if provided
                if self.on_update:
                    self.on_update(self._get_state())
                    logger.debug("[LoroSyncClient] Triggered on_update callback")

        except websockets.exceptions.ConnectionClosed:
            logger.warning("[LoroSyncClient] ⚠️ WebSocket connection closed, attempting to reconnect...")
            self.connected = False
            # Attempt to reconnect
            await self._auto_reconnect()
        except Exception as e:
            logger.error(f"[LoroSyncClient] ❌ Error in listen loop: {e}")
            self.connected = False
            # Attempt to reconnect
            await self._auto_reconnect()

    async def _auto_reconnect(self, max_retries: int = 3, delay: float = 2.0):
        """
        Attempt to automatically reconnect to the sync server.
        """
        for attempt in range(max_retries):
            try:
                logger.info(f"[LoroSyncClient] 🔄 Reconnection attempt {attempt + 1}/{max_retries}...")
                await asyncio.sleep(delay)
                await self.connect()
                logger.info("[LoroSyncClient] ✅ Reconnected successfully")
                return
            except Exception as e:
                logger.error(f"[LoroSyncClient] ❌ Reconnection attempt {attempt + 1} failed: {e}")
        
        logger.error(f"[LoroSyncClient] ❌ Failed to reconnect after {max_retries} attempts")

    async def ensure_connected(self) -> bool:
        """
        Ensure the client is connected, attempting to reconnect if necessary.
        Returns True if connected, False otherwise.
        """
        if self.connected and self.ws:
            return True
        
        logger.info("[LoroSyncClient] 🔌 Connection lost, attempting to reconnect...")
        try:
            await self.connect()
            return self.connected
        except Exception as e:
            logger.error(f"[LoroSyncClient] ❌ Failed to reconnect: {e}")
            return False

    def reconnect_sync(self) -> bool:
        """
        Synchronous reconnection method for use in tool code.
        Returns True if reconnected, False otherwise.
        
        Note: This method cannot safely reconnect if called from within
        the same event loop where the WebSocket was created, as blocking
        would cause deadlock. In that case, it returns False.
        """
        if self.connected and self.ws:
            return True
        
        logger.info("[LoroSyncClient] 🔌 Attempting synchronous reconnection...")
        
        try:
            # Check if we're in a running event loop
            try:
                running_loop = asyncio.get_running_loop()
                # If we're in a running loop, we cannot safely block
                # Just log and return False - the caller should handle this gracefully
                if running_loop is self._ws_loop:
                    logger.warning("[LoroSyncClient] ⚠️ Cannot reconnect from within the same event loop (would deadlock)")
                    return False
                else:
                    # Different loop - schedule reconnect but don't block
                    # This is a rare case, just skip for safety
                    logger.warning("[LoroSyncClient] ⚠️ In different event loop, skipping reconnect")
                    return False
            except RuntimeError:
                # No running loop - safe to create one and block
                pass
            
            # No running loop - safe to create one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self.connect())
                return self.connected
            finally:
                # Keep the loop reference for future operations
                # Don't close it
                pass
        except Exception as e:
            logger.error(f"[LoroSyncClient] ❌ Sync reconnection failed: {e}")
            return False


    def _send_update(self, update: bytes):
        """
        Send a local update to the sync server.
        Uses the event loop where WebSocket was created to avoid cross-loop issues.
        """
        if not (self.ws and self.connected):
            logger.warning("[LoroSyncClient] ⚠️ Cannot send update: not connected")
            return
            
        if not self._ws_loop:
            logger.warning("[LoroSyncClient] ⚠️ Cannot send update: no event loop reference")
            return
            
        update_size = len(update)
        logger.info(f"[LoroSyncClient] 📤 Sending update to server ({update_size} bytes)")
        
        try:
            # Check if we're in the same event loop as the WebSocket
            try:
                current_loop = asyncio.get_running_loop()
            except RuntimeError:
                current_loop = None
                
            if current_loop is self._ws_loop:
                # Same loop - can create task directly (non-blocking)
                logger.debug("[LoroSyncClient] Same loop detected, creating task directly")
                task = current_loop.create_task(self.ws.send(update))
                self._pending_sends.add(task)
                task.add_done_callback(self._pending_sends.discard)
                logger.debug("[LoroSyncClient] ✅ Task created for send")
                return
            
            # Different loop or no loop - check if the ws_loop is running
            if self._ws_loop.is_running():
                # Loop is running in another thread, use run_coroutine_threadsafe
                # But DON'T block on result (avoid deadlock)
                logger.debug("[LoroSyncClient] WS loop is running, scheduling via run_coroutine_threadsafe")
                future = asyncio.run_coroutine_threadsafe(self.ws.send(update), self._ws_loop)
                # Don't block - just schedule and log any errors via callback
                def on_done(f):
                    try:
                        f.result()
                        logger.debug("[LoroSyncClient] ✅ Update sent successfully via thread-safe call")
                    except Exception as e:
                        logger.error(f"[LoroSyncClient] ❌ Error sending update: {e}")
                future.add_done_callback(on_done)
            else:
                # Loop is not running - this shouldn't happen in normal flow
                # Log warning and skip
                logger.warning("[LoroSyncClient] ⚠️ WS event loop is not running, cannot send update")
                
        except Exception as e:
            logger.error(f"[LoroSyncClient] ❌ Error in _send_update: {e}")

    def _get_state(self) -> Dict[str, Any]:
        """
        Get the current state of the document as a dictionary.
        """
        nodes_map = self.doc.get_map("nodes")
        edges_map = self.doc.get_map("edges")
        tasks_map = self.doc.get_map("tasks")

        return {
            "nodes": {k: v for k, v in nodes_map.items()},
            "edges": {k: v for k, v in edges_map.items()},
            "tasks": {k: v for k, v in tasks_map.items()},
        }

    # === Node Operations ===

    def add_node(self, node_id: str, node_data: Dict[str, Any]):
        """
        Add a new node to the canvas.

        Args:
            node_id: Unique node ID (semantic ID recommended)
            node_data: Node data including type, position, data, etc.
        """
        node_type = node_data.get("type", "unknown")
        logger.info(f"[LoroSyncClient] ➕ Adding node: {node_id} (type: {node_type})")

        version_before = self.doc.oplog_vv
        nodes_map = self.doc.get_map("nodes")

        nodes_map.insert(node_id, node_data)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Node added: {node_id}")

    def update_node(self, node_id: str, node_data: Dict[str, Any]):
        """
        Update an existing node (merge with existing data).

        Args:
            node_id: Node ID to update
            node_data: Partial node data to merge
        """
        logger.info(f"[LoroSyncClient] 🔄 Updating node: {node_id}")

        version_before = self.doc.oplog_vv
        nodes_map = self.doc.get_map("nodes")

        # Get existing node data safely
        existing_proxy = nodes_map.get(node_id)
        existing = {}
        if existing_proxy:
            if hasattr(existing_proxy, "value"):
                existing = existing_proxy.value
            elif hasattr(existing_proxy, "to_dict"):
                existing = existing_proxy.to_dict()
        
        if not isinstance(existing, dict):
             # Try get_deep_value as last resort
             all_nodes = nodes_map.get_deep_value() or {}
             existing = all_nodes.get(node_id) or {}

        # Merge data
        merged = {**existing, **node_data}
        if "data" in existing and "data" in node_data:
            merged["data"] = {**existing.get("data", {}), **node_data.get("data", {})}

        nodes_map.insert(node_id, merged)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Node updated: {node_id}")

    def remove_node(self, node_id: str):
        """
        Remove a node from the canvas.

        Args:
            node_id: Node ID to remove
        """
        logger.info(f"[LoroSyncClient] ➖ Removing node: {node_id}")

        version_before = self.doc.oplog_vv
        nodes_map = self.doc.get_map("nodes")

        nodes_map.delete(node_id)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Node removed: {node_id}")

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Batch transaction completed ({count} nodes)")

    def batch_update_graph(self, nodes: Dict[str, Any] = None, edges: Dict[str, Any] = None):
        """
        Atomically set (insert/update) multiple nodes AND edges in a single transaction.
        
        Args:
            nodes: Dictionary where keys are node IDs and values are the full node data.
            edges: Dictionary where keys are edge IDs and values are the full edge data.
        """
        nodes = nodes or {}
        edges = edges or {}
        
        if not nodes and not edges:
            return

        logger.info(f"[LoroSyncClient] 📦 Batch graph update ({len(nodes)} nodes, {len(edges)} edges)")

        version_before = self.doc.oplog_vv
        
        if nodes:
            nodes_map = self.doc.get_map("nodes")
            for node_id, node_data in nodes.items():
                # Ensure node_data is a dict (sanitization)
                if hasattr(node_data, "value"):
                    try:
                        val = node_data.value
                        if isinstance(val, dict): node_data = val
                    except: pass
                elif hasattr(node_data, "to_dict"):
                    try:
                        val = node_data.to_dict()
                        if isinstance(val, dict): node_data = val
                    except: pass
                nodes_map.insert(node_id, node_data)
        
        if edges:
            edges_map = self.doc.get_map("edges")
            for edge_id, edge_data in edges.items():
                # Ensure edge_data is a dict (sanitization)
                if hasattr(edge_data, "value"):
                    try:
                        val = edge_data.value
                        if isinstance(val, dict): edge_data = val
                    except: pass
                elif hasattr(edge_data, "to_dict"):
                    try:
                        val = edge_data.to_dict()
                        if isinstance(val, dict): edge_data = val
                    except: pass
                edges_map.insert(edge_id, edge_data)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Batch graph transaction completed")

    # === Edge Operations ===

    def add_edge(self, edge_id: str, edge_data: Dict[str, Any]):
        """
        Add a new edge to the canvas.

        Args:
            edge_id: Unique edge ID (format: "e-{source}-{target}")
            edge_data: Edge data including source, target, type, etc.
        """
        source = edge_data.get("source", "?")
        target = edge_data.get("target", "?")
        logger.info(f"[LoroSyncClient] ➕ Adding edge: {edge_id} ({source} → {target})")

        version_before = self.doc.oplog_vv
        edges_map = self.doc.get_map("edges")

        edges_map.insert(edge_id, edge_data)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Edge added: {edge_id}")

    def update_edge(self, edge_id: str, edge_data: Dict[str, Any]):
        """
        Update an existing edge.

        Args:
            edge_id: Edge ID to update
            edge_data: Partial edge data to merge
        """
        logger.info(f"[LoroSyncClient] 🔄 Updating edge: {edge_id}")

        version_before = self.doc.oplog_vv
        edges_map = self.doc.get_map("edges")

        existing_proxy = edges_map.get(edge_id)
        existing = {}
        if existing_proxy:
             if hasattr(existing_proxy, "value"):
                 existing = existing_proxy.value
             elif hasattr(existing_proxy, "to_dict"):
                 existing = existing_proxy.to_dict()
        
        if not isinstance(existing, dict):
             all_edges = edges_map.get_deep_value() or {}
             existing = all_edges.get(edge_id) or {}

        merged = {**existing, **edge_data}

        edges_map.insert(edge_id, merged)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Edge updated: {edge_id}")

    def remove_edge(self, edge_id: str):
        """
        Remove an edge from the canvas.

        Args:
            edge_id: Edge ID to remove
        """
        logger.info(f"[LoroSyncClient] ➖ Removing edge: {edge_id}")

        version_before = self.doc.oplog_vv
        edges_map = self.doc.get_map("edges")

        edges_map.delete(edge_id)

        update = self.doc.export(ExportMode.Updates(version_before))
        self._send_update(update)
        logger.info(f"[LoroSyncClient] ✅ Edge removed: {edge_id}")

    # === Read Operations ===

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Get a node by ID."""
        nodes_map = self.doc.get_map("nodes")
        # Use get_deep_value to get Python dict
        all_nodes = nodes_map.get_deep_value() or {}
        node = all_nodes.get(node_id)
        
        logger.debug(f"[LoroSyncClient] get_node({node_id}) Type: {type(node)}")
        logger.debug(f"[LoroSyncClient] Get node: {node_id} -> {'found' if node else 'not found'}")
        return node

    def get_all_nodes(self) -> Dict[str, Any]:
        """Get all nodes."""
        nodes_map = self.doc.get_map("nodes")
        nodes = nodes_map.get_deep_value() or {}
        logger.debug(f"[LoroSyncClient] Get all nodes: {len(nodes)} nodes")
        return nodes

    def get_edge(self, edge_id: str) -> Optional[Dict[str, Any]]:
        """Get an edge by ID."""
        edges_map = self.doc.get_map("edges")
        all_edges = edges_map.get_deep_value() or {}
        edge = all_edges.get(edge_id)
        logger.debug(f"[LoroSyncClient] Get edge: {edge_id} -> {'found' if edge else 'not found'}")
        return edge

    def get_all_edges(self) -> Dict[str, Any]:
        """Get all edges."""
        edges_map = self.doc.get_map("edges")
        edges = edges_map.get_deep_value() or {}
        logger.debug(f"[LoroSyncClient] Get all edges: {len(edges)} edges")
        return edges

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a task by ID."""
        tasks_map = self.doc.get_map("tasks")
        all_tasks = tasks_map.get_deep_value() or {}
        task = all_tasks.get(task_id)
        logger.debug(f"[LoroSyncClient] Get task: {task_id} -> {'found' if task else 'not found'}")
        return task

    def get_all_tasks(self) -> Dict[str, Any]:
        """Get all tasks."""
        tasks_map = self.doc.get_map("tasks")
        tasks = {k: v for k, v in tasks_map.items()}
        logger.debug(f"[LoroSyncClient] Get all tasks: {len(tasks)} tasks")
        return tasks


# === Synchronous wrapper for non-async contexts ===


class LoroSyncClientSync:
    """
    Synchronous wrapper for LoroSyncClient.
    Runs the async client in a background thread.

    Usage:
        with LoroSyncClientSync(project_id="proj_123", token="jwt") as client:
            client.add_node("node_123", {...})
            client.add_edge("edge_123", {...})
    """

    def __init__(self, project_id: str, token: str, sync_server_url: str = "ws://localhost:8787"):
        self.project_id = project_id
        self.token = token
        self.sync_server_url = sync_server_url
        self._client: Optional[LoroSyncClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def __enter__(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        self._client = LoroSyncClient(
            project_id=self.project_id,
            token=self.token,
            sync_server_url=self.sync_server_url,
        )

        self._loop.run_until_complete(self._client.connect())
        return self._client

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            self._loop.run_until_complete(self._client.disconnect())
        if self._loop:
            self._loop.close()
