import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { dataDir, dbFile, migrationsDir } from "@/server/paths";
import { seedLookups } from "./seed";
import { mkdirp } from "@/server/fsx";

export type DB = BetterSQLite3Database<typeof schema>;
type Conn = { sqlite: Database.Database; db: DB };
const g = globalThis as unknown as { __stm?: Conn };

function open(): Conn {
  mkdirp(dataDir());
  const sqlite = new Database(dbFile());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir() });
  seedLookups(db);
  return { sqlite, db };
}

/** The app's database (opened, migrated and seeded on first use). */
export function db(): DB {
  if (!g.__stm) g.__stm = open();
  return g.__stm.db;
}
export function sqlite(): Database.Database {
  db();
  return g.__stm!.sqlite;
}
/** Close the connection (used before restoring a backup file over it). */
export function closeDb() {
  if (g.__stm) { g.__stm.sqlite.close(); g.__stm = undefined; }
}
export { schema };
