# Frontend - Clash Flow

Next.js application deployed to Cloudflare Pages.

## Features

- Project CRUD operations
- User authentication (NextAuth.js)
- Workflow visualization (React Flow)
- AI-powered chat interface
- Cloudflare D1 database integration

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Drizzle ORM (D1 adapter)
- NextAuth.js
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

# Or use Wrangler for full Cloudflare environment
wrangler pages dev
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
# Build for Cloudflare Pages
npm run pages:build

# Regular Next.js build
npm run build
```

## Deployment

### Using Wrangler CLI

```bash
# Deploy to Cloudflare Pages
wrangler pages deploy

# Or use the build command
npm run pages:build
wrangler pages publish out
```

### Using GitHub Integration

1. Connect your GitHub repository to Cloudflare Pages
2. Configure build settings:
   - Build command: `npm run pages:build`
   - Build output directory: `out`
   - Environment variables: Add from `.env.example`

### Environment Variables in Cloudflare

Add these in Cloudflare Pages dashboard:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
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

- `/api/auth/[...nextauth]` - NextAuth.js authentication
- `/api/ai/generate` - AI generation endpoint
- `/api/google-ai` - Google AI integration

## Database Schema

See [lib/db/schema.ts](lib/db/schema.ts) for the complete schema.

Main tables:
- `user` - User accounts
- `project` - Video projects
- `message` - Chat messages
- `session` - Auth sessions
- `account` - OAuth accounts

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run pages:build` - Build for Cloudflare Pages
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
import { getRequestContext } from '@cloudflare/next-on-pages';

// In Server Components or API Routes
const { env } = getRequestContext();
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
rm -rf .next out node_modules
npm install
npm run pages:build
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
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [NextAuth.js](https://next-auth.js.org/)
