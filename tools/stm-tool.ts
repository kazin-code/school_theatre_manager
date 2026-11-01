/**
 * School Theatre Manager setup tool, run by the Windows installer and the Start-menu
 * "Reset Director Password" shortcut with the bundled node.exe. Built with esbuild from the
 * app's own modules, so it creates exactly the database the app expects.
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

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const data = opt("--data");
if (!data) { console.error("Missing --data <folder>"); process.exit(2); }
process.env.STM_DATA_DIR = data;
process.env.STM_MIGRATIONS ??= path.join(__dirname, "..", "drizzle");

const configFile = path.join(data, "config.json");
function readConfig(): { port: number; network: boolean } {
  try { return { port: 8417, network: false, ...JSON.parse(fs.readFileSync(configFile, "utf8")) }; } catch { return { port: 8417, network: false }; }
}
const writeConfig = (c: { port: number; network: boolean }) => fs.writeFileSync(configFile, JSON.stringify(c, null, 2));

async function main() {
  const { db, closeDb } = await import("../src/db");
  const { settings, users, sessions } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { hashPassword } = await import("../src/server/hash");
  const { passwordProblem, USERNAME_RE } = await import("../src/lib/password");
  const { writeBrandingIni } = await import("../src/server/branding-ini");
  const setSetting = (key: string, value: unknown) => db().insert(settings).values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } }).run();

  if (cmd === "init") {
    db(); // creates the folder and database, applies migrations, fills the default dropdown lists
    if (!fs.existsSync(configFile)) writeConfig(readConfig());
    let code = 0;
    const school = process.env.STM_SCHOOL?.trim();
    if (school) {
      const old = (db().select().from(settings).where(eq(settings.key, "branding")).get()?.value ?? {}) as Record<string, string | null>;
      const b = { school, program: process.env.STM_PROGRAM?.trim() || null, short: process.env.STM_SHORT?.trim() || null, tagline: process.env.STM_TAGLINE?.trim() || null, accent: old.accent ?? null };
      setSetting("branding", b);
      writeBrandingIni(b);
      console.log(`Saved school details for ${school}.`);
    }
    const user = process.env.STM_ADMIN_USER?.trim().toLowerCase();
    if (user) {
      const pass = process.env.STM_ADMIN_PASS ?? "";
      const any = db().select({ id: users.id }).from(users).limit(1).get();
      if (any) console.log("Accounts already exist; the director account was not changed.");
      else if (!USERNAME_RE.test(user) || passwordProblem(pass)) { console.error("The director account could not be created (username or password not allowed)."); code = 3; }
      else {
        db().insert(users).values({ username: user, displayName: process.env.STM_ADMIN_NAME?.trim() || user, role: "director", passwordHash: hashPassword(pass) }).run();
        console.log(`Created the director account "${user}".`);
      }
    }
    closeDb();
    console.log(`Database ready: ${path.join(data!, "theatre.db")}`);
    process.exit(code);
  }

  if (cmd === "network") {
    const c = readConfig(); c.network = args[1] === "on"; writeConfig(c);
    console.log(c.network ? "Other computers on the network can now connect." : "Only this computer can connect.");
    process.exit(0);
  }

  if (cmd === "reset-password") {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const done = async (msg: string, code = 0) => { console.log(`\n${msg}\n`); await rl.question("Press Enter to close."); rl.close(); closeDb(); process.exit(code); };
    console.log("School Theatre Manager: reset a password\n");
    const all = db().select().from(users).all();
    if (!all.length) await done("There are no accounts yet. Open the program and it will ask you to create the director account.");
    const directors = all.filter((u) => u.role === "director");
    const list = directors.length ? directors : all;
    list.forEach((u, i) => console.log(`  ${i + 1}. ${u.displayName} (${u.username})${u.active ? "" : " (turned off)"}`));
    let pick = list[0];
    if (list.length > 1) {
      const a = (await rl.question(`\nWhich account? Type its number (1-${list.length}): `)).trim();
      pick = list[Number(a) - 1] ?? list.find((u) => u.username === a.toLowerCase())!;
      if (!pick) await done("No account was changed.", 1);
    }
    const word = ["Curtain", "Encore", "Stage", "Spotlight", "Bravo", "Overture"][crypto.randomInt(6)];
    const temp = `${word}-${crypto.randomInt(1000, 9999)}!${crypto.randomBytes(2).toString("hex")}`;
    db().update(users).set({ passwordHash: hashPassword(temp), mustChangePassword: true, active: true }).where(eq(users.id, pick.id)).run();
    db().delete(sessions).where(eq(sessions.userId, pick.id)).run();
    await done(`The temporary password for ${pick.displayName} (username: ${pick.username}) is:\n\n      ${temp}\n\nSign in with it; you'll be asked to choose a new password right away.`);
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
