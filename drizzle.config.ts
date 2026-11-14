import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations run as the schema owner, never as the runtime app role.
    url: process.env.DATABASE_ADMIN_URL ?? "postgres://crewlane:crewlane@localhost:5433/crewlane",
  },
  strict: true,
});
