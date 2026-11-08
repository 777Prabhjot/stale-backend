import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct connection. On Neon, DATABASE_URL is the pooled one (for the app)
    // and DIRECT_URL the direct one; locally they're the same, so DIRECT_URL is optional.
    // Not required for `prisma generate` (runs on every install, including Vercel builds).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
