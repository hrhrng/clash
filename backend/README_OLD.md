# Master Clash

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Code style: ruff](https://img.shields.io/badge/code%20style-ruff-000000.svg)](https://github.com/astral-sh/ruff)

An AI-powered video production toolkit with multi-agent orchestration for generating complete video storyboards from story ideas.

## Features

- **Automated Script Generation**: Convert story ideas into structured production scripts
- **Asset Generation**: Automatically create character and location reference images
- **Shot Generation**: Generate individual shot keyframes with consistent visual style
- **Multiple AI Backends**: Support for Google Gemini and Nano Banana Pro
- **Multi-Agent Architecture**: Built with LangChain and LangGraph for orchestration
- **Modular Design**: Clean separation of concerns with reusable components
- **Checkpoint System**: LangGraph-powered state persistence with SQLite/Cloudflare D1
- **Cost Tracking**: Automatic tracking of API costs, execution time, and resource usage
- **Workflow Recovery**: Resume interrupted workflows from the last successful checkpoint

## Quick Start

### Installation

This project uses [uv](https://github.com/astral-sh/uv) for fast, reliable dependency management:

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone the repository
git clone https://github.com/yourusername/master-clash.git
cd master-clash

# Install dependencies
uv sync

# Install development tools (optional)
uv sync --all-groups
```

### Environment Setup

Create a `.env` file in the project root:

```env
# AI API Keys
GOOGLE_API_KEY=your_google_api_key
GEMINI_API_KEY=your_gemini_api_key
NANO_BANANA_API_KEY=your_nano_banana_api_key

# Database (for checkpointing)
DATABASE_URL=sqlite:///./data/checkpoints.db
```

### Initialize Database

Set up the database schema via migrations (SQLite or Postgres):

```bash
# Initialize database schema (uses DATABASE_URL)
uv run python scripts/init_database.py
```

Supported `DATABASE_URL` values:
- `sqlite:///./data/checkpoints.db` (default)
- `postgresql://user:pass@host:5432/master_clash` (Neon compatible; add `?sslmode=require` if needed)
 - `d1://your-d1-database-name` (Cloudflare D1 via Admin API; requires CF_API_TOKEN, CF_ACCOUNT_ID, D1_DATABASE_ID)

Note: LangGraph checkpointing currently uses the bundled SQLite `SqliteSaver`.
The metadata, assets and API logs are stored using the configured `DATABASE_URL`.

If using Postgres/Neon, install the optional driver group:

```bash
uv sync --group postgres
```

Using Cloudflare D1
- Set env vars: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `D1_DATABASE_ID` and `DATABASE_URL=d1://<name>`
- Run migrations: `uv run python scripts/init_database.py`
- Notes: Adapter uses the D1 Admin API; suitable for migrations/ops outside Workers.

CI/CD with Cloudflare Containers
- CI workflow builds/tests Docker image: `.github/workflows/ci.yml`
- Deploy workflow builds, runs migrations (including D1), pushes image to GHCR: `.github/workflows/deploy-cloudflare.yml`
- Replace the placeholder step with your Cloudflare Containers deploy command/API once enabled on your account.

## Project Structure

```
master-clash/
├── src/
│   └── master_clash/          # Main package
│       ├── __init__.py
│       ├── models.py          # Pydantic data models
│       ├── prompts.py         # AI prompts
│       ├── utils.py           # Utility functions
│       ├── agents/            # Agent modules
│       │   ├── script_agent.py
│       │   ├── shot_agent.py
│       │   └── art_director_agent.py
│       └── tools/             # Tools and integrations
│           ├── kling.py       # Video generation
│           └── nano_banana.py # Image generation
├── tests/                     # Test suite
├── docs/                      # Documentation
├── assets/                    # Asset files
├── pyproject.toml            # Project configuration
├── uv.lock                   # Dependency lock file
└── Makefile                  # Development tasks
```

## Usage

### Interactive Development (Jupyter Notebook)

Open `video_production.ipynb` for interactive workflow:

```python
from master_clash.agents import script_agent, shot_agent, art_director_agent
from master_clash.models import Script

# Generate script
script = script_agent.generate("A sci-fi short about a robot finding a flower")

# Generate assets
assets = art_director_agent.generate_assets(script)

# Generate shots
shots = shot_agent.generate_shots(script, assets)
```

### Python API

```python
from master_clash.agents import script_agent
from master_clash.models import Script

# Your production pipeline code here
script = script_agent.generate("Your story idea")
```

## Development

### Available Commands

```bash
# Show all available commands
make help

# Install dependencies
make install

# Format code
make format

# Run linting
make lint

# Fix linting issues
make lint-fix

# Run type checking
make typecheck

# Run tests
make test

# Run tests with coverage
make test-cov

# Run all checks (format, lint, typecheck, test)
make all

# Run checks without formatting
make check

# Clean up build artifacts
make clean
```

### Development Workflow

1. Install dependencies: `make install` or `uv sync --all-groups`
2. Make your changes
3. Format code: `make format`
4. Run checks: `make check`
5. Run tests: `make test`

## Module Overview

### Core Modules

- **models.py**: Pydantic data models for scripts, shots, characters, etc.
- **prompts.py**: AI prompts for different agents
- **utils.py**: Utility functions for file I/O and conversions

### Agents

- **script_agent.py**: Converts story ideas to structured scripts
- **art_director_agent.py**: Generates character and location assets
- **shot_agent.py**: Generates individual shot keyframes

### Tools

- **nano_banana.py**: Image generation integration
- **kling.py**: Video generation integration

## Testing

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov

# Run specific test file
uv run pytest tests/test_models.py
```

## Requirements

- Python 3.12+
- Google Gemini API access
- Nano Banana Pro API access (optional)
- See [pyproject.toml](pyproject.toml) for complete dependency list

## License

MIT

## Contributing

Contributions welcome! Please ensure code follows the modular structure.
