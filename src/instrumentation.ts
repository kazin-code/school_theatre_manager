/** Runs once when the server starts: daily safety copies and the cloud-folder backup. */
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
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 3600_000).unref();
}
