import "server-only";
/**
 * File access for the school's data folder. The folder is only known at run time (the installer
 * chooses it), so these calls are marked for the bundler's file tracer to skip.
 */
import fs from "node:fs";

export const exists = (p: string) => fs.existsSync(/*turbopackIgnore: true*/ p);
export const mkdirp = (p: string) => fs.mkdirSync(/*turbopackIgnore: true*/ p, { recursive: true });
export const readFile = (p: string) => fs.readFileSync(/*turbopackIgnore: true*/ p);
export const readText = (p: string) => fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8");
export const writeFile = (p: string, data: Buffer | string) => fs.writeFileSync(/*turbopackIgnore: true*/ p, data);
export const remove = (p: string) => fs.rmSync(/*turbopackIgnore: true*/ p, { force: true, recursive: true });
export const list = (p: string) => (fs.existsSync(/*turbopackIgnore: true*/ p) ? fs.readdirSync(/*turbopackIgnore: true*/ p) : []);
export const stat = (p: string) => fs.statSync(/*turbopackIgnore: true*/ p);
export const rename = (a: string, b: string) => fs.renameSync(/*turbopackIgnore: true*/ a, /*turbopackIgnore: true*/ b);
export const copy = (a: string, b: string) => fs.copyFileSync(/*turbopackIgnore: true*/ a, /*turbopackIgnore: true*/ b);
export const openRead = (p: string) => fs.createReadStream(/*turbopackIgnore: true*/ p);

import path from "node:path";
/** path.join for data-folder paths (skipped by the file tracer). */
export const pjoin = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ ...parts);
