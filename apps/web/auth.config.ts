import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

export const authConfig = {
    providers: [Google],
    // Add other config options here (pages, callbacks, etc.)
} satisfies NextAuthConfig
