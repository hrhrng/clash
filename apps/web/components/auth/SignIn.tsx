"use client"

import betterAuthClient from "@/lib/betterAuthClient"

export function SignIn() {
    return (
        <button
            type="button"
            onClick={async () => {
                await betterAuthClient.signIn.social({
                    provider: "google",
                    callbackURL: "/",
                })
            }}
        >
            Sign in with Google
        </button>
    )
}

