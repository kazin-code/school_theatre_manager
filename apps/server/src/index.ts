/**
 * School Theatre Manager server. Run it directly (`node server.cjs`) or embed it with `startServer()`.
 * Settings come from environment variables or <data folder>/server.json (see config.ts).
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { serve } from "@hono/node-server";
import { APP_VERSION } from "@stm/core/version";
import { loadConfig, type Config } from "./config";
import { closeDatabase, dialect, openDatabase } from "./db";
import { setRoots } from "./files";
import { app } from "./app";
import { dailyBackup, setBackupConfig } from "./services/backup";
import { branding } from "./services/settings";
import { startDiscoveryResponder } from "./discovery";

export { app };

export async function startServer(overrides: Partial<Config> = {}) {
  const cfg = { ...loadConfig(), ...overrides };
  setRoots(cfg.dataDir, cfg.filesDir);
  setBackupConfig(cfg);
  await openDatabase(cfg);
  // port 0 picks a free port (the offline app's private server)
  let server!: ReturnType<typeof serve>;
  const port = await new Promise<number>((resolve, reject) => {
    server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (info) => resolve(info.port));
    server.once("error", reject);
  });
  const url = `http://${cfg.host.includes(":") ? `[${cfg.host}]` : cfg.host}:${port}`;
  console.log(`School Theatre Manager server ${APP_VERSION}: ${url}/api/v1 (${dialect() === "pg" ? "PostgreSQL" : "SQLite"}; data in ${cfg.dataDir})`);
  const tick = () => dailyBackup().catch((e) => console.error("daily backup failed:", e));
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost" && process.env.STM_DISCOVERY !== "0") {
    startDiscoveryResponder(port, async () => { const b = await branding(); return { name: b.name, school: b.school ?? null }; });
  }
  const stop = async () => { server.close(); await closeDatabase(); };
  return { server, url, config: cfg, stop };
}

// Embedded: the offline app runs the server in a worker thread (its own globals, so it can't clash
// with the screens' Next.js) and is told the address once it is listening.
if (!isMainThread && workerData?.stmEmbedded) {
  startServer(workerData.overrides ?? {}).then(({ url }) => parentPort!.postMessage({ url }))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}

// Run directly: node server.cjs
else if (require.main === module) {
  startServer().then(({ stop }) => {
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop().finally(() => process.exit(0)); });
  }).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
