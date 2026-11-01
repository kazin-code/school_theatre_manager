/**
 * Backups and restore.
 *  - Daily copy and safety copies of the database (SQLite only; on PostgreSQL the school's IT backs up
 *    the database server).
 *  - Full backup zip: data.json (every record, portable between SQLite and PostgreSQL), the photos and
 *    files, and on SQLite the database file itself.
 *  - Restore from a zip: a SQLite file is swapped in directly on SQLite; otherwise the records are
 *    loaded table by table. This also moves an offline computer's data onto the school server.
 *  - Cloud folder (SQLite only): copies to a OneDrive / Google Drive folder after changes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { getTableName } from "drizzle-orm";
import * as sqliteSchema from "@stm/core/db/schema";
import { closeDatabase, db, dialect, openDatabase, rows, sqliteConnection, t, tx, write } from "../db";
import { bad } from "../errors";
import { dataDir, dir, FILE_DIRS } from "../files";
import { readZip, ZipWriter } from "../zip";
import { readSetting, writeSetting, PRODUCT } from "./settings";
import type { Config } from "../config";

let config: Config;
export const setBackupConfig = (c: Config) => { config = c; };
const localDate = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const bdir = () => dir("backups");

type BackupState = { cloudFolder: string | null; lastCloud: string | null; lastCloudError: string | null; lastLocal: string | null };
export const backupState = () => readSetting<BackupState>("backup", { cloudFolder: null, lastCloud: null, lastCloudError: null, lastLocal: null });
const setState = async (p: Partial<BackupState>) => writeSetting("backup", { ...(await backupState()), ...p });

/** Tables in an order that respects their links (parents before children). Sessions are never copied. */
const TABLES = ["users", "settings", "lookups", "activity", "items", "itemPhotos", "conditionLog", "renters", "rentals", "rentalItems", "shows", "showPeople", "showNumbers", "showFiles", "showItems", "programs", "sponsors"] as const;

function snapshotSqlite(to: string) {
  if (fs.existsSync(to)) fs.rmSync(to);
  sqliteConnection()!.prepare("VACUUM INTO ?").run(to);
}

/** A copy of the database before something hard to undo. Keeps the newest 20. Returns its name (SQLite) or null. */
export async function safetySnapshot(reason: string): Promise<string | null> {
  if (dialect() !== "sqlite") return null;
  const name = `before-${reason.replace(/[^a-z0-9-]/gi, "-").slice(0, 40)}-${stamp()}.db`;
  snapshotSqlite(path.join(bdir(), name));
  const old = fs.readdirSync(bdir()).filter((f) => f.startsWith("before-") && f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(bdir(), f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(20);
  for (const o of old) fs.rmSync(path.join(bdir(), o.f));
  return name;
}

/** One automatic copy per day (SQLite); keeps the last 30. */
export async function dailyBackup(force = false) {
  if (dialect() !== "sqlite") return null;
  const name = `daily-${localDate()}.db`, to = path.join(bdir(), name);
  if (!force && fs.existsSync(to)) return null;
  snapshotSqlite(to);
  const daily = fs.readdirSync(bdir()).filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of daily.slice(0, Math.max(0, daily.length - 30))) fs.rmSync(path.join(bdir(), f));
  await setState({ lastLocal: new Date().toISOString() });
  return name;
}

export function listBackups() {
  return fs.readdirSync(bdir()).filter((f) => /\.(db|zip)$/.test(f)).map((f) => { const s = fs.statSync(path.join(bdir(), f)); return { name: f, size: s.size, at: s.mtime.toISOString() }; })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Every record, as plain JSON (works for either database). */
export async function exportData() {
  const out: Record<string, unknown[]> = {};
  for (const k of TABLES) out[k] = await db().select().from(t[k]);
  return { app: "school-theatre-manager", format: 1, exportedAt: new Date().toISOString(), tables: out };
}

/** Everything in one zip. */
export function makeFullBackup() {
  return write(async () => {
    const name = `full-backup-${stamp()}.zip`, final = path.join(bdir(), name), tmp = final + ".partial";
    const snap = path.join(os.tmpdir(), `stm-snap-${Date.now()}.db`);
    try {
      const z = new ZipWriter(tmp);
      z.add("data.json", Buffer.from(JSON.stringify(await exportData())));
      if (dialect() === "sqlite") { snapshotSqlite(snap); z.add("theatre.db", fs.readFileSync(snap)); }
      for (const sub of FILE_DIRS) for (const f of fs.readdirSync(dir(sub))) { const p = path.join(dir(sub), f); const s = fs.statSync(p); if (s.isFile()) z.add(`${sub}/${f}`, fs.readFileSync(p), s.mtime); }
      z.add("README.txt", Buffer.from(`Backup from ${PRODUCT}, ${new Date().toLocaleString("en-US")}.\r\n\r\nTo restore: sign in as a director, open Settings > Backups & data, and choose Restore from a backup file.\r\nThis backup can also be restored on the school's server to move this data there.\r\n`));
      z.close();
      fs.renameSync(tmp, final);
    } finally { for (const f of [snap, tmp]) if (fs.existsSync(f)) fs.rmSync(f); }
    const fulls = fs.readdirSync(bdir()).filter((f) => f.startsWith("full-backup-") && f.endsWith(".zip")).sort();
    for (const f of fulls.slice(0, Math.max(0, fulls.length - 5))) fs.rmSync(path.join(bdir(), f));
    return { name };
  });
}

/** Read every record from a SQLite database file (an older backup, or another computer's database). */
function readSqliteFile(file: string): Record<string, unknown[]> {
  const conn = new Database(file, { readonly: true });
  try {
    const names = new Set((conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name));
    for (const need of ["users", "items", "shows"]) if (!names.has(need)) throw bad("The backup doesn't contain a School Theatre Manager database.");
    const d = drizzleSqlite(conn, { schema: sqliteSchema });
    const out: Record<string, unknown[]> = {};
    for (const k of TABLES) out[k] = names.has(getTableName(sqliteSchema[k])) ? d.select().from(sqliteSchema[k]).all() : [];
    return out;
  } finally { conn.close(); }
}

/** Replace every record with the given ones, in one transaction. */
async function importData(tables: Record<string, unknown[]>) {
  const users = (tables.users ?? []) as { role?: string; active?: boolean }[];
  if (!users.length) throw bad("The backup has no user accounts, so nobody could sign in after restoring it.");
  const keepBackup = await backupState(); // this computer's backup setup isn't part of the backup
  await tx(async (d) => {
    for (const k of [...TABLES].reverse()) await d.delete(t[k]);
    await d.delete(t.sessions);
    for (const k of TABLES) {
      const list = (tables[k] ?? []) as Record<string, unknown>[];
      for (let i = 0; i < list.length; i += 200) await d.insert(t[k]).values(list.slice(i, i + 200) as never);
    }
  });
  await writeSetting("backup", keepBackup);
  if (dialect() === "pg") {
    // move each id counter past the restored records
    for (const k of TABLES) {
      const name = getTableName(t[k]);
      if (!("id" in t[k])) continue;
      await rows(sql.raw(`SELECT setval(pg_get_serial_sequence('"${name}"', 'id'), COALESCE((SELECT MAX(id) FROM "${name}"), 0) + 1, false)`));
    }
  }
}

/** Swap in a SQLite database file (SQLite servers only); the current one is kept as a safety copy. */
async function swapSqliteFile(newDb: string) {
  readSqliteFile(newDb); // checks it's ours
  const keep = await backupState();
  await safetySnapshot("restore");
  await closeDatabase();
  const live = path.join(dataDir(), "theatre.db");
  for (const ext of ["-wal", "-shm"]) if (fs.existsSync(live + ext)) fs.rmSync(live + ext);
  fs.copyFileSync(newDb, live);
  await openDatabase(config); // brings the schema up to date if the backup is older
  await writeSetting("backup", keep);
}

/** Restore from a full-backup zip (or a bare .db file). Returns how many files were restored. */
export function restore(file: string) {
  return write(async () => {
    const tmpDb = path.join(os.tmpdir(), `stm-restore-${Date.now()}.db`);
    try {
      let tables: Record<string, unknown[]> | null = null, dbFile: string | null = null, n = 0;
      const head = Buffer.alloc(16); const fd = fs.openSync(file, "r"); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
      if (head.toString("latin1").startsWith("SQLite format 3")) dbFile = file;
      else {
        const z = readZip(file);
        try {
          const dj = z.entries.find((e) => e.name === "data.json"), dbe = z.entries.find((e) => e.name === "theatre.db");
          if (!dj && !dbe) throw bad("That file isn't a backup from School Theatre Manager.");
          if (dbe) { fs.writeFileSync(tmpDb, dbe.read()); dbFile = tmpDb; }
          if (dj) { const j = JSON.parse(dj.read().toString("utf8")); if (j.app !== "school-theatre-manager") throw bad("That file isn't a backup from School Theatre Manager."); tables = j.tables; }
          for (const e of z.entries) {
            const m = /^(photos|showfiles|sponsors|branding)\/([a-zA-Z0-9_.-]+)$/.exec(e.name);
            if (m) { fs.writeFileSync(path.join(dir(m[1] as (typeof FILE_DIRS)[number]), m[2]), e.read()); n++; }
          }
        } finally { z.close(); }
      }
      if (dialect() === "sqlite" && dbFile) await swapSqliteFile(dbFile);
      else {
        await safetySnapshot("restore");
        await importData(tables ?? readSqliteFile(dbFile!));
      }
      return { files: n };
    } finally { if (fs.existsSync(tmpDb)) fs.rmSync(tmpDb); }
  });
}

// ---------- cloud folder (OneDrive / Google Drive / Dropbox keep it synced); SQLite only ----------
const MIRROR_SUB = "School Theatre Manager Backup";
export function cloudCandidates(): { label: string; path: string }[] {
  const home = os.homedir(), out: { label: string; path: string }[] = [], seen = new Set<string>();
  const add = (label: string, p?: string) => { if (!p || seen.has(p.toLowerCase())) return; try { if (fs.statSync(p).isDirectory()) { seen.add(p.toLowerCase()); out.push({ label, path: p }); } } catch {} };
  add("OneDrive", process.env.OneDrive); add("OneDrive (school)", process.env.OneDriveCommercial); add("OneDrive", path.join(home, "OneDrive"));
  try { for (const f of fs.readdirSync(home)) if (/^OneDrive - /.test(f)) add(f, path.join(home, f)); } catch {}
  for (const d of ["G", "H", "I"]) add("Google Drive", `${d}:\\My Drive`);
  add("Google Drive", path.join(home, "Google Drive")); add("Google Drive", path.join(home, "My Drive")); add("Dropbox", path.join(home, "Dropbox"));
  return out;
}
export const mirrorRoot = async () => { const f = (await backupState()).cloudFolder; return f ? path.join(f, MIRROR_SUB) : null; };
export function setCloudFolder(folder: string | null) {
  return write(async () => {
    if (folder) {
      if (dialect() !== "sqlite") throw bad("On the school server, the database is backed up by the school's IT. The cloud folder is for computers working offline.");
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw bad("That folder doesn't exist on this computer.");
      const probe = path.join(folder, `.stm-write-test-${Date.now()}`);
      try { fs.writeFileSync(probe, "ok"); fs.rmSync(probe); } catch { throw bad("The app can't write to that folder."); }
    }
    await setState({ cloudFolder: folder, lastCloudError: null });
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Called after every change: copy to the cloud folder 90 seconds after the last change. */
export async function scheduleCloud() {
  if (dialect() !== "sqlite" || !(await backupState()).cloudFolder) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncCloud().catch((e) => console.error("cloud backup failed:", e)); }, 90_000);
  timer.unref?.();
}

export async function syncCloud() {
  const st = await backupState(), root = await mirrorRoot();
  if (!st.cloudFolder || !root) throw bad("No cloud backup folder is set.");
  try {
    if (!fs.existsSync(st.cloudFolder)) throw bad(`The cloud folder ${st.cloudFolder} can't be reached. Is OneDrive or Google Drive signed in?`);
    for (const d of ["", "daily", ...FILE_DIRS]) fs.mkdirSync(path.join(root, d), { recursive: true });
    const snap = path.join(os.tmpdir(), `stm-cloud-${Date.now()}.db`);
    try {
      snapshotSqlite(snap);
      const put = (to: string) => { fs.copyFileSync(snap, to + ".partial"); if (fs.existsSync(to)) fs.rmSync(to); fs.renameSync(to + ".partial", to); };
      put(path.join(root, "theatre-latest.db")); put(path.join(root, "daily", `theatre-${localDate()}.db`));
    } finally { if (fs.existsSync(snap)) fs.rmSync(snap); }
    const daily = fs.readdirSync(path.join(root, "daily")).filter((f) => f.endsWith(".db")).sort();
    for (const f of daily.slice(0, Math.max(0, daily.length - 60))) fs.rmSync(path.join(root, "daily", f));
    for (const sub of FILE_DIRS) for (const f of fs.readdirSync(dir(sub))) {
      const to = path.join(root, sub, f);
      if (sub === "branding" || !fs.existsSync(to)) fs.copyFileSync(path.join(dir(sub), f), to);
    }
    fs.writeFileSync(path.join(root, "README.txt"), `These files are automatic backups from ${PRODUCT}.\r\n\r\nTo restore on a new computer: install ${PRODUCT}, sign in as a director,\r\nopen Settings > Backups & data, choose this cloud folder and click Restore from cloud folder.\r\n\r\nDo not edit these files.\r\n`);
    await setState({ lastCloud: new Date().toISOString(), lastCloudError: null });
  } catch (e) {
    await setState({ lastCloudError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export function restoreFromCloud() {
  return write(async () => {
    const root = await mirrorRoot();
    const latest = root ? path.join(root, "theatre-latest.db") : "";
    if (!root || !fs.existsSync(latest)) throw bad("There's no backup in the cloud folder yet.");
    let n = 0;
    for (const sub of FILE_DIRS) {
      const from = path.join(root, sub);
      if (fs.existsSync(from)) for (const f of fs.readdirSync(from)) if (/^[a-zA-Z0-9_.-]+$/.test(f)) { fs.copyFileSync(path.join(from, f), path.join(dir(sub), f)); n++; }
    }
    const tmp = path.join(os.tmpdir(), `stm-restore-${Date.now()}.db`);
    try { fs.copyFileSync(latest, tmp); await swapSqliteFile(tmp); } finally { if (fs.existsSync(tmp)) fs.rmSync(tmp); }
    return { files: n };
  });
}
