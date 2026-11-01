/**
 * The HTTP API, under /api/v1. Clients send `Authorization: Bearer <session token>` from sign-in.
 * Errors come back as { error, fieldErrors? } with a fitting status code, worded for people.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hono, type Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import { APP_ID, APP_VERSION } from "@stm/core/version";
import { dialect } from "./db";
import { ApiError } from "./errors";
import { dataDir, filePath } from "./files";
import { logActivity } from "./activity";
import type { Me } from "./me";
import * as auth from "./services/auth";
import * as settings from "./services/settings";
import * as items from "./services/items";
import * as shows from "./services/shows";
import * as rentals from "./services/rentals";
import * as sponsors from "./services/sponsors";
import * as programs from "./services/programs";
import * as backup from "./services/backup";
import { exportCsv } from "./services/exports";

type Env = { Variables: { me: Me | null; token: string | null } };
const api = new Hono<Env>();

/**
 * A number that changes after every change to the data. Clients put it in their cache keys, so a
 * screen shows changes made from any computer, not only its own. The random start makes it change
 * when the server restarts too (a restore, say).
 */
const boot = Math.random().toString(36).slice(2, 8);
let changes = 0;
export const revision = () => `${boot}.${changes}`;

// ---------- plumbing ----------
api.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site" }));
api.use("*", bodyLimit({ maxSize: 260 * 1024 * 1024, onError: (c) => c.json({ error: "That upload is too large (the limit is 250 MB)." }, 413) }));
api.use("*", async (c, next) => {
  const h = c.req.header("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
  c.set("token", token);
  c.set("me", await auth.userFromToken(token));
  await next();
  if (c.req.method !== "GET" && c.res.status < 300) { changes++; void backup.scheduleCloud().catch(() => {}); }
  c.res.headers.set("X-STM-Revision", revision());
});

/** The signed-in person, or a 401/403 error. */
function need(c: Context<Env>, role?: "director", opts: { allowMustChange?: boolean } = {}): Me {
  const me = c.get("me");
  if (!me) throw new ApiError(401, "Your session ended. Sign in again.");
  if (me.mustChangePassword && !opts.allowMustChange) throw new ApiError(403, "Choose a new password first.");
  if (role === "director" && me.role !== "director") throw new ApiError(403, "Only a director account can do that.");
  return me;
}
const id = (c: Context, name = "id") => { const n = Number(c.req.param(name)); if (!Number.isInteger(n) || n < 1) throw new ApiError(404, "Not found."); return n; };
const body = async (c: Context): Promise<Record<string, unknown>> => { try { return (await c.req.json()) ?? {}; } catch { return {}; } };
const ok = (c: Context, data: unknown = { ok: true }) => c.json(data ?? { ok: true });
async function form(c: Context) {
  const f = await c.req.parseBody({ all: true });
  const files = (k: string) => [f[k]].flat().filter((x): x is File => x instanceof File);
  const text = (k: string) => { const v = f[k]; return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined; };
  return { files, text };
}

api.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ error: e.message, fieldErrors: e.fieldErrors }, e.status as 400);
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return c.json({ error: e.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors }, 400);
  }
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  const detail = `${msg} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}`;
  if (code === "23505" || /UNIQUE constraint failed/.test(detail)) {
    if (/items(\.tag|_tag)/.test(detail)) return c.json({ error: "That tag number is already used by another item.", fieldErrors: { tag: "Already used" } }, 409);
    if (/users(\.username|_username)/.test(detail)) return c.json({ error: "That username is already taken.", fieldErrors: { username: "Already taken" } }, 409);
    return c.json({ error: "That would create a duplicate." }, 409);
  }
  if (code === "23503" || /FOREIGN KEY constraint failed/.test(detail)) return c.json({ error: "This record is still used elsewhere, so it can't be removed." }, 409);
  console.error(e);
  return c.json({ error: "Something went wrong on the server: " + msg }, 500);
});
api.notFound((c) => c.json({ error: "Not found." }, 404));

// ---------- public ----------
api.get("/ping", (c) => c.json({ app: APP_ID, version: APP_VERSION }));
api.get("/revision", (c) => c.json({ revision: revision() }));
api.get("/server-info", async (c) => {
  const b = await settings.branding();
  return c.json({ app: APP_ID, version: APP_VERSION, name: b.name, school: b.school ?? null, database: dialect() === "pg" ? "postgresql" : "sqlite" });
});
api.get("/branding", async (c) => ok(c, await settings.branding()));
api.get("/branding/logo", (c) => {
  const f = settings.logoFile();
  if (!f) return c.json({ error: "No logo." }, 404);
  return sendFile(c, f, { cache: "no-cache" });
});
api.get("/setup", async (c) => ok(c, { needed: await auth.needsSetup() }));
api.post("/auth/setup", async (c) => ok(c, await auth.setup(await body(c))));
api.post("/auth/login", async (c) => ok(c, await auth.login(await body(c))));

// ---------- account ----------
api.post("/auth/logout", async (c) => { await auth.logout(c.get("token") ?? undefined); return ok(c); });
api.get("/auth/me", (c) => ok(c, need(c, undefined, { allowMustChange: true })));
api.post("/auth/password", async (c) => { await auth.changePassword(need(c, undefined, { allowMustChange: true }), await body(c)); return ok(c); });

// ---------- settings ----------
api.get("/lists", async (c) => { need(c); return ok(c, await settings.lists()); });
api.put("/lists/:list", async (c) => { await settings.saveList(need(c, "director"), c.req.param("list"), (await body(c)).values); return ok(c); });
api.put("/branding", async (c) => { await settings.saveBranding(need(c, "director"), await body(c)); return ok(c); });
api.post("/branding/logo", async (c) => { const me = need(c, "director"); const f = await form(c); await settings.saveLogo(me, f.files("logo")[0], f.files("icon")[0]); return ok(c); });
api.delete("/branding/logo", async (c) => { await settings.removeLogo(need(c, "director")); return ok(c); });
api.get("/users", async (c) => { need(c, "director"); return ok(c, await settings.listUsers()); });
api.post("/users", async (c) => { await settings.createUser(need(c, "director"), await body(c)); return ok(c); });
api.patch("/users/:id", async (c) => { await settings.updateUser(need(c, "director"), id(c), await body(c)); return ok(c); });
api.get("/activity", async (c) => { need(c); return ok(c, await settings.activityLog(Number(c.req.query("limit")) || 300)); });

// ---------- inventory ----------
api.get("/dashboard", async (c) => { need(c); return ok(c, await items.dashboard()); });
api.get("/items", async (c) => { need(c); return ok(c, await items.listItems()); });
api.get("/items/:id", async (c) => { need(c); const d = await items.getItem(id(c)); if (!d) throw new ApiError(404, "That item no longer exists."); return ok(c, d); });
api.post("/items", async (c) => ok(c, await items.saveItem(need(c), null, await body(c))));
api.put("/items/:id", async (c) => ok(c, await items.saveItem(need(c), id(c), await body(c))));
api.delete("/items/:id", async (c) => { await items.deleteItem(need(c, "director"), id(c)); return ok(c); });
api.post("/items/:id/condition", async (c) => { await items.recordCondition(need(c), id(c), await body(c)); return ok(c); });
api.post("/items/:id/photos", async (c) => { const me = need(c); await items.addPhotos(me, id(c), (await form(c)).files("photo")); return ok(c); });
api.patch("/item-photos/:id", async (c) => { await items.updatePhoto(need(c), id(c), await body(c)); return ok(c); });
api.delete("/item-photos/:id", async (c) => { await items.deletePhoto(need(c), id(c)); return ok(c); });

// ---------- shows ----------
api.get("/shows", async (c) => { need(c); return ok(c, await shows.listShows()); });
api.get("/shows/:id", async (c) => { need(c); const d = await shows.getShow(id(c)); if (!d) throw new ApiError(404, "That show no longer exists."); return ok(c, d); });
api.post("/shows", async (c) => ok(c, await shows.saveShow(need(c), null, await body(c))));
api.put("/shows/:id", async (c) => ok(c, await shows.saveShow(need(c), id(c), await body(c))));
api.put("/shows/:id/status", async (c) => { const b = await body(c); await shows.setStatus(need(c), id(c), b.status, !!b.returnAll); return ok(c); });
api.post("/shows/:id/delete", async (c) => { await shows.deleteShow(need(c, "director"), id(c), String((await body(c)).title ?? "")); return ok(c); });
api.post("/shows/:id/cover", async (c) => { const me = need(c); await shows.setCover(me, id(c), (await form(c)).files("cover")[0]); return ok(c); });
api.delete("/shows/:id/cover", async (c) => { await shows.removeCover(need(c), id(c)); return ok(c); });
api.post("/shows/:id/cover-from/:fileId", async (c) => { await shows.photoAsCover(need(c), id(c), id(c, "fileId")); return ok(c); });
api.post("/shows/:id/people", async (c) => { await shows.savePerson(need(c), id(c), null, await body(c)); return ok(c); });
api.put("/shows/:id/people/:pid", async (c) => { await shows.savePerson(need(c), id(c), id(c, "pid"), await body(c)); return ok(c); });
api.delete("/shows/:id/people/:pid", async (c) => { await shows.deletePerson(need(c), id(c), id(c, "pid")); return ok(c); });
api.post("/shows/:id/people/import", async (c) => { const b = await body(c); return ok(c, await shows.importPeople(need(c), id(c), b.kind, b.text)); });
api.post("/shows/:id/numbers", async (c) => { await shows.saveNumber(need(c), id(c), null, await body(c)); return ok(c); });
api.put("/shows/:id/numbers/:nid", async (c) => { await shows.saveNumber(need(c), id(c), id(c, "nid"), await body(c)); return ok(c); });
api.delete("/shows/:id/numbers/:nid", async (c) => { await shows.deleteNumber(need(c), id(c), id(c, "nid")); return ok(c); });
api.put("/shows/:id/order", async (c) => { const b = await body(c); await shows.reorder(need(c), id(c), b.what, b.ids); return ok(c); });
api.post("/shows/:id/files", async (c) => { const me = need(c); const f = await form(c); await shows.addFiles(me, id(c), f.text("kind"), f.files("file"), f.text("category")); return ok(c); });
api.patch("/show-files/:id", async (c) => { await shows.updateFile(need(c), id(c), await body(c)); return ok(c); });
api.delete("/show-files/:id", async (c) => { await shows.deleteFile(need(c), id(c)); return ok(c); });
api.post("/shows/:id/checkout", async (c) => ok(c, await shows.checkout(need(c), id(c), await body(c))));
api.post("/shows/:id/returns", async (c) => { await shows.returnLines(need(c), id(c), await body(c)); return ok(c); });
api.patch("/show-lines/:id", async (c) => { await shows.updateLine(need(c), id(c), await body(c)); return ok(c); });
api.delete("/show-lines/:id", async (c) => { await shows.removeLine(need(c), id(c)); return ok(c); });
api.get("/shows/:id/program", async (c) => { need(c); return ok(c, await programs.getProgram(id(c))); });
api.put("/shows/:id/program", async (c) => ok(c, await programs.saveProgram(need(c), id(c), (await body(c)).doc)));
api.get("/programs/:id", async (c) => { need(c); return ok(c, await programs.programToCopy(id(c))); });

// ---------- renters & rentals ----------
api.get("/renters", async (c) => { need(c); return ok(c, await rentals.listRenters()); });
api.get("/renters/:id", async (c) => { need(c); const d = await rentals.getRenter(id(c)); if (!d) throw new ApiError(404, "That renter no longer exists."); return ok(c, d); });
api.post("/renters", async (c) => ok(c, await rentals.saveRenter(need(c), null, await body(c))));
api.put("/renters/:id", async (c) => ok(c, await rentals.saveRenter(need(c), id(c), await body(c))));
api.delete("/renters/:id", async (c) => { await rentals.deleteRenter(need(c, "director"), id(c)); return ok(c); });
api.get("/rentals", async (c) => { need(c); return ok(c, await rentals.listRentals()); });
api.get("/rentals/:id", async (c) => { need(c); const d = await rentals.getRental(id(c)); if (!d) throw new ApiError(404, "That rental no longer exists."); return ok(c, d); });
api.post("/rentals", async (c) => ok(c, await rentals.createRental(need(c), await body(c))));
api.patch("/rentals/:id", async (c) => { await rentals.updateRental(need(c), id(c), await body(c)); return ok(c); });
api.post("/rentals/:id/return", async (c) => { await rentals.returnRental(need(c), id(c), await body(c)); return ok(c); });
api.post("/rentals/:id/cancel", async (c) => { await rentals.cancelRental(need(c), id(c)); return ok(c); });

// ---------- sponsors ----------
api.get("/sponsors", async (c) => { need(c); return ok(c, await sponsors.listSponsors()); });
const sponsorForm = async (c: Context<Env>, sid: number | null) => {
  const me = need(c); const f = await form(c);
  let data: unknown = {}; try { data = JSON.parse(f.text("data") ?? "{}"); } catch { throw new ApiError(400, "The sponsor's details weren't readable."); }
  return ok(c, await sponsors.saveSponsor(me, sid, data, f.files("logo")[0], f.text("removeLogo") === "1"));
};
api.post("/sponsors", (c) => sponsorForm(c, null));
api.put("/sponsors/:id", (c) => sponsorForm(c, id(c)));
api.delete("/sponsors/:id", async (c) => { await sponsors.deleteSponsor(need(c, "director"), id(c)); return ok(c); });

// ---------- files ----------
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8", ".zip": "application/zip", ".db": "application/octet-stream" };
function sendFile(c: Context, p: string, opts: { name?: string; download?: boolean; cache?: string } = {}) {
  const ext = path.extname(p).toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  const inline = !opts.download && (type.startsWith("image/") || type === "application/pdf");
  const name = (opts.name ?? path.basename(p)).replace(/[\r\n"]/g, "");
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, { headers: {
    "Content-Type": type, "Content-Length": String(fs.statSync(p).size), "X-Content-Type-Options": "nosniff",
    "Cache-Control": opts.cache ?? "private, max-age=31536000, immutable",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}` } });
}
api.get("/files/:kind/:name", async (c) => {
  need(c);
  const sub = ({ photos: "photos", show: "showfiles", sponsor: "sponsors" } as Record<string, "photos" | "showfiles" | "sponsors">)[c.req.param("kind")];
  const p = sub ? filePath(sub, c.req.param("name")) : null;
  if (!p || !fs.existsSync(p)) return c.json({ error: "Not found." }, 404);
  // show files download under the name they were uploaded with
  const name = c.req.query("name") ?? (sub === "showfiles" ? await shows.originalName(c.req.param("name")) : null) ?? undefined;
  return sendFile(c, p, { name, download: c.req.query("download") != null });
});

// ---------- spreadsheets ----------
api.get("/exports/:what", async (c) => {
  need(c);
  const e = await exportCsv(c.req.param("what"));
  if (!e) return c.json({ error: "Not found." }, 404);
  return c.body(e.csv, 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${e.file}"` });
});

// ---------- backups (directors) ----------
api.get("/backups", async (c) => {
  need(c, "director");
  const st = await backup.backupState();
  return ok(c, { ...st, dataDir: dataDir(), mirror: await backup.mirrorRoot(), database: dialect() === "pg" ? "postgresql" : "sqlite", backups: backup.listBackups(), candidates: dialect() === "sqlite" ? backup.cloudCandidates() : [] });
});
api.post("/backups", async (c) => {
  const me = need(c, "director");
  const full = (await body(c)).full !== false;
  const r = full ? await backup.makeFullBackup() : { name: await backup.dailyBackup(true) };
  await logActivity(me.displayName, "backup", full ? `Made a full backup (${r.name})` : "Made a database backup");
  return ok(c, r);
});
api.get("/backups/:name", (c) => {
  need(c, "director");
  const name = c.req.param("name");
  const p = /\.(db|zip)$/.test(name) ? filePath("backups", name) : null;
  if (!p || !fs.existsSync(p)) return c.json({ error: "Not found." }, 404);
  return sendFile(c, p, { download: true, cache: "no-store" });
});
api.post("/backups/restore", async (c) => {
  const me = need(c, "director");
  if (c.req.header("x-confirm") !== "RESTORE") throw new ApiError(400, "Type RESTORE to confirm.");
  const raw = c.req.raw.body;
  if (!raw) throw new ApiError(400, "Choose a backup file.");
  const tmp = path.join(os.tmpdir(), `stm-upload-${Date.now()}`);
  try {
    await pipeline(Readable.fromWeb(raw as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
    const r = await backup.restore(tmp);
    await logActivity(me.displayName, "backup", `Restored from a backup file (${r.files} files)`).catch(() => {});
    return ok(c, r);
  } finally { if (fs.existsSync(tmp)) fs.rmSync(tmp); }
});
api.put("/backups/cloud", async (c) => {
  const me = need(c, "director");
  const f = (await body(c)).folder;
  const folder = typeof f === "string" && f.trim() ? f.trim() : null;
  await backup.setCloudFolder(folder);
  await logActivity(me.displayName, "backup", folder ? `Cloud backup folder set to ${folder}` : "Turned off the cloud backup folder");
  if (folder) await backup.syncCloud();
  return ok(c);
});
api.post("/backups/cloud/sync", async (c) => { need(c, "director"); await backup.syncCloud(); return ok(c); });
api.post("/backups/cloud/restore", async (c) => {
  const me = need(c, "director");
  if (String((await body(c)).confirm ?? "").trim().toUpperCase() !== "RESTORE") throw new ApiError(400, "Type RESTORE to confirm.");
  const r = await backup.restoreFromCloud();
  await logActivity(me.displayName, "backup", `Restored from the cloud backup folder (${r.files} files)`).catch(() => {});
  return ok(c, r);
});

export const app = new Hono().route("/api/v1", api);
