/** Runs once when the server starts: daily safety copies, the cloud-folder backup, and school-network discovery. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const tick = async () => {
    try {
      const b = await import("./server/backup");
      b.dailyLocalBackup();
      const st = b.backupState();
      if (st.cloudFolder && (!st.lastCloud || Date.now() - Date.parse(st.lastCloud) > 20 * 3600_000)) b.syncCloud();
    } catch (e) { console.error("automatic backup failed:", e); }
  };
  // the school's server answers other computers looking for it on the school network
  try {
    const net = await import("./server/network");
    if (net.readNetConfig().network || process.env.STM_NETWORK === "1") {
      const { readSetting } = await import("./server/settings");
      net.startDiscoveryResponder(() => { const b = readSetting<{ school?: string | null; program?: string | null }>("branding", {}); return { name: b.program || (b.school ? `${b.school} Theatre` : "School Theatre Manager"), school: b.school ?? null }; });
    }
  } catch (e) { console.error("school network discovery failed to start:", e); }
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
}
