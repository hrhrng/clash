"use client"

import betterAuthClient from "@/lib/betterAuthClient"

export function SignOut() {
    return (
        <button
            type="button"
            onClick={async () => {
                await betterAuthClient.signOut()
            }}
        >
            Sign Out
        </button>
    )
}

