# Deployment Guide

This guide covers deploying Master Clash to Cloudflare infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐              ┌───────────────────┐   │
│  │  Cloudflare      │              │   Cloudflare      │   │
│  │  Pages           │─────────────▶│   Container       │   │
│  │  (Next.js)       │   API calls  │   (Python/FastAPI)│   │
│  └──────────────────┘              └───────────────────┘   │
│         │                                   │               │
│         │                                   │               │
│         └─────────┬───────────────────────┘               │
│                   ▼                                         │
│         ┌───────────────────┐                              │
│         │  Cloudflare D1    │                              │
│         │  (SQLite Database)│                              │
│         └───────────────────┘                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Cloudflare Account**
   - Sign up at https://dash.cloudflare.com/sign-up
   - Get your Account ID from dashboard

2. **Cloudflare API Token**
   - Go to Profile → API Tokens
   - Create token with permissions:
     - `Account:Cloudflare Pages:Edit`
     - `Account:D1:Edit`
     - `User:User Details:Read`

3. **Wrangler CLI**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

## Part 1: Database Setup (D1)

### 1.1 Create D1 Database

```bash
cd frontend
wrangler d1 create clash-flow-db
```

Save the output:
```
[[d1_databases]]
binding = "DB"
database_name = "clash-flow-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 1.2 Update wrangler.toml

Update `frontend/wrangler.toml` with your database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "clash-flow-db"
database_id = "your-actual-database-id-here"
migrations_dir = "drizzle"
```

### 1.3 Run Migrations

```bash
# Local (for testing)
wrangler d1 migrations apply clash-flow-db --local

# Production
wrangler d1 migrations apply clash-flow-db
```

### 1.4 Verify Database

```bash
# List databases
wrangler d1 list

# Execute query
wrangler d1 execute clash-flow-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## Part 2: Frontend Deployment (Cloudflare Pages)

### 2.1 Build Frontend

```bash
cd frontend
npm install
npm run pages:build
```

### 2.2 Deploy via Wrangler

```bash
wrangler pages deploy out --project-name=clash-flow
```

Or connect GitHub repository:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Click "Create a project" → "Connect to Git"
3. Select your repository
4. Configure build settings:
   - **Build command**: `cd frontend && npm run pages:build`
   - **Build output directory**: `frontend/out`
   - **Root directory**: `/`

### 2.3 Configure Environment Variables

In Cloudflare Pages dashboard, add environment variables:

**Production & Preview:**
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `GOOGLE_AI_API_KEY` - Your Gemini API key
- `NEXT_PUBLIC_BACKEND_URL` - Your backend URL (set after Part 3)

**Google OAuth (Optional):**
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

### 2.4 Bind D1 Database

In Cloudflare Pages:
1. Go to Settings → Functions
2. Add D1 database binding:
   - Variable name: `DB`
   - D1 database: `clash-flow-db`

## Part 3: Backend Deployment (Cloudflare Container)

### 3.1 Build Docker Image

```bash
cd backend
docker build -t master-clash-backend:latest .
```

### 3.2 Tag for Cloudflare Registry

```bash
# Replace {account-id} with your Cloudflare Account ID
docker tag master-clash-backend:latest \
  registry.cloudflare.com/{account-id}/master-clash-backend:latest
```

### 3.3 Login to Cloudflare Registry

```bash
# Get API token from Cloudflare dashboard
docker login registry.cloudflare.com \
  -u {account-id} \
  -p {api-token}
```

### 3.4 Push Image

```bash
docker push registry.cloudflare.com/{account-id}/master-clash-backend:latest
```

### 3.5 Deploy Container

In Cloudflare Dashboard:

1. Go to **Workers & Pages** → **Overview**
2. Click **Create** → **Create Worker**
3. Deploy from container:
   - Select your image from Container Registry
   - Set name: `master-clash-backend`
   - Configure port: `8000`

### 3.6 Configure Environment Variables

Add these in Worker settings:

```
GOOGLE_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key (optional)
KLING_ACCESS_KEY=your-kling-access-key
KLING_SECRET_KEY=your-kling-secret-key

# D1 Database
D1_DATABASE_URL=https://api.cloudflare.com/client/v4/accounts/{account-id}/d1/database/{database-id}
D1_ACCOUNT_ID=your-account-id
D1_DATABASE_ID=your-d1-database-id
D1_API_TOKEN=your-api-token

# LangSmith (Optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-key
LANGCHAIN_PROJECT=master-clash-production

# App Settings
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
```

### 3.7 Get Backend URL

After deployment, your backend will be available at:
```
https://master-clash-backend.{your-subdomain}.workers.dev
```

**Update frontend environment variable:**
- Go back to Cloudflare Pages
- Set `NEXT_PUBLIC_BACKEND_URL` to your backend URL
- Redeploy frontend

## Part 4: GitHub Actions (Automated Deployment)

### 4.1 Set GitHub Secrets

In your GitHub repository, go to Settings → Secrets and variables → Actions:

Add these secrets:

```
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
GOOGLE_AI_API_KEY=your-gemini-api-key
NEXT_PUBLIC_BACKEND_URL=https://master-clash-backend.your-subdomain.workers.dev
```

### 4.2 Enable Workflows

Workflows are already configured in `.github/workflows/`:

- **deploy.yml** - Deploys on push to main
- **test.yml** - Runs tests on all PRs

### 4.3 Trigger Deployment

```bash
git add .
git commit -m "Deploy to Cloudflare"
git push origin main
```

GitHub Actions will automatically:
1. Run tests
2. Build frontend and deploy to Cloudflare Pages
3. Build backend Docker image and push to registry
4. Run database migrations

## Part 5: Custom Domain (Optional)

### 5.1 Frontend Custom Domain

1. Go to Cloudflare Pages → Custom domains
2. Add your domain (e.g., `clash-flow.com`)
3. Follow DNS instructions
4. Update `AUTH_URL` environment variable

### 5.2 Backend Custom Domain

1. Go to Workers → Settings → Triggers
2. Add custom domain (e.g., `api.clash-flow.com`)
3. Update `NEXT_PUBLIC_BACKEND_URL` in frontend

## Verification

### Check Frontend

```bash
curl https://your-pages-url.pages.dev
```

### Check Backend

```bash
curl https://your-worker-url.workers.dev/health
```

### Check Database

```bash
wrangler d1 execute clash-flow-db --command="SELECT COUNT(*) FROM user"
```

## Troubleshooting

### Frontend Issues

**Build fails:**
```bash
# Clear cache and rebuild
cd frontend
rm -rf .next out node_modules
npm install
npm run pages:build
```

**D1 binding not working:**
- Check `wrangler.toml` has correct database_id
- Verify D1 binding in Cloudflare Pages settings
- Re-deploy

### Backend Issues

**Container fails to start:**
```bash
# Test locally
cd backend
docker build -t test .
docker run -p 8000:8000 --env-file .env test

# Check logs
docker logs <container-id>
```

**D1 connection fails:**
- Verify D1_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN
- Check API token has D1 permissions
- Test D1 API manually:
  ```bash
  curl -X POST \
    https://api.cloudflare.com/client/v4/accounts/{account-id}/d1/database/{database-id}/query \
    -H "Authorization: Bearer {api-token}" \
    -H "Content-Type: application/json" \
    -d '{"sql":"SELECT 1"}'
  ```

### GitHub Actions Issues

**Deployment fails:**
- Check GitHub secrets are set correctly
- Verify Cloudflare API token permissions
- Check workflow logs for specific errors

## Rollback

### Frontend Rollback

```bash
# Via Wrangler
wrangler pages deployment list --project-name=clash-flow
wrangler pages deployment rollback <deployment-id>
```

Or in Cloudflare Dashboard → Pages → Deployments → Rollback

### Backend Rollback

```bash
# Re-deploy previous image
docker tag registry.cloudflare.com/{account-id}/master-clash-backend:{previous-sha} \
  registry.cloudflare.com/{account-id}/master-clash-backend:latest

docker push registry.cloudflare.com/{account-id}/master-clash-backend:latest
```

## Monitoring

### Cloudflare Analytics

- Pages analytics: Dashboard → Pages → Analytics
- Worker analytics: Dashboard → Workers → Analytics

### Logs

**Frontend logs:**
```bash
wrangler pages deployment tail
```

**Backend logs:**
```bash
wrangler tail master-clash-backend
```

### Alerts

Set up alerts in Cloudflare Dashboard:
- Error rate threshold
- Response time threshold
- Request volume

## Cost Estimation

### Free Tier Limits

- **Pages**: 500 builds/month, unlimited requests
- **Workers**: 100,000 requests/day
- **D1**: 5 GB storage, 5M row reads/day, 100K row writes/day

### Paid Plans

- **Pages Pro**: $20/month
- **Workers Paid**: $5/month + usage
- **D1**: Pay as you go after free tier

## Next Steps

1. Set up monitoring and alerts
2. Configure custom domains
3. Enable analytics
4. Set up staging environment
5. Configure CDN caching
6. Implement rate limiting

## Support

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [GitHub Issues](https://github.com/yourusername/master-clash/issues)
