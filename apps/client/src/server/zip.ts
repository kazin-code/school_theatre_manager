import "server-only";
import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Minimal ZIP writer/reader (no dependencies) for backup archives. Writes to disk entry by
 * entry so big photo collections don't sit in memory. Archives must stay under 4 GB.
 */
const LIMIT = 0xffffffff;
function dosTime(d: Date) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
const STORE = /\.(jpe?g|png|gif|webp|zip|mp3|m4a|mp4|mov|pdf|docx|xlsx|pptx)$/i;

export class ZipWriter {
  private fd: number;
  private offset = 0;
  private central: Buffer[] = [];
  private count = 0;
  constructor(path: string) { this.fd = fs.openSync(/*turbopackIgnore: true*/ path, "w"); }
  private write(b: Buffer) { fs.writeSync(this.fd, b); this.offset += b.length; }
  add(name: string, data: Buffer, mtime = new Date()) {
    const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const deflate = !STORE.test(name) && data.length > 256;
    const body = deflate ? zlib.deflateRawSync(data, { level: 6 }) : data;
    const crc = zlib.crc32(data) >>> 0, { time, date } = dosTime(mtime), method = deflate ? 8 : 0;
    if (this.offset + body.length + 1024 > LIMIT) throw new Error("The backup is larger than 4 GB. Use the cloud backup folder instead, which copies files one by one.");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const at = this.offset;
    this.write(local); this.write(nameBuf); this.write(body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(at, 42);
    this.central.push(c, nameBuf); this.count++;
  }
  close() {
    const cd = Buffer.concat(this.central), at = this.offset;
    this.write(cd);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(this.count, 8); end.writeUInt16LE(this.count, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
    this.write(end);
    fs.closeSync(this.fd);
  }
}

export type ZipEntry = { name: string; size: number; read: () => Buffer };
/** List a zip's entries; each can be read on demand. */
export function readZip(path: string): { entries: ZipEntry[]; close: () => void } {
  const fd = fs.openSync(/*turbopackIgnore: true*/ path, "r");
  const size = fs.fstatSync(fd).size;
  const tailLen = Math.min(size, 22 + 65535), tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) { fs.closeSync(fd); throw new Error("That file isn't a backup made by School Theatre Manager (not a zip file)."); }
  const n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdAt = tail.readUInt32LE(e + 16);
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdAt);
  const entries: ZipEntry[] = [];
  for (let p = 0, k = 0; k < n; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("The backup file is damaged.");
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), local = cd.readUInt32LE(p + 42);
    const name = cd.toString("utf8", p + 46, p + 46 + nl);
    entries.push({ name, size: usize, read: () => {
      const h = Buffer.alloc(30); fs.readSync(fd, h, 0, 30, local);
      const start = local + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
      const body = Buffer.alloc(csize); fs.readSync(fd, body, 0, csize, start);
      return method === 8 ? zlib.inflateRawSync(body) : body;
    } });
    p += 46 + nl + xl + cl;
  }
  return { entries, close: () => fs.closeSync(fd) };
}
