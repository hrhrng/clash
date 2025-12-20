import type { D1Database, IncomingRequestCfProperties, KVNamespace } from "@cloudflare/workers-types"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { withCloudflare } from "better-auth-cloudflare"
import { drizzle } from "drizzle-orm/d1"
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3"

import * as betterAuthSchema from "./lib/db/better-auth.schema"

type CloudflareBindings = {
  DB: D1Database
  KV?: KVNamespace<string>
  BETTER_AUTH_URL?: string
  BETTER_AUTH_SECRET?: string
  AUTH_SECRET?: string
  AUTH_GOOGLE_ID?: string
  AUTH_GOOGLE_SECRET?: string
}

const basePath = "/api/better-auth"

async function authBuilder() {
  if (process.env.NODE_ENV === "development") {
    const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "dev-secret-change-me"
    const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

    const Database = (await import("better-sqlite3")).default
    const sqlite = new Database("local.db")
    const db = drizzleSqlite(sqlite, { schema: betterAuthSchema })

    const googleClientId = process.env.AUTH_GOOGLE_ID
    const googleClientSecret = process.env.AUTH_GOOGLE_SECRET

    return betterAuth({
      basePath,
      baseURL,
      trustedProxyHeaders: true,
      secret,
      emailAndPassword: { enabled: true },
      socialProviders:
        googleClientId && googleClientSecret
          ? {
              google: {
                enabled: true,
                clientId: googleClientId,
                clientSecret: googleClientSecret,
              },
            }
          : undefined,
      rateLimit: { enabled: false },
      database: drizzleAdapter(db as unknown as any, {
        provider: "sqlite",
        usePlural: true,
        debugLogs: true,
      }),
    })
  }

  let cf: IncomingRequestCfProperties | undefined
  let typedEnv: Partial<CloudflareBindings> = {}

  try {
    const context = await getCloudflareContext({ async: true })
    cf = context.cf as IncomingRequestCfProperties
    typedEnv = (context.env ?? {}) as Partial<CloudflareBindings>
  } catch {
    // `next dev` (Node.js) has no Cloudflare context; fall back to local sqlite.
  }

  const secretFromEnv =
    typedEnv.BETTER_AUTH_SECRET ?? typedEnv.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET

  const googleClientId = typedEnv.AUTH_GOOGLE_ID ?? process.env.AUTH_GOOGLE_ID
  const googleClientSecret = typedEnv.AUTH_GOOGLE_SECRET ?? process.env.AUTH_GOOGLE_SECRET

  const secret = secretFromEnv

  if (!secret) {
    throw new Error("Missing BETTER_AUTH_SECRET (or AUTH_SECRET)")
  }

  const baseURL =
    typedEnv.BETTER_AUTH_URL ??
    process.env.BETTER_AUTH_URL ??
    undefined

  if (typedEnv.DB && cf) {
    return betterAuth(
      withCloudflare(
        {
          autoDetectIpAddress: true,
          geolocationTracking: true,
          cf,
          d1: {
            db: drizzle(typedEnv.DB, { schema: betterAuthSchema }) as unknown as any,
            options: {
              usePlural: true,
              debugLogs: true,
            },
          },
          kv: typedEnv.KV,
        },
        {
          basePath,
          baseURL,
          trustedProxyHeaders: true,
          secret,
          emailAndPassword: { enabled: true },
          socialProviders:
            googleClientId && googleClientSecret
              ? {
                  google: {
                    enabled: true,
                    clientId: googleClientId,
                    clientSecret: googleClientSecret,
                  },
                }
              : undefined,
          rateLimit: typedEnv.KV
            ? {
                enabled: true,
                window: 60,
                max: 100,
                customRules: {
                  "/sign-in/email": { window: 60, max: 100 },
                  "/sign-in/social": { window: 60, max: 100 },
                },
              }
            : { enabled: false },
        }
      )
    )
  }

  throw new Error("Missing Cloudflare bindings (DB) for Better Auth")
}

let authInstance: Awaited<ReturnType<typeof authBuilder>> | null = null

export async function initBetterAuth() {
  if (!authInstance) {
    authInstance = await authBuilder()
  }
  return authInstance
}

// Used by `npx @better-auth/cli@latest generate --config apps/web/better-auth.ts --output apps/web/lib/db/better-auth.schema.ts`
export const auth = betterAuth({
  ...withCloudflare(
    {
      autoDetectIpAddress: true,
      geolocationTracking: true,
      cf: {} as IncomingRequestCfProperties,
    },
    {
      basePath,
      trustedProxyHeaders: true,
      emailAndPassword: { enabled: true },
    }
  ),
  database: drizzleAdapter({} as unknown as D1Database, {
    provider: "sqlite",
    usePlural: true,
    debugLogs: true,
  }),
})
