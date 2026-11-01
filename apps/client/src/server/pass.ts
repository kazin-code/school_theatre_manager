import "server-only";
import { apiRaw, ApiFail } from "./api";

const KEEP = ["content-type", "content-length", "content-disposition", "cache-control", "x-content-type-options"];

/** Hand a file or download from the server to the browser as it streams in. */
export async function passThrough(path: string, init: Parameters<typeof apiRaw>[1] = {}): Promise<Response> {
  let r: Response;
  try { r = await apiRaw(path, init); } catch (e) {
    return new Response(e instanceof ApiFail ? e.message : "The server couldn't be reached.", { status: 503 });
  }
  const headers = new Headers();
  for (const h of KEEP) { const v = r.headers.get(h); if (v) headers.set(h, v); }
  return new Response(r.body, { status: r.status, headers });
}
