import "server-only";
import dgram from "node:dgram";
import os from "node:os";
import { APP_ID, APP_VERSION, DEFAULT_PORT, DISCOVERY_PORT, SERVER_HOSTNAME } from "@/lib/version";
import { dataDir } from "./paths";
import { exists, pjoin, readText, writeFile } from "./fsx";

/**
 * School network ("intranet") mode. Every computer works offline on its own data by default.
 * One computer can be the school's server (network: true); other computers can find it on the
 * school network and connect (server: "http://…"). Nothing here uses the internet.
 */
export type NetConfig = { port: number; network: boolean; server: string | null };
const file = () => pjoin(dataDir(), "config.json");
export function readNetConfig(): NetConfig {
  let c: Partial<NetConfig> = {};
  try { if (exists(file())) c = JSON.parse(readText(file())); } catch {}
  return { port: Number(c.port) || DEFAULT_PORT, network: !!c.network, server: typeof c.server === "string" && c.server ? c.server : null };
}
export function writeNetConfig(patch: Partial<NetConfig>) {
  let raw: Record<string, unknown> = {};
  try { if (exists(file())) raw = JSON.parse(readText(file())); } catch {}
  writeFile(file(), JSON.stringify({ ...raw, ...readNetConfig(), ...patch }, null, 2));
}

export type ServerInfo = { app: string; version: string; name: string; school: string | null; url: string };

/** Turn what someone typed ("10.0.4.20", "school-theatre:8417", "http://…") into an address. */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    if (!u.port && u.protocol === "http:") u.port = String(DEFAULT_PORT);
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

/** Ask an address whether it's a School Theatre Manager server. */
export async function checkServer(url: string, timeoutMs = 2500): Promise<ServerInfo | null> {
  try {
    const r = await fetch(`${url}/api/server-info`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<ServerInfo>;
    if (j.app !== APP_ID) return null;
    return { app: j.app, version: String(j.version ?? ""), name: String(j.name ?? "School Theatre Manager"), school: j.school ?? null, url };
  } catch { return null; }
}

/** The addresses of this computer on the school network. */
export function localAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal);
}
function broadcastAddresses() {
  const out = new Set(["255.255.255.255"]);
  for (const a of localAddresses()) {
    const ip = a.address.split(".").map(Number), mask = a.netmask.split(".").map(Number);
    out.add(ip.map((p, i) => (p & mask[i]) | (~mask[i] & 255)).join("."));
  }
  return [...out];
}

/** Look for School Theatre Manager servers: a broadcast on the local network, plus the school-theatre network name. */
export async function discover(waitMs = 1800): Promise<ServerInfo[]> {
  const found = new Map<string, ServerInfo>();
  const replies = new Promise<void>((resolve) => {
    const sock = dgram.createSocket("udp4");
    const done = () => { try { sock.close(); } catch {} resolve(); };
    sock.on("error", done);
    sock.on("message", (msg, rinfo) => {
      try {
        const j = JSON.parse(msg.toString("utf8")) as Partial<ServerInfo> & { port?: number };
        if (j.app !== APP_ID) return;
        const url = `http://${rinfo.address}:${j.port ?? DEFAULT_PORT}`;
        found.set(url, { app: j.app, version: String(j.version ?? ""), name: String(j.name ?? ""), school: j.school ?? null, url });
      } catch {}
    });
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const probe = Buffer.from(JSON.stringify({ app: APP_ID, ask: "where" }));
      for (const b of broadcastAddresses()) sock.send(probe, DISCOVERY_PORT, b, () => {});
      setTimeout(done, waitMs);
    });
  });
  const byName = checkServer(normalizeUrl(SERVER_HOSTNAME)!, waitMs).then((s) => { if (s && ![...found.values()].some((f) => f.name === s.name && f.school === s.school)) found.set(s.url, s); });
  await Promise.all([replies, byName]);
  // confirm each answer over HTTP (the address must actually serve the app)
  const checked = await Promise.all([...found.values()].map(async (f) => ((await checkServer(f.url)) ? f : null)));
  return checked.filter((x): x is ServerInfo => !!x);
}

const g = globalThis as unknown as { __stmResponder?: dgram.Socket };
/** On the school's server: answer "where are you?" from other computers. */
export function startDiscoveryResponder(info: () => { name: string; school: string | null }) {
  if (g.__stmResponder) return;
  const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
  sock.on("error", (e) => { console.error("school network discovery unavailable:", e.message); try { sock.close(); } catch {} g.__stmResponder = undefined; });
  sock.on("message", (msg, rinfo) => {
    try {
      const q = JSON.parse(msg.toString("utf8"));
      if (q.app !== APP_ID || q.ask !== "where") return;
      const i = info();
      sock.send(Buffer.from(JSON.stringify({ app: APP_ID, version: APP_VERSION, name: i.name, school: i.school, port: Number(process.env.PORT) || DEFAULT_PORT })), rinfo.port, rinfo.address);
    } catch {}
  });
  sock.bind(DISCOVERY_PORT, () => console.log(`School network: answering on UDP ${DISCOVERY_PORT}`));
  sock.unref();
  g.__stmResponder = sock;
}
