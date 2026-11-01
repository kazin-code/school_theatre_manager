/**
 * School Theatre Manager setup tool, run by the Windows installer and the Start-menu
 * "Reset Director Password" shortcut with the bundled node.exe. It uses the server's own database
 * code, so it creates exactly the database the server expects, on SQLite or PostgreSQL.
 *
 *   node stm-tool.cjs init --data <dir>             create/upgrade the database; branding and the
 *                                                     director account come from STM_* variables
 *   node stm-tool.cjs reset-password --data <dir>   give a director a temporary password
 *   node stm-tool.cjs network on|off --data <dir>   let other computers on the network connect
 */
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
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
if (!data) { console.error("Missing --data <folder>"); process.exit(2); }
process.env.STM_DATA_DIR = data;
// packaged: the migrations sit beside the tools folder
if (!process.env.STM_MIGRATIONS && fs.existsSync(path.join(__dirname, "..", "drizzle", "sqlite"))) process.env.STM_MIGRATIONS = path.join(__dirname, "..", "drizzle");

const configFile = path.join(data, "config.json");
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

async function main() {
  if (cmd === "network") {
    const c = readConfig(); c.network = args[1] === "on"; writeConfig(c);
    console.log(c.network ? "Other computers on the network can now connect." : "Only this computer can connect.");
    return 0;
  }

  if (cmd === "init") {
    const cfg = await open();
    if (!fs.existsSync(configFile)) writeConfig(readConfig());
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
        await db().insert(t.users).values({ username: user, displayName: process.env.STM_ADMIN_NAME?.trim() || user, role: "director", passwordHash: hashPassword(pass) });
        console.log(`Created the director account "${user}".`);
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
