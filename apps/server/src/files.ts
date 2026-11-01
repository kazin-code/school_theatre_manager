/**
 * Photos, show files, sponsor logos and branding live in folders under the files folder
 * (STM_FILES_DIR, default the data folder; it can be a network share). Backups and the setting
 * files stay in the data folder.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bad } from "./errors";

export const FILE_DIRS = ["photos", "showfiles", "sponsors", "branding"] as const;
export type FileDir = (typeof FILE_DIRS)[number] | "backups" | "recycle";
let roots = { data: "", files: "" };
export function setRoots(data: string, files: string) { roots = { data, files }; }
export function dir(sub: FileDir) {
  const d = path.join(sub === "backups" || sub === "recycle" ? roots.data : roots.files, sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export const dataDir = () => roots.data;
export const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;
/** The path of a stored file, or null for names that could point anywhere else. */
export function filePath(sub: FileDir, name: string): string | null {
  if (!SAFE_NAME.test(name) || name.startsWith(".")) return null;
  return path.join(dir(sub), name);
}
export function removeFile(sub: FileDir, name: string | null | undefined) {
  const p = name ? filePath(sub, name) : null;
  if (p) fs.rmSync(p, { force: true });
}

export const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
/** Files that could run code on a computer are never stored. */
const BLOCKED = new Set([".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".jar", ".dll", ".lnk", ".reg", ".hta", ".html", ".htm", ".svg", ".xhtml", ".cpl", ".msc", ".pif", ".appx", ".msix"]);
export const extOf = (name: string) => { const m = /\.[a-z0-9]+$/i.exec(name); return m ? m[0].toLowerCase() : ""; };
const newName = (prefix: string, ext: string) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${ext}`;

export async function savePhoto(sub: FileDir, prefix: string, f: File, maxMb = 25): Promise<string> {
  const ext = extOf(f.name);
  if (ext === ".heic" || ext === ".heif") throw bad(`${f.name} is an iPhone HEIC photo, which browsers can't show. On the iPhone choose Settings → Camera → Formats → Most Compatible, or export it as JPG.`);
  if (!PHOTO_EXT.has(ext)) throw bad(`${f.name} isn't a JPG, PNG, WEBP or GIF picture.`);
  if (f.size > maxMb * 1024 * 1024) throw bad(`${f.name} is larger than ${maxMb} MB.`);
  const name = newName(prefix, ext);
  fs.writeFileSync(path.join(dir(sub), name), Buffer.from(await f.arrayBuffer()));
  return name;
}

export async function saveDocument(sub: FileDir, prefix: string, f: File, maxMb = 200): Promise<{ name: string; size: number }> {
  const ext = extOf(f.name);
  if (BLOCKED.has(ext)) throw bad(`${f.name} is a program or web file, which can't be stored for safety. Zip it or save it as a PDF first.`);
  if (f.size > maxMb * 1024 * 1024) throw bad(`${f.name} is larger than ${maxMb} MB.`);
  const name = newName(prefix, ext || ".bin");
  fs.writeFileSync(path.join(dir(sub), name), Buffer.from(await f.arrayBuffer()));
  return { name, size: f.size };
}
