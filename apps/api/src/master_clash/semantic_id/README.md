# Semantic ID System

A human-readable, memorable ID generation system for assets and resources. IDs are composed of three words from carefully curated wordlists, forming identifiers like `alpha-ocean-square` or `beta-mountain-circle`.

## Features

- **Human-Readable**: Easy to remember and communicate IDs
- **64 Million Combinations**: 400 × 400 × 400 = 64,000,000 unique IDs
- **Project-Scoped**: Ensures uniqueness within project boundaries
- **Collision Detection**: Automatic retry mechanism for duplicates
- **LLM-Friendly**: Perfect for AI systems that need to reference assets by ID
- **Customizable**: Support for custom separators and wordlists

## Quick Start

### Basic Usage

```python
from master_clash.semantic_id import generate_semantic_id

# Generate a single ID
id = generate_semantic_id()
# Example output: "alpha-ocean-square"
```

### Project-Scoped Generation

```python
from master_clash.semantic_id.db_integration import (
    InMemoryIDChecker,
    generate_unique_id_for_project
)

# Create ID checker (use DatabaseIDChecker for production)
checker = InMemoryIDChecker()

# Generate unique IDs for a project
project_id = "project-123"
asset_id = generate_unique_id_for_project(project_id, checker)
print(f"Asset ID: {asset_id}")  # e.g., "beta-mountain-circle"

# Register the ID in the checker
checker.add_id(asset_id, project_id)

# Generate another unique ID (will avoid duplicates)
shot_id = generate_unique_id_for_project(project_id, checker)
print(f"Shot ID: {shot_id}")  # e.g., "gamma-river-triangle"
```

### Advanced Usage

```python
from master_clash.semantic_id import SemanticIDGenerator

# Create generator with custom settings
generator = SemanticIDGenerator(
    separator="_",        # Use underscore instead of dash
    max_attempts=100      # Max collision resolution attempts
)

# Generate IDs
id1 = generator.generate()  # e.g., "alpha_ocean_square"

# Generate with uniqueness check
existing_ids = {"alpha_ocean_square", "beta_mountain_circle"}

def is_unique(candidate: str) -> bool:
    return candidate not in existing_ids

unique_id = generator.generate_unique(is_unique, context="my-project")
print(f"Unique ID: {unique_id}")

# Generate batch of unique IDs
batch = generator.generate_unique_batch(
    count=10,
    is_unique=is_unique,
    context="my-project"
)
print(f"Generated {len(batch)} unique IDs")
```

## Database Integration

### In-Memory Checker (Testing/Development)

```python
from master_clash.semantic_id.db_integration import InMemoryIDChecker

checker = InMemoryIDChecker()

# Add IDs
checker.add_id("alpha-ocean-square", "project-1")
checker.add_id("beta-mountain-circle", "project-1")

# Check existence
exists = checker.id_exists("alpha-ocean-square", "project-1")  # True
exists = checker.id_exists("gamma-river-triangle", "project-1")  # False

# Get all IDs for a project
project_ids = checker.get_project_ids("project-1")
print(f"Project has {len(project_ids)} IDs")
```

### Database Checker (Production)

```python
from master_clash.semantic_id.db_integration import DatabaseIDChecker

# Assuming you have a database connection
from master_clash.database import get_database

db = get_database()
checker = DatabaseIDChecker(db)

# Generate unique ID with database checking
from master_clash.semantic_id.db_integration import generate_unique_id_for_project

unique_id = generate_unique_id_for_project("project-123", checker)
print(f"Generated: {unique_id}")
```

## Wordlists

The system uses three curated wordlists of 400 neutral, descriptive words each:

1. **TECH_SCIENCE_WORDS**: Technology, science, and Greek letters
   - Examples: `alpha`, `beta`, `gamma`, `pixel`, `matrix`, `quantum`

2. **NATURE_ELEMENTS_WORDS**: Nature, elements, and geography
   - Examples: `ocean`, `mountain`, `solar`, `lunar`, `forest`

3. **GEOMETRY_ABSTRACT_WORDS**: Abstract concepts, geometry, and numbers
   - Examples: `square`, `circle`, `triangle`, `red`, `blue`, `first`

### ID Format

Each ID consists of three words joined by a separator (default: `-`):

```
word1-word2-word3
  ↑      ↑      ↑
List 1  List 2  List 3
```

Examples:
- `alpha-ocean-square`
- `beta-mountain-circle`
- `gamma-river-triangle`
- `delta-forest-hexagon`

## ID Space & Collision Probability

With 400 words in each of the 3 wordlists:

**Total possible IDs**: 400 × 400 × 400 = **64,000,000**

**Collision probabilities** (within a single project):
- 100 existing IDs: 0.0078% chance of collision
- 1,000 existing IDs: 0.7782% chance of collision
- 10,000 existing IDs: 54.2167% chance of collision

For most projects, you'll have thousands of unique IDs before any collision occurs. The built-in collision resolution will automatically retry generation if a duplicate is detected.

## Use Cases

### For AI/LLM Systems

```python
# LLM can easily reference assets by semantic ID
asset_id = generate_unique_id_for_project(project_id, checker)
print(f"Created new shot: {asset_id}")
# Output: "Created new shot: alpha-ocean-square"

# LLM instruction:
# "Please modify the shot alpha-ocean-square and add beta-mountain-circle"
```

### For Asset Management

```python
# Generate IDs for different asset types
shot_id = generate_asset_id(project_id, checker)
scene_id = generate_scene_id(project_id, checker)

print(f"Shot ID: {shot_id}")   # e.g., "gamma-river-triangle"
print(f"Scene ID: {scene_id}")  # e.g., "delta-forest-hexagon"
```

### For Multi-Project Systems

```python
# IDs are unique within each project
# Same ID can exist in different projects

checker = InMemoryIDChecker()

id1 = generate_unique_id_for_project("project-A", checker)
id2 = generate_unique_id_for_project("project-B", checker)

# These won't conflict even if they're the same words
print(f"Project A: {id1}")  # e.g., "alpha-ocean-square"
print(f"Project B: {id2}")  # e.g., "alpha-ocean-square" (OK!)
```

## API Reference

### Core Functions

#### `generate_semantic_id(wordlists=None, separator="-")`

Generate a single semantic ID using default settings.

**Parameters:**
- `wordlists` (optional): Custom wordlists. Defaults to `ALL_WORDLISTS`.
- `separator` (optional): Separator between words. Defaults to `"-"`.

**Returns:** A semantic ID string.

#### `generate_unique_id_for_project(project_id, checker, generator=None)`

Generate a unique semantic ID for a project with collision detection.

**Parameters:**
- `project_id`: The project scope to generate ID for.
- `checker`: ID checker implementing the `IDChecker` protocol.
- `generator` (optional): Custom generator. Creates default if None.

**Returns:** A unique semantic ID string.

**Raises:** `RuntimeError` if unable to generate unique ID.

### SemanticIDGenerator Class

#### `__init__(wordlists=None, separator="-", max_attempts=100)`

Initialize the generator.

**Parameters:**
- `wordlists` (optional): List of 3 wordlists. Defaults to `ALL_WORDLISTS`.
- `separator` (optional): Separator between words. Defaults to `"-"`.
- `max_attempts` (optional): Max collision resolution attempts. Defaults to 100.

#### `generate()`

Generate a single semantic ID.

**Returns:** A semantic ID string.

#### `generate_unique(is_unique, context=None)`

Generate a unique semantic ID with collision detection.

**Parameters:**
- `is_unique`: Function that returns True if ID is unique.
- `context` (optional): Context string for logging/debugging.

**Returns:** A unique semantic ID string.

**Raises:** `RuntimeError` if unable to generate unique ID.

#### `generate_unique_batch(count, is_unique, context=None)`

Generate multiple unique semantic IDs.

**Parameters:**
- `count`: Number of unique IDs to generate.
- `is_unique`: Function that returns True if ID is unique.
- `context` (optional): Context string for logging/debugging.

**Returns:** List of unique semantic ID strings.

## Testing

Run the test suite:

```bash
uv run python test_semantic_id.py
```

The test suite includes:
- Wordlist integrity checks
- Basic ID generation
- Uniqueness & collision detection
- ID space calculations
- Project scoping
- Collision resolution
- Edge cases

## Best Practices

1. **Always use project scoping**: Ensure IDs are unique within project boundaries
2. **Register IDs immediately**: Add generated IDs to your checker right away
3. **Use database-backed checker in production**: `InMemoryIDChecker` is for testing only
4. **Monitor collision rates**: If collisions become frequent, consider expanding wordlists
5. **Keep IDs immutable**: Once generated, never change an ID
6. **Use meaningful project IDs**: Makes debugging easier

## Future Enhancements

Potential improvements:
- Additional wordlists for more variety
- Support for 2-word or 4-word IDs
- Language-specific wordlists (multilingual support)
- Custom word filtering (avoid certain words)
- ID analytics (track generation patterns)
- Batch import/export utilities
