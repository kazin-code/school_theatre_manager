/* eslint-disable @typescript-eslint/no-require-imports */
// Starts the program for the Windows launcher: the private server (data, files, backups) on a free
// port that only this computer can reach, then the screens (Next.js) that talk to it. Output goes to
// <data>\logs\server.log and the process id to <data>\server.pid, so the launcher can find and stop it.
// If STM_API_URL is already set (a school server), only the screens start.
const fs = require("fs");
const path = require("path");
const data = process.env.STM_DATA_DIR;
const logs = path.join(data, "logs");
fs.mkdirSync(logs, { recursive: true });
const file = path.join(logs, "server.log");
try { if (fs.statSync(file).size > 5e6) fs.renameSync(file, file + ".1"); } catch {}
const out = fs.createWriteStream(file, { flags: "a" });
for (const s of [process.stdout, process.stderr]) s.write = (chunk, enc, cb) => out.write(chunk, enc, cb);
out.write(`\n--- started ${new Date().toISOString()} (pid ${process.pid}) ---\n`);
fs.writeFileSync(path.join(data, "server.pid"), String(process.pid));
const fail = (e) => { out.write(`${(e && e.stack) || e}\n`, () => process.exit(1)); };
process.on("uncaughtException", fail);
process.on("exit", () => { try { if (fs.readFileSync(path.join(data, "server.pid"), "utf8") === String(process.pid)) fs.unlinkSync(path.join(data, "server.pid")); } catch {} });

(async () => {
  if (!process.env.STM_API_URL) {
    // a worker thread: its own globals, the same process (stopping the program stops it too)
    const { Worker } = require("worker_threads");
    const w = new Worker(path.join(__dirname, "server", "server.cjs"), { workerData: { stmEmbedded: true, overrides: { host: "127.0.0.1", port: 0 } } });
    w.on("error", fail);
    w.on("exit", (code) => fail(new Error(`The private server stopped (code ${code}).`)));
    process.env.STM_API_URL = await new Promise((resolve) => w.once("message", (m) => resolve(m.url)));
  }
  // the screens live in apps/client inside the packed folder (the repository layout is kept)
  require(path.join(__dirname, "apps", "client", "server.js"));
})().catch(fail);
