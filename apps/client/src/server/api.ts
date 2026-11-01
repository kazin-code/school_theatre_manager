import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { ApiErrorBody } from "@stm/server/types";

/**
 * The screens talk to the School Theatre Manager server for everything. Offline, that server runs
 * privately inside this program (see tools/start.cjs); on a school network it can be another
 * computer. STM_API_URL says where it is.
 */
export function apiBase(): string {
  const u = process.env.STM_API_URL;
  if (!u) throw new ApiFail(503, "The app's server isn't running. Close the app and open it again.");
  return u.replace(/\/+$/, "") + "/api/v1";
}

export const COOKIE = "stm_session";

/** An error from the server, worded for people. */
export class ApiFail extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>) { super(message); }
}

/** The signed-in person's session token (kept in an httpOnly cookie, sent to the server as a Bearer token). */
export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

type Opts = {
  method?: string;
  json?: unknown;
  form?: FormData;
  body?: BodyInit | ReadableStream;
  headers?: Record<string, string>;
  /** Defaults to the request's session cookie. Pass it in from cached functions, which can't read cookies. */
  token?: string | null;
};

const UNREACHABLE = "Can't reach the School Theatre Manager server. If it runs on another computer, check that it is on and connected to the school network.";

/** A request to the server, returning the raw response (for files and downloads). */
export async function apiRaw(path: string, o: Opts = {}): Promise<Response> {
  const token = o.token !== undefined ? o.token : await sessionToken();
  const headers: Record<string, string> = { ...o.headers };
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | ReadableStream | undefined = o.body;
  if (o.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(o.json); }
  else if (o.form) body = o.form;
  const init: RequestInit & { duplex?: "half" } = { method: o.method ?? (body !== undefined ? "POST" : "GET"), headers, body: body as BodyInit, cache: "no-store" };
  if (body instanceof ReadableStream) init.duplex = "half";
  try {
    return await fetch(apiBase() + path, init);
  } catch (e) {
    if (e instanceof ApiFail) throw e;
    throw new ApiFail(503, UNREACHABLE);
  }
}

/** A request to the server that answers with JSON. Errors become ApiFail with the server's message. */
export async function api<T = { ok: true }>(path: string, o: Opts = {}): Promise<T> {
  const r = await apiRaw(path, o);
  const j = (await r.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!r.ok) throw new ApiFail(r.status, j?.error ?? `The server couldn't do that (error ${r.status}).`, j?.fieldErrors);
  return j as T;
}

/**
 * Changes whenever anything changes on the server, from any computer. Cached reads include it in
 * their keys, so they never show stale data. Asked once per request.
 */
export const revision = cache(async (): Promise<string> => {
  try { return (await api<{ revision: string }>("/revision", { token: null })).revision; } catch { return String(Date.now()); }
});

/** What a cached read needs as arguments: who is asking and how fresh the data is. */
export const cacheKey = cache(async () => ({ token: (await sessionToken()) ?? "", rev: await revision() }));
