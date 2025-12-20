import { initBetterAuth } from "@/better-auth"

export async function GET(req: Request) {
    const auth = await initBetterAuth()
    return auth.handler(req)
}

export async function POST(req: Request) {
    const auth = await initBetterAuth()
    return auth.handler(req)
}

export async function PUT(req: Request) {
    const auth = await initBetterAuth()
    return auth.handler(req)
}

export async function DELETE(req: Request) {
    const auth = await initBetterAuth()
    return auth.handler(req)
}

export async function PATCH(req: Request) {
    const auth = await initBetterAuth()
    return auth.handler(req)
}

// With OpenNextJS on Cloudflare Workers, "nodejs" routes still run on Workers (nodejs_compat),
// and avoids Edge bundler limitations for dependencies that import Node builtins (e.g. `node:module`).
export const runtime = "nodejs"
