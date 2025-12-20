# Master Clash

AI-powered video production platform with multi-agent orchestration.

## Architecture

This is a full-stack application deployed on Cloudflare:

- **Frontend**: Next.js application deployed to Cloudflare Pages
  - Handles project CRUD operations
  - User interface and interactions
  - Uses Cloudflare D1 (SQLite) database

- **Backend**: Python FastAPI service deployed to Cloudflare Container
  - AI agent orchestration (LangGraph)
  - Video production workflow
  - Image/video generation (Kling API)
  - Connects to shared D1 database

## Tech Stack

### Frontend
- Next.js 16 (React 19)
- Cloudflare Pages + Workers
- Cloudflare D1 (Database)
- Drizzle ORM
- Better Auth (Authentication)
- TailwindCSS 4
- React Flow (Workflow visualization)

### Backend
- Python 3.12+
- FastAPI
- LangGraph (Multi-agent orchestration)
- LangChain
- Google Gemini / OpenAI
- Kling AI (Image/Video generation)

## Project Structure

```
master-clash/
├── frontend/              # Next.js application
│   ├── app/              # Next.js App Router
│   ├── components/       # React components
│   ├── lib/             # Utilities and database
│   ├── drizzle/         # Database migrations
│   └── wrangler.toml    # Cloudflare config
├── backend/              # Python FastAPI service
│   ├── src/
│   │   └── master_clash/
│   │       ├── agents/  # LangGraph agents
│   │       ├── tools/   # AI tools (Kling, etc)
│   │       ├── workflow/# Video production workflow
│   │       └── database/# Database adapters
│   ├── Dockerfile       # Container config
│   └── pyproject.toml   # Python dependencies
└── .github/
    └── workflows/        # CI/CD pipelines
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Initial Setup

```bash
# Clone and setup
git clone <your-repo>
cd master-clash

# Run setup script
npm run setup
```

This will:
1. Install frontend dependencies
2. Setup Python virtual environment
3. Create environment files
4. Initialize D1 database
5. Run database migrations

### Development

#### Frontend Development

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

#### Backend Development

```bash
cd backend
make dev
# Open http://localhost:8000
```

### Environment Variables

#### Frontend (.env)

```env
# Database
DATABASE_URL="your-d1-database-url"

# Auth
AUTH_SECRET="your-secret-key"
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# Backend API
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"

# AI
GOOGLE_AI_API_KEY="your-gemini-api-key"
```

#### Backend (.env)

```env
# AI Services
GOOGLE_API_KEY="your-gemini-api-key"
OPENAI_API_KEY="your-openai-api-key"
KLING_ACCESS_KEY="your-kling-access-key"
KLING_SECRET_KEY="your-kling-secret-key"

# Database (Cloudflare D1)
D1_DATABASE_URL="your-d1-database-url"
D1_ACCOUNT_ID="your-cloudflare-account-id"
D1_DATABASE_ID="your-d1-database-id"
D1_API_TOKEN="your-cloudflare-api-token"

# LangSmith (Optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY="your-langsmith-api-key"
LANGCHAIN_PROJECT="master-clash"
```

## Deployment

### Frontend to Cloudflare Pages

```bash
cd frontend
npm run pages:build
wrangler pages deploy
```

### Backend to Cloudflare Container

```bash
cd backend
docker build -t master-clash-backend .
# Push to Cloudflare Container Registry
# (See Cloudflare documentation)
```

### Using GitHub Actions (Recommended)

Push to `main` branch to trigger automatic deployment:

```bash
git add .
git commit -m "Deploy updates"
git push origin main
```

## Database Management

### Create D1 Database

```bash
cd frontend
wrangler d1 create clash-flow-db
```

### Run Migrations

```bash
cd frontend
wrangler d1 migrations apply clash-flow-db --local  # Local
wrangler d1 migrations apply clash-flow-db          # Production
```

### Execute SQL

```bash
wrangler d1 execute clash-flow-db --command="SELECT * FROM users"
```

## API Documentation

### Backend API

Once the backend is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Testing

### Frontend Tests

```bash
cd frontend
npm test
```

### Backend Tests

```bash
cd backend
make test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT
