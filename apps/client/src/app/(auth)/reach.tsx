import { api, ApiFail, where } from "@/server/api";
import { readNetConfig } from "@/server/network";
import { Unreachable } from "@/components/app/unreachable";

/** Before the sign-in screens: if the server doesn't answer, say so plainly instead of failing. */
export async function reachOrExplain() {
  try {
    await api("/ping", { token: null, timeoutMs: 4000 });
    return null;
  } catch (e) {
    if (!(e instanceof ApiFail) || e.status !== 503) throw e;
    const w = where();
    return <Unreachable school={w.kind === "school"} name={w.kind === "school" ? readNetConfig().serverName : null} url={w.url} />;
  }
}
