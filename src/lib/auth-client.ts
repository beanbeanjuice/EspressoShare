import { createAuthClient } from "better-auth/react"
import {adminClient, twoFactorClient, usernameClient} from "better-auth/client/plugins"; // make sure to import from better-auth/react

export const authClient =  createAuthClient({
    plugins: [
        twoFactorClient(),
        usernameClient({ displayUsername: false }),
        adminClient()
    ]
});
