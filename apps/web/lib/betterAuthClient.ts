import { createAuthClient } from "better-auth/react"
import { cloudflareClient } from "better-auth-cloudflare/client"

// Use full URL to avoid "Invalid base URL" error
const getBaseURL = () => {
    if (typeof window !== 'undefined') {
        return `${window.location.origin}/api/better-auth`
    }
    // Fallback for SSR (shouldn't be used in practice with dynamic import)
    return process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/better-auth`
        : "http://localhost:3000/api/better-auth"
}

const betterAuthClient = createAuthClient({
    baseURL: getBaseURL(),
    plugins: [cloudflareClient()],
})

export default betterAuthClient
