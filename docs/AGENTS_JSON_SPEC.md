# Agent-Optimized Documentation System (AODS) Spec

This document defines the standard for `agents.json` files and source code headers used to guide Coding Agents through the codebase.

## 1. `agents.json` Structure

Each significant directory SHOULD contain an `agents.json` file. This file acts as a "router" for the Agent.

```json
{
  "summary": "Brief description of this directory's purpose (Max 1-2 sentences).",
  "context_hints": [
    "When to look here: e.g., dealing with database schemas",
    "When to look here: e.g., debugging authentication flow"
  ],
  "subdirectories": {
    "folder_name": "Description of what is inside this folder. Be specific enough for an agent to decide if it needs to enter."
  },
  "key_files": {
    "filename.ext": "Description of this file's responsibility. Mention if it is an entry point or a singleton."
  },
  "architecture_notes": "Optional. High-level patterns used here (e.g., 'Uses Dependency Injection', 'Follows Repository Pattern').",
  "related_modules": [
    "Path/to/related/module - Reason for relationship"
  ]
}
```

## 2. Source Code Header Standard

Every non-trivial source file MUST have a structured comment block at the very top.

### Format

```text
/**
 * @file <filename>
 * @description <Concise summary of what this file does>
 * @module <module_name>
 *
 * @responsibility
 * - <Primary Responsibility 1>
 * - <Primary Responsibility 2>
 *
 * @exports
 * - <ClassName/FunctionName>: <Brief description>
 *
 * @visual-context (Optional, for UI components)
 * <Description of where this component appears in the UI>
 */
```

### Example (Python)

```python
"""
@file router.py
@description FastAPI router for handling project generation requests.
@module apps.api.routers

@responsibility
- Validates incoming project creation requests
- Dispatches tasks to the LangGraph workflow
- Handles async task status polling

@exports
- project_router: The APIRouter instance
"""
```
