import "server-only";
import crypto from "node:crypto";
import { ActionError } from "./auth";
import { dir, type SubDir } from "./paths";
import { pjoin, writeFile } from "./fsx";

export const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
/** Files that could run code on the computer are never stored. */
const BLOCKED = new Set([".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".jar", ".dll", ".lnk", ".reg", ".hta", ".html", ".htm", ".svg", ".xhtml", ".cpl", ".msc", ".pif", ".appx", ".msix"]);

export const extOf = (name: string) => { const m = /\.[a-z0-9]+$/i.exec(name); return m ? m[0].toLowerCase() : ""; };
const fresh = (prefix: string, ext: string) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

export async function savePhoto(sub: SubDir, prefix: string, f: File, maxMb = 25): Promise<string> {
  const ext = extOf(f.name);
  if (ext === ".heic" || ext === ".heif") throw new ActionError(`${f.name} is an iPhone HEIC photo, which browsers can't show. On the iPhone choose Settings → Camera → Formats → Most Compatible, or export it as JPG.`);
  if (!PHOTO_EXT.has(ext)) throw new ActionError(`${f.name} isn't a JPG, PNG, WEBP or GIF picture.`);
  if (f.size > maxMb << 20) throw new ActionError(`${f.name} is larger than ${maxMb} MB.`);
  const name = fresh(prefix, ext);
  writeFile(pjoin(dir(sub), name), Buffer.from(await f.arrayBuffer()));
  return name;
}

export async function saveDocument(sub: SubDir, prefix: string, f: File, maxMb = 200): Promise<{ name: string; size: number }> {
  const ext = extOf(f.name);
  if (BLOCKED.has(ext)) throw new ActionError(`${f.name} is a program or web file, which can't be stored for safety. Zip it or save it as a PDF first.`);
  if (f.size > maxMb << 20) throw new ActionError(`${f.name} is larger than ${maxMb} MB.`);
  const name = fresh(prefix, ext || ".bin");
  writeFile(pjoin(dir(sub), name), Buffer.from(await f.arrayBuffer()));
  return { name, size: f.size };
}
