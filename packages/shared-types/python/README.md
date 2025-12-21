# clash-types

Auto-generated Python type definitions from `@clash/shared-types` Zod schemas.

## Installation

```bash
# From monorepo root
uv pip install -e packages/shared-types/python
```

## Usage

```python
from clash_types import CanvasNode, CanvasEdge, AIGCTask
```

## Regenerate

When Zod schemas change, regenerate with:

```bash
pnpm --filter @clash/shared-types generate:python
```
