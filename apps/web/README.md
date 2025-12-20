# Frontend - Clash Flow

Next.js application deployed to Cloudflare Workers using OpenNextJS.

## Features

- Project CRUD operations
- User authentication (Better Auth on Cloudflare Workers/D1)
- Workflow visualization (React Flow)
- AI-powered chat interface
- Cloudflare D1 database integration

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Drizzle ORM (D1 adapter)
- Better Auth + better-auth-cloudflare
- React Flow
- Framer Motion

## Development

### Prerequisites

- Node.js 20+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your values
```

### Local Development

```bash
# Run with local D1 database
npm run dev

# Or use OpenNextJS preview (Cloudflare Worker runtime)
npm run cf:preview
```

### Database Management

#### Create D1 Database

```bash
# Create the database
wrangler d1 create clash-flow-db

# Update wrangler.toml with the database_id from output
```

#### Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations locally
npm run db:migrate:local

# Apply migrations to production
npm run db:migrate:prod

# Open D1 console
wrangler d1 console clash-flow-db --local
```

#### Seed Database

```bash
npm run db:seed
```

### Build

```bash
# Build for Cloudflare Workers (OpenNextJS)
npm run cf:build

# Regular Next.js build
npm run build
```

## Deployment

### Using Wrangler CLI

```bash
# Deploy to Cloudflare Workers (OpenNextJS)
npm run cf:deploy
```

### Using GitHub Integration

Use Wrangler/OpenNextJS in CI to run `npm run cf:deploy`.

### Environment Variables in Cloudflare

Add these as Worker vars/secrets (Wrangler or Cloudflare dashboard):

- `AUTH_SECRET` (fallback secret)
- `BETTER_AUTH_SECRET` (recommended)
- `BETTER_AUTH_URL` (your Worker URL, e.g. `https://your-app.your-account.workers.dev`)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (optional, for Google OAuth)
- `GOOGLE_AI_API_KEY`
- `NEXT_PUBLIC_BACKEND_URL`

D1 database is automatically bound via `wrangler.toml`.

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (dashboard)/       # Dashboard pages
│   └── actions.ts         # Server actions
├── components/            # React components
├── lib/                   # Utilities
│   ├── db/               # Database (Drizzle)
│   └── ai-config.ts      # AI configuration
├── drizzle/              # Database migrations
├── public/               # Static assets
└── wrangler.toml         # Cloudflare configuration
```

## API Routes

- `/api/better-auth/[...all]` - Better Auth (better-auth-cloudflare) handler
- `/api/ai/generate` - AI generation endpoint
- `/api/google-ai` - Google AI integration

## Database Schema

See [lib/db/schema.ts](lib/db/schema.ts) for the complete schema.

Main tables:
- `users` - User accounts
- `project` - Video projects
- `message` - Chat messages
- `sessions` - Auth sessions
- `accounts` - OAuth accounts

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run cf:build` - Build for Cloudflare Workers (OpenNextJS)
- `npm run cf:deploy` - Build + deploy to Cloudflare Workers (OpenNextJS)
- `npm run lint` - Run ESLint
- `npm run format` - Format with Prettier
- `npm run db:generate` - Generate migrations
- `npm run db:migrate:local` - Run migrations locally
- `npm run db:migrate:prod` - Run migrations in production

## Cloudflare D1 Integration

This app uses Cloudflare D1 (serverless SQLite) as the database.

### Accessing D1 in Code

```typescript
import { drizzle } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// In Server Components or API Routes
const { env } = await getCloudflareContext({ async: true });
const db = drizzle(env.DB);
```

### Local vs Production

- **Local**: Uses SQLite file (`local.db`)
- **Production**: Uses Cloudflare D1

The Drizzle adapter automatically handles both environments.

## Troubleshooting

### Build Errors

If you encounter build errors:

```bash
# Clean build artifacts
rm -rf .next .open-next node_modules
npm install
npm run cf:build
```

### Database Issues

```bash
# Reset local database
rm -f local.db local.db-shm local.db-wal
wrangler d1 migrations apply clash-flow-db --local

# Check database contents
wrangler d1 execute clash-flow-db --command="SELECT * FROM project"
```

### Wrangler Issues

```bash
# Re-authenticate
wrangler login

# Check D1 databases
wrangler d1 list
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenNextJS on Cloudflare](https://opennext.js.org/cloudflare)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Better Auth](https://better-auth.com)
