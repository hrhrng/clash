# DSL Workflow Refactor - Video Editor Node Integration

## Summary

Refactored the DSL (Domain Specific Language) workflow for video editing to use **node-based storage** instead of file-based storage. The timeline DSL is now embedded within `video-editor` nodes on the canvas, enabling better integration with the Loro CRDT system and the agent workflow.

## Problem Statement

Previously, the Editor agent attempted to operate on file-based DSL files (`timeline.json`), which had several issues:

1. **No Context**: The Editor agent didn't know which editor context it was working in
2. **File System Coupling**: DSL files were stored in the file system, separate from the canvas
3. **Missing Node Support**: There was no tool to create or manage `video-editor` nodes
4. **Sync Issues**: Changes to the DSL file weren't automatically synced to the canvas

## Solution

### 1. Node-Based DSL Storage

**video-editor nodes** now store the timeline DSL in their `data.timelineDsl` field:

```json
{
  "id": "editor-abc123",
  "type": "video-editor",
  "data": {
    "label": "Final Video",
    "timelineDsl": {
      "version": "1.0.0",
      "fps": 30,
      "compositionWidth": 1920,
      "compositionHeight": 1080,
      "durationInFrames": 0,
      "tracks": [...]
    }
  }
}
```

### 2. Updated DSL Tools

#### `read_dsl(node_id: str)`
- **Before**: `read_dsl(file_path: str)` - read from file system
- **After**: `read_dsl(node_id: str)` - read from video-editor node's `timelineDsl` field

#### `patch_dsl(node_id: str, patch: list[dict])`
- **Before**: `patch_dsl(file_path: str, patch: list[dict])` - patch file system file
- **After**: `patch_dsl(node_id: str, patch: list[dict])` - patch node's `timelineDsl` field and update in Loro

### 3. Video-Editor Node Creation

Extended `create_canvas_node` tool to support `video-editor` type:

```python
create_canvas_node(
    node_type="video-editor",
    payload={"label": "Final Video Timeline"}
)
# Returns: editor-abc-123
```

Features:
- Automatically initializes `timelineDsl` with default structure if not provided
- Sets appropriate default dimensions (800x600)
- Syncs to Loro CRDT for real-time updates

### 4. Updated Agent Workflow

#### Supervisor Agent
Updated to guide the creation and delegation workflow:

```python
# 1. Create video-editor node
editor_node_id = create_canvas_node(
    node_type="video-editor",
    payload={"label": "Final Video"}
)

# 2. Delegate to Editor with node context
task_delegation(
    agent="Editor",
    instruction=f"Assemble timeline using video-editor node: {editor_node_id}",
    context={"editor_node_id": editor_node_id}
)

# 3. Trigger rendering
run_generation_node(node_id=editor_node_id)
```

#### Editor Agent
Updated to require and use video-editor node ID:

```python
# Extract node_id from instruction or context
node_id = "editor-abc-123"

# Read current timeline
dsl = read_dsl(node_id=node_id)

# Modify timeline
patch_dsl(
    node_id=node_id,
    patch=[{
        "op": "add",
        "path": "/tracks/-",
        "value": {
            "id": "track-1",
            "items": [...]
        }
    }]
)
```

## Files Modified

1. **`workflow/middleware.py`**
   - `TimelineMiddleware._read_dsl_tool()` - Changed to use node_id
   - `TimelineMiddleware._patch_dsl_tool()` - Changed to use node_id
   - Updated prompts to explain node-based workflow

2. **`workflow/tools/create_node.py`**
   - Added `video-editor` to `CreateCanvasNodeInput.node_type`
   - Added `timelineDsl` field to `CanvasNodeData`
   - Auto-initialize `timelineDsl` for video-editor nodes
   - Added appropriate default dimensions

3. **`workflow/subagents.py`**
   - Updated `Editor` agent prompt to require node_id
   - Added clear workflow instructions
   - Included DSL structure example

4. **`workflow/graph.py`**
   - Updated supervisor prompt with video-editor workflow
   - Added example of creating and delegating to Editor

## Benefits

1. **Better Context**: Editor always knows which video-editor node it's working on
2. **Unified Storage**: DSL is stored in the same place as other canvas data
3. **Real-time Sync**: Changes to DSL are automatically synced via Loro
4. **Cleaner Workflow**: No need to manage file paths, everything is node-based
5. **Rendering Integration**: `run_generation_node` can directly render video-editor nodes

## Migration Notes

- Existing file-based DSL workflows are no longer supported
- All timeline editing must go through video-editor nodes
- Director/Supervisor must create video-editor nodes before delegating to Editor
- Editor agent will fail gracefully if no node_id is provided

## Example Usage

Complete workflow from Supervisor to rendering:

```python
# User: "Create a video with scene 1 and scene 2"

# Supervisor creates video-editor node
editor_node = create_canvas_node(
    node_type="video-editor",
    payload={"label": "User's Video"}
)  # Returns: "editor-xyz789"

# Supervisor delegates to Editor
task_delegation(
    agent="Editor",
    instruction="""
    Assemble a video timeline using video-editor node: editor-xyz789.
    Add Scene 1 (video node: scene1-abc) and Scene 2 (video node: scene2-def).
    """,
    context={"editor_node_id": "editor-xyz789"}
)

# Editor reads current state
dsl = read_dsl(node_id="editor-xyz789")
# Returns empty timeline structure

# Editor adds items
patch_dsl(
    node_id="editor-xyz789",
    patch=[
        {
            "op": "add",
            "path": "/tracks/-",
            "value": {
                "id": "track-main",
                "items": [
                    {
                        "assetId": "scene1-abc",
                        "from": 0,
                        "durationInFrames": 150
                    },
                    {
                        "assetId": "scene2-def",
                        "from": 150,
                        "durationInFrames": 150
                    }
                ]
            }
        }
    ]
)

# Supervisor triggers rendering
run_generation_node(node_id="editor-xyz789")
# Creates a video node with the rendered result
```

## Testing

To test the new workflow:

1. Create a video-editor node via the API or agent
2. Verify it appears on the canvas with default timeline structure
3. Use Editor agent to modify the timeline
4. Verify changes are reflected in the node's data
5. Trigger rendering and verify video generation

## Future Enhancements

- Add validation for timeline structure
- Support for audio tracks
- Timeline preview generation
- Undo/redo support for timeline edits
- Visual timeline editor UI component
