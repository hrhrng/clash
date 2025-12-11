# Backend - Master Clash

Python FastAPI service for AI agent orchestration and video production workflows.

## Features

- AI agent orchestration using LangGraph
- Video production workflow management
- Image/video generation via Kling API
- Checkpoint-based state management
- RESTful API for frontend integration
- Cloudflare D1 database support

## Tech Stack

- Python 3.12+
- FastAPI
- LangGraph (Multi-agent orchestration)
- LangChain (LLM framework)
- Google Gemini / OpenAI
- Kling AI (Image/Video generation)
- Cloudflare D1 (Database)

## Development

### Prerequisites

- Python 3.12+
- uv (recommended) or pip
- Docker (for containerization)

### Setup

```bash
# Using uv (recommended)
uv venv
uv pip install -e ".[dev]"

# Or using pip
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `GOOGLE_API_KEY` - Google Gemini API key
- `KLING_ACCESS_KEY` - Kling AI access key
- `KLING_SECRET_KEY` - Kling AI secret key
- `D1_DATABASE_URL` - Cloudflare D1 database URL

### Run Development Server

```bash
# Using make
make dev

# Or directly
uvicorn master_clash.api.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at:
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Testing

```bash
# Run all tests
make test

# Run with coverage
pytest --cov=master_clash --cov-report=html

# Run specific test
pytest tests/test_models.py
```

### Code Quality

```bash
# Format code
make format

# Lint code
make lint

# Type check
make typecheck
```

## Project Structure

```
backend/
├── src/
│   └── master_clash/
│       ├── api/              # FastAPI application
│       │   └── main.py       # API server
│       ├── agents/           # LangGraph agents
│       │   ├── script_agent.py
│       │   ├── shot_agent.py
│       │   └── art_director_agent.py
│       ├── workflow/         # Video production workflow
│       │   ├── state.py
│       │   └── video_production.py
│       ├── tools/            # AI tools
│       │   ├── kling.py      # Kling API integration
│       │   └── nano_banana.py
│       ├── database/         # Database adapters
│       │   ├── adapters/
│       │   │   ├── d1_adapter.py
│       │   │   ├── sqlite_adapter.py
│       │   │   └── postgres_adapter.py
│       │   └── checkpointer.py
│       ├── config.py         # Settings
│       ├── models.py         # Pydantic models
│       └── utils.py          # Utilities
├── tests/                    # Test suite
├── examples/                 # Example scripts
├── Dockerfile               # Container config
├── Makefile                 # Development commands
└── pyproject.toml           # Dependencies
```

## API Endpoints

### Health & Status

- `GET /` - Root endpoint
- `GET /health` - Health check

### Video Generation

- `POST /api/v1/video/generate` - Generate video from script
  ```json
  {
    "project_id": "uuid",
    "script": "Video script content",
    "style": "cinematic",
    "duration": 30
  }
  ```

- `POST /api/v1/image/generate` - Generate image for shot
  ```json
  {
    "project_id": "uuid",
    "shot_description": "Shot description",
    "style": "cinematic"
  }
  ```

### Workflow Management

- `GET /api/v1/workflow/{project_id}/status` - Get workflow status
- `POST /api/v1/workflow/{project_id}/cancel` - Cancel workflow

## Docker

### Build Container

```bash
# Build
docker build -t master-clash-backend:latest .

# Build with BuildKit cache
DOCKER_BUILDKIT=1 docker build -t master-clash-backend:latest .
```

### Run Container

```bash
# Run with environment variables
docker run -d \
  -p 8000:8000 \
  -e GOOGLE_API_KEY=your-key \
  -e KLING_ACCESS_KEY=your-key \
  -e KLING_SECRET_KEY=your-secret \
  -e D1_DATABASE_URL=your-d1-url \
  master-clash-backend:latest

# Run with .env file
docker run -d \
  -p 8000:8000 \
  --env-file .env \
  master-clash-backend:latest
```

## Deployment to Cloudflare

### Using Cloudflare Container Registry

1. **Build and tag image**:
   ```bash
   docker build -t master-clash-backend:latest .
   docker tag master-clash-backend:latest \
     registry.cloudflare.com/{account-id}/master-clash-backend:latest
   ```

2. **Login to Cloudflare registry**:
   ```bash
   docker login registry.cloudflare.com \
     -u {account-id} \
     -p {api-token}
   ```

3. **Push image**:
   ```bash
   docker push registry.cloudflare.com/{account-id}/master-clash-backend:latest
   ```

4. **Deploy via Cloudflare Dashboard**:
   - Go to Workers & Pages → Container Registry
   - Create new deployment from image
   - Configure environment variables
   - Set port to 8000

### Environment Variables in Production

Set these in Cloudflare dashboard:

- `GOOGLE_API_KEY`
- `KLING_ACCESS_KEY`
- `KLING_SECRET_KEY`
- `D1_DATABASE_URL`
- `D1_ACCOUNT_ID`
- `D1_DATABASE_ID`
- `D1_API_TOKEN`
- `LANGCHAIN_API_KEY` (optional)
- `ENVIRONMENT=production`

## Database Integration

The backend connects to the same Cloudflare D1 database as the frontend:

```python
from master_clash.database.adapters.d1_adapter import D1Adapter

# Initialize D1 adapter
adapter = D1Adapter(
    account_id=settings.d1_account_id,
    database_id=settings.d1_database_id,
    api_token=settings.d1_api_token
)

# Use for checkpointing
from master_clash.database.checkpointer import D1Checkpointer
checkpointer = D1Checkpointer(adapter)
```

## LangGraph Workflow

The video production workflow uses LangGraph with checkpointing:

```python
from master_clash.workflow.video_production import create_workflow

# Create workflow with checkpointing
workflow = create_workflow()

# Execute workflow
result = await workflow.ainvoke(
    {"script": "Your script here"},
    config={"configurable": {"thread_id": project_id}}
)
```

Checkpoints are stored in D1 database for resumability.

## Makefile Commands

- `make dev` - Start development server
- `make test` - Run tests
- `make lint` - Run linter
- `make format` - Format code
- `make typecheck` - Run type checker
- `make docker-build` - Build Docker image
- `make docker-run` - Run Docker container
- `make clean` - Clean build artifacts

## Troubleshooting

### Import Errors

```bash
# Reinstall in editable mode
uv pip install -e ".[dev]"
```

### Database Connection Issues

```bash
# Test D1 connection
python -c "from master_clash.database.adapters.d1_adapter import D1Adapter; print('OK')"
```

### Docker Build Issues

```bash
# Clean build cache
docker builder prune

# Rebuild without cache
docker build --no-cache -t master-clash-backend:latest .
```

## Learn More

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain Documentation](https://python.langchain.com/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Container Registry](https://developers.cloudflare.com/workers/platform/registry/)
