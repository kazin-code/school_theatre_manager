/* eslint-disable @typescript-eslint/no-require-imports */
// Starts the app server for the Windows launcher: writes its output to <data>\logs\server.log
// and its process id to <data>\server.pid, so the launcher can find and stop it.
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
process.on("uncaughtException", (e) => { out.write(`${(e && e.stack) || e}\n`, () => process.exit(1)); });
process.on("exit", () => { try { if (fs.readFileSync(path.join(data, "server.pid"), "utf8") === String(process.pid)) fs.unlinkSync(path.join(data, "server.pid")); } catch {} });
require("./server.js");
