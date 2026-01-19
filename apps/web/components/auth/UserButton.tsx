"use client"

/* eslint-disable @next/next/no-img-element */

import betterAuthClient from "@/lib/betterAuthClient"
import { SignIn } from "./SignIn"
import { SignOut } from "./SignOut"

export default function UserButton() {
    const sessionQuery = betterAuthClient.useSession()
    const session = sessionQuery.data

    if (!session?.user) return <SignIn />

    return (
        <div className="flex items-center gap-2">
            {session.user.image && (
                <img src={session.user.image} alt="User Avatar" className="w-8 h-8 rounded-full" />
            )}
            <span className="text-sm font-medium">{session.user.name}</span>
            <SignOut />
        </div>
    )
}
