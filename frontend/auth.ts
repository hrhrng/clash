import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { getDb } from "@/lib/db/drizzle"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
    const db = getDb(getRequestContext().env.DB)
    return {
        adapter: DrizzleAdapter(db),
        session: { strategy: "jwt" },
        ...authConfig,
    }
})
