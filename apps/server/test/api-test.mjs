// End-to-end test of the server API: runs a small school year against a running server.
//   node apps/server/test/api-test.mjs http://127.0.0.1:8417
// Works the same against SQLite and PostgreSQL. Exits non-zero on the first failure.
import assert from "node:assert/strict";
import zlib from "node:zlib";

const BASE = (process.argv[2] || "http://127.0.0.1:8417") + "/api/v1";
let token = null;
const step = (name) => console.log("•", name);
async function call(method, path, body, opts = {}) {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) };
  let payload;
  if (body instanceof FormData || body instanceof Uint8Array) payload = body;
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  const type = r.headers.get("content-type") || "";
  const data = type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
  if (opts.expect !== undefined) { assert.equal(r.status, opts.expect, `${method} ${path}: expected ${opts.expect}, got ${r.status} ${JSON.stringify(data).slice(0, 300)}`); return data; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
// a tiny valid PNG (1x1)
function png() {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 200, 30, 30, 255]))), chunk("IEND", Buffer.alloc(0))]);
}
const pic = (name) => new File([png()], name, { type: "image/png" });

step("ping and first-run state");
const ping = await call("GET", "/ping"); assert.equal(ping.app, "school-theatre-manager");
const info = await call("GET", "/server-info"); console.log("  database:", info.database);
assert.equal((await call("GET", "/setup")).needed, true);
await call("GET", "/items", undefined, { expect: 401 });

step("director setup, weak password refused");
await call("POST", "/auth/setup", { displayName: "Ms. Rivera", username: "director", password: "weak", confirm: "weak" }, { expect: 400 });
token = (await call("POST", "/auth/setup", { displayName: "Ms. Rivera", username: "director", password: "Curtain2026!", confirm: "Curtain2026!" })).token;
assert.ok(token);
await call("POST", "/auth/setup", { displayName: "x", username: "again", password: "Curtain2026!", confirm: "Curtain2026!" }, { expect: 409 });
assert.equal((await call("GET", "/auth/me")).role, "director");

step("branding, logo, lists");
await call("PUT", "/branding", { school: "Test High School", program: "Test Theatre", short: "THS", tagline: "Break a leg", accent: "#0d2c6c" });
assert.equal((await call("GET", "/branding")).name, "Test Theatre");
let fd = new FormData(); fd.append("logo", pic("logo.png")); fd.append("icon", pic("icon.png"));
await call("POST", "/branding/logo", fd);
assert.ok((await call("GET", "/branding/logo")).length > 50);
const lists = await call("GET", "/lists"); assert.ok(lists.category.length > 5);
await call("PUT", "/lists/location", { values: ["Costume loft", "Prop room", "Costume loft"] });
assert.deepEqual((await call("GET", "/lists")).location, ["Costume loft", "Prop room"]);

step("users and roles");
await call("POST", "/users", { displayName: "Jordan", username: "jordan", role: "assistant", password: "Stage#2026" });
const users = await call("GET", "/users"); assert.equal(users.length, 2);

step("inventory: add, tag numbering, duplicate tag, photos, condition");
const gown = await call("POST", "/items", { name: "Blue Victorian ball gown", category: "Costume", era: "Victorian", size: "M", chest: "36", quantity: 1, condition: 4, status: "active", rentable: true, replacementValue: "250" });
const chair = await call("POST", "/items", { name: "Oak dining chair", category: "Furniture", quantity: 6, condition: 4, status: "active", rentable: true });
const gownItem = await call("GET", `/items/${gown.id}`); assert.equal(gownItem.item.tag, "COS-0001");
await call("POST", "/items", { name: "Dup", tag: "COS-0001", quantity: 1, condition: 4, status: "active", rentable: true }, { expect: 409 });
await call("POST", "/items", { name: "", quantity: 1, condition: 4, status: "active", rentable: true }, { expect: 400 });
fd = new FormData(); fd.append("photo", pic("front.png")); fd.append("photo", pic("back.png"));
await call("POST", `/items/${gown.id}/photos`, fd);
let d = await call("GET", `/items/${gown.id}`); assert.equal(d.photos.length, 2); assert.equal(d.item.mainPhoto, d.photos[0].file);
await call("PATCH", `/item-photos/${d.photos[1].id}`, { main: true, caption: "Back view" });
d = await call("GET", `/items/${gown.id}`); assert.equal(d.item.mainPhoto, d.photos[0].file); assert.equal(d.photos[0].caption, "Back view");
assert.ok((await call("GET", `/files/photos/${d.item.mainPhoto}`)).length > 50);
await call("GET", "/files/photos/..%2F..%2Ftheatre.db", undefined, { expect: 404 });
await call("POST", `/items/${gown.id}/condition`, { condition: 2, status: "active", notes: "Torn hem" });
const listRows = await call("GET", "/items"); assert.equal(listRows.length, 2);
const chairRow = listRows.find((r) => r.id === chair.id); assert.equal(chairRow.quantity, 6); assert.equal(chairRow.rentOut, 0); assert.equal(typeof chairRow.photoCount, "number");

step("assistant permissions");
const director = token;
token = (await call("POST", "/auth/login", { username: "jordan", password: "Stage#2026", remember: false })).token;
await call("GET", "/items", undefined, { expect: 403 }); // must choose a new password first
await call("POST", "/auth/password", { current: "Stage#2026", next: "Spotlight#2027", confirm: "Spotlight#2027" });
await call("GET", "/items");
await call("DELETE", `/items/${chair.id}`, undefined, { expect: 403 });
await call("GET", "/users", undefined, { expect: 403 });
token = director;
await call("POST", "/auth/login", { username: "director", password: "wrong", remember: false }, { expect: 401 });

step("shows: create, people, paste import, numbers, cover, materials");
const show = await call("POST", "/shows", { title: "Cinderella", type: "Musical", season: "Spring", year: 2027, director: "Ms. Rivera", status: "planning", musicBy: "Richard Rodgers", lyricsBy: "Oscar Hammerstein II", openDate: "2027-03-12", closeDate: "2027-03-14" });
assert.equal((await call("POST", `/shows/${show.id}/people/import`, { kind: "cast", text: "Maya Lopez, Cinderella, Soprano\nEli Park - The Prince" })).count, 2);
await call("POST", `/shows/${show.id}/numbers`, { act: "1", number: "1", title: "In My Own Little Corner", singers: "Cinderella" });
await call("POST", `/shows/${show.id}/numbers`, { act: "1", number: "2", title: "Ten Minutes Ago" });
fd = new FormData(); fd.append("cover", pic("cover.png")); await call("POST", `/shows/${show.id}/cover`, fd);
fd = new FormData(); fd.append("kind", "material"); fd.append("category", "Script"); fd.append("file", new File([Buffer.from("%PDF-1.4\n%%EOF")], "Script.pdf", { type: "application/pdf" }));
await call("POST", `/shows/${show.id}/files`, fd);
fd = new FormData(); fd.append("kind", "material"); fd.append("file", new File(["x"], "virus.exe"));
await call("POST", `/shows/${show.id}/files`, fd, { expect: 400 });
let sd = await call("GET", `/shows/${show.id}`);
assert.equal(sd.people.length, 3); assert.equal(sd.numbers.length, 2); assert.equal(sd.files.length, 1); assert.ok(sd.show.cover); assert.equal(sd.show.castCount, 2);
const nums = sd.numbers.map((n) => n.id).reverse();
await call("PUT", `/shows/${show.id}/order`, { what: "numbers", ids: nums });
sd = await call("GET", `/shows/${show.id}`); assert.equal(sd.numbers[0].title, "Ten Minutes Ago");

step("checkout, availability, returns, past show");
await call("POST", `/shows/${show.id}/checkout`, { dateOut: "2027-02-01", lines: [{ itemId: chair.id, qty: 7 }] }, { expect: 400 });
const co = await call("POST", `/shows/${show.id}/checkout`, { dateOut: "2027-02-01", lines: [{ itemId: gown.id, qty: 1, character: "Cinderella", actor: "Maya Lopez" }, { itemId: chair.id, qty: 4 }] });
assert.deepEqual(co.ids.sort(), [gown.id, chair.id].sort());
assert.equal((await call("GET", `/shows/${show.id}`)).show.status, "production");
assert.equal((await call("GET", "/items")).find((r) => r.id === chair.id).showOut, 4);
await call("POST", `/shows/${show.id}/checkout`, { dateOut: "2027-02-01", lines: [{ itemId: chair.id, qty: 3 }] }, { expect: 400 });
sd = await call("GET", `/shows/${show.id}`);
const gownLine = sd.lines.find((l) => l.item.id === gown.id);
await call("POST", `/shows/${show.id}/returns`, { dateReturned: "2027-03-20", lines: [{ id: gownLine.line.id, conditionIn: 1, notesIn: "Zipper broke", sendToRepair: true }] });
assert.equal((await call("GET", `/items/${gown.id}`)).item.status, "repair");
await call("PUT", `/shows/${show.id}/status`, { status: "past" }, { expect: 400 });
await call("PUT", `/shows/${show.id}/status`, { status: "past", returnAll: true });
assert.equal((await call("GET", "/items")).find((r) => r.id === chair.id).showOut, 0);
const usage = (await call("GET", "/items")).find((r) => r.id === gown.id);
assert.equal(usage.showCount, 1); assert.ok(usage.showTitles.includes("Cinderella")); assert.equal(usage.showIds, String(show.id));

step("program save and copy");
const doc = { v: 2, size: "half", style: "classic", paper: "white", border: "none", accent: "", pageNumbers: true, pages: [{ id: "p1", name: "Cover", blocks: [{ id: "b1", type: "heading", text: "Cinderella", size: 5, align: "center", color: "ink", font: "display" }, { id: "b2", type: "text", html: "<b>Hi</b><script>x</script>", size: 2, align: "left", color: "ink" }] }] };
await call("PUT", `/shows/${show.id}/program`, { doc });
const prog = await call("GET", `/shows/${show.id}/program`);
assert.equal(prog.doc.pages[0].blocks[1].html, "<b>Hi</b>x");
assert.equal((await call("GET", `/shows/${show.id}`)).hasProgram, true);
await call("PUT", `/shows/${show.id}/program`, { doc: { ...doc, pages: [] } }, { expect: 400 });

step("renters, rentals, rating");
const renter = await call("POST", "/renters", { name: "Riverside Middle School", email: "drama@riverside.org", approved: true });
await call("POST", "/renters", { name: "Bad Email", email: "nope", approved: true }, { expect: 400 });
const unapproved = await call("POST", "/renters", { name: "Not Yet", approved: false });
await call("POST", "/rentals", { renterId: unapproved.id, dateOut: "2027-04-01", lines: [{ itemId: chair.id, qty: 1, conditionOut: 4 }] }, { expect: 400 });
await call("POST", "/rentals", { renterId: renter.id, dateOut: "2027-04-01", lines: [{ itemId: gown.id, qty: 1, conditionOut: 1 }] }, { expect: 400 }); // in repair
const rental = await call("POST", "/rentals", { renterId: renter.id, purpose: "Spring play", dateOut: "2027-04-01", dateDue: "2027-04-15", fee: "40", deposit: "100", lines: [{ itemId: chair.id, qty: 2, conditionOut: 4 }] });
assert.equal((await call("GET", "/items")).find((r) => r.id === chair.id).rentOut, 2);
const rd = await call("GET", `/rentals/${rental.id}`);
await call("POST", `/rentals/${rental.id}/return`, { dateReturned: "2027-04-14", rating: 4, ratingNotes: "Careful", depositReturned: true, lines: [{ id: rd.lines[0].line.id, conditionIn: 3, notesIn: "Scuffed", damageCharge: "15", sendToRepair: false }] });
const renters = await call("GET", "/renters"); const rr = renters.find((r) => r.id === renter.id);
assert.equal(rr.avgRating, 4); assert.equal(rr.rentalCount, 1); assert.equal(rr.damage, 15);
const rl = await call("GET", "/rentals"); assert.equal(rl[0].status, "returned"); assert.ok(rl[0].summary.includes("Oak dining chair"));
await call("DELETE", `/renters/${renter.id}`, undefined, { expect: 400 });

step("sponsors with logo");
fd = new FormData(); fd.append("data", JSON.stringify({ name: "Main Street Bakery", tier: "Producer", adSize: "Half page", amount: "150", active: true })); fd.append("logo", pic("bakery.png"));
const sp = await call("POST", "/sponsors", fd);
let spl = await call("GET", "/sponsors"); assert.equal(spl.length, 1); assert.ok(spl[0].logo);
fd = new FormData(); fd.append("data", JSON.stringify({ name: "Main Street Bakery", tier: "Producer", adSize: "Half page", amount: "175", active: false })); fd.append("removeLogo", "1");
await call("PUT", `/sponsors/${sp.id}`, fd);
spl = await call("GET", "/sponsors"); assert.equal(spl[0].logo, null); assert.equal(spl[0].amount, 175);

step("dashboard, activity, exports");
const dash = await call("GET", "/dashboard"); assert.equal(dash.stats.records, 2); assert.equal(dash.stats.pieces, 7); assert.equal(dash.stats.repair, 1);
const act = await call("GET", "/activity?limit=5"); assert.equal(act.length, 5);
for (const w of ["items", "show-items", "shows", "rentals", "renters", "sponsors", "activity"]) {
  const csv = (await call("GET", `/exports/${w}`)).toString("utf8"); assert.ok(csv.split("\r\n").length >= 2, `export ${w}`);
}

step("full backup, change, restore");
const bk = await call("POST", "/backups", { full: true });
const zip = await call("GET", `/backups/${bk.name}`); assert.ok(zip.length > 500);
const temp = await call("POST", "/items", { name: "Temporary hat", quantity: 1, condition: 4, status: "active", rentable: true });
await call("POST", "/backups/restore", new Uint8Array(zip), { headers: { "x-confirm": "nope" }, expect: 400 });
const res = await call("POST", "/backups/restore", new Uint8Array(zip), { headers: { "x-confirm": "RESTORE" } });
assert.ok(res.files >= 4);
// a restore may sign people out (sessions aren't kept in backups); sign in again if so
if ((await fetch(BASE + "/auth/me", { headers: { authorization: `Bearer ${token}` } })).status === 401)
  token = (await call("POST", "/auth/login", { username: "director", password: "Curtain2026!", remember: false })).token;
const after = await call("GET", "/items"); assert.equal(after.length, 2); assert.ok(!after.some((r) => r.id === temp.id));
const again = await call("POST", "/items", { name: "After restore", quantity: 1, condition: 4, status: "active", rentable: true });
assert.ok(again.id > gown.id && again.id > chair.id, "ids continue after a restore");

step("delete a cancelled show");
const cancelled = await call("POST", "/shows", { title: "Cancelled Show", type: "Play", status: "planning" });
await call("POST", `/shows/${cancelled.id}/delete`, { title: "wrong" }, { expect: 400 });
await call("POST", `/shows/${cancelled.id}/delete`, { title: "cancelled show" });
await call("GET", `/shows/${cancelled.id}`, undefined, { expect: 404 });

step("sign out");
await call("POST", "/auth/logout");
await call("GET", "/items", undefined, { expect: 401 });
console.log("\nAll API checks passed on", info.database);
