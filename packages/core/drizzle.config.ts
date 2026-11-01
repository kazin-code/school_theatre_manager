import { defineConfig } from "drizzle-kit";

// SQLite (offline) migrations. Run from the repo root: npm run db:generate
export default defineConfig({
  dialect: "sqlite",
  schema: "./packages/core/src/db/schema.ts",
  out: "./packages/core/drizzle/sqlite",
  dbCredentials: { url: process.env.STM_DB ?? "./apps/client/data/theatre.db" },
});
