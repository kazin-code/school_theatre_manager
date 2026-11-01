import "server-only";
import type { NetState } from "@/components/app/network-panel";
import { where } from "./api";
import { checkServer, readNetConfig } from "./network";

/** Which server this computer uses now, and whether it answers. */
export async function netState(): Promise<NetState> {
  const w = where();
  const reachable = w.kind === "school" && w.url ? !!(await checkServer(w.url, 2500)) : true;
  return { kind: w.kind, url: w.url, name: w.kind === "school" ? readNetConfig().serverName : null, reachable };
}
