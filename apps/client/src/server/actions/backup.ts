"use server";
import type { BackupInfo } from "@stm/server/types";
import { actionUser } from "../auth";
import { api } from "../api";
import { run } from "../action";

export async function backupInfoAction() {
  return run(() => api<BackupInfo>("/backups"));
}
export async function backupNowAction(full: boolean) {
  return run(async () => { await actionUser("director"); return api<{ name: string | null }>("/backups", { json: { full } }); });
}
export async function setCloudFolderAction(folder: string | null) {
  return run(async () => { await api("/backups/cloud", { method: "PUT", json: { folder: folder?.trim() || null } }); });
}
export async function syncCloudAction() {
  return run(async () => { await api("/backups/cloud/sync", { method: "POST" }); });
}
export async function restoreCloudAction(confirm: string) {
  return run(() => api<{ files: number }>("/backups/cloud/restore", { json: { confirm } }));
}
