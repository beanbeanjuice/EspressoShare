import "dotenv/config";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter: adapter });

async function main() {
    // Create roles if they don't exist
    // const roles = ["RESTRICTED", "USER", "ADMIN"];
    // for (const role of roles) {
    //     await prisma.role.upsert({
    //         where: { name: role },
    //         update: {}, // No update if the role exists
    //         create: { name: role }, // Create if the role doesn't exist
    //     });
    // }
    // console.log('Roles have been seeded!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
