import "server-only";
import { mkdirp, pjoin } from "./fsx";
import path from "node:path";

/** Where the school's data lives. The Windows installer sets STM_DATA_DIR. */
export function dataDir(): string {
  if (process.env.STM_DATA_DIR) return process.env.STM_DATA_DIR;
  if (process.platform === "win32") return pjoin(process.env.ProgramData || "C:\\ProgramData", "School Theatre Manager");
  return path.resolve("data"); // development: ./data
}

export const SUBDIRS = ["photos", "showfiles", "sponsors", "branding", "backups", "recycle"] as const;
export type SubDir = (typeof SUBDIRS)[number];

export function dir(sub: SubDir): string {
  const d = pjoin(dataDir(), sub);
  mkdirp(d);
  return d;
}

export const dbFile = () => pjoin(dataDir(), "theatre.db");
export const migrationsDir = () => process.env.STM_MIGRATIONS || path.resolve("drizzle");

/** Only plain generated names are ever served or deleted. */
export const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;
export function filePath(sub: SubDir, name: string): string | null {
  if (!SAFE_NAME.test(name) || name.startsWith(".")) return null;
  return pjoin(dir(sub), name);
}
