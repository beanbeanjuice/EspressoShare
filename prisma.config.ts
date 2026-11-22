import 'dotenv/config';
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/database.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: 'node prisma/seed.js' // for dev, use npm run prisma:seed
  },
  datasource: {
    url: env('DATABASE_URL'),
  }
});
