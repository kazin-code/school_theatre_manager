// Development: builds the server, runs it on a private port with the data in apps/client/data,
// and runs the screens (Next.js) against it. Rebuilds and restarts the server when its code changes.
//   node scripts/dev.mjs          next dev
//   node scripts/dev.mjs start    next start (after npm run build)
import { spawn } from "node:child_process";
import path from "node:path";
import { context } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const port = Number(process.env.STM_API_PORT) || 8419;
const env = { ...process.env, STM_DATA_DIR: process.env.STM_DATA_DIR || path.join(root, "apps/client/data"), STM_MIGRATIONS: path.join(root, "packages/core/drizzle") };

let api;
const startApi = () => {
  api?.kill();
  api = spawn(process.execPath, [path.join(root, "apps/server/dist/server.cjs")], { env: { ...env, PORT: String(port), HOST: "127.0.0.1" }, stdio: "inherit" });
};
const ctx = await context({
  entryPoints: [path.join(root, "apps/server/src/index.ts")], bundle: true, platform: "node", target: "node22", format: "cjs",
  outfile: path.join(root, "apps/server/dist/server.cjs"), external: ["better-sqlite3"], tsconfig: path.join(root, "apps/server/tsconfig.json"), logLevel: "warning",
  plugins: [{ name: "restart", setup: (b) => b.onEnd((r) => { if (!r.errors.length) startApi(); }) }],
});
await ctx.rebuild();
if (mode === "dev") await ctx.watch();

const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), mode, "apps/client"], { cwd: root, env: { ...env, STM_API_URL: `http://127.0.0.1:${port}` }, stdio: "inherit" });
const stop = () => { api?.kill(); next.kill(); ctx.dispose(); };
next.on("exit", (code) => { stop(); process.exit(code ?? 0); });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, stop);
