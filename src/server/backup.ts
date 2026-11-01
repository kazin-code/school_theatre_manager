import "server-only";
import os from "node:os";
import { revalidateTag } from "next/cache";
import { closeDb, sqlite } from "@/db";
import { dbFile, dir, SUBDIRS } from "./paths";
import { copy, exists, list, mkdirp, pjoin, readFile, remove, rename, stat, writeFile } from "./fsx";
import { readSetting, writeSetting, PRODUCT } from "./settings";
import { readZip, ZipWriter } from "./zip";
import { T } from "./tags";

/** Folders whose files are part of a backup (the database is added separately). */
const FILE_DIRS = ["photos", "showfiles", "sponsors", "branding"] as const;
const MIRROR_SUB = "School Theatre Manager Backup";
type BackupState = { cloudFolder: string | null; lastCloud: string | null; lastCloudError: string | null; lastLocal: string | null };
export const backupState = (): BackupState => readSetting<BackupState>("backup", { cloudFolder: null, lastCloud: null, lastCloudError: null, lastLocal: null });
const setState = (p: Partial<BackupState>) => writeSetting("backup", { ...backupState(), ...p });
const localDate = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** A consistent copy of the live database, safe to take while the app is in use. */
export function snapshotDb(to: string) {
  if (exists(to)) remove(to);
  sqlite().prepare("VACUUM INTO ?").run(to);
}

/** One automatic copy per day in the backups folder; keeps the last 30. */
export function dailyLocalBackup(force = false) {
  const name = `daily-${localDate()}.db`, to = pjoin(dir("backups"), name);
  if (!force && exists(to)) return null;
  snapshotDb(to);
  const daily = list(dir("backups")).filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of daily.slice(0, Math.max(0, daily.length - 30))) remove(pjoin(dir("backups"), f));
  setState({ lastLocal: new Date().toISOString() });
  return name;
}

export function listBackups() {
  return list(dir("backups")).filter((f) => /\.(db|zip)$/.test(f)).map((f) => { const s = stat(pjoin(dir("backups"), f)); return { name: f, size: s.size, at: s.mtime.toISOString() }; })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Everything in one zip: the database plus photos, show files, sponsor logos and branding. */
export function makeFullBackup(): string {
  const name = `full-backup-${stamp()}.zip`, final = pjoin(dir("backups"), name), tmp = final + ".partial";
  const snap = pjoin(os.tmpdir(), `stm-snap-${Date.now()}.db`);
  try {
    snapshotDb(snap);
    const z = new ZipWriter(tmp);
    z.add("theatre.db", readFile(snap));
    for (const sub of FILE_DIRS) for (const f of list(dir(sub))) { const p = pjoin(dir(sub), f); const s = stat(p); if (s.isFile()) z.add(`${sub}/${f}`, readFile(p), s.mtime); }
    z.add("README.txt", Buffer.from(`Backup from ${PRODUCT}, ${new Date().toLocaleString("en-US")}.\r\n\r\nTo restore: sign in as a director, open Settings > Backups & data, and choose Restore from a backup file.\r\n`));
    z.close();
    rename(tmp, final);
  } finally { if (exists(snap)) remove(snap); if (exists(tmp)) remove(tmp); }
  // keep the newest 5 full backups
  const fulls = list(dir("backups")).filter((f) => f.startsWith("full-backup-") && f.endsWith(".zip")).sort();
  for (const f of fulls.slice(0, Math.max(0, fulls.length - 5))) remove(pjoin(dir("backups"), f));
  return name;
}

/** Check that a file is one of our databases before it replaces the live one. */
function assertOurDb(path: string) {
  const head = readFile(path).subarray(0, 16).toString("latin1");
  if (!head.startsWith("SQLite format 3")) throw new Error("The backup doesn't contain a School Theatre Manager database.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const t = new Database(path, { readonly: true });
  try {
    const tables = new Set((t.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name));
    for (const need of ["users", "items", "shows"]) if (!tables.has(need)) throw new Error("The backup doesn't contain a School Theatre Manager database.");
    const users = (t.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    if (!users) throw new Error("The backup has no user accounts, so nobody could sign in after restoring it.");
  } finally { t.close(); }
}

/** Swap in a database file; the current one is kept as a safety copy first. */
function replaceDb(newDb: string) {
  assertOurDb(newDb);
  const keep = backupState(); // the backup setup belongs to this computer, not to the backup
  snapshotDb(pjoin(dir("backups"), `before-restore-${stamp()}.db`));
  closeDb();
  for (const ext of ["-wal", "-shm"]) if (exists(dbFile() + ext)) remove(dbFile() + ext);
  copy(newDb, dbFile());
  sqlite(); // reopen (and bring the schema up to date if the backup is older)
  writeSetting("backup", keep);
  for (const t of Object.values(T)) revalidateTag(t, { expire: 0 });
}

/** Restore from a full-backup zip (database + files). Returns how many files were restored. */
export function restoreFromZip(zipPath: string): number {
  const z = readZip(zipPath);
  const tmp = pjoin(os.tmpdir(), `stm-restore-${Date.now()}.db`);
  try {
    const dbEntry = z.entries.find((e) => e.name === "theatre.db");
    if (!dbEntry) throw new Error("That file isn't a full backup from School Theatre Manager (no theatre.db inside).");
    writeFile(tmp, dbEntry.read());
    assertOurDb(tmp);
    let n = 0;
    for (const e of z.entries) {
      const m = /^(photos|showfiles|sponsors|branding)\/([a-zA-Z0-9_.-]+)$/.exec(e.name);
      if (!m) continue;
      writeFile(pjoin(dir(m[1] as (typeof SUBDIRS)[number]), m[2]), e.read()); n++;
    }
    replaceDb(tmp);
    return n;
  } finally { z.close(); if (exists(tmp)) remove(tmp); }
}

// ---------- cloud folder (OneDrive / Google Drive / Dropbox keep it synced) ----------
export function cloudCandidates(): { label: string; path: string }[] {
  const home = os.homedir(), out: { label: string; path: string }[] = [], seen = new Set<string>();
  const add = (label: string, p?: string) => { if (!p || seen.has(p.toLowerCase())) return; try { if (exists(p) && stat(p).isDirectory()) { seen.add(p.toLowerCase()); out.push({ label, path: p }); } } catch {} };
  add("OneDrive", process.env.OneDrive); add("OneDrive (school)", process.env.OneDriveCommercial); add("OneDrive", pjoin(home, "OneDrive"));
  for (const f of list(home)) if (/^OneDrive - /.test(f)) add(f, pjoin(home, f));
  for (const d of ["G", "H", "I"]) add("Google Drive", `${d}:\\My Drive`);
  add("Google Drive", pjoin(home, "Google Drive")); add("Google Drive", pjoin(home, "My Drive")); add("Dropbox", pjoin(home, "Dropbox"));
  return out;
}

export function setCloudFolder(folder: string | null) {
  if (folder) {
    if (!exists(folder) || !stat(folder).isDirectory()) throw new Error("That folder doesn't exist on this computer.");
    const probe = pjoin(folder, `.stm-write-test-${Date.now()}`);
    try { writeFile(probe, "ok"); remove(probe); } catch { throw new Error("The app can't write to that folder."); }
  }
  setState({ cloudFolder: folder, lastCloudError: null });
}
export const mirrorRoot = () => { const f = backupState().cloudFolder; return f ? pjoin(f, MIRROR_SUB) : null; };

let timer: ReturnType<typeof setTimeout> | null = null;
/** Called after every change: copy to the cloud folder 90 seconds after the last change. */
export function scheduleCloud() {
  if (!backupState().cloudFolder) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; try { syncCloud(); } catch (e) { console.error("cloud backup failed:", e); } }, 90_000);
  timer.unref?.();
}

export function syncCloud() {
  const st = backupState(), root = mirrorRoot();
  if (!st.cloudFolder || !root) throw new Error("No cloud backup folder is set.");
  try {
    if (!exists(st.cloudFolder)) throw new Error(`The cloud folder ${st.cloudFolder} can't be reached. Is OneDrive or Google Drive signed in?`);
    for (const d of ["", "daily", ...FILE_DIRS]) mkdirp(pjoin(root, d));
    const snap = pjoin(os.tmpdir(), `stm-cloud-${Date.now()}.db`);
    try {
      snapshotDb(snap);
      const put = (to: string) => { copy(snap, to + ".partial"); if (exists(to)) remove(to); rename(to + ".partial", to); };
      put(pjoin(root, "theatre-latest.db")); put(pjoin(root, "daily", `theatre-${localDate()}.db`));
    } finally { if (exists(snap)) remove(snap); }
    const daily = list(pjoin(root, "daily")).filter((f) => f.endsWith(".db")).sort();
    for (const f of daily.slice(0, Math.max(0, daily.length - 60))) remove(pjoin(root, "daily", f));
    for (const sub of FILE_DIRS) for (const f of list(dir(sub))) {
      const to = pjoin(root, sub, f);
      if (sub === "branding" || !exists(to)) copy(pjoin(dir(sub), f), to); // photos and files never change once saved
    }
    writeFile(pjoin(root, "README.txt"), `These files are automatic backups from ${PRODUCT}.\r\n\r\nTo restore on a new computer: install ${PRODUCT}, sign in as a director,\r\nopen Settings > Backups & data, choose this cloud folder and click Restore from cloud folder.\r\n\r\nDo not edit these files.\r\n`);
    setState({ lastCloud: new Date().toISOString(), lastCloudError: null });
  } catch (e) {
    setState({ lastCloudError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export function restoreFromCloud(): number {
  const root = mirrorRoot();
  if (!root || !exists(pjoin(root, "theatre-latest.db"))) throw new Error("There's no backup in the cloud folder yet.");
  const tmp = pjoin(os.tmpdir(), `stm-restore-${Date.now()}.db`);
  try {
    copy(pjoin(root, "theatre-latest.db"), tmp);
    assertOurDb(tmp);
    let n = 0;
    for (const sub of FILE_DIRS) for (const f of list(pjoin(root, sub))) if (/^[a-zA-Z0-9_.-]+$/.test(f)) { copy(pjoin(root, sub, f), pjoin(dir(sub), f)); n++; }
    replaceDb(tmp);
    return n;
  } finally { if (exists(tmp)) remove(tmp); }
}
