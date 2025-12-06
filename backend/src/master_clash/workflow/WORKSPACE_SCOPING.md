# Workspace Scoping Feature

## Overview

The Supervisor agent can now:
1. **Create workspace groups** to organize work
2. **Delegate tasks** to sub-agents with workspace scoping
3. **Handle simple tasks** directly using canvas tools

Sub-agents automatically place their nodes inside their assigned workspace group.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Supervisor Agent                         │
│  • create_workspace_group()                                │
│  • list_workspace_groups()                                 │
│  • task_delegation(workspace_group_id=...)                 │
│  • All canvas tools (list, read, create, etc.)             │
└────────────────────────────────────────────────────────────┘
                          │
                          │ Delegates with workspace_group_id
                          ▼
┌────────────────────────────────────────────────────────────┐
│              SubAgent (workspace-aware)                     │
│  • Receives workspace_group_id in state                    │
│  • Automatically sets parent_id for all created nodes      │
│  • Works within the assigned workspace                     │
└────────────────────────────────────────────────────────────┘
```

## Supervisor Tools

### 1. create_workspace_group

Creates a workspace group for organizing related work.

```python
create_workspace_group(
    name: str,
    description: str | None = None,
) -> str
```

**Example:**
```
User: "Create a character design for a space explorer"

Supervisor thinks:
1. Create workspace for organization
2. Delegate to ConceptArtist

Supervisor calls:
create_workspace_group(
    name="Space Explorer Character",
    description="Character design workspace"
)

Returns: "Created workspace group 'Space Explorer Character' with ID: alpha-ocean-square"
```

### 2. list_workspace_groups

Lists all existing workspace groups on the canvas.

```python
list_workspace_groups() -> str
```

**Example:**
```
Supervisor calls:
list_workspace_groups()

Returns:
"Workspace groups:
- alpha-ocean-square: Space Explorer Character (Character design workspace)
- beta-fire-triangle: Storyboard Shots (Shot sequence workspace)"
```

### 3. task_delegation (enhanced)

Delegates work to sub-agents with optional workspace scoping.

```python
task_delegation(
    agent: str,
    instruction: str,
    workspace_group_id: str | None = None,  # ← NEW
    context: dict[str, Any] | None = None,
) -> str
```

**Example:**
```
Supervisor calls:
task_delegation(
    agent="ConceptArtist",
    instruction="Design a space explorer character with futuristic suit",
    workspace_group_id="alpha-ocean-square"  # ← Scope work to this group
)

Result:
- ConceptArtist creates a Prompt node → parent_id = "alpha-ocean-square"
- ConceptArtist creates an Image Gen node → parent_id = "alpha-ocean-square"
- All work is organized inside the group!
```

## SubAgent Workspace Awareness

### Workspace-Aware Agents

These agents automatically scope their work to the assigned workspace:

- ✅ **ScriptWriter** (`workspace_aware=True`)
- ✅ **ConceptArtist** (`workspace_aware=True`)
- ✅ **StoryboardDesigner** (`workspace_aware=True`)
- ❌ **Editor** (`workspace_aware=False` - works globally)

### How It Works

When a sub-agent is delegated with `workspace_group_id`:

1. **State is updated:**
   ```python
   sub_state = {
       "messages": [...],
       "project_id": "proj-123",
       "workspace_group_id": "alpha-ocean-square",  # ← Added
   }
   ```

2. **Tools auto-scope:**
   ```python
   # In create_canvas_node tool
   if parent_id is None:
       workspace_group_id = runtime.state.get("workspace_group_id")
       if workspace_group_id:
           parent_id = workspace_group_id  # ← Auto-set parent
   ```

3. **All nodes created by the sub-agent are automatically placed in the workspace**

## Example Workflow

### User Request
```
User: "Create a video about a space explorer discovering an alien planet"
```

### Supervisor Execution

```python
# Step 1: Create workspace for story
create_workspace_group(
    name="Story Development",
    description="Space explorer story workspace"
)
# Returns: story-workspace-id

# Step 2: Delegate script writing
task_delegation(
    agent="ScriptWriter",
    instruction="Write a story about a space explorer discovering an alien planet",
    workspace_group_id="story-workspace-id"
)
# ScriptWriter creates:
# - Text node: "Story Outline" → parent_id = story-workspace-id
# - Text node: "Character Bio: Explorer" → parent_id = story-workspace-id

# Step 3: Create workspace for visuals
create_workspace_group(
    name="Visual Design",
    description="Character and scene designs"
)
# Returns: visual-workspace-id

# Step 4: Delegate concept art
task_delegation(
    agent="ConceptArtist",
    instruction="Create visual designs for the space explorer and alien planet",
    workspace_group_id="visual-workspace-id"
)
# ConceptArtist creates:
# - Prompt node: "Space Explorer Design" → parent_id = visual-workspace-id
# - Image Gen node → parent_id = visual-workspace-id
# - Prompt node: "Alien Planet Scene" → parent_id = visual-workspace-id
# - Image Gen node → parent_id = visual-workspace-id

# Step 5: Create workspace for shots
create_workspace_group(
    name="Storyboard Shots",
    description="Video shot sequence"
)
# Returns: shots-workspace-id

# Step 6: Delegate storyboarding
task_delegation(
    agent="StoryboardDesigner",
    instruction="Create shot sequence based on the story",
    workspace_group_id="shots-workspace-id"
)
# StoryboardDesigner creates:
# - Prompt node: "Shot 1: Explorer arrives" → parent_id = shots-workspace-id
# - Image Gen node → parent_id = shots-workspace-id
# - Prompt node: "Shot 2: Alien landscape" → parent_id = shots-workspace-id
# - Image Gen node → parent_id = shots-workspace-id

# Step 7: Assemble video (no workspace needed)
task_delegation(
    agent="Editor",
    instruction="Assemble final video from generated shots"
)
# Editor uses timeline_editor globally
```

### Result Canvas Structure

```
Canvas:
├── [Group] Story Development (story-workspace-id)
│   ├── [Text] Story Outline
│   └── [Text] Character Bio: Explorer
│
├── [Group] Visual Design (visual-workspace-id)
│   ├── [Prompt] Space Explorer Design
│   ├── [Image] (generated)
│   ├── [Prompt] Alien Planet Scene
│   └── [Image] (generated)
│
└── [Group] Storyboard Shots (shots-workspace-id)
    ├── [Prompt] Shot 1: Explorer arrives
    ├── [Image] (generated)
    ├── [Prompt] Shot 2: Alien landscape
    └── [Image] (generated)
```

## Benefits

### 1. **Organization**
- All related work grouped together
- Easy to find and manage content
- Visual hierarchy on canvas

### 2. **Isolation**
- Each sub-agent works in its own space
- No accidental pollution of other workspaces
- Clear separation of concerns

### 3. **Flexibility**
- Supervisor can create multiple workspaces
- Same agent can work in different workspaces
- Some agents (like Editor) can work globally

### 4. **Simplicity**
- Sub-agents don't need to specify `parent_id`
- Automatic scoping via middleware
- Just works™

## Implementation Details

### AgentState Extension

```python
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    project_id: str
    workspace_group_id: str | None  # ← NEW
```

### SubAgent Definition

```python
@dataclass
class SubAgent:
    name: str
    description: str
    system_prompt: str
    tools: Sequence[BaseTool]
    workspace_aware: bool = False  # ← NEW
```

### Middleware Auto-Scoping

```python
# In CanvasMiddleware._create_node_tool()
def create_canvas_node(..., parent_id=None, runtime=None):
    # Auto-set parent_id from workspace if not explicitly provided
    if parent_id is None:
        workspace_group_id = runtime.state.get("workspace_group_id")
        if workspace_group_id:
            parent_id = workspace_group_id

    # Create node with auto-scoped parent_id
    result = backend.create_node(..., parent_id=parent_id)
```

## API Changes

### Before

```python
# Supervisor had no tools
supervisor = create_supervisor_agent(
    model=llm,
    subagents=subagents,
)
# Supervisor could only delegate
```

### After

```python
# Supervisor has workspace management tools
supervisor = create_supervisor_agent(
    model=llm,
    subagents=subagents,
)
# Supervisor can:
# - create_workspace_group()
# - list_workspace_groups()
# - task_delegation(workspace_group_id=...)
# - All canvas tools (list, read, create, etc.)
```

## Future Enhancements

- [ ] Auto-layout groups on canvas (spiral, grid)
- [ ] Nested workspaces (groups within groups)
- [ ] Workspace templates (pre-create structure)
- [ ] Workspace permissions (read-only, etc.)
- [ ] Workspace search (find nodes in specific workspace)
- [ ] Workspace deletion (clean up completed work)

## Summary

Workspace scoping enables **organized, hierarchical work** on the canvas:

✅ Supervisor creates workspaces for organization
✅ Sub-agents work within assigned workspaces
✅ All nodes automatically scoped to workspace
✅ Clear visual hierarchy on canvas
✅ No breaking changes to existing code

This is a **powerful pattern** for complex multi-step workflows!
