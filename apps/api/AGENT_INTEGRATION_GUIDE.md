# Agent Loro Integration - Quick Start

## 快速集成步骤

### Step 1: 安装 Loro

```bash
cd apps/api
uv add loro-crdt websockets
```

### Step 2: 修改 middleware.py

找到两处发送 `node_proposal` 的地方并替换：

#### Location 1: `_create_canvas_node_tool()` (约第 567 行)

**Before**:
```python
# Emit SSE proposal if available
if result.proposal:
    writer = get_stream_writer()
    writer({
        "action": "create_node_proposal",
        "proposal": result.proposal,
    })
```

**After**:
```python
# Sync to Loro instead of SSE
if result.proposal:
    await self._sync_node_to_loro(result.proposal, result.node_id)
```

#### Location 2: `_create_generation_node_tool()` (约第 660 行)

**Before**:
```python
if result.proposal:
    writer = get_stream_writer()
    writer({
        "action": "create_node_proposal",
        "proposal": result.proposal,
    })
```

**After**:
```python
# Sync to Loro instead of SSE
if result.proposal:
    await self._sync_node_to_loro(result.proposal, result.node_id)
```

### Step 3: 添加 Loro 同步方法

在 `VideoProductionWorkflow` 类中添加：

```python
import asyncio
import json
import websockets
from loro import LoroDoc

class VideoProductionWorkflow:
    def __init__(self, project_id: str, ...):
        self.project_id = project_id
        self.loro_doc = LoroDoc()
        self.loro_ws = None
        self._loro_connected = False

        # Start Loro connection in background
        asyncio.create_task(self._connect_loro())

    async def _connect_loro(self):
        """Connect to Loro sync server"""
        try:
            sync_server_url = "ws://localhost:8787"
            ws_url = f"{sync_server_url}/sync/{self.project_id}"

            self.loro_ws = await websockets.connect(ws_url)
            self._loro_connected = True
            logger.info(f"[Loro] Connected to sync server for project {self.project_id}")

            # Start listening for updates
            asyncio.create_task(self._listen_loro_updates())
        except Exception as e:
            logger.error(f"[Loro] Connection failed: {e}")

    async def _listen_loro_updates(self):
        """Listen for updates from sync server"""
        try:
            async for message in self.loro_ws:
                # Apply update from server
                update = bytes(message)
                self.loro_doc.import_batch(update)
        except Exception as e:
            logger.error(f"[Loro] Listen error: {e}")
            self._loro_connected = False

    async def _sync_node_to_loro(self, proposal: dict, node_id: str):
        """Sync node to Loro document"""
        if not self._loro_connected:
            logger.warning("[Loro] Not connected, skipping sync")
            return

        try:
            # Extract data from proposal
            node_id = proposal.get("id") or node_id
            node_type = proposal.get("nodeType", "unknown")
            node_data = proposal.get("nodeData", {})

            # Build node object
            node = {
                "id": node_id,
                "type": node_type,
                "position": node_data.get("position", {"x": 100, "y": 200}),
                "data": {
                    "label": node_data.get("label", ""),
                    **{k: v for k, v in node_data.items() if k not in ["position", "id"]}
                }
            }

            # Add parent if specified
            if proposal.get("groupId"):
                node["parentId"] = proposal["groupId"]

            # Get nodes map and add node
            version_before = self.loro_doc.oplog_version()
            nodes_map = self.loro_doc.get_map("nodes")
            nodes_map.insert(node_id, node)

            # Export update and send to server
            update = self.loro_doc.export_from(version_before)
            await self.loro_ws.send(update)

            logger.info(f"[Loro] Added node {node_id}")

            # Add edges
            upstream_ids = proposal.get("upstreamNodeIds", [])
            if upstream_ids:
                await self._sync_edges_to_loro(node_id, upstream_ids)

        except Exception as e:
            logger.error(f"[Loro] Error syncing node: {e}")

    async def _sync_edges_to_loro(self, target_node_id: str, source_node_ids: list):
        """Sync edges to Loro document"""
        if not self._loro_connected:
            return

        try:
            edges_map = self.loro_doc.get_map("edges")

            for source_id in source_node_ids:
                edge_id = f"e-{source_id}-{target_node_id}"
                edge = {
                    "id": edge_id,
                    "source": source_id,
                    "target": target_node_id,
                    "type": "default"
                }

                version_before = self.loro_doc.oplog_version()
                edges_map.insert(edge_id, edge)
                update = self.loro_doc.export_from(version_before)
                await self.loro_ws.send(update)

            logger.info(f"[Loro] Added {len(source_node_ids)} edges to {target_node_id}")
        except Exception as e:
            logger.error(f"[Loro] Error syncing edges: {e}")

    async def cleanup(self):
        """Cleanup when workflow ends"""
        if self.loro_ws:
            await self.loro_ws.close()
            logger.info("[Loro] Disconnected from sync server")
```

## 简化版本（如果异步太复杂）

如果你的 workflow 不支持异步，可以使用同步版本：

```python
from master_clash.tools.loro_sync_client import LoroSyncClientSync

class VideoProductionWorkflow:
    def __init__(self, project_id: str, ...):
        # Use synchronous wrapper
        self.loro_client = LoroSyncClientSync(
            project_id=project_id,
            sync_server_url="ws://localhost:8787"
        )
        self.loro_client.__enter__()  # Connect

    def _sync_node_to_loro(self, proposal: dict, node_id: str):
        """Sync node to Loro (synchronous)"""
        node_id = proposal.get("id") or node_id
        node_type = proposal.get("nodeType", "unknown")
        node_data = proposal.get("nodeData", {})

        node = {
            "id": node_id,
            "type": node_type,
            "position": node_data.get("position", {"x": 100, "y": 200}),
            "data": {
                "label": node_data.get("label", ""),
                **{k: v for k, v in node_data.items() if k not in ["position", "id"]}
            }
        }

        if proposal.get("groupId"):
            node["parentId"] = proposal["groupId"]

        # Sync to Loro
        self.loro_client._client.add_node(node_id, node)

        # Add edges
        upstream_ids = proposal.get("upstreamNodeIds", [])
        for source_id in upstream_ids:
            edge_id = f"e-{source_id}-{node_id}"
            self.loro_client._client.add_edge(edge_id, {
                "id": edge_id,
                "source": source_id,
                "target": node_id,
                "type": "default"
            })

        logger.info(f"[Loro] Synced node {node_id} with {len(upstream_ids)} edges")

    def cleanup(self):
        """Cleanup when workflow ends"""
        self.loro_client.__exit__(None, None, None)
```

## 配置

在 `.env` 中添加：

```bash
SYNC_SERVER_URL=ws://localhost:8787
```

## 测试

1. 启动 sync server:
   ```bash
   cd apps/loro-sync-server
   pnpm dev
   ```

2. 启动 agent:
   ```bash
   cd apps/api
   uv run python -m master_clash.api.main
   ```

3. 发送请求创建节点，检查日志：
   ```
   [Loro] Connected to sync server for project proj_123
   [Loro] Added node node_image_cat
   [Loro] Added 1 edges to node_image_cat
   ```

4. 在前端应该能看到节点自动出现！

## 注意事项

1. **异步 vs 同步**：如果你的 workflow 是异步的（使用 `async/await`），用异步版本；否则用同步版本

2. **错误处理**：如果 Loro 连接失败，不应该阻塞主流程，只记录日志即可

3. **清理资源**：在 workflow 结束时记得调用 `cleanup()` 断开连接

## 完整流程图

```
User 发送消息 "生成一个猫的图片"
    ↓
Agent 调用 create_generation_node tool
    ↓
Backend 生成 proposal
    ↓
❌ 旧方式: SSE 发送 node_proposal
✅ 新方式: loro_client.add_node(...)
    ↓
Sync Server 广播给所有客户端
    ↓
Frontend 自动收到更新，显示节点
```
