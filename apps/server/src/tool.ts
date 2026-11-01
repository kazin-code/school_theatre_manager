/**
 * School Theatre Manager setup tool, run by the Windows installer and the Start-menu
 * "Reset Director Password" shortcut with the bundled node.exe. It uses the server's own database
 * code, so it creates exactly the database the server expects, on SQLite or PostgreSQL.
 *
 *   node stm-tool.cjs init --data <dir>             create/upgrade the database; branding and the
 *                                                     director account come from STM_* variables
 *   node stm-tool.cjs reset-password --data <dir>   give a director a temporary password
 *   node stm-tool.cjs network on|off --data <dir>   let other computers on the network connect
 *   node stm-tool.cjs server <address>|off --data <dir>   connect this computer to the school's server
 *
 * School server package (Windows Server):
 *   node stm-tool.cjs check-db                      test the PostgreSQL settings (STM_DB_* variables)
 *   node stm-tool.cjs configure --data <dir>        test them, save server.json, create the tables,
 *                                                     and the first director (STM_ADMIN_*) if given
 *   STM_DB_HOST, STM_DB_PORT (5432), STM_DB_NAME, STM_DB_USER, STM_DB_PASSWORD, STM_DB_SSL (require),
 *   or STM_DATABASE_URL; STM_PORT (8417), STM_FILES_DIR (default: the data folder)
 */
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { APP_ID, DEFAULT_PORT } from "@stm/core/version";
import { hashPassword } from "@stm/core/auth/hash";
import { passwordProblem, USERNAME_RE } from "@stm/core/auth/password";
import type { Branding } from "@stm/core/db/validation";
import { loadConfig } from "./config";
import { closeDatabase, db, dialect, one, openDatabase, t } from "./db";
import { setRoots } from "./files";
import { readSetting, writeBrandingIni, writeSetting } from "./services/settings";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const data = opt("--data");
if (!data && cmd !== "check-db") { console.error("Missing --data <folder>"); process.exit(2); }
if (data) process.env.STM_DATA_DIR = data;
// packaged: the migrations sit beside the tools folder
if (!process.env.STM_MIGRATIONS && fs.existsSync(path.join(__dirname, "..", "drizzle", "sqlite"))) process.env.STM_MIGRATIONS = path.join(__dirname, "..", "drizzle");

const configFile = path.join(data ?? ".", "config.json");
type NetConfig = { port: number; network: boolean } & Record<string, unknown>;
function readConfig(): NetConfig {
  try { return { port: 8417, network: false, ...JSON.parse(fs.readFileSync(configFile, "utf8")) }; } catch { return { port: 8417, network: false }; }
}
const writeConfig = (c: NetConfig) => { fs.mkdirSync(data!, { recursive: true }); fs.writeFileSync(configFile, JSON.stringify(c, null, 2)); };

async function open() {
  const cfg = loadConfig();
  setRoots(cfg.dataDir, cfg.filesDir);
  await openDatabase(cfg); // creates the database, applies migrations, fills the default dropdown lists
  return cfg;
}

// ---------- the school server's database ----------
function dbSettings() {
  const e = process.env;
  if (e.STM_DATABASE_URL) return { url: e.STM_DATABASE_URL, ssl: e.STM_DATABASE_SSL === "require", label: e.STM_DATABASE_URL.replace(/\/\/[^@]*@/, "//…@") };
  const host = e.STM_DB_HOST?.trim(), name = e.STM_DB_NAME?.trim(), user = e.STM_DB_USER?.trim();
  if (!host || !name || !user) throw new Error("Fill in the database server, database name and username.");
  const port = Number(e.STM_DB_PORT) || 5432;
  if (port < 1 || port > 65535) throw new Error("The database port must be a number such as 5432.");
  const enc = encodeURIComponent;
  return { url: `postgres://${enc(user)}:${enc(e.STM_DB_PASSWORD ?? "")}@${host.includes(":") ? `[${host}]` : host}:${port}/${enc(name)}`, ssl: e.STM_DB_SSL === "require" || e.STM_DB_SSL === "1", label: `${user}@${host}:${port}/${name}` };
}

/** Plain words for what went wrong connecting to PostgreSQL. */
function dbProblem(err: unknown, label: string): string {
  const e = err as { code?: string; message?: string };
  const m = e?.message ?? String(err);
  switch (e?.code) {
    case "ECONNREFUSED": return `Nothing answered at ${label}. Check the server name and port, and that PostgreSQL is running and listens on the network (listen_addresses in postgresql.conf).`;
    case "ENOTFOUND": case "EAI_AGAIN": return `The database server name in ${label} wasn't found on the network. Check the spelling, or use its IP address.`;
    case "ETIMEDOUT": case "CONNECT_TIMEOUT": return `The database server at ${label} didn't answer in time. A firewall may be blocking port 5432 from this computer.`;
    case "28P01": return "The database didn't accept that username and password.";
    case "28000": return `PostgreSQL refused this computer (${m}). Add a line for this server's address to pg_hba.conf, then reload PostgreSQL.`;
    case "3D000": return `There's no database with that name on the server. Create it first: CREATE DATABASE … OWNER …; (see the setup guide).`;
    case "42501": return `The account can sign in but isn't allowed to create tables in that database (${m}). Make it the database's owner.`;
  }
  if (/ssl|tls|certificate/i.test(m)) return `The encrypted connection failed (${m}). Untick "Require an encrypted connection" if the database server doesn't use TLS.`;
  return `Couldn't connect to the database: ${m}`;
}

async function checkDb(): Promise<{ url: string; ssl: boolean; label: string }> {
  const d = dbSettings();
  const sql = postgres(d.url, { ssl: d.ssl ? "require" : undefined, connect_timeout: 10, max: 1, onnotice: () => {} });
  try {
    const [r] = await sql`select version() as v, has_database_privilege(current_user, current_database(), 'CREATE') as can_create,
      has_schema_privilege(current_user, 'public', 'CREATE') as can_tables`;
    if (!r.can_tables) { const e = Object.assign(new Error("no CREATE on schema public"), { code: "42501" }); throw e; }
    console.log(`Connected to ${d.label}: ${String(r.v).split(",")[0]}.`);
    return d;
  } catch (e) {
    throw new Error(dbProblem(e, d.label));
  } finally { await sql.end({ timeout: 2 }).catch(() => {}); }
}

async function main() {
  if (cmd === "network") {
    const c = readConfig(); c.network = args[1] === "on"; writeConfig(c);
    console.log(c.network ? "Other computers on the network can now connect." : "Only this computer can connect.");
    return 0;
  }

  if (cmd === "check-db") {
    await checkDb();
    return 0;
  }

  if (cmd === "configure") {
    const d = await checkDb();
    const f = path.join(data!, "server.json");
    let old: Record<string, unknown> = {};
    try { old = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
    const port = Number(process.env.STM_PORT) || Number(old.port) || DEFAULT_PORT;
    const files = process.env.STM_FILES_DIR?.trim() || (typeof old.filesDir === "string" ? old.filesDir : undefined);
    const next = { ...old, app: APP_ID, databaseUrl: d.url, databaseSsl: d.ssl ? "require" : "", host: "0.0.0.0", port, ...(files ? { filesDir: files } : {}) };
    fs.mkdirSync(data!, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(next, null, 2));
    console.log(`Saved the server settings in ${f}.`);
    process.env.STM_DATABASE_URL = d.url;
    process.env.STM_DATABASE_SSL = d.ssl ? "require" : "";
    if (files) { process.env.STM_FILES_DIR = files; fs.mkdirSync(files, { recursive: true }); }
    // then the same as init: the tables, and the first director if one was given
  }

  if (cmd === "server") {
    const c = readConfig();
    const to = args[1];
    if (!to || to === "off") { delete c.server; delete c.serverName; writeConfig(c); console.log("This computer keeps its records itself (offline)."); return 0; }
    let url = /^https?:\/\//i.test(to) ? to : `http://${to}`;
    try { const u = new URL(url); if (!u.port && u.protocol === "http:") u.port = String(DEFAULT_PORT); url = `${u.protocol}//${u.host}`; } catch { console.error(`"${to}" isn't a server address.`); return 2; }
    let name: string | null = null;
    try { const r = await fetch(`${url}/api/v1/server-info`, { signal: AbortSignal.timeout(4000) }); const j = await r.json() as { app?: string; name?: string }; if (j.app === APP_ID) name = j.name ?? null; } catch {}
    c.server = url; c.serverName = name; writeConfig(c);
    console.log(name ? `Connected to ${name} (${url}).` : `Will use the school's server at ${url} (it didn't answer just now; the app tries again when it opens).`);
    return 0;
  }

  if (cmd === "init" || cmd === "configure") {
    const cfg = await open();
    if (cmd === "init" && !fs.existsSync(configFile)) writeConfig(readConfig());
    let code = 0;
    const school = process.env.STM_SCHOOL?.trim();
    if (school) {
      const old = await readSetting<Partial<Branding>>("branding", {});
      const b: Branding = { school, program: process.env.STM_PROGRAM?.trim() || null, short: process.env.STM_SHORT?.trim() || null, tagline: process.env.STM_TAGLINE?.trim() || null, accent: old.accent ?? null };
      await writeSetting("branding", b);
      writeBrandingIni(b);
      console.log(`Saved school details for ${school}.`);
    }
    const user = process.env.STM_ADMIN_USER?.trim().toLowerCase();
    if (user) {
      const pass = process.env.STM_ADMIN_PASS ?? "";
      if (await one(db().select({ id: t.users.id }).from(t.users).limit(1))) console.log("Accounts already exist; the director account was not changed.");
      else if (!USERNAME_RE.test(user) || passwordProblem(pass)) { console.error("The director account could not be created (username or password not allowed)."); code = 3; }
      else {
        // on a school server IT types a temporary password: the director chooses their own at first sign-in
        await db().insert(t.users).values({ username: user, displayName: process.env.STM_ADMIN_NAME?.trim() || user, role: "director", passwordHash: hashPassword(pass), mustChangePassword: cmd === "configure" });
        console.log(`Created the director account "${user}"${cmd === "configure" ? " (they choose a new password when they first sign in)" : ""}.`);
      }
    }
    console.log(dialect() === "pg" ? "Database ready (PostgreSQL)." : `Database ready: ${path.join(cfg.dataDir, "theatre.db")}`);
    return code;
  }

  if (cmd === "reset-password") {
    await open();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const done = async (msg: string, code = 0) => { console.log(`\n${msg}\n`); if (process.stdin.isTTY) await rl.question("Press Enter to close."); rl.close(); return code; };
    console.log("School Theatre Manager: reset a password\n");
    const all = await db().select().from(t.users);
    if (!all.length) return done("There are no accounts yet. Open the program and it will ask you to create the director account.");
    const directors = all.filter((u) => u.role === "director");
    const list = directors.length ? directors : all;
    list.forEach((u, i) => console.log(`  ${i + 1}. ${u.displayName} (${u.username})${u.active ? "" : " (turned off)"}`));
    let pick = list[0];
    if (list.length > 1) {
      const a = (await rl.question(`\nWhich account? Type its number (1-${list.length}): `)).trim();
      pick = list[Number(a) - 1] ?? list.find((u) => u.username === a.toLowerCase())!;
      if (!pick) return done("No account was changed.", 1);
    }
    const word = ["Curtain", "Encore", "Stage", "Spotlight", "Bravo", "Overture"][crypto.randomInt(6)];
    const temp = `${word}-${crypto.randomInt(1000, 9999)}!${crypto.randomBytes(2).toString("hex")}`;
    await db().update(t.users).set({ passwordHash: hashPassword(temp), mustChangePassword: true, active: true }).where(eq(t.users.id, pick.id));
    await db().delete(t.sessions).where(eq(t.sessions.userId, pick.id));
    return done(`The temporary password for ${pick.displayName} (username: ${pick.username}) is:\n\n      ${temp}\n\nSign in with it; you'll be asked to choose a new password right away.`);
  }

  console.error(`Unknown command: ${cmd}`);
  return 2;
}

main().then(async (code) => { await closeDatabase(); process.exit(code); })
  .catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDatabase().catch(() => {}); process.exit(1); });
