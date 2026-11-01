/**
 * The database: SQLite (offline, one file) or PostgreSQL (a school's database server).
 *
 * Both use the same tables (@stm/core/db/schema and its generated PostgreSQL twin), so services are
 * written once against `t` (the tables) and `db()`. Queries are awaited (both drivers support it);
 * use `one()` for a single row. The few SQL differences are wrapped in the helpers at the bottom.
 * On SQLite there is one connection, so writes are queued one at a time (see `write`).
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import * as sqliteSchema from "@stm/core/db/schema";
import * as pgSchema from "@stm/core/db/schema.pg";
import { DEFAULT_LISTS } from "@stm/core/db/seed";
import type { Config } from "./config";

/** Typed as the SQLite flavour; at run time it may be PostgreSQL. Write portable queries. */
export type DB = BetterSQLite3Database<typeof sqliteSchema>;
/** The tables (filled in by openDatabase for the chosen database). */
export const t = {} as typeof sqliteSchema;

type State = { dialect: "sqlite" | "pg"; db: DB; sqlite?: Database.Database; pg?: postgres.Sql };
let state: State | null = null;
export const dialect = () => state!.dialect;
export function db(): DB {
  if (!state) throw new Error("The database isn't open yet.");
  return state.db;
}
export const sqliteConnection = () => state?.sqlite ?? null;

export async function openDatabase(cfg: Config) {
  if (state) return;
  if (cfg.dialect === "pg") {
    const client = postgres(cfg.databaseUrl!, { max: 10, ssl: cfg.databaseSsl ? "require" : undefined, onnotice: () => {} });
    const d = drizzlePg(client, { schema: pgSchema });
    await migratePg(d, { migrationsFolder: cfg.migrationsDir });
    Object.assign(t, pgSchema);
    state = { dialect: "pg", db: d as unknown as DB, pg: client };
  } else {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    const conn = new Database(path.join(cfg.dataDir, "theatre.db"));
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.pragma("busy_timeout = 5000");
    const d = drizzleSqlite(conn, { schema: sqliteSchema });
    migrateSqlite(d, { migrationsFolder: cfg.migrationsDir });
    Object.assign(t, sqliteSchema);
    state = { dialect: "sqlite", db: d, sqlite: conn };
  }
  await seedLists();
}

export async function closeDatabase() {
  if (!state) return;
  if (state.sqlite) state.sqlite.close();
  if (state.pg) await state.pg.end({ timeout: 5 });
  state = null;
}

/** Fill any dropdown list that has never been set up. Safe on every start. */
async function seedLists() {
  const have = new Set((await db().selectDistinct({ list: t.lookups.list }).from(t.lookups)).map((r) => r.list));
  const rows = Object.entries(DEFAULT_LISTS).filter(([k]) => !have.has(k)).flatMap(([list, vals]) => vals.map((value, sort) => ({ list, value, sort })));
  if (rows.length) await db().insert(t.lookups).values(rows).onConflictDoNothing();
}

// ---------- writes and transactions ----------
let queue: Promise<unknown> = Promise.resolve();
/** Run a change. On SQLite changes run one at a time (a single connection); PostgreSQL handles its own. */
export function write<T>(fn: () => Promise<T>): Promise<T> {
  if (state?.dialect !== "sqlite") return fn();
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
/** All-or-nothing changes. Call inside write(). */
export async function tx<T>(fn: (d: DB) => Promise<T>): Promise<T> {
  if (state!.dialect === "pg") return (state!.db as unknown as { transaction: (f: (d: DB) => Promise<T>) => Promise<T> }).transaction(fn);
  const c = state!.sqlite!;
  c.exec("BEGIN IMMEDIATE");
  try { const r = await fn(state!.db); c.exec("COMMIT"); return r; } catch (e) { if (c.inTransaction) c.exec("ROLLBACK"); throw e; }
}

// ---------- portable helpers ----------
/** The first row of a query, or undefined. */
export async function one<T>(q: PromiseLike<T[]>): Promise<T | undefined> { return (await q)[0]; }
/** Run raw SQL and return its rows. */
export async function rows<T>(q: SQL): Promise<T[]> {
  if (state!.dialect === "pg") return (await (state!.db as unknown as { execute: (q: SQL) => Promise<T[]> }).execute(q)) as T[];
  return state!.db.all<T>(q);
}
/** A whole number from COUNT/SUM (PostgreSQL returns those as big numbers in text). */
export const int = (e: SQL | SQLWrapper) => sql<number>`cast(${e} as integer)`.mapWith(Number);
/** A decimal rounded to `places`, as a number. */
export const round = (e: SQL | SQLWrapper, places: number) => sql<number | null>`cast(round(cast(${e} as numeric), ${sql.raw(String(places))}) as real)`.mapWith((v) => (v == null ? null : Number(v)));
/** Join values from several rows into one string. */
export function listOf(e: SQL | SQLWrapper, sep: string, distinct = false) {
  if (state!.dialect === "pg") return distinct ? sql<string | null>`string_agg(distinct cast(${e} as text), ${sep})` : sql<string | null>`string_agg(cast(${e} as text), ${sep})`;
  return distinct ? sql<string | null>`group_concat(distinct ${e})` : sql<string | null>`group_concat(${e}, ${sep})`;
}
/** For alphabetical order that ignores capitals. */
export const nocase = (e: SQL | SQLWrapper) => sql`lower(${e})`;
/** A column name qualified by its table, for correlated subqueries. */
export const col = (table: string, column: string) => sql.raw(`"${table}"."${column}"`);
export const nowIso = () => new Date().toISOString();
export const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
