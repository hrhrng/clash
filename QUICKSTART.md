# Quick Start Guide

Get Master Clash up and running in 5 minutes.

## Prerequisites

- Node.js 20+
- Python 3.12+
- Cloudflare account (free tier works)

## Step 1: Clone and Setup

```bash
# Clone repository
git clone <your-repo-url>
cd master-clash

# Run automated setup
npm install
npm run setup
```

This will:
- Install frontend dependencies
- Setup Python virtual environment
- Create `.env` files from examples

## Step 2: Configure Environment

### Frontend (.env)

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
# Minimum required for local development
GOOGLE_AI_API_KEY=your-gemini-api-key
AUTH_SECRET=your-random-secret-32-chars-min

# Local backend (keep as is for dev)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Generate AUTH_SECRET:
```bash
openssl rand -base64 32
```

### Backend (.env)

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# Minimum required
GOOGLE_API_KEY=your-gemini-api-key
KLING_ACCESS_KEY=your-kling-access-key
KLING_SECRET_KEY=your-kling-secret-key
```

## Step 3: Initialize Database

```bash
cd frontend

# Create local D1 database
wrangler d1 create clash-flow-db

# Copy database_id to wrangler.toml
# Then run migrations
wrangler d1 migrations apply clash-flow-db --local
```

## Step 4: Start Development

Open two terminals:

**Terminal 1 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd backend
make dev
```

Visit:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs

## What's Next?

### For Development

1. **Explore the API**
   - Visit http://localhost:8000/docs
   - Try the `/api/v1/video/generate` endpoint

2. **Check the Frontend**
   - Create a new project
   - Test the workflow builder
   - Try AI chat

3. **Run Tests**
   ```bash
   # Frontend
   cd frontend && npm test

   # Backend
   cd backend && make test
   ```

### For Deployment

Follow [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.

**Quick deploy:**
```bash
# Push to GitHub (triggers CI/CD)
git add .
git commit -m "Initial deployment"
git push origin main
```

## Common Issues

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill

# Kill process on port 8000
lsof -ti:8000 | xargs kill
```

### Database Not Found

```bash
cd frontend
rm -f local.db*
wrangler d1 migrations apply clash-flow-db --local
```

### Python Import Errors

```bash
cd backend
uv pip install -e ".[dev]"
```

### Frontend Build Errors

```bash
cd frontend
rm -rf .next node_modules
npm install
npm run dev
```

## Getting API Keys

### Google Gemini API Key

1. Go to https://makersuite.google.com/app/apikey
2. Create new API key
3. Copy to `GOOGLE_AI_API_KEY`

### Kling API Keys

1. Sign up at https://klingai.com
2. Go to API dashboard
3. Create access key and secret
4. Copy to `.env`

### Cloudflare (for deployment)

1. Sign up at https://dash.cloudflare.com
2. Get Account ID from dashboard
3. Create API token with Pages + D1 permissions

## Project Structure

```
master-clash/
├── frontend/          # Next.js app (Cloudflare Pages)
│   ├── app/          # Routes and pages
│   ├── components/   # React components
│   └── lib/          # Database & utilities
├── backend/          # Python FastAPI (Cloudflare Container)
│   ├── src/master_clash/
│   │   ├── api/      # FastAPI endpoints
│   │   ├── agents/   # LangGraph agents
│   │   ├── workflow/ # Video production
│   │   └── tools/    # Kling API integration
│   └── tests/        # Test suite
└── .github/workflows/ # CI/CD pipelines
```

## Available Commands

### Root

```bash
npm run setup              # Setup everything
npm run dev                # Start both frontend & backend
npm run build              # Build both
npm run test               # Test both
```

### Frontend

```bash
npm run dev                # Development server
npm run build              # Production build
npm run pages:build        # Build for Cloudflare Pages
npm run lint               # Lint code
npm run format             # Format code
```

### Backend

```bash
make dev                   # Development server
make test                  # Run tests
make lint                  # Lint code
make format                # Format code
make docker-build          # Build Docker image
```

## Learn More

- [Full Documentation](./README.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Architecture Overview](./README.md#architecture)
- [API Documentation](http://localhost:8000/docs)

## Need Help?

- Open an issue: [GitHub Issues](https://github.com/yourusername/master-clash/issues)
- Check [Troubleshooting](./DEPLOYMENT.md#troubleshooting)

## Next Steps

1. ✅ Setup complete
2. 📝 Read [README.md](./README.md) for architecture
3. 🚀 Follow [DEPLOYMENT.md](./DEPLOYMENT.md) to deploy
4. 💻 Start building!
