"use server";
import { actionUser, ActionError } from "../auth";
import { logActivity } from "../activity";
import { run } from "../action";
import { backupState, cloudCandidates, dailyLocalBackup, listBackups, makeFullBackup, mirrorRoot, restoreFromCloud, setCloudFolder, syncCloud } from "../backup";
import { dataDir } from "../paths";

const director = () => actionUser("director");
const fail = (e: unknown): never => { throw new ActionError(e instanceof Error ? e.message : String(e)); };

export async function backupInfoAction() {
  return run(async () => { await director(); return { ...backupState(), mirror: mirrorRoot(), dataDir: dataDir(), backups: listBackups(), candidates: cloudCandidates() }; });
}
export async function backupNowAction(full: boolean) {
  return run(async () => {
    const me = await director();
    try { const name = full ? makeFullBackup() : dailyLocalBackup(true); logActivity(me.displayName, "backup", full ? `Made a full backup (${name})` : "Made a database backup"); return { name }; } catch (e) { return fail(e); }
  });
}
export async function setCloudFolderAction(folder: string | null) {
  return run(async () => {
    const me = await director();
    try { setCloudFolder(folder?.trim() || null); } catch (e) { fail(e); }
    logActivity(me.displayName, "backup", folder ? `Cloud backup folder set to ${folder}` : "Turned off the cloud backup folder");
    if (folder) { try { syncCloud(); } catch (e) { fail(e); } }
  });
}
export async function syncCloudAction() {
  return run(async () => { await director(); try { syncCloud(); } catch (e) { fail(e); } });
}
export async function restoreCloudAction(confirm: string) {
  return run(async () => {
    const me = await director();
    if (confirm.trim().toUpperCase() !== "RESTORE") throw new ActionError("Type RESTORE to confirm.");
    let n = 0;
    try { n = restoreFromCloud(); } catch (e) { fail(e); }
    logActivity(me.displayName, "backup", `Restored from the cloud backup folder (${n} files)`);
    return { files: n };
  });
}
