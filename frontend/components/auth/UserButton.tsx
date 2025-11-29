import { auth } from "@/auth"
import { SignIn } from "./SignIn"
import { SignOut } from "./SignOut"

export default async function UserButton() {
    const session = await auth()

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
