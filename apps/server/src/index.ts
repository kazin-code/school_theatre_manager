/**
 * School Theatre Manager server. Run it directly (`node server.cjs`) or embed it with `startServer()`.
 * Settings come from environment variables or <data folder>/server.json (see config.ts).
 */
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
  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host });
  console.log(`School Theatre Manager server ${APP_VERSION}: http://${cfg.host}:${cfg.port}/api/v1 (${dialect() === "pg" ? "PostgreSQL" : "SQLite"}; data in ${cfg.dataDir})`);
  const tick = () => dailyBackup().catch((e) => console.error("daily backup failed:", e));
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
  if (cfg.host !== "127.0.0.1" && cfg.host !== "localhost" && process.env.STM_DISCOVERY !== "0") {
    startDiscoveryResponder(cfg.port, async () => { const b = await branding(); return { name: b.name, school: b.school ?? null }; });
  }
  const stop = async () => { server.close(); await closeDatabase(); };
  return { server, config: cfg, stop };
}

// Run directly: node server.cjs
if (require.main === module) {
  startServer().then(({ stop }) => {
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop().finally(() => process.exit(0)); });
  }).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
