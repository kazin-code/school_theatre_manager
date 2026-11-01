/** On the school's server: answer "where are you?" broadcasts (UDP 8418) from classroom computers. */
import dgram from "node:dgram";
import { APP_ID, APP_VERSION, DISCOVERY_PORT } from "@stm/core/version";

export function startDiscoveryResponder(port: number, info: () => Promise<{ name: string; school: string | null }>) {
  const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
  sock.on("error", (e) => { console.error(`School network search can't answer on UDP ${DISCOVERY_PORT}: ${e.message}`); try { sock.close(); } catch {} });
  sock.on("message", async (msg, rinfo) => {
    try {
      const q = JSON.parse(msg.toString("utf8"));
      if (q.app !== APP_ID || q.ask !== "where") return;
      const i = await info();
      sock.send(Buffer.from(JSON.stringify({ app: APP_ID, version: APP_VERSION, name: i.name, school: i.school, port })), rinfo.port, rinfo.address);
    } catch {}
  });
  sock.bind(DISCOVERY_PORT, () => console.log(`School network search: answering on UDP ${DISCOVERY_PORT}`));
  sock.unref();
  return sock;
}
