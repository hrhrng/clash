# Master Clash - Project Overview

## ✅ Setup Complete!

Your full-stack AI video production platform is now configured for local development and Cloudflare deployment.

## 🎯 What You Have

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Cloudflare Infrastructure              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Frontend (Next.js)          Backend (FastAPI)      │
│  ┌─────────────────┐         ┌──────────────────┐  │
│  │ Cloudflare      │         │ Cloudflare       │  │
│  │ Pages/Workers   │────────▶│ Container        │  │
│  │                 │  REST   │                  │  │
│  │ - Project CRUD  │  API    │ - AI Agents      │  │
│  │ - Auth          │         │ - LangGraph      │  │
│  │ - UI/UX         │         │ - Kling AI       │  │
│  └────────┬────────┘         └────────┬─────────┘  │
│           │                           │             │
│           └──────────┬────────────────┘             │
│                      ▼                               │
│           ┌─────────────────────┐                   │
│           │  Cloudflare D1      │                   │
│           │  (SQLite Database)  │                   │
│           │                     │                   │
│           │ - Users             │                   │
│           │ - Projects          │                   │
│           │ - Messages          │                   │
│           │ - Checkpoints       │                   │
│           └─────────────────────┘                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

**Frontend (Next.js)**
- ⚛️ React 19 + Next.js 16 (App Router)
- 🎨 Tailwind CSS 4
- 🔐 NextAuth.js (Authentication)
- 🗄️ Drizzle ORM (D1 adapter)
- 🎭 Framer Motion
- 🔀 React Flow (Workflow visualization)
- ☁️ Deployed on Cloudflare Pages/Workers

**Backend (Python)**
- 🐍 Python 3.12+
- ⚡ FastAPI
- 🤖 LangGraph (Agent orchestration)
- 🔗 LangChain
- 🧠 Google Gemini / OpenAI
- 🎬 Kling AI (Video generation)
- 🐳 Docker containerized
- ☁️ Deployed on Cloudflare Container

**Database**
- 🗄️ Cloudflare D1 (Serverless SQLite)
- 📝 Drizzle ORM migrations
- 💾 Checkpoint storage for workflows

## 📁 Project Structure

```
master-clash/
├── frontend/                    # Next.js frontend
│   ├── app/                    # App Router pages
│   │   ├── (dashboard)/       # Dashboard routes
│   │   ├── api/               # API routes
│   │   └── agent/             # Agent interaction
│   ├── components/            # React components
│   ├── lib/                   # Utilities
│   │   ├── db/               # Database (Drizzle + D1)
│   │   └── ai-config.ts      # AI configuration
│   ├── drizzle/              # Database migrations
│   └── wrangler.toml         # Cloudflare config
│
├── backend/                    # Python backend
│   ├── src/master_clash/
│   │   ├── api/              # FastAPI server
│   │   │   └── main.py       # API endpoints
│   │   ├── agents/           # LangGraph agents
│   │   │   ├── script_agent.py
│   │   │   ├── shot_agent.py
│   │   │   └── art_director_agent.py
│   │   ├── workflow/         # Video production workflow
│   │   ├── tools/            # AI tools (Kling API)
│   │   ├── database/         # Database adapters
│   │   └── config.py         # Settings
│   ├── tests/                # Test suite
│   ├── Dockerfile            # Container config
│   └── Makefile              # Development commands
│
├── .github/workflows/          # CI/CD
│   ├── deploy.yml            # Deployment pipeline
│   └── test.yml              # Test pipeline
│
├── scripts/                    # Setup scripts
│   └── setup.js              # Automated setup
│
├── Makefile                   # Root commands
├── README.md                  # Main documentation
├── DEPLOYMENT.md              # Deployment guide
├── QUICKSTART.md              # Quick start guide
└── PROJECT_OVERVIEW.md        # This file
```

## 🚀 Current Status

### ✅ Configured

- [x] Project structure
- [x] Frontend (Next.js with Cloudflare compatibility)
- [x] Backend (FastAPI with Docker)
- [x] Database schema (Drizzle ORM)
- [x] Development environment
- [x] Makefile commands
- [x] CI/CD pipelines (GitHub Actions)
- [x] Documentation

### 🏃 Running

- ✅ Frontend: http://localhost:3000
- ⏳ Backend: Not started (run `make dev-backend`)

### 📋 Next Steps

1. **Configure API Keys**
   ```bash
   # Edit frontend/.env
   GOOGLE_AI_API_KEY=your-key
   AUTH_SECRET=your-secret

   # Edit backend/.env
   GOOGLE_API_KEY=your-key
   KLING_ACCESS_KEY=your-key
   KLING_SECRET_KEY=your-secret
   ```

2. **Setup Database**
   ```bash
   make db-setup      # Create D1 database
   make db-migrate    # Run migrations
   ```

3. **Start Backend**
   ```bash
   make dev-backend   # Or: cd backend && make dev
   ```

4. **Test Everything**
   ```bash
   make test
   ```

## 🎮 Available Commands

### Quick Commands (Makefile)

```bash
make help           # Show all commands
make setup          # Complete setup
make dev            # Start both frontend & backend
make build          # Build for production
make test           # Run all tests
make clean          # Clean build artifacts

# Shortcuts
make d              # = make dev
make b              # = make build
make t              # = make test
```

### Frontend Only

```bash
cd frontend
npm run dev         # Development server
npm run build       # Production build
npm run pages:build # Build for Cloudflare Pages
npm run lint        # Lint code
npm run format      # Format code
```

### Backend Only

```bash
cd backend
make dev            # Development server
make test           # Run tests
make lint           # Lint code
make format         # Format code
make docker-build   # Build Docker image
```

### Database

```bash
make db-setup       # Create D1 database
make db-migrate     # Run migrations (local)
make db-console     # Open D1 console
```

## 🌐 Deployment

### Automatic (Recommended)

Push to GitHub to trigger automated deployment:

```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

GitHub Actions will:
1. Run tests
2. Build and deploy frontend to Cloudflare Pages
3. Build and push backend to Cloudflare Container Registry
4. Run database migrations

### Manual

```bash
# Frontend
cd frontend
wrangler pages deploy

# Backend
cd backend
docker build -t master-clash-backend:latest .
docker tag master-clash-backend:latest registry.cloudflare.com/{account-id}/master-clash-backend:latest
docker push registry.cloudflare.com/{account-id}/master-clash-backend:latest
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions.

## 📚 Documentation

- [README.md](./README.md) - Main documentation
- [QUICKSTART.md](./QUICKSTART.md) - Get started in 5 minutes
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Full deployment guide
- [frontend/README.md](./frontend/README.md) - Frontend specific docs
- [backend/README.md](./backend/README.md) - Backend specific docs

## 🔧 Configuration Files

### Environment Variables

**Frontend** (`frontend/.env`)
- `GOOGLE_AI_API_KEY` - Google Gemini API key
- `AUTH_SECRET` - NextAuth secret (generate with `openssl rand -base64 32`)
- `NEXT_PUBLIC_BACKEND_URL` - Backend API URL

**Backend** (`backend/.env`)
- `GOOGLE_API_KEY` - Google Gemini API key
- `KLING_ACCESS_KEY` - Kling AI access key
- `KLING_SECRET_KEY` - Kling AI secret key
- `D1_DATABASE_URL` - Cloudflare D1 database URL

### Cloudflare Configuration

**wrangler.toml** (Frontend)
```toml
name = "clash-flow"
pages_build_output_dir = "out"

[[d1_databases]]
binding = "DB"
database_name = "clash-flow-db"
database_id = "your-database-id"
```

**Dockerfile** (Backend)
- Multi-stage build with uv
- Non-root user for security
- Health checks configured
- Port 8000 exposed

## 🎯 Features

### Current Features

- ✅ User authentication (NextAuth.js)
- ✅ Project management (CRUD operations)
- ✅ Workflow visualization (React Flow)
- ✅ AI chat interface
- ✅ Database persistence (Cloudflare D1)

### AI Agent Features

- 🤖 Script Agent: Analyze and structure scripts
- 🎬 Shot Agent: Generate shot descriptions
- 🎨 Art Director: Define visual styles
- 🖼️ Image Generation: Kling AI integration
- 💾 Checkpoint System: Resume workflows

### Planned Features

- [ ] Video generation workflow
- [ ] Real-time collaboration
- [ ] Asset management
- [ ] Export functionality
- [ ] Analytics dashboard

## 🐛 Troubleshooting

### Frontend won't start

```bash
cd frontend
rm -rf .next node_modules
npm install
npm run dev
```

### Backend won't start

```bash
cd backend
uv pip install -e ".[dev]"
make dev
```

### Database issues

```bash
make db-migrate  # Re-run migrations
make db-console  # Check database
```

### Build errors

```bash
make clean       # Clean all artifacts
make install     # Reinstall dependencies
```

## 📊 Project Health

Run this to check project status:

```bash
make status
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `make test`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file

## 🆘 Getting Help

- 📖 Read the docs: [README.md](./README.md)
- 🚀 Quick start: [QUICKSTART.md](./QUICKSTART.md)
- 🌐 Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/master-clash/issues)

---

**Happy coding! 🚀**

Access your app:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs (when started)
