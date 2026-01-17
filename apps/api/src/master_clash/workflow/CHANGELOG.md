# Changelog

## 🎉 v2.0 - Workspace Scoping & Enhanced Supervisor (2025-01-XX)

### 🔧 Timeline Editor Update (DSL)
- **Editor Agent** switched to DSL-based editing for precise state management
- **New Tools**:
  - `read_dsl` - Read full timeline state
  - `patch_dsl` - Modify timeline using JSON Patch (RFC 6902)
- **Removed**: `timeline_editor` tool
- **Dependency**: Added `jsonpatch` library

### 🆕 New Features

#### Workspace Scoping
- **Supervisor can create workspace groups** for organizing sub-agent work
- **Sub-agents automatically scope their work** to assigned workspace
- **New tools added to Supervisor:**
  - `create_workspace_group(name, description)` - Create organizational groups
  - `list_workspace_groups()` - List existing workspaces
- **Enhanced task_delegation:**
  - Added `workspace_group_id` parameter
  - Sub-agents receive workspace scope in state
  - All created nodes automatically placed in workspace

#### Supervisor Enhancement
- **Supervisor is no longer just a delegator** - it now has tools!
- **Can handle simple tasks directly** using canvas tools
- **Workspace-aware system prompt** with examples
- **Better organization** of complex multi-step workflows

#### Workspace-Aware Agents
- **ScriptWriter** - workspace_aware=True
- **ConceptArtist** - workspace_aware=True
- **StoryboardDesigner** - workspace_aware=True
- **Editor** - workspace_aware=False (works globally)

### 🔧 Technical Changes

#### State Schema
```python
# Before
class AgentState(TypedDict):
    messages: ...
    project_id: str

# After
class AgentState(TypedDict):
    messages: ...
    project_id: str
    workspace_group_id: str | None  # ← NEW
```

#### SubAgent Definition
```python
# Before
@dataclass
class SubAgent:
    name: str
    description: str
    tools: ...

# After
@dataclass
class SubAgent:
    name: str
    description: str
    tools: ...
    workspace_aware: bool = False  # ← NEW
```

#### Middleware Auto-Scoping
- `create_canvas_node` now checks `runtime.state.get("workspace_group_id")`
- Automatically sets `parent_id` for workspace-aware agents
- No code changes needed in sub-agents

### 📚 Documentation
- Added [WORKSPACE_SCOPING.md](WORKSPACE_SCOPING.md) - Complete feature guide
- Updated [README.md](README.md) - Added workspace scoping section
- Updated [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) - New capabilities

### 🎯 Benefits
- ✅ **Organized canvas** - Clear visual hierarchy
- ✅ **Isolated workspaces** - No cross-contamination
- ✅ **Automatic scoping** - No manual parent_id management
- ✅ **Flexible delegation** - Same agent, different workspaces
- ✅ **No breaking changes** - Backward compatible

---

## v1.0 - Initial Architecture (2025-01-XX)

### 🆕 Initial Features

#### Core Architecture
- **Backend Protocol** - Abstract canvas operations
- **Middleware System** - Composable capabilities
- **SubAgent Delegation** - Specialized agents
- **Graph Factory** - Agent composition

#### Implementations
- **StateCanvasBackend** - Integrated with existing context system
- **CanvasMiddleware** - 7 canvas tools generated dynamically (timeline_editor moved to TimelineMiddleware)
- **TodoListMiddleware** - Task planning tools
- **SubAgentMiddleware** - Task delegation

#### Specialists
- **ScriptWriter** - Story outlines and scripts
- **ConceptArtist** - Character and scene visualization
- **StoryboardDesigner** - Shot sequences
- **Editor** - Timeline assembly

#### Integration
- **SSE Emission** - `get_stream_writer()` for proposals
- **Context Reading** - `get_project_context()` for state
- **Semantic IDs** - `generate_unique_id_for_project()`
- **No breaking changes** - Full compatibility with existing system

### 📚 Documentation
- [README.md](README.md) - Architecture overview
- [INTEGRATION.md](INTEGRATION.md) - Integration guide
- [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) - Quick summary

### 🎯 Design Principles
1. **Middleware as Plugins** - Composable capabilities
2. **Backend Abstraction** - Decoupled operations
3. **Tool Factories** - Dynamic generation
4. **State-First** - LangGraph state management
5. **Delegation Model** - Specialist agents

---

## Migration Guide

### From v1.0 to v2.0

**No breaking changes!** All v1.0 code continues to work.

**New capabilities:**
```python
# v1.0 - Still works
task_delegation(
    agent="ConceptArtist",
    instruction="Design a character"
)

# v2.0 - Enhanced with workspace scoping
create_workspace_group(name="Character Design")
# → workspace-id

task_delegation(
    agent="ConceptArtist",
    instruction="Design a character",
    workspace_group_id="workspace-id"  # ← NEW
)
```

**Supervisor enhancement:**
```python
# v1.0 - Supervisor could only delegate
# v2.0 - Supervisor has tools:
# - create_workspace_group()
# - list_workspace_groups()
# - task_delegation()
# - All canvas tools (list, read, create, etc.)
```

---

## Roadmap

### v2.1 - Enhanced Workspace Management
- [ ] Auto-layout groups on canvas
- [ ] Nested workspaces (groups within groups)
- [ ] Workspace templates
- [ ] Workspace search

### v2.2 - Production Features
- [ ] Error recovery and retry logic
- [ ] Rate limiting
- [ ] Metrics and monitoring
- [ ] Parallel subagent execution

### v3.0 - Advanced Backends
- [ ] CompositeBackend - Routing by path
- [ ] StoreBackend - Persistent storage
- [ ] DatabaseCanvasBackend - PostgreSQL/D1

### v3.1 - Advanced Middleware
- [ ] SummarizationMiddleware
- [ ] HumanInTheLoopMiddleware
- [ ] CachingMiddleware

---

## Contributors

Architecture inspired by [deepagents](https://github.com/anthropics/deepagents) by Anthropic.
