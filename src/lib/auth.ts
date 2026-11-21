import {APIError, betterAuth} from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@prisma";
import {nextCookies} from "better-auth/next-js";
import {admin, twoFactor, username} from "better-auth/plugins";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "sqlite", ...etc
    }),
    emailAndPassword: {
        enabled: true
    },
    advanced: {
        ipAddress: {
            ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
        },
    },
    plugins: [
        twoFactor(),
        admin({
            defaultRole: "user",
            adminRoles: ["admin"],
        }),
        username({
            displayUsername: false
        }),
        nextCookies() // Must be last
    ],
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    const existing = await prisma.user.count();
                    if (existing > 0) {
                        throw new APIError("FORBIDDEN", { message: "Sign-ups are closed." });
                    }
                    return { data: user };
                },
            },
        },
    },
});
