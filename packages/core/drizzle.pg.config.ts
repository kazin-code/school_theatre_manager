import { defineConfig } from "drizzle-kit";

// PostgreSQL (school intranet server) migrations. Run from the repo root: npm run db:generate
export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/core/src/db/schema.pg.ts",
  out: "./packages/core/drizzle/pg",
});
