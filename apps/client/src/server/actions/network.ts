"use server";
import { cookies } from "next/headers";
import { APP_VERSION } from "@stm/core/version";
import type { Session } from "@stm/server/types";
import { actionUser, ActionError, COOKIE } from "../auth";
import { api, apiRaw, ApiFail, where } from "../api";
import { run } from "../action";
import { checkServer, discover, normalizeUrl, readNetConfig, writeNetConfig, type ServerInfo } from "../network";

const major = (v: string) => v.split(".")[0];

/**
 * Who may change which server this computer uses: a director (of the records in use now), or
 * anyone while this computer's own copy has no accounts yet (a new classroom install).
 */
async function mayChange() {
  const local = process.env.STM_LOCAL_API_URL;
  if (where().kind === "fixed") throw new ActionError("This copy of the app always uses its own server.");
  if (local) {
    const fresh = await api<{ needed: boolean }>("/setup", { base: local, token: null }).then((r) => r.needed).catch(() => false);
    if (fresh && where().kind === "local") return;
  }
  await actionUser("director");
}

export type Found = ServerInfo & { compatible: boolean };
const withCompat = (s: ServerInfo): Found => ({ ...s, compatible: major(s.version) === major(APP_VERSION) });

/** Look for School Theatre Manager servers on the school network. */
export async function findServersAction() {
  return run(async () => { await mayChange(); return (await discover()).map(withCompat); });
}

/** Check an address someone typed. */
export async function checkAddressAction(address: string) {
  return run(async () => {
    await mayChange();
    const url = normalizeUrl(address);
    if (!url) throw new ActionError("Type the server's name or address, for example school-theatre or 10.0.4.20.");
    const s = await checkServer(url, 4000);
    if (!s) throw new ActionError(`No School Theatre Manager server answered at ${url}. Check the address, and that the server is on.`);
    return withCompat(s);
  });
}

async function signOutHere() { (await cookies()).delete(COOKIE); }

/** Use the school's server from now on. Everyone signs in again with their school-server account. */
export async function connectAction(url: string) {
  return run(async () => {
    await mayChange();
    const s = await checkServer(url, 4000);
    if (!s) throw new ActionError("That server didn't answer. Check that it is on, then try again.");
    if (major(s.version) !== major(APP_VERSION)) throw new ActionError(`That server runs version ${s.version} and this computer has ${APP_VERSION}. Ask your IT team to update one of them so they match.`);
    writeNetConfig({ server: s.url, serverName: s.name });
    await signOutHere();
    return { name: s.name };
  });
}

/** Work on this computer's own records again. They were kept when the computer was connected. */
export async function workOfflineAction() {
  return run(async () => {
    if (where().kind === "fixed") throw new ActionError("This copy of the app always uses its own server.");
    // anyone may do this when the school's server can't be reached (nobody could sign in to it)
    const reachable = readNetConfig().server ? !!(await checkServer(readNetConfig().server!, 2500)) : false;
    if (reachable) await actionUser("director");
    writeNetConfig({ server: null, serverName: null });
    await signOutHere();
  });
}

/**
 * Copy this computer's records (and photos and files) to a new, empty school server, then connect
 * to it. The accounts come along too, so everyone signs in there as they do here.
 */
export async function copyToServerAction(url: string, username: string, password: string) {
  return run(async () => {
    if (where().kind !== "local") throw new ActionError("Work offline first: this copies the records kept on this computer.");
    await actionUser("director");
    const s = await checkServer(url, 4000);
    if (!s) throw new ActionError("That server didn't answer. Check that it is on, then try again.");
    if (major(s.version) !== major(APP_VERSION)) throw new ActionError(`That server runs version ${s.version} and this computer has ${APP_VERSION}. They need to match.`);
    // sign in to the school's server as one of its directors (on a brand-new server, these become its first director)
    const me0 = await actionUser("director");
    const fresh = await api<{ needed: boolean }>("/setup", { base: s.url, token: null }).then((r) => r.needed);
    let remote: Session;
    try {
      remote = fresh
        ? await api<Session>("/auth/setup", { base: s.url, token: null, json: { displayName: me0.displayName, username, password, confirm: password } })
        : await api<Session>("/auth/login", { base: s.url, token: null, json: { username, password, remember: false } });
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) throw new ActionError("That username and password don't match a director on the school's server.");
      if (e instanceof ApiFail && e.fieldErrors) throw new ActionError(Object.values(e.fieldErrors)[0] ?? e.message);
      throw e;
    }
    const me = await api<{ role: string }>("/auth/me", { base: s.url, token: remote.token });
    if (me.role !== "director") throw new ActionError("Sign in with a director account on the school's server.");
    // only into an empty server: copying replaces everything there
    const [dash, shows] = await Promise.all([
      api<{ stats: { records: number } }>("/dashboard", { base: s.url, token: remote.token }),
      api<unknown[]>("/shows", { base: s.url, token: remote.token }),
    ]);
    if (dash.stats.records > 0 || shows.length > 0) throw new ActionError("The school's server already has records, so nothing was copied (copying would replace them). Ask your IT team, or connect to it and use its records.");
    // a full backup here, sent straight into the school's server
    const { name } = await api<{ name: string }>("/backups", { json: { full: true } });
    const zip = await apiRaw(`/backups/${encodeURIComponent(name)}`);
    if (!zip.ok || !zip.body) throw new ActionError("The backup of this computer's records couldn't be read.");
    const r = await api<{ files: number }>("/backups/restore", { base: s.url, token: remote.token, body: zip.body, headers: { "x-confirm": "RESTORE", "content-type": "application/zip" } });
    writeNetConfig({ server: s.url, serverName: s.name });
    await signOutHere();
    return { name: s.name, files: r.files };
  });
}
