/**
 * Server settings, from environment variables or a settings file (server.json) in the data folder.
 * Environment variables win, so Docker and Windows Server can each use what suits them.
 *
 *   STM_DATA_DIR       data folder (photos, files, backups, settings file; and the SQLite database)
 *   STM_DATABASE_URL   postgres://user:password@host:5432/database  → use PostgreSQL instead of SQLite
 *   STM_DATABASE_SSL   "require" to insist on an encrypted database connection
 *   STM_FILES_DIR      where photos and files go (default: the data folder). Can be a network share.
 *   PORT / HOST        where the API listens (default 8417 on 127.0.0.1; HOST=0.0.0.0 for the network)
 *   STM_MIGRATIONS     migrations folder (set by the packaged app)
 */
import fs from "node:fs";
import path from "node:path";

export type Config = {
  dataDir: string; filesDir: string; databaseUrl: string | null; databaseSsl: boolean;
  port: number; host: string; migrationsDir: string; dialect: "sqlite" | "pg";
};

function defaultDataDir() {
  if (process.platform === "win32") return path.join(process.env.ProgramData || "C:\\ProgramData", "School Theatre Manager");
  return path.resolve("data");
}

function findMigrations(dialect: "sqlite" | "pg") {
  if (process.env.STM_MIGRATIONS) return path.join(process.env.STM_MIGRATIONS, dialect === "pg" ? "pg" : "sqlite");
  const here = typeof __dirname === "string" ? __dirname : process.cwd();
  for (const base of [path.join(here, "drizzle"), path.join(here, "../drizzle"), path.resolve("packages/core/drizzle"), path.resolve("../../packages/core/drizzle"), path.join(here, "../../../packages/core/drizzle")]) {
    const p = path.join(base, dialect === "pg" ? "pg" : "sqlite");
    if (fs.existsSync(path.join(p, "meta", "_journal.json"))) return p;
  }
  throw new Error("Can't find the database migrations folder. Set STM_MIGRATIONS.");
}

export function loadConfig(): Config {
  const dataDir = process.env.STM_DATA_DIR || defaultDataDir();
  let file: Record<string, unknown> = {};
  const f = path.join(dataDir, "server.json");
  if (fs.existsSync(f)) file = JSON.parse(fs.readFileSync(f, "utf8"));
  const pick = (env: string, key: string) => process.env[env] ?? (file[key] != null ? String(file[key]) : undefined);
  const databaseUrl = pick("STM_DATABASE_URL", "databaseUrl") || null;
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) throw new Error("STM_DATABASE_URL must start with postgres://");
  const dialect = databaseUrl ? "pg" : "sqlite";
  return {
    dataDir, filesDir: pick("STM_FILES_DIR", "filesDir") || dataDir, databaseUrl,
    databaseSsl: (pick("STM_DATABASE_SSL", "databaseSsl") ?? "") === "require" || pick("STM_DATABASE_SSL", "databaseSsl") === "true",
    port: Number(pick("PORT", "port")) || 8417, host: pick("HOST", "host") || "127.0.0.1",
    migrationsDir: findMigrations(dialect), dialect,
  };
}
