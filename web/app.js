"use strict";
/* AHS Theatre Inventory — browser interface. Talks to the local server at /api. */

// ---------- tiny templating ----------
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const out = (v) => v == null || v === false ? "" : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(out).join("") : esc(v);
const h = (str, ...vals) => new Safe(str.reduce((a, s, i) => a + s + (i < vals.length ? out(vals[i]) : ""), ""));
const raw = (s) => new Safe(s);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- icons ----------
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 2 5 4.9"/>',
  swap: '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
  mask: '<path d="M4 4c3 1.3 6 1.3 9 0v6c0 4-2 7-4.5 7S4 14 4 10z"/><path d="M13 9c2.4.9 4.7.9 7 0v5c0 3.6-1.8 6-4 6-1.4 0-2.6-1-3.3-2.6"/><path d="M6.5 8.5h1.2M9.4 8.5h1.2M7 12.5c.9.8 2 .8 3 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M6 14h12v7H6z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  hanger: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v1.5L3 15h18l-9-6.5"/><path d="M3 15v2h18v-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
};
const icon = (n) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`);

// ---------- state ----------
const S = { me: null, lists: {}, configured: {}, shows: [], pull: loadPull(), staged: null };
function loadPull() { try { return JSON.parse(localStorage.getItem("ati_pull") || "[]"); } catch { return []; } }
function savePull() { try { localStorage.setItem("ati_pull", JSON.stringify(S.pull)); } catch {} updatePullBadge(); }
const isDirector = () => S.me && S.me.role === "director";

// ---------- api ----------
class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
async function api(method, url, data) {
  const opt = { method, headers: { "X-ATI": "1" }, credentials: "same-origin" };
  if (data instanceof FormData) opt.body = data;
  else if (data !== undefined) { opt.body = JSON.stringify(data); opt.headers["Content-Type"] = "application/json"; }
  let res;
  try { res = await fetch(url, opt); } catch { throw new ApiError("The inventory program isn't running. Open it from the desktop shortcut, then try again.", 0); }
  let body = null;
  try { body = await res.json(); } catch {}
  if (res.status === 401 && !url.startsWith("/api/login")) { S.me = null; renderLogin(); throw new ApiError("Please sign in.", 401); }
  if (res.status === 428) { renderMustChange(); throw new ApiError("Choose a new password first.", 428); }
  if (!res.ok) throw new ApiError((body && body.error) || `Request failed (${res.status}).`, res.status);
  return body;
}
const GET = (u) => api("GET", u);
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== "" && v != null && v !== false) p.set(k, v === true ? "1" : v); const s = p.toString(); return s ? "?" + s : ""; };

// ---------- formatting ----------
const COND = { 5: "Excellent", 4: "Good", 3: "Fair", 2: "Poor", 1: "Needs repair" };
const condBadge = (c) => c ? h`<span class="cond" data-c="${c}"><span class="pips"><i></i><i></i><i></i><i></i><i></i></span>${COND[c]}</span>` : h`<span class="muted">—</span>`;
const condOptions = (val, blank) => [blank ? h`<option value="">${blank}</option>` : "", ...[5, 4, 3, 2, 1].map((c) => h`<option value="${c}" ${+val === c ? raw("selected") : ""}>${c} · ${COND[c]}</option>`)];
const stars = (n, count) => {
  if (n == null) return h`<span class="muted small">Not rated yet</span>`;
  const r = Math.round(n);
  return h`<span class="stars" title="${(+n).toFixed(1)} of 5">${"★".repeat(r)}<span class="off">${"★".repeat(5 - r)}</span></span> <span class="small num">${(+n).toFixed(1)}${count != null ? h`<span class="muted"> (${count})</span>` : ""}</span>`;
};
const money = (v) => v == null || v === "" ? "—" : "$" + (+v).toFixed(2).replace(/\.00$/, "");
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(String(d).slice(0, 10) + "T12:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const fmtWhen = (d) => {
  if (!d) return "";
  const dt = new Date(String(d).replace(" ", "T"));
  if (isNaN(dt)) return d;
  const today = new Date().toDateString() === dt.toDateString();
  return today ? dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const STATUS = { active: ["In stock", "good"], repair: ["In repair", "warn"], retired: ["Retired", "mute"], lost: ["Lost", "bad"] };
function availPill(it) {
  if (it.status !== "active") { const [t, c] = STATUS[it.status] || [it.status, "mute"]; return h`<span class="pill ${c}">${t}</span>`; }
  const free = it.quantity - it.rent_out - it.show_out;
  if (free <= 0) return h`<span class="pill bad">${it.rent_out ? "Rented out" : "In a show"}</span>`;
  if (free < it.quantity) return h`<span class="pill warn num">${free} of ${it.quantity} free</span>`;
  return h`<span class="pill good">${it.quantity > 1 ? `All ${it.quantity} available` : "Available"}</span>`;
}
const photoURL = (p) => p ? "/photos/" + encodeURIComponent(p) : "";
const thumb = (p) => p ? h`<img class="thumb" src="${photoURL(p)}" alt="" loading="lazy">` : h`<span class="thumb ph">${icon("hanger")}</span>`;
const tag = (t) => t ? h`<span class="tag">${t}</span>` : "";
const showLabel = (s) => [s.season, s.year].filter(Boolean).join(" ");
const SHOWSTATUS = { planning: ["Planning", "info"], "in production": ["In production", "warn"], closed: ["Closed", "mute"] };
const showPill = (st) => { const [t, c] = SHOWSTATUS[st] || [st, "mute"]; return h`<span class="pill ${c}">${t}</span>`; };

// ---------- toast & modal ----------
let toastT;
function toast(msg, err) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (err ? " err" : "");
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = ""), err ? 5000 : 2600);
}
function modal({ title, body, ok = "Save", okClass = "primary", onOk, wide }) {
  const root = $("#modal-root");
  root.innerHTML = h`<div class="modal-bg"><form class="modal" ${wide ? raw('style="width:min(820px,100%)"') : ""} novalidate>
    <header><h2>${title}</h2></header><div class="mb"><div class="errbox" hidden></div>${body}</div>
    <footer><button type="button" class="btn ghost" data-close>Cancel</button>${ok ? h`<button class="btn ${okClass}">${ok}</button>` : ""}</footer></form></div>`.s;
  const form = $(".modal", root);
  const close = () => (root.innerHTML = "");
  $("[data-close]", root).onclick = close;
  $(".modal-bg", root).addEventListener("mousedown", (e) => { if (e.target.classList.contains("modal-bg")) close(); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("footer .btn:last-child", form); btn.disabled = true;
    try { await onOk(form); close(); } catch (err) { const eb = $(".errbox", form); eb.textContent = err.message; eb.hidden = false; } finally { btn.disabled = false; }
  };
  const first = $("input:not([type=hidden]),select,textarea", form); if (first) first.focus();
  return form;
}
const confirmBox = (title, text, ok, fn) => modal({ title, body: h`<p>${text}</p>`, ok, okClass: "primary", onOk: fn });

// ---------- form helpers ----------
const NUMERIC = new Set(["quantity", "condition", "chest", "waist", "hips", "inseam", "neck", "sleeve", "head", "cost", "replacement_value", "rental_rate", "fee", "deposit", "year", "renter_id", "rating", "damage_charge", "qty"]);
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (NUMERIC.has(el.name)) o[el.name] = el.value === "" ? null : Number(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
const val = (o, k) => (o && o[k] != null ? o[k] : "");
function fld(label, input, cls = "", hint = "") { return h`<div class="${cls}"><label>${label}</label>${input}${hint ? h`<div class="hint">${hint}</div>` : ""}</div>`; }
const inp = (name, o, attrs = "") => h`<input type="text" id="f-${name}" name="${name}" value="${val(o, name)}" ${raw(attrs)}>`;
const numInp = (name, o, step = "any", attrs = "") => h`<input type="number" id="f-${name}" name="${name}" step="${step}" min="0" value="${val(o, name)}" ${raw(attrs)}>`;
const dateInp = (name, v) => h`<input type="date" id="f-${name}" name="${name}" value="${v || ""}">`;
const listInp = (name, o, list) => h`<input type="text" id="f-${name}" name="${name}" list="dl-${list || name}" value="${val(o, name)}" autocomplete="off">`;
const area = (name, o, rows = 3) => h`<textarea id="f-${name}" name="${name}" rows="${rows}">${val(o, name)}</textarea>`;
const sel = (name, options, cur, blank) => h`<select id="f-${name}" name="${name}">${blank != null ? h`<option value="">${blank}</option>` : ""}${options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h`<option value="${v}" ${String(cur ?? "") === String(v) ? raw("selected") : ""}>${t}</option>`; })}</select>`;
const datalists = () => Object.entries(S.lists).map(([k, vals]) => h`<datalist id="dl-${k}">${vals.map((v) => h`<option value="${v}">`)}</datalist>`);

// ---------- shell ----------
const NAV = [
  ["dashboard", "Dashboard", "home"], ["items", "Inventory", "box"], ["shows", "Shows", "mask"], ["rentals", "Rentals", "swap"], ["renters", "Renters", "users"],
  null, ["pull", "Pull list", "list"], ["activity", "Activity log", "clock"], ["settings", "Settings", "gear"],
];
function shell(active, content) {
  const pullN = S.pull.length;
  $("#app").innerHTML = h`<div class="shell">
    <aside class="side no-print">
      <div class="brand"><img src="logo.png" alt="AHS Theatre"><div><b>AHS Theatre</b><span>Inventory</span></div></div>
      <nav class="nav">${NAV.map((n) => n ? h`<a href="#/${n[0]}" class="${active === n[0] ? "on" : ""}">${icon(n[2])}${n[1]}${n[0] === "pull" ? h`<span class="badge" id="pullbadge" ${pullN ? "" : raw("hidden")}>${pullN}</span>` : ""}${n[0] === "rentals" && S.overdue ? h`<span class="badge">${S.overdue} late</span>` : ""}</a>` : h`<div class="sep"></div>`)}</nav>
      <div class="who"><div><b>${S.me.display_name || S.me.username}</b>${S.me.role === "director" ? "Director" : "Assistant"}</div><button id="signout">Sign out</button></div>
    </aside>
    <main class="main" id="main">${content}</main>
    ${datalists()}
  </div>`.s;
  $("#signout").onclick = async () => { await api("POST", "/api/logout").catch(() => {}); S.me = null; renderLogin(); };
  window.scrollTo(0, 0);
}
function updatePullBadge() { const b = $("#pullbadge"); if (b) { b.textContent = S.pull.length; b.hidden = !S.pull.length; } }
const page = (eyebrow, title, actions = "", crumb = "") => h`${crumb ? h`<div class="crumb no-print">${crumb}</div>` : ""}<div class="pagehead"><div>${eyebrow ? h`<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1></div><div class="actions no-print">${actions}</div></div>`;
const loading = () => h`<p class="muted">Loading…</p>`;

function addToPull(it, qty = 1) {
  const ex = S.pull.find((p) => p.id === it.id);
  if (ex) { toast(`${it.name} is already on the pull list`); return; }
  S.pull.push({ id: it.id, tag: it.tag, name: it.name, category: it.category, size: it.size, photo: it.photo, qty, max: it.quantity });
  savePull(); toast(`Added ${it.name} to the pull list`);
}

// ---------- auth screens ----------
function authFrame(inner) {
  $("#app").innerHTML = h`<div class="login"><div class="curtain"><img src="logo.png" alt="AHS Theatre logo"><h1>AHS Theatre Inventory</h1><p>Costumes, props, furniture and set pieces: what we own, where it is, and every show it has been in.</p></div>${inner}</div>`.s;
}
async function renderLogin() {
  let setup = false;
  try { setup = (await GET("/api/setup")).needs_setup; } catch {}
  if (setup) return renderSetup();
  authFrame(h`<form id="loginf" novalidate>
    <div><h2>Sign in</h2><p class="muted small">Use the director or assistant account set up for this computer.</p></div>
    <div class="errbox" hidden></div>
    ${fld("Username", h`<input type="text" id="lu" name="username" autocomplete="username" autofocus>`)}
    ${fld("Password", h`<input type="password" id="lp" name="password" autocomplete="current-password">`)}
    <label class="check"><input type="checkbox" name="remember" id="lr"> Keep me signed in on this computer for 30 days</label>
    <button class="btn primary" style="justify-content:center;padding:10px">Sign in</button>
    <p class="muted small">Forgot the director password? A Windows administrator can run <b>Reset Director Password</b> from the Start menu.</p>
  </form>`);
  const f = $("#loginf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api("POST", "/api/login", formData(f)); await boot(); }
    catch (err) { const eb = $(".errbox", f); eb.textContent = err.message; eb.hidden = false; $("#lp").select(); }
  };
}
function renderSetup() {
  authFrame(h`<form id="setupf" novalidate>
    <div><h2>Create the director account</h2><p class="muted small">This account owns the inventory. It can add other users, change settings and restore backups.</p></div>
    <div class="errbox" hidden></div>
    ${fld("Your name", h`<input type="text" name="display_name" id="sd" placeholder="e.g. Ms. Rivera">`)}
    ${fld("Username", h`<input type="text" name="username" id="su" autocomplete="username">`, "", "Letters, numbers, dots or dashes.")}
    ${fld("Password", h`<input type="password" name="password" id="sp" autocomplete="new-password">`, "", "At least 8 characters.")}
    ${fld("Confirm password", h`<input type="password" name="confirm" id="sc" autocomplete="new-password">`)}
    <button class="btn primary" style="justify-content:center;padding:10px">Create account</button>
  </form>`);
  const f = $("#setupf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    if (d.password !== d.confirm) { eb.textContent = "The two passwords don't match."; eb.hidden = false; return; }
    try { await api("POST", "/api/setup", d); await boot(); } catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
}
function renderMustChange() {
  authFrame(h`<form id="mcf" novalidate>
    <div><h2>Choose a new password</h2><p class="muted small">You're signed in with a temporary password. Pick one only you know.</p></div>
    <div class="errbox" hidden></div>
    ${fld("Temporary password", h`<input type="password" name="current" id="mc0" autocomplete="current-password">`)}
    ${fld("New password", h`<input type="password" name="new" id="mc1" autocomplete="new-password">`, "", "At least 8 characters.")}
    ${fld("Confirm new password", h`<input type="password" name="confirm" id="mc2" autocomplete="new-password">`)}
    <button class="btn primary" style="justify-content:center;padding:10px">Save password</button>
  </form>`);
  const f = $("#mcf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    if (d.new !== d.confirm) { eb.textContent = "The two passwords don't match."; eb.hidden = false; return; }
    try { await api("POST", "/api/me/password", d); await boot(); } catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
}

// ---------- router ----------
const ROUTES = [
  [/^#?\/?(dashboard)?$/, viewDashboard],
  [/^#\/items$/, viewItems],
  [/^#\/items\/new$/, () => viewItemForm(null)],
  [/^#\/item\/(\d+)$/, (m) => viewItem(+m[1])],
  [/^#\/item\/(\d+)\/edit$/, (m) => viewItemForm(+m[1])],
  [/^#\/item\/(\d+)\/copy$/, (m) => viewItemForm(+m[1], true)],
  [/^#\/renters$/, viewRenters],
  [/^#\/renters\/new$/, () => viewRenterForm(null)],
  [/^#\/renter\/(\d+)$/, (m) => viewRenter(+m[1])],
  [/^#\/renter\/(\d+)\/edit$/, (m) => viewRenterForm(+m[1])],
  [/^#\/rentals$/, viewRentals],
  [/^#\/rentals\/new$/, viewNewRental],
  [/^#\/rental\/(\d+)$/, (m) => viewRental(+m[1])],
  [/^#\/shows$/, viewShows],
  [/^#\/shows\/new$/, () => viewShowForm(null)],
  [/^#\/show\/(\d+)$/, (m) => viewShow(+m[1])],
  [/^#\/show\/(\d+)\/edit$/, (m) => viewShowForm(+m[1])],
  [/^#\/pull$/, viewPull],
  [/^#\/activity$/, viewActivity],
  [/^#\/settings$/, viewSettings],
];
async function route() {
  if (!S.me) return;
  $("#modal-root").innerHTML = "";
  const hash = location.hash || "#/dashboard";
  for (const [re, fn] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); } catch (err) { if (err.code !== 401 && err.code !== 428) { shell("", h`${page("", "Something went wrong")}<div class="errbox">${err.message}</div><a class="btn" href="#/dashboard">Back to the dashboard</a>`); } }
      return;
    }
  }
  location.hash = "#/dashboard";
}
window.addEventListener("hashchange", route);

async function refreshLookups() {
  const l = await GET("/api/lookups");
  S.lists = l.lists; S.configured = l.configured;
}
async function boot() {
  try { S.me = await GET("/api/me"); } catch (e) { if (e.code === 401 || e.code === 428) return; $("#app").innerHTML = h`<div class="boot"><img src="logo.png" alt="" width="96" height="96"><p>${e.message}</p></div>`.s; return; }
  if (S.me.must_change) return renderMustChange();
  await refreshLookups();
  route();
}

// ---------- dashboard ----------
async function viewDashboard() {
  const d = await GET("/api/dashboard");
  S.overdue = d.overdue_count || 0;
  const n = (v) => Math.round(v || 0).toLocaleString();
  shell("dashboard", h`
    ${page("Alton High School Theatre", `Welcome back, ${S.me.display_name || S.me.username}`)}
    <div class="quick no-print">
      <a class="btn primary" href="#/items/new">${icon("plus")}Add an item</a>
      <a class="btn" href="#/items">${icon("search")}Search inventory</a>
      <a class="btn" href="#/shows">${icon("mask")}Check out to a show</a>
      <a class="btn" href="#/rentals/new">${icon("swap")}Start a rental</a>
    </div>
    <div class="stats">
      <a class="stat" href="#/items"><div class="v">${n(d.item_pieces)}</div><div class="k">Pieces in stock</div><div class="small muted">${n(d.item_records)} catalog records</div></a>
      <a class="stat" href="#/shows"><div class="v">${n(d.in_shows)}</div><div class="k">Out to shows</div></a>
      <a class="stat" href="#/rentals"><div class="v">${n(d.on_rental)}</div><div class="k">Out on rental</div></a>
      <a class="stat ${d.overdue_count ? "alert" : ""}" href="#/rentals"><div class="v">${n(d.overdue_count)}</div><div class="k">Overdue rentals</div></a>
      <a class="stat ${d.needs_repair ? "alert" : ""}" href="#/items"><div class="v">${n(d.needs_repair)}</div><div class="k">Need repair</div></a>
      <div class="stat"><div class="v">${"$" + n(d.value)}</div><div class="k">Replacement value</div></div>
    </div>
    <div class="two">
      <div class="stack">
        <section class="panel"><header><h2>Current shows</h2><a class="more" href="#/shows">All shows</a></header>
          ${d.shows.length ? h`<div class="tablewrap"><table><tr><th>Show</th><th>Opens</th><th class="r">Pieces out</th></tr>${d.shows.map((s) => h`<tr class="click" data-go="#/show/${s.id}"><td><b>${s.title}</b><div class="small muted">${[s.type, showLabel(s)].filter(Boolean).join(" · ")}</div></td><td class="num">${fmtDate(s.open_date)}</td><td class="r num">${s.out_pieces || 0}</td></tr>`)}</table></div>`
            : h`<div class="empty">No shows in planning or production. <a href="#/shows/new">Create the next show</a> to start checking items out to it.</div>`}
        </section>
        <section class="panel"><header><h2>Out on rental</h2><a class="more" href="#/rentals">All rentals</a></header>
          ${d.active_rentals.length ? h`<div class="tablewrap"><table><tr><th>Renter</th><th>Due</th><th class="r">Pieces</th></tr>${d.active_rentals.map((r) => h`<tr class="click" data-go="#/rental/${r.id}"><td><b>${r.renter}</b><div class="small muted">${r.purpose || r.organization || ""}</div></td><td class="num">${fmtDate(r.date_due)} ${r.overdue ? h`<span class="pill bad">Overdue</span>` : ""}</td><td class="r num">${r.pieces}</td></tr>`)}</table></div>`
            : h`<div class="empty">Nothing is out on rental right now.</div>`}
        </section>
      </div>
      <div class="stack">
        <section class="panel"><header><h2>Needs repair</h2></header>
          ${d.repairs.length ? h`<div class="tablewrap"><table>${d.repairs.map((i) => h`<tr class="click" data-go="#/item/${i.id}"><td>${tag(i.tag)}</td><td><b>${i.name}</b><div class="small muted">${i.condition_notes || i.category || ""}</div></td><td>${i.status === "repair" ? h`<span class="pill warn">In repair</span>` : condBadge(i.condition)}</td></tr>`)}</table></div>`
            : h`<div class="empty">Nothing is flagged for repair.</div>`}
        </section>
        <section class="panel"><header><h2>Recent activity</h2><a class="more" href="#/activity">Full log</a></header>
          <div class="body">${d.activity.length ? h`<ul class="feed">${d.activity.map((a) => h`<li><time>${fmtWhen(a.at)}</time><span><b>${a.user}</b> — ${a.details}</span></li>`)}</ul>` : h`<p class="muted">Changes people make will show up here.</p>`}</div>
        </section>
      </div>
    </div>`);
  bindRows();
}
function bindRows(root = document) { $$("tr[data-go]", root).forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a,button,input,select")) location.hash = tr.dataset.go; })); }

// ---------- inventory search ----------
const INV_DEFAULT = { q: "", category: "", subcategory: "", era: "", gender: "", size: "", material: "", color: "", location: "", availability: "", status: "current", condition_min: "", rentable: false, show_id: "", never_used: false, chest_min: "", chest_max: "", waist_min: "", waist_max: "", hips_min: "", hips_max: "", inseam_min: "", inseam_max: "", sort: "name" };
let INV = (() => { try { return { ...INV_DEFAULT, ...JSON.parse(sessionStorage.getItem("ati_inv") || "{}") }; } catch { return { ...INV_DEFAULT }; } })();
let invView = (() => { try { return localStorage.getItem("ati_view") || "grid"; } catch { return "grid"; } })();
const FILTER_LABELS = { category: "Category", subcategory: "Type", era: "Era", gender: "Gender", size: "Size", material: "Material", color: "Color", location: "Location", availability: "Availability", status: "Status", condition_min: "Condition", rentable: "Rentable", show_id: "Used in", never_used: "Never used", chest_min: "Chest ≥", chest_max: "Chest ≤", waist_min: "Waist ≥", waist_max: "Waist ≤", hips_min: "Hips ≥", hips_max: "Hips ≤", inseam_min: "Inseam ≥", inseam_max: "Inseam ≤" };

async function viewItems() {
  S.shows = await GET("/api/shows");
  const L = S.lists;
  const fsel = (k, label, opts) => h`<div class="f"><label for="v-${k}">${label}</label><select id="v-${k}" data-f="${k}"><option value="">Any</option>${opts.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h`<option value="${v}" ${String(INV[k]) === String(v) ? raw("selected") : ""}>${t}</option>`; })}</select></div>`;
  const range = (k, label) => h`<div class="range"><span>${label}</span><input type="number" step="0.5" min="0" placeholder="min" data-f="${k}_min" id="v-${k}_min" value="${INV[k + "_min"]}"><input type="number" step="0.5" min="0" placeholder="max" data-f="${k}_max" id="v-${k}_max" value="${INV[k + "_max"]}"></div>`;
  shell("items", h`
    ${page("Inventory", "Find what you have", h`<a class="btn" href="/api/export/items.csv">Export spreadsheet</a><a class="btn primary" href="#/items/new">${icon("plus")}Add an item</a>`)}
    <div class="searchbar"><div class="q">${icon("search")}<input type="search" id="v-q" placeholder="Search names, tags, colors, keywords, or a show or character it was used for…" value="${INV.q}" autofocus></div></div>
    <div class="inv">
      <aside class="filters" id="filters">
        <button class="btn sm ghost" id="ftoggle" type="button" style="display:none">Show filters</button>
        <div class="fbody">
          <h3>What</h3>
          ${fsel("category", "Category", L.category || [])}
          ${fsel("subcategory", "Type", L.subcategory || [])}
          ${fsel("era", "Era / period", L.era || [])}
          ${fsel("gender", "Gender", L.gender || [])}
          ${fsel("size", "Size", L.size || [])}
          ${fsel("material", "Material", L.material || [])}
          ${fsel("color", "Color", L.color || [])}
          <h3>Where &amp; state</h3>
          ${fsel("location", "Storage location", L.location || [])}
          ${fsel("availability", "Availability", [["available", "Available now"], ["out", "Checked out (any)"], ["inshow", "Out to a show"], ["rented", "Out on rental"]])}
          <div class="f"><label for="v-status">Status</label><select id="v-status" data-f="status">${[["current", "Not retired"], ["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"], ["all", "Everything"]].map(([v, t]) => h`<option value="${v}" ${INV.status === v ? raw("selected") : ""}>${t}</option>`)}</select></div>
          ${fsel("condition_min", "Condition at least", [[5, "5 · Excellent"], [4, "4 · Good"], [3, "3 · Fair"], [2, "2 · Poor"]])}
          <div class="f"><label class="check"><input type="checkbox" data-f="rentable" id="v-rentable" ${INV.rentable ? raw("checked") : ""}> Rentable to outside groups</label></div>
          <h3>Show history</h3>
          ${fsel("show_id", "Used in show", S.shows.map((s) => [s.id, `${s.title}${s.year ? " (" + s.year + ")" : ""}`]))}
          <div class="f"><label class="check"><input type="checkbox" data-f="never_used" id="v-never_used" ${INV.never_used ? raw("checked") : ""}> Never used in a show</label></div>
          <h3>Measurements (inches)</h3>
          ${range("chest", "Chest")}${range("waist", "Waist")}${range("hips", "Hips")}${range("inseam", "Inseam")}
          <button class="btn sm" type="button" id="clearf" style="margin-top:10px">Clear all filters</button>
        </div>
      </aside>
      <section style="min-width:0">
        <div class="activef" id="activef"></div>
        <div class="resbar"><span class="count num" id="count">Searching…</span>
          <div class="right">
            <select id="v-sort" aria-label="Sort">${[["name", "Name A–Z"], ["tag", "Tag number"], ["category", "Category"], ["recent", "Newest first"], ["condition", "Best condition"], ["used", "Most used in shows"]].map(([v, t]) => h`<option value="${v}" ${INV.sort === v ? raw("selected") : ""}>${t}</option>`)}</select>
            <div class="seg"><button type="button" data-view="grid" class="${invView === "grid" ? "on" : ""}">Photos</button><button type="button" data-view="list" class="${invView === "list" ? "on" : ""}">List</button></div>
          </div>
        </div>
        <div id="results"></div>
      </section>
    </div>`);
  if (matchMedia("(max-width:1080px)").matches) { const f = $("#filters"); f.classList.add("collapsed"); const t = $("#ftoggle"); t.style.display = ""; t.onclick = () => { f.classList.toggle("collapsed"); t.textContent = f.classList.contains("collapsed") ? "Show filters" : "Hide filters"; }; }
  let timer;
  const changed = () => { clearTimeout(timer); timer = setTimeout(runSearch, 200); };
  $("#v-q").addEventListener("input", (e) => { INV.q = e.target.value; changed(); });
  $$("[data-f]").forEach((el) => el.addEventListener(el.type === "number" ? "input" : "change", () => { INV[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; changed(); }));
  $("#v-sort").onchange = (e) => { INV.sort = e.target.value; runSearch(); };
  $("#clearf").onclick = () => { INV = { ...INV_DEFAULT, q: INV.q }; viewItems(); };
  $$("[data-view]").forEach((b) => (b.onclick = () => { invView = b.dataset.view; try { localStorage.setItem("ati_view", invView); } catch {} $$("[data-view]").forEach((x) => x.classList.toggle("on", x === b)); runSearch(); }));
  runSearch();
}
let lastItems = [];
async function runSearch() {
  try { sessionStorage.setItem("ati_inv", JSON.stringify(INV)); } catch {}
  const items = await GET("/api/items" + qs(INV));
  lastItems = items;
  const pieces = items.reduce((a, i) => a + i.quantity, 0);
  $("#count").textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}${pieces !== items.length ? ` · ${pieces} pieces` : ""}` : "No matches";
  const act = Object.keys(FILTER_LABELS).filter((k) => INV[k] !== INV_DEFAULT[k] && INV[k] !== "" && INV[k] !== false);
  $("#activef").innerHTML = act.map((k) => {
    let v = INV[k];
    if (k === "show_id") v = (S.shows.find((s) => String(s.id) === String(v)) || {}).title || v;
    if (k === "condition_min") v = COND[v] + " or better";
    if (k === "rentable" || k === "never_used") v = "yes";
    if (k === "status") v = { active: "In stock", repair: "In repair", retired: "Retired", lost: "Lost", all: "Everything" }[v];
    if (k === "availability") v = { available: "Available now", out: "Checked out", inshow: "In a show", rented: "On rental" }[v];
    return h`<button type="button" data-clear="${k}">${FILTER_LABELS[k]}: ${v}</button>`.s;
  }).join("");
  $$("[data-clear]").forEach((b) => (b.onclick = () => { INV[b.dataset.clear] = INV_DEFAULT[b.dataset.clear]; viewItems(); }));
  const res = $("#results");
  if (!items.length) {
    res.innerHTML = h`<div class="panel"><div class="empty">${S.lists && INV.q === "" && act.length === 0 ? h`Your inventory is empty. <a href="#/items/new">Add the first item</a> — a costume, a chair, a prop — and it will show up here.` : "Nothing matches. Try fewer filters or a different word."}</div></div>`.s;
    return;
  }
  if (invView === "grid") {
    res.innerHTML = h`<div class="cards">${items.map((i) => h`<article class="card" data-id="${i.id}">
      <div class="ph">${i.photo ? h`<img src="${photoURL(i.photo)}" alt="" loading="lazy">` : icon("hanger")}</div>
      <button class="btn sm addpull" type="button" data-pull="${i.id}" title="Add to pull list">+ Pull</button>
      <div class="cb">${tag(i.tag)}<div class="nm">${i.name}</div>
        <div class="meta">${[i.era, i.gender, i.size && "Size " + i.size, i.color].filter(Boolean).join(" · ")}</div>
        <div class="foot">${availPill(i)}${condBadge(i.condition)}</div></div></article>`)}</div>`.s;
    $$(".card", res).forEach((c) => c.addEventListener("click", (e) => { if (!e.target.closest("[data-pull]")) location.hash = "#/item/" + c.dataset.id; }));
  } else {
    res.innerHTML = h`<div class="panel tablewrap"><table><tr><th></th><th>Tag</th><th>Item</th><th>Era</th><th>Gender / size</th><th>Material · color</th><th>Location</th><th>Condition</th><th>Status</th><th></th></tr>
      ${items.map((i) => h`<tr class="click" data-go="#/item/${i.id}"><td>${thumb(i.photo)}</td><td>${tag(i.tag)}</td><td><b>${i.name}</b><div class="small muted">${[i.category, i.subcategory].filter(Boolean).join(" · ")}${i.quantity > 1 ? ` · qty ${i.quantity}` : ""}</div></td>
        <td>${i.era || ""}</td><td>${[i.gender, i.size].filter(Boolean).join(" · ")}</td><td>${[i.material, i.color].filter(Boolean).join(" · ")}</td><td>${i.location || ""}</td><td>${condBadge(i.condition)}</td><td>${availPill(i)}</td>
        <td><button class="btn sm" type="button" data-pull="${i.id}">+ Pull</button></td></tr>`)}</table></div>`.s;
    bindRows(res);
  }
  $$("[data-pull]", res).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const it = lastItems.find((x) => x.id === +b.dataset.pull); if (it) addToPull(it); }));
}

// ---------- item detail ----------
async function viewItem(id) {
  const d = await GET("/api/items/" + id);
  const it = d.item;
  const free = it.quantity - it.rent_out - it.show_out;
  const meas = ["chest", "waist", "hips", "inseam", "neck", "sleeve", "head"].filter((k) => it[k] != null).map((k) => `${k[0].toUpperCase() + k.slice(1)} ${it[k]}″`).join(" · ");
  const fact = (k, v) => v == null || v === "" ? "" : h`<div><span>${k}</span><b>${v}</b></div>`;
  shell("items", h`
    ${page(it.category || "Item", it.name, h`
      <button class="btn" id="pullit">+ Pull list</button>
      <button class="btn" id="inspect">Record condition</button>
      <button class="btn" id="printtag">${icon("print")}Print tag</button>
      <a class="btn" href="#/item/${id}/copy" title="Start a new item with the same details">Duplicate</a>
      <a class="btn dark" href="#/item/${id}/edit">Edit</a>`, h`<a href="#/items">Inventory</a> / ${it.tag}`)}
    <div class="itemtop">
      <div>
        <div class="photo" id="photo">${it.photo ? h`<img src="${photoURL(it.photo)}" alt="${it.name}">` : icon("camera")}</div>
        <div class="no-print" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <label class="btn sm" for="photofile" style="margin:0;font-weight:500">${it.photo ? "Replace photo" : "Add a photo"}</label>
          <input type="file" id="photofile" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
          ${it.photo ? h`<button class="btn sm ghost" id="rmphoto">Remove</button>` : ""}
        </div>
      </div>
      <div style="min-width:0">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">${tag(it.tag)}${condBadge(it.condition)}${it.rentable ? h`<span class="pill info">Rentable${it.rental_rate != null ? " · " + money(it.rental_rate) : ""}</span>` : h`<span class="pill mute">Not for rent</span>`}</div>
        ${it.description ? h`<p style="margin:0 0 14px;max-width:65ch">${it.description}</p>` : ""}
        <div class="dl">
          ${fact("Type", it.subcategory)}${fact("Era / period", it.era)}${fact("Gender", it.gender)}${fact("Size", it.size)}${fact("Shoe size", it.shoe_size)}
          ${fact("Material", it.material)}${fact("Color", it.color)}${fact("Pattern / trim", it.pattern)}${fact("Quantity", it.quantity)}${fact("Location", it.location)}
          ${fact("Replacement value", it.replacement_value != null ? money(it.replacement_value) : null)}${fact("Acquired", [fmtDate(it.acquired_date) !== "—" ? fmtDate(it.acquired_date) : "", it.acquired_from].filter(Boolean).join(" · "))}${fact("Cost", it.cost != null ? money(it.cost) : null)}
        </div>
        ${meas ? h`<p class="small" style="margin:12px 0 0"><b>Measurements:</b> ${meas}</p>` : ""}
        ${it.keywords ? h`<div class="chips" style="margin-top:12px">${it.keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean).map((k) => h`<span class="chip">${k}</span>`)}</div>` : ""}
        <div class="avail">${availPill(it)}<span class="small">${it.status === "active" ? `${Math.max(free, 0)} of ${it.quantity} on the shelf` : ""}${it.show_out ? ` · ${it.show_out} out to a show` : ""}${it.rent_out ? ` · ${it.rent_out} on rental` : ""}</span>
          <span class="small muted" style="margin-left:auto">Used in ${it.show_count} show${it.show_count === 1 ? "" : "s"} · rented ${it.rental_count} time${it.rental_count === 1 ? "" : "s"}</span></div>
        ${it.condition_notes ? h`<p class="small"><b>Condition notes:</b> ${it.condition_notes}</p>` : ""}
        ${it.notes ? h`<p class="small" style="max-width:65ch"><b>Notes:</b> ${it.notes}</p>` : ""}
        <p class="small muted">Added ${fmtDate(it.created_at)}${it.created_by ? " by " + it.created_by : ""}${it.updated_at && it.updated_at !== it.created_at ? ` · last edited ${fmtDate(it.updated_at)} by ${it.updated_by}` : ""}</p>
      </div>
    </div>
    <section class="panel">
      <div class="tabs" role="tablist"><button class="on" data-tab="shows">Show history (${d.shows.length})</button><button data-tab="rentals">Rental history (${d.rentals.length})</button><button data-tab="cond">Condition log (${d.conditions.length})</button></div>
      <div data-pane="shows" class="tablewrap">${d.shows.length ? h`<table><tr><th>Show</th><th>Character / use</th><th>Actor</th><th>Scene</th><th>Out</th><th>Returned</th><th>Alterations</th></tr>${d.shows.map((s) => h`<tr class="click" data-go="#/show/${s.show_id}">
          <td><b>${s.title}</b><div class="small muted">${[s.type, showLabel(s)].filter(Boolean).join(" · ")}</div></td>
          <td>${s.character || "—"}${s.usage_notes ? h`<div class="small muted">${s.usage_notes}</div>` : ""}</td><td>${s.actor || ""}</td><td>${s.scene || ""}</td>
          <td class="num">${fmtDate(s.date_out)}<div>${condBadge(s.condition_out)}</div></td>
          <td class="num">${s.date_returned ? h`${fmtDate(s.date_returned)}<div>${condBadge(s.condition_in)}</div>` : h`<span class="pill warn">Still out</span>`}</td>
          <td class="small">${s.alterations || ""}${s.notes_in ? h`<div class="muted">${s.notes_in}</div>` : ""}</td></tr>`)}</table>` : h`<div class="empty">This item hasn't been used in a show yet.</div>`}</div>
      <div data-pane="rentals" class="tablewrap" hidden>${d.rentals.length ? h`<table><tr><th>Rental</th><th>Renter</th><th>Dates</th><th>Condition out → in</th><th>Return notes</th><th class="r">Damage</th></tr>${d.rentals.map((r) => h`<tr class="click" data-go="#/rental/${r.rental_id}">
          <td class="num">#${r.rental_id}</td><td><b>${r.renter}</b><div class="small muted">${r.purpose || r.organization || ""}</div></td>
          <td class="num small">${fmtDate(r.date_out)} → ${r.date_returned ? fmtDate(r.date_returned) : h`<span class="pill warn">Out</span>`}</td>
          <td>${condBadge(r.condition_out)} → ${r.condition_in ? condBadge(r.condition_in) : "…"}</td><td class="small">${r.notes_in || ""}</td><td class="r num">${r.damage_charge ? money(r.damage_charge) : ""}</td></tr>`)}</table>` : h`<div class="empty">This item has never been rented.</div>`}</div>
      <div data-pane="cond" class="tablewrap" hidden>${d.conditions.length ? h`<table><tr><th>When</th><th>Condition</th><th>What happened</th><th>Notes</th><th>By</th></tr>${d.conditions.map((c) => h`<tr><td class="num">${fmtDate(c.at)}</td><td>${condBadge(c.condition)}</td><td>${c.source}</td><td class="small">${c.notes || ""}</td><td class="small">${c.user || ""}</td></tr>`)}</table>` : h`<div class="empty">No condition records yet.</div>`}</div>
    </section>
    ${isDirector() ? h`<p class="no-print" style="margin-top:20px"><button class="btn sm danger" id="delitem">Delete this item</button></p>` : ""}
    <div id="tagcard"><div class="bar"><img src="logo.png" alt=""><b>AHS Theatre</b></div><div class="t">${it.tag}</div><div class="n">${it.name}</div>
      <div class="small">${[it.category, it.era, it.gender, it.size && "Size " + it.size].filter(Boolean).join(" · ")}</div><div class="small">${meas}</div><div class="small">Home: ${it.location || "—"}</div></div>`);
  bindRows();
  $$("[data-tab]").forEach((b) => (b.onclick = () => { $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab)); }));
  $("#pullit").onclick = () => addToPull(it);
  $("#printtag").onclick = () => { document.body.classList.add("print-tag"); window.print(); setTimeout(() => document.body.classList.remove("print-tag"), 500); };
  $("#photofile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("photo", f);
    try { await api("POST", `/api/items/${id}/photo`, fd); toast("Photo saved"); viewItem(id); } catch (err) { toast(err.message, true); }
  };
  if ($("#rmphoto")) $("#rmphoto").onclick = () => confirmBox("Remove the photo?", "The photo file will be deleted from this computer.", "Remove photo", async () => { await api("POST", `/api/items/${id}/photo?remove=1`); viewItem(id); });
  $("#inspect").onclick = () => modal({
    title: "Record condition", ok: "Save condition",
    body: h`<div class="grid">${fld("Condition now", h`<select name="condition" id="m-cond">${condOptions(it.condition)}</select>`, "full")}
      ${fld("Status", sel("status", [["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"]], it.status), "full")}
      ${fld("What you found", h`<textarea name="notes" id="m-notes" rows="3" placeholder="e.g. Hem re-sewn, small stain on left cuff">${it.condition_notes || ""}</textarea>`, "full")}</div>`,
    onOk: async (f) => { await api("POST", `/api/items/${id}/condition`, formData(f)); toast("Condition recorded"); viewItem(id); },
  });
  if ($("#delitem")) $("#delitem").onclick = () => confirmBox("Delete this item?", `${it.tag} ${it.name} will be removed permanently. Items with show or rental history can't be deleted; retire them instead.`, "Delete item", async () => { await api("DELETE", "/api/items/" + id); toast("Item deleted"); location.hash = "#/items"; });
}

// ---------- item form ----------
async function viewItemForm(id, copy) {
  let it = { quantity: 1, condition: 4, rentable: 1, status: "active" };
  if (id) it = (await GET("/api/items/" + id)).item;
  if (copy) it = { ...it, tag: "", photo: null };
  const editing = id && !copy;
  shell("items", h`
    ${page(editing ? it.tag : "New item", editing ? "Edit " + it.name : copy ? "Duplicate of " + it.name : "Add an item", "", editing ? h`<a href="#/items">Inventory</a> / <a href="#/item/${id}">${it.tag}</a>` : h`<a href="#/items">Inventory</a>`)}
    <form id="itemf" novalidate>
      <div class="errbox" hidden></div>
      <fieldset><legend>The basics</legend><div class="grid">
        ${fld("Name *", inp("name", it, 'required placeholder="e.g. Burgundy velvet ball gown"'), "wide")}
        ${fld("Tag number", inp("tag", it, 'placeholder="Assigned automatically"'), "", "Leave blank to number it from the category.")}
        ${fld("Quantity", numInp("quantity", it, "1", 'min="1"'), "", "For identical pieces, like 12 black chairs.")}
        ${fld("Category", listInp("category", it))}
        ${fld("Type", listInp("subcategory", it))}
        ${fld("Storage location", listInp("location", it))}
        ${fld("Status", sel("status", [["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"]], it.status))}
      </div></fieldset>
      <fieldset><legend>Look &amp; period</legend><div class="grid">
        ${fld("Era / period", listInp("era", it))}
        ${fld("Gender", listInp("gender", it))}
        ${fld("Color", listInp("color", it), "", "More than one? Separate with commas.")}
        ${fld("Material", listInp("material", it))}
        ${fld("Pattern / trim", inp("pattern", it, 'placeholder="e.g. Gold brocade trim"'))}
        ${fld("Keywords", inp("keywords", it, 'placeholder="e.g. royalty, ballroom, Cinderella"'), "wide", "Words the director might search for. Separate with commas.")}
        ${fld("Description", area("description", it), "full")}
      </div></fieldset>
      <fieldset><legend>Size &amp; fit</legend><p class="hint" style="margin:-6px 0 12px">Measurements in inches. Fill in what applies; they power the measurement search.</p><div class="grid">
        ${fld("Size", listInp("size", it))}${fld("Shoe size", inp("shoe_size", it))}
        ${fld("Chest / bust", numInp("chest", it, "0.5"))}${fld("Waist", numInp("waist", it, "0.5"))}${fld("Hips", numInp("hips", it, "0.5"))}
        ${fld("Inseam", numInp("inseam", it, "0.5"))}${fld("Neck", numInp("neck", it, "0.5"))}${fld("Sleeve", numInp("sleeve", it, "0.5"))}${fld("Head", numInp("head", it, "0.5"))}
      </div></fieldset>
      <fieldset><legend>Condition</legend><div class="grid">
        ${fld("Condition", h`<select name="condition" id="f-condition">${condOptions(it.condition)}</select>`)}
        ${fld("Condition notes", inp("condition_notes", it, 'placeholder="e.g. Zipper sticks; small tear at hem"'), "wide")}
      </div></fieldset>
      <fieldset><legend>Rentals &amp; value</legend><div class="grid">
        <div style="align-self:end"><label class="check"><input type="checkbox" name="rentable" id="f-rentable" ${it.rentable ? raw("checked") : ""}> Can be rented to outside groups</label></div>
        ${fld("Rental rate ($)", numInp("rental_rate", it, "0.01"))}
        ${fld("Replacement value ($)", numInp("replacement_value", it, "0.01"), "", "What it would cost to replace. Used for damage charges.")}
        ${fld("Purchase cost ($)", numInp("cost", it, "0.01"))}
        ${fld("Acquired on", dateInp("acquired_date", it.acquired_date))}
        ${fld("Acquired from", inp("acquired_from", it, 'placeholder="e.g. Donated by the Smith family"'))}
      </div></fieldset>
      <fieldset><legend>Notes</legend>${area("notes", it, 3)}</fieldset>
      <div class="formbar">
        <a class="btn ghost" href="${editing ? "#/item/" + id : "#/items"}">Cancel</a>
        ${!editing ? h`<button type="button" class="btn" id="saveanother">Save and add another</button>` : ""}
        <button class="btn primary">${editing ? "Save changes" : "Save item"}</button>
      </div>
    </form>`);
  const f = $("#itemf");
  const save = async (another) => {
    const d = formData(f), eb = $(".errbox", f);
    if (!d.name.trim()) { eb.textContent = "Give the item a name."; eb.hidden = false; $("#f-name").focus(); return; }
    try {
      if (editing) { await api("PUT", "/api/items/" + id, d); toast("Saved"); location.hash = "#/item/" + id; }
      else {
        const r = await api("POST", "/api/items", d); toast(`Saved ${d.name}`);
        await refreshLookups();
        if (another) { const keep = { category: d.category, subcategory: d.subcategory, location: d.location, era: d.era, gender: d.gender }; await viewItemForm(null); for (const [k, v] of Object.entries(keep)) if (v) $("#f-" + k).value = v; $("#f-name").focus(); }
        else location.hash = "#/item/" + r.id;
      }
    } catch (err) { eb.textContent = err.message; eb.hidden = false; window.scrollTo(0, 0); }
  };
  f.onsubmit = (e) => { e.preventDefault(); save(false); };
  if ($("#saveanother")) $("#saveanother").onclick = () => save(true);
}

// ---------- item picker (used by rentals & shows) ----------
function picker(container, onAdd, opts = {}) {
  container.innerHTML = h`<div class="picker"><div class="pq"><input type="search" placeholder="Search by name, tag, size, era…" id="pk-q">
    <select id="pk-cat" style="width:auto">${[h`<option value="">Any category</option>`, ...(S.lists.category || []).map((c) => h`<option>${c}</option>`)]}</select>
    ${S.pull.length ? h`<button type="button" class="btn sm" id="pk-pull">Add pull list (${S.pull.length})</button>` : ""}</div><div class="pres" id="pk-res"><div class="empty small">Type to find available items.</div></div></div>`.s;
  let t;
  const run = async () => {
    const q = $("#pk-q", container).value, cat = $("#pk-cat", container).value;
    if (!q && !cat) { $("#pk-res", container).innerHTML = h`<div class="empty small">Type to find available items.</div>`.s; return; }
    const items = await GET("/api/items" + qs({ q, category: cat, availability: "available", rentable: opts.rentable, sort: "name" }));
    $("#pk-res", container).innerHTML = items.length ? items.slice(0, 60).map((i) => h`<div>${thumb(i.photo)}<div class="grow"><b>${i.name}</b> ${tag(i.tag)}<div class="small muted">${[i.category, i.era, i.size && "Size " + i.size, i.color].filter(Boolean).join(" · ")}</div></div>${availPill(i)}<button type="button" class="btn sm" data-add="${i.id}">Add</button></div>`.s).join("") : h`<div class="empty small">No available items match${opts.rentable ? " (only rentable items are shown)" : ""}.</div>`.s;
    $$("[data-add]", container).forEach((b) => (b.onclick = () => { const it = items.find((x) => x.id === +b.dataset.add); onAdd({ id: it.id, tag: it.tag, name: it.name, category: it.category, size: it.size, photo: it.photo, condition: it.condition, qty: 1, max: it.quantity - it.rent_out - it.show_out }); b.textContent = "Added"; b.disabled = true; }));
  };
  $("#pk-q", container).addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 200); });
  $("#pk-cat", container).onchange = run;
  if ($("#pk-pull", container)) $("#pk-pull", container).onclick = () => { S.pull.forEach((p) => onAdd({ ...p })); toast("Pull list added"); };
}

// ---------- pull list ----------
function viewPull() {
  shell("pull", h`
    ${page("Pull list", "Items you've set aside", S.pull.length ? h`<button class="btn" id="clearpull">Clear list</button>` : "")}
    <p class="muted" style="max-width:65ch;margin-top:-8px">Build a pull list while you search the inventory, then check the whole list out to a show or start a rental with it. The list is kept on this computer until you clear it.</p>
    ${S.pull.length ? h`<section class="panel tablewrap" style="margin-bottom:16px"><table class="lines"><tr><th></th><th>Tag</th><th>Item</th><th>Category</th><th>Size</th><th>Qty</th><th></th></tr>
      ${S.pull.map((p, i) => h`<tr><td>${thumb(p.photo)}</td><td>${tag(p.tag)}</td><td><a href="#/item/${p.id}"><b>${p.name}</b></a></td><td>${p.category || ""}</td><td>${p.size || ""}</td>
        <td style="width:90px"><input type="number" min="1" max="${p.max || 99}" value="${p.qty}" data-qty="${i}" aria-label="Quantity"></td><td><button class="btn sm ghost" data-rm="${i}">Remove</button></td></tr>`)}</table></section>
      <div class="two"><section class="panel"><header><h2>Check out to a show</h2></header><div class="body" id="pullshow"></div></section>
        <section class="panel"><header><h2>Start a rental</h2></header><div class="body"><p class="small muted">Opens a new rental with these items. You'll pick the renter there.</p><button class="btn primary" id="pullrent">Start a rental with this list</button></div></section></div>`
      : h`<div class="panel"><div class="empty">The pull list is empty. In <a href="#/items">Inventory</a>, use <b>+ Pull</b> on anything you want to set aside.</div></div>`}`);
  if (!S.pull.length) return;
  $$("[data-qty]").forEach((el) => (el.onchange = () => { S.pull[+el.dataset.qty].qty = Math.max(1, +el.value || 1); savePull(); }));
  $$("[data-rm]").forEach((b) => (b.onclick = () => { S.pull.splice(+b.dataset.rm, 1); savePull(); viewPull(); }));
  $("#clearpull").onclick = () => { S.pull = []; savePull(); viewPull(); };
  $("#pullrent").onclick = () => { S.staged = S.pull.map((p) => ({ ...p })); location.hash = "#/rentals/new"; };
  GET("/api/shows").then((shows) => {
    const open = shows.filter((s) => s.status !== "closed");
    $("#pullshow").innerHTML = open.length ? h`<p class="small muted">You'll add characters and scenes before confirming.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="pullshowsel" style="flex:1 1 200px">${open.map((s) => h`<option value="${s.id}">${s.title}${s.year ? " (" + s.year + ")" : ""}</option>`)}</select><button class="btn primary" id="pullgo">Continue</button></div>`.s
      : h`<p class="small muted">There are no open shows. <a href="#/shows/new">Create a show</a> first.</p>`.s;
    if ($("#pullgo")) $("#pullgo").onclick = () => { S.staged = S.pull.map((p) => ({ ...p })); location.hash = "#/show/" + $("#pullshowsel").value; };
  });
}

// ---------- renters ----------
let RQ = { q: "", approved: "", sort: "name" };
async function viewRenters() {
  shell("renters", h`
    ${page("Renters", "Approved renters", h`<a class="btn" href="/api/export/renters.csv">Export spreadsheet</a><a class="btn primary" href="#/renters/new">${icon("plus")}Add a renter</a>`)}
    <div class="searchbar"><div class="q">${icon("search")}<input type="search" id="r-q" placeholder="Search by name, organization, contact, email or phone" value="${RQ.q}"></div>
      <select id="r-ap" style="width:auto">${[["", "Everyone"], ["1", "Approved only"], ["0", "Not approved"]].map(([v, t]) => h`<option value="${v}" ${RQ.approved === v ? raw("selected") : ""}>${t}</option>`)}</select>
      <select id="r-sort" style="width:auto">${[["name", "Name A–Z"], ["rating", "Best rated"], ["recent", "Most recent rental"]].map(([v, t]) => h`<option value="${v}" ${RQ.sort === v ? raw("selected") : ""}>${t}</option>`)}</select></div>
    <div id="rres"></div>`);
  let t;
  const run = async () => {
    const rows = await GET("/api/renters" + qs(RQ));
    $("#rres").innerHTML = rows.length ? h`<section class="panel tablewrap"><table><tr><th>Renter</th><th>Contact</th><th>Status</th><th>Rating</th><th class="r">Rentals</th><th>Last rental</th><th class="r">Damage charges</th></tr>
      ${rows.map((r) => h`<tr class="click" data-go="#/renter/${r.id}"><td><b>${r.name}</b><div class="small muted">${r.organization || ""}</div></td><td class="small">${r.contact_name || ""}${r.phone ? h`<div>${r.phone}</div>` : ""}${r.email ? h`<div>${r.email}</div>` : ""}</td>
        <td>${r.approved ? h`<span class="pill good">Approved</span>` : h`<span class="pill mute">Not approved</span>`}${r.active_count ? h` <span class="pill warn">${r.active_count} out</span>` : ""}</td>
        <td>${stars(r.avg_rating, r.rating_count)}</td><td class="r num">${r.rental_count}</td><td class="num">${fmtDate(r.last_rental)}</td><td class="r num">${r.damage_total ? money(r.damage_total) : ""}</td></tr>`)}</table></section>`.s
      : h`<div class="panel"><div class="empty">${RQ.q || RQ.approved ? "No renters match." : h`No renters yet. <a href="#/renters/new">Add an approved renter</a> — another school, community theatre or church group — before starting a rental.`}</div></div>`.s;
    bindRows($("#rres"));
  };
  $("#r-q").oninput = (e) => { RQ.q = e.target.value; clearTimeout(t); t = setTimeout(run, 200); };
  $("#r-ap").onchange = (e) => { RQ.approved = e.target.value; run(); };
  $("#r-sort").onchange = (e) => { RQ.sort = e.target.value; run(); };
  run();
}
async function viewRenter(id) {
  const d = await GET("/api/renters/" + id);
  const r = d.renter;
  shell("renters", h`
    ${page(r.organization || "Renter", r.name, h`
      ${r.approved ? h`<a class="btn primary" href="#/rentals/new" id="newrent">${icon("swap")}New rental</a>` : ""}
      <button class="btn" id="toggleap">${r.approved ? "Remove approval" : "Approve renter"}</button>
      <a class="btn dark" href="#/renter/${id}/edit">Edit</a>`, h`<a href="#/renters">Renters</a>`)}
    <div class="two" style="margin-bottom:18px">
      <section class="panel"><div class="body"><div class="dl">
        <div><span>Status</span><b>${r.approved ? h`<span class="pill good">Approved${r.approved_date ? " " + fmtDate(r.approved_date) : ""}</span>` : h`<span class="pill mute">Not approved</span>`}</b></div>
        <div><span>Contact person</span><b>${r.contact_name || "—"}</b></div><div><span>Phone</span><b>${r.phone || "—"}</b></div><div><span>Email</span><b>${r.email || "—"}</b></div>
        <div style="grid-column:1/-1"><span>Address</span><b>${r.address || "—"}</b></div></div>
        ${r.notes ? h`<p class="small" style="margin-bottom:0"><b>Notes:</b> ${r.notes}</p>` : ""}</div></section>
      <section class="panel"><div class="body">
        <div class="small muted" style="text-transform:uppercase;letter-spacing:.07em">How they treat our things</div>
        <div style="font-size:22px;margin:4px 0 10px">${stars(r.avg_rating, r.rating_count)}</div>
        <div class="dl"><div><span>Rentals</span><b class="num">${r.rental_count}</b></div><div><span>Out now</span><b class="num">${r.active_count}</b></div><div><span>Damage charges</span><b class="num">${money(r.damage_total)}</b></div></div>
      </div></section>
    </div>
    <section class="panel"><header><h2>Rental history</h2></header>
      ${d.rentals.length ? h`<div class="tablewrap"><table><tr><th>#</th><th>Dates</th><th>For</th><th>Items</th><th>Rating</th><th class="r">Damage</th></tr>${d.rentals.map((x) => h`<tr class="click" data-go="#/rental/${x.id}">
        <td class="num">${x.id}</td><td class="num small">${fmtDate(x.date_out)} → ${x.status === "returned" ? fmtDate(x.date_returned) : h`<span class="pill warn">Out, due ${fmtDate(x.date_due)}</span>`}</td>
        <td>${x.purpose || ""}</td><td class="small">${x.pieces} piece${x.pieces === 1 ? "" : "s"}: ${x.item_names || ""}</td>
        <td>${x.rating ? stars(x.rating) : h`<span class="muted small">—</span>`}${x.rating_notes ? h`<div class="small muted">${x.rating_notes}</div>` : ""}</td><td class="r num">${x.damages ? money(x.damages) : ""}</td></tr>`)}</table></div>`
        : h`<div class="empty">No rentals yet.</div>`}
    </section>
    ${isDirector() && !d.rentals.length ? h`<p class="no-print" style="margin-top:20px"><button class="btn sm danger" id="delrenter">Delete this renter</button></p>` : ""}`);
  bindRows();
  if ($("#newrent")) $("#newrent").onclick = () => { S.stagedRenter = id; };
  $("#toggleap").onclick = async () => { await api("PUT", "/api/renters/" + id, { approved: !r.approved }); toast(r.approved ? "Removed from the approved list" : "Approved"); viewRenter(id); };
  if ($("#delrenter")) $("#delrenter").onclick = () => confirmBox("Delete this renter?", `${r.name} will be removed permanently.`, "Delete renter", async () => { await api("DELETE", "/api/renters/" + id); location.hash = "#/renters"; });
}
async function viewRenterForm(id) {
  let r = { approved: 1 };
  if (id) r = (await GET("/api/renters/" + id)).renter;
  shell("renters", h`
    ${page("Renters", id ? "Edit " + r.name : "Add a renter", "", h`<a href="#/renters">Renters</a>`)}
    <form id="renterf" novalidate><div class="errbox" hidden></div>
      <fieldset><legend>Who is renting</legend><div class="grid">
        ${fld("Name *", inp("name", r, 'placeholder="e.g. Godfrey Community Players"'), "wide")}
        ${fld("Organization / school", inp("organization", r))}
        ${fld("Contact person", inp("contact_name", r))}
        ${fld("Phone", h`<input type="tel" id="f-phone" name="phone" value="${val(r, "phone")}">`)}
        ${fld("Email", h`<input type="email" id="f-email" name="email" value="${val(r, "email")}">`)}
        ${fld("Address", inp("address", r), "wide")}
        <div class="full"><label class="check"><input type="checkbox" name="approved" id="f-approved" ${r.approved ? raw("checked") : ""}> Approved to rent from AHS Theatre</label></div>
        ${fld("Notes", area("notes", r), "full")}
      </div></fieldset>
      <div class="formbar"><a class="btn ghost" href="${id ? "#/renter/" + id : "#/renters"}">Cancel</a><button class="btn primary">${id ? "Save changes" : "Save renter"}</button></div>
    </form>`);
  const f = $("#renterf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    try { if (id) { await api("PUT", "/api/renters/" + id, d); location.hash = "#/renter/" + id; } else { const x = await api("POST", "/api/renters", d); location.hash = "#/renter/" + x.id; } toast("Saved"); }
    catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
}

// ---------- rentals ----------
let RENT_TAB = "out";
async function viewRentals() {
  const tabs = [["out", "Out now"], ["overdue", "Overdue"], ["returned", "Returned"], ["", "All"]];
  shell("rentals", h`
    ${page("Rentals", "Rentals", h`<a class="btn" href="/api/export/rentals.csv">Export spreadsheet</a><a class="btn primary" href="#/rentals/new">${icon("plus")}New rental</a>`)}
    <div class="resbar"><div class="seg">${tabs.map(([v, t]) => h`<button type="button" data-tab="${v}" class="${RENT_TAB === v ? "on" : ""}">${t}</button>`)}</div></div>
    <div id="rlist"></div>`);
  const run = async () => {
    const rows = await GET("/api/rentals" + qs({ status: RENT_TAB }));
    $("#rlist").innerHTML = rows.length ? h`<section class="panel tablewrap"><table><tr><th>#</th><th>Renter</th><th>For</th><th>Out</th><th>Due / returned</th><th class="r">Pieces</th><th>Rating</th><th class="r">Fee</th></tr>
      ${rows.map((r) => h`<tr class="click" data-go="#/rental/${r.id}"><td class="num">${r.id}</td><td><b>${r.renter}</b><div class="small muted">${r.organization || ""}</div></td><td>${r.purpose || ""}</td><td class="num">${fmtDate(r.date_out)}</td>
        <td class="num">${r.status === "returned" ? h`${fmtDate(r.date_returned)} <span class="pill good">Returned</span>` : h`${fmtDate(r.date_due)} ${r.overdue ? h`<span class="pill bad">Overdue</span>` : h`<span class="pill warn">Out</span>`}`}</td>
        <td class="r num">${r.pieces}</td><td>${r.rating ? stars(r.rating) : ""}</td><td class="r num">${money(r.fee)}</td></tr>`)}</table></section>`.s
      : h`<div class="panel"><div class="empty">${RENT_TAB === "overdue" ? "No overdue rentals." : RENT_TAB === "out" ? "Nothing is out on rental right now." : "No rentals yet."}</div></div>`.s;
    bindRows($("#rlist"));
  };
  $$("[data-tab]").forEach((b) => (b.onclick = () => { RENT_TAB = b.dataset.tab; $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); run(); }));
  run();
}

function linesTable(lines, kind) {
  if (!lines.length) return h`<div class="empty small">No items added yet. Search below or add your pull list.</div>`;
  if (kind === "rental") return h`<div class="tablewrap"><table class="lines"><tr><th>Item</th><th style="width:80px">Qty</th><th style="width:190px">Condition going out</th><th>Notes going out</th><th></th></tr>
    ${lines.map((l, i) => h`<tr><td>${tag(l.tag)} <b>${l.name}</b><div class="small muted">${[l.category, l.size].filter(Boolean).join(" · ")}</div></td>
      <td><input type="number" min="1" max="${l.max || 99}" value="${l.qty}" data-l="${i}" data-k="qty" aria-label="Quantity"></td>
      <td><select data-l="${i}" data-k="condition_out" aria-label="Condition going out">${condOptions(l.condition_out || l.condition)}</select></td>
      <td><input type="text" value="${l.notes_out || ""}" data-l="${i}" data-k="notes_out" placeholder="e.g. Missing one button" aria-label="Notes"></td>
      <td><button type="button" class="btn sm ghost" data-rml="${i}">Remove</button></td></tr>`)}</table></div>`;
  return h`<div class="tablewrap"><table class="lines"><tr><th>Item</th><th style="width:70px">Qty</th><th>Character / use</th><th>Actor</th><th>Scene / act</th><th>How it's used</th><th></th></tr>
    ${lines.map((l, i) => h`<tr><td>${tag(l.tag)} <b>${l.name}</b><div class="small muted">${[l.category, l.size].filter(Boolean).join(" · ")}</div></td>
      <td><input type="number" min="1" max="${l.max || 99}" value="${l.qty}" data-l="${i}" data-k="qty" aria-label="Quantity"></td>
      <td><input type="text" list="dl-characters" value="${l.character || ""}" data-l="${i}" data-k="character" placeholder="e.g. Mrs. Lovett" aria-label="Character"></td>
      <td><input type="text" value="${l.actor || ""}" data-l="${i}" data-k="actor" aria-label="Actor"></td>
      <td><input type="text" value="${l.scene || ""}" data-l="${i}" data-k="scene" placeholder="e.g. Act 1 Sc 3" aria-label="Scene"></td>
      <td><input type="text" value="${l.usage_notes || ""}" data-l="${i}" data-k="usage_notes" placeholder="e.g. Wedding dress, finale" aria-label="How it's used"></td>
      <td><button type="button" class="btn sm ghost" data-rml="${i}">Remove</button></td></tr>`)}</table></div>`;
}
function bindLines(box, lines, kind, rerender) {
  box.innerHTML = linesTable(lines, kind).s;
  $$("[data-l]", box).forEach((el) => el.addEventListener("input", () => { const l = lines[+el.dataset.l]; l[el.dataset.k] = el.dataset.k === "qty" || el.dataset.k === "condition_out" ? Number(el.value) : el.value; }));
  $$("[data-rml]", box).forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.rml, 1); rerender(); }));
}

async function viewNewRental() {
  const renters = await GET("/api/renters?approved=1");
  const lines = (S.staged || []).map((l) => ({ ...l, condition_out: l.condition }));
  S.staged = null;
  const pre = S.stagedRenter; S.stagedRenter = null;
  const t = todayISO();
  shell("rentals", h`
    ${page("Rentals", "New rental", "", h`<a href="#/rentals">Rentals</a>`)}
    ${renters.length ? "" : h`<div class="note">There are no approved renters yet. <a href="#/renters/new">Add a renter</a> first.</div>`}
    <form id="rentf" novalidate><div class="errbox" hidden></div>
      <fieldset><legend>Renter &amp; dates</legend><div class="grid">
        ${fld("Renter *", h`<select name="renter_id" id="f-renter_id"><option value="">Choose an approved renter…</option>${renters.map((r) => h`<option value="${r.id}" ${pre === r.id ? raw("selected") : ""}>${r.name}${r.organization ? " — " + r.organization : ""}${r.avg_rating != null ? ` (${(+r.avg_rating).toFixed(1)}★)` : ""}</option>`)}</select>`, "wide")}
        ${fld("For (their show or event)", inp("purpose", {}, 'placeholder="e.g. Their spring production of Oklahoma!"'), "wide")}
        ${fld("Checked out", dateInp("date_out", t))}${fld("Due back", dateInp("date_due", addDays(t, 21)))}
        ${fld("Rental fee ($)", numInp("fee", {}, "0.01"))}${fld("Deposit ($)", numInp("deposit", {}, "0.01"))}
        ${fld("Notes", area("notes", {}, 2), "full")}
      </div><div id="renterinfo" class="small" style="margin-top:10px"></div></fieldset>
      <fieldset><legend>Items going out</legend><div id="lines"></div><p class="hint" style="margin:10px 0 6px">Only items marked rentable and available now are listed.</p><div id="pick"></div></fieldset>
      <div class="formbar"><a class="btn ghost" href="#/rentals">Cancel</a><button class="btn primary">Check out rental</button></div>
    </form>`);
  const box = $("#lines");
  const rerender = () => bindLines(box, lines, "rental", rerender);
  rerender();
  picker($("#pick"), (it) => { if (lines.some((l) => l.id === it.id)) return; lines.push({ ...it, condition_out: it.condition }); rerender(); }, { rentable: true });
  const showInfo = async () => {
    const id = $("#f-renter_id").value; if (!id) { $("#renterinfo").innerHTML = ""; return; }
    const r = renters.find((x) => x.id === +id);
    $("#renterinfo").innerHTML = h`Track record: ${stars(r.avg_rating, r.rating_count)} · ${r.rental_count} past rental${r.rental_count === 1 ? "" : "s"}${r.damage_total ? ` · ${money(r.damage_total)} in damage charges` : ""}${r.active_count ? h` · <span class="pill warn">${r.active_count} rental still out</span>` : ""}`.s;
  };
  $("#f-renter_id").onchange = showInfo; showInfo();
  const f = $("#rentf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    d.items = lines.map((l) => ({ item_id: l.id, qty: l.qty || 1, condition_out: l.condition_out, notes_out: l.notes_out || "" }));
    if (!d.renter_id) { eb.textContent = "Choose a renter."; eb.hidden = false; return; }
    try {
      const r = await api("POST", "/api/rentals", d);
      if (lines.length && S.pull.length && lines.every((l) => S.pull.some((p) => p.id === l.id)) ) { S.pull = S.pull.filter((p) => !lines.some((l) => l.id === p.id)); savePull(); }
      toast("Rental checked out"); location.hash = "#/rental/" + r.id;
    } catch (err) { eb.textContent = err.message; eb.hidden = false; window.scrollTo(0, 0); }
  };
}

async function viewRental(id) {
  const d = await GET("/api/rentals/" + id);
  const r = d.rental, rn = d.renter, out = r.status === "out";
  shell("rentals", h`
    ${page("Rental #" + id, rn.name, h`<button class="btn" id="printr">${icon("print")}Print agreement</button><button class="btn" id="editr">Edit details</button>${isDirector() ? h`<button class="btn danger" id="delr">Delete</button>` : ""}`, h`<a href="#/rentals">Rentals</a>`)}
    <div class="print-only" style="margin-bottom:12px"><b>Alton High School Theatre — Rental agreement #${id}</b></div>
    <div class="two" style="margin-bottom:18px">
      <section class="panel"><div class="body"><div class="dl">
        <div><span>Status</span><b>${out ? (r.overdue ? h`<span class="pill bad">Overdue</span>` : h`<span class="pill warn">Out</span>`) : h`<span class="pill good">Returned ${fmtDate(r.date_returned)}</span>`}</b></div>
        <div><span>For</span><b>${r.purpose || "—"}</b></div><div><span>Checked out</span><b>${fmtDate(r.date_out)}</b></div><div><span>Due back</span><b>${fmtDate(r.date_due)}</b></div>
        <div><span>Fee</span><b>${money(r.fee)}</b></div><div><span>Deposit</span><b>${money(r.deposit)}${r.deposit != null && !out ? (r.deposit_returned ? " · returned" : " · kept") : ""}</b></div>
        <div><span>Checked out by</span><b>${r.created_by || "—"}</b></div>${!out ? h`<div><span>Checked in by</span><b>${r.returned_by || "—"}</b></div>` : ""}
      </div>${r.notes ? h`<p class="small" style="margin-bottom:0"><b>Notes:</b> ${r.notes}</p>` : ""}</div></section>
      <section class="panel"><div class="body">
        <a href="#/renter/${rn.id}"><b>${rn.name}</b></a>${rn.organization ? h` · ${rn.organization}` : ""}
        <div class="small">${[rn.contact_name, rn.phone, rn.email].filter(Boolean).join(" · ")}</div>
        <div style="margin-top:8px">Overall: ${stars(rn.avg_rating, rn.rating_count)}</div>
        ${!out ? h`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><span class="small muted">This rental:</span> ${stars(r.rating)}${r.rating_notes ? h`<p class="small" style="margin:4px 0 0">${r.rating_notes}</p>` : ""}</div>` : ""}
      </div></section>
    </div>
    ${out ? h`<form id="retf" novalidate class="no-print">
      <fieldset><legend>Check in this rental</legend><div class="errbox" hidden></div>
        <p class="small muted" style="margin-top:0">Inspect each item and record its condition now. Item records are updated automatically.</p>
        <div class="tablewrap"><table class="lines"><tr><th>Item</th><th>Went out</th><th style="width:180px">Came back</th><th>What you found</th><th style="width:110px">Damage charge</th><th>Repair</th></tr>
          ${d.items.map((l) => h`<tr data-line="${l.id}"><td>${tag(l.tag)} <b>${l.name}</b>${l.qty > 1 ? ` × ${l.qty}` : ""}${l.replacement_value ? h`<div class="small muted">Replacement ${money(l.replacement_value)}</div>` : ""}</td><td>${condBadge(l.condition_out)}</td>
            <td><select name="ci" data-out="${l.condition_out}" aria-label="Condition returned">${condOptions(l.condition_out)}</select></td>
            <td><input type="text" name="ni" placeholder="e.g. Torn lining, cleaned" aria-label="Notes"></td><td><input type="number" name="dc" min="0" step="0.01" aria-label="Damage charge"></td>
            <td><label class="check small"><input type="checkbox" name="rp"> Send</label></td></tr>`)}</table></div>
        <div class="grid" style="margin-top:16px">
          ${fld("Returned on", dateInp("date_returned", todayISO()))}
          ${r.deposit != null ? h`<div style="align-self:end"><label class="check"><input type="checkbox" name="deposit_returned" id="f-depret" checked> Deposit (${money(r.deposit)}) returned</label></div>` : ""}
          <div class="full"><label>Rate how ${rn.name} treated our things *</label><div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => h`<button type="button" data-star="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`)}</div>
            <input type="hidden" name="rating" id="f-rating"><div class="hint" id="suggest"></div></div>
          ${fld("Rating notes", h`<textarea name="rating_notes" id="f-rating_notes" rows="2" placeholder="e.g. Everything cleaned and returned on time"></textarea>`, "full")}
        </div>
        <div class="formbar"><button class="btn primary">Check in rental</button></div>
      </fieldset></form>` : ""}
    <section class="panel"><header><h2>Items</h2></header><div class="tablewrap"><table><tr><th>Item</th><th class="r">Qty</th><th>Condition out</th><th>Notes out</th>${!out ? h`<th>Condition in</th><th>Notes in</th><th class="r">Damage</th>` : ""}</tr>
      ${d.items.map((l) => h`<tr class="click" data-go="#/item/${l.item_id}"><td>${tag(l.tag)} <b>${l.name}</b><div class="small muted">${[l.category, l.size].filter(Boolean).join(" · ")}</div></td><td class="r num">${l.qty}</td><td>${condBadge(l.condition_out)}</td><td class="small">${l.notes_out || ""}</td>
        ${!out ? h`<td>${condBadge(l.condition_in)}</td><td class="small">${l.notes_in || ""}</td><td class="r num">${l.damage_charge ? money(l.damage_charge) : ""}</td>` : ""}</tr>`)}</table></div></section>
    <div class="print-only"><p class="small">The renter agrees to return all items by the due date in the condition listed above, and to pay for cleaning, repair or replacement of damaged or missing items.</p>
      <div class="sig"><div>Renter signature &amp; date</div><div>AHS Theatre signature &amp; date</div></div></div>`);
  bindRows();
  $("#printr").onclick = () => window.print();
  $("#editr").onclick = () => modal({
    title: "Edit rental details",
    body: h`<div class="grid">${fld("For", inp("purpose", r), "full")}${fld("Checked out", dateInp("date_out", r.date_out))}${fld("Due back", dateInp("date_due", r.date_due))}
      ${fld("Fee ($)", numInp("fee", r, "0.01"))}${fld("Deposit ($)", numInp("deposit", r, "0.01"))}
      ${!out ? h`${fld("Rating", h`<select name="rating" id="f-rt">${[5, 4, 3, 2, 1].map((n) => h`<option value="${n}" ${r.rating === n ? raw("selected") : ""}>${"★".repeat(n)} (${n})</option>`)}</select>`)}${fld("Rating notes", inp("rating_notes", r), "full")}` : ""}
      ${fld("Notes", area("notes", r, 2), "full")}</div>`,
    onOk: async (f) => { await api("PUT", "/api/rentals/" + id, formData(f)); toast("Saved"); viewRental(id); },
  });
  if ($("#delr")) $("#delr").onclick = () => confirmBox("Delete this rental?", "The rental and its item lines will be removed from the history. This can't be undone.", "Delete rental", async () => { await api("DELETE", "/api/rentals/" + id); location.hash = "#/rentals"; });
  if (!out) return;
  const f = $("#retf");
  const setStar = (n) => { $("#f-rating").value = n; $$("[data-star]").forEach((b) => b.classList.toggle("on", +b.dataset.star <= n)); };
  $$("[data-star]").forEach((b) => (b.onclick = () => setStar(+b.dataset.star)));
  const suggest = () => {
    let drop = 0, dmg = 0;
    $$("tr[data-line]", f).forEach((tr) => { const s = $("select", tr); drop = Math.max(drop, (+s.dataset.out || 0) - +s.value); dmg += +$("[name=dc]", tr).value || 0; });
    const late = r.date_due && $("#f-date_returned").value > r.date_due;
    let n = 5 - Math.min(drop, 3) - (late ? 1 : 0) - (dmg > 0 && drop === 0 ? 1 : 0);
    n = Math.max(1, n);
    $("#suggest").textContent = `Suggested: ${n} star${n > 1 ? "s" : ""} — ${drop ? `condition dropped ${drop} level${drop > 1 ? "s" : ""}` : "no condition loss"}${late ? ", returned late" : ""}${dmg ? `, $${dmg.toFixed(2)} in damage` : ""}. You decide.`;
    if (!$("#f-rating").value || f.dataset.auto === "1") { setStar(n); f.dataset.auto = "1"; }
  };
  $$("[data-star]").forEach((b) => b.addEventListener("click", () => (f.dataset.auto = "0")));
  $$("select[name=ci], [name=dc], #f-date_returned", f).forEach((el) => el.addEventListener("input", suggest));
  suggest();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const eb = $(".errbox", f);
    const body = { date_returned: $("#f-date_returned").value, rating: +$("#f-rating").value, rating_notes: $("#f-rating_notes").value, items: [] };
    if ($("#f-depret")) body.deposit_returned = $("#f-depret").checked;
    $$("tr[data-line]", f).forEach((tr) => body.items.push({ id: +tr.dataset.line, condition_in: +$("[name=ci]", tr).value, notes_in: $("[name=ni]", tr).value, damage_charge: $("[name=dc]", tr).value === "" ? null : +$("[name=dc]", tr).value, send_to_repair: $("[name=rp]", tr).checked }));
    try { await api("POST", `/api/rentals/${id}/return`, body); toast("Rental checked in"); viewRental(id); }
    catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
}

// ---------- shows ----------
let SQ = { q: "", status: "" };
async function viewShows() {
  shell("shows", h`
    ${page("Productions", "Shows", h`<a class="btn" href="/api/export/shows.csv">Export spreadsheet</a><a class="btn primary" href="#/shows/new">${icon("plus")}New show</a>`)}
    <p class="muted" style="max-width:68ch;margin-top:-8px">Each show keeps a permanent record of what was checked out, for which character and scene, any alterations made, and the condition it came back in.</p>
    <div class="searchbar"><div class="q">${icon("search")}<input type="search" id="s-q" placeholder="Search by title, director, season or year" value="${SQ.q}"></div>
      <select id="s-st" style="width:auto">${[["", "All shows"], ["planning", "Planning"], ["in production", "In production"], ["closed", "Closed"]].map(([v, t]) => h`<option value="${v}" ${SQ.status === v ? raw("selected") : ""}>${t}</option>`)}</select></div>
    <div id="slist"></div>`);
  let t;
  const run = async () => {
    const rows = await GET("/api/shows" + qs(SQ));
    $("#slist").innerHTML = rows.length ? h`<section class="panel tablewrap"><table><tr><th>Show</th><th>Season</th><th>Director</th><th>Run</th><th>Status</th><th class="r">Pieces used</th><th class="r">Still out</th></tr>
      ${rows.map((s) => h`<tr class="click" data-go="#/show/${s.id}"><td><b>${s.title}</b><div class="small muted">${s.type || ""}</div></td><td>${showLabel(s)}</td><td>${s.director || ""}</td>
        <td class="num small">${s.open_date ? fmtDate(s.open_date) + (s.close_date ? " – " + fmtDate(s.close_date) : "") : "—"}</td><td>${showPill(s.status)}</td><td class="r num">${s.pieces || 0}</td><td class="r num">${s.out_pieces || ""}</td></tr>`)}</table></section>`.s
      : h`<div class="panel"><div class="empty">${SQ.q || SQ.status ? "No shows match." : h`No shows yet. <a href="#/shows/new">Create the spring play</a> and check items out to it.`}</div></div>`.s;
    bindRows($("#slist"));
  };
  $("#s-q").oninput = (e) => { SQ.q = e.target.value; clearTimeout(t); t = setTimeout(run, 200); };
  $("#s-st").onchange = (e) => { SQ.status = e.target.value; run(); };
  run();
}
async function viewShowForm(id) {
  const y = new Date().getFullYear();
  let s = { status: "planning", year: y, type: "Play", director: S.me.display_name || "" };
  if (id) s = (await GET("/api/shows/" + id)).show;
  shell("shows", h`
    ${page("Shows", id ? "Edit " + s.title : "New show", "", h`<a href="#/shows">Shows</a>`)}
    <form id="showf" novalidate><div class="errbox" hidden></div>
      <fieldset><legend>Production</legend><div class="grid">
        ${fld("Title *", inp("title", s, 'placeholder="e.g. Little Shop of Horrors"'), "wide")}
        ${fld("Type", listInp("type", s, "show_type"))}
        ${fld("Season", listInp("season", s))}
        ${fld("School year / year", numInp("year", s, "1", 'min="1990" max="2100"'))}
        ${fld("Director", inp("director", s))}
        ${fld("Venue", inp("venue", s, 'placeholder="e.g. AHS Auditorium"'))}
        ${fld("Opening", dateInp("open_date", s.open_date))}${fld("Closing", dateInp("close_date", s.close_date))}
        ${fld("Status", sel("status", [["planning", "Planning"], ["in production", "In production"], ["closed", "Closed"]], s.status))}
        ${fld("Notes", area("notes", s, 3), "full")}
      </div></fieldset>
      <datalist id="dl-show_type">${(S.lists.show_type || []).map((v) => h`<option value="${v}">`)}</datalist><datalist id="dl-season">${(S.lists.season || []).map((v) => h`<option value="${v}">`)}</datalist>
      <div class="formbar"><a class="btn ghost" href="${id ? "#/show/" + id : "#/shows"}">Cancel</a>${id && isDirector() ? h`<button type="button" class="btn danger" id="delshow">Delete show</button>` : ""}<button class="btn primary">${id ? "Save changes" : "Create show"}</button></div>
    </form>`);
  const f = $("#showf");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    try { if (id) { await api("PUT", "/api/shows/" + id, d); location.hash = "#/show/" + id; } else { const x = await api("POST", "/api/shows", d); location.hash = "#/show/" + x.id; } toast("Saved"); }
    catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
  if ($("#delshow")) $("#delshow").onclick = () => confirmBox("Delete this show?", "Only shows with no items on record can be deleted. Mark a finished show Closed to keep its history.", "Delete show", async () => { await api("DELETE", "/api/shows/" + id); location.hash = "#/shows"; });
}

async function viewShow(id) {
  const d = await GET("/api/shows/" + id);
  const s = d.show, items = d.items;
  const outLines = items.filter((l) => !l.date_returned);
  const staged = (S.staged || []).map((l) => ({ ...l })); S.staged = null;
  const pieces = items.reduce((a, l) => a + l.qty, 0);
  const cats = {}; items.forEach((l) => (cats[l.category || "Other"] = (cats[l.category || "Other"] || 0) + l.qty));
  const chars = [...new Set(items.map((l) => l.character).filter(Boolean))];
  const groups = {}; items.forEach((l) => (groups[l.character || "No character assigned"] ||= []).push(l));
  shell("shows", h`
    ${page([s.type, showLabel(s)].filter(Boolean).join(" · ") || "Show", s.title, h`
      <button class="btn" id="printpull">${icon("print")}Print pull sheet</button>
      <a class="btn" href="#/items" id="browse">${icon("search")}Browse inventory</a>
      ${outLines.length ? h`<button class="btn dark" id="returnbtn">Return items (${outLines.length})</button>` : ""}
      <a class="btn" href="#/show/${id}/edit">Edit show</a>`, h`<a href="#/shows">Shows</a>`)}
    <div class="avail" style="margin-top:0">${showPill(s.status)}
      <span class="small">${s.director ? "Directed by " + s.director : ""}${s.open_date ? ` · ${fmtDate(s.open_date)}${s.close_date ? " – " + fmtDate(s.close_date) : ""}` : ""}${s.venue ? " · " + s.venue : ""}</span>
      <span class="small muted" style="margin-left:auto">${pieces} piece${pieces === 1 ? "" : "s"} used${Object.keys(cats).length ? ": " + Object.entries(cats).map(([c, n]) => `${n} ${c.toLowerCase()}`).join(", ") : ""}${outLines.length ? ` · ${outLines.reduce((a, l) => a + l.qty, 0)} still out` : ""}</span></div>
    ${s.notes ? h`<p class="small" style="max-width:70ch">${s.notes}</p>` : ""}
    <datalist id="dl-characters">${chars.map((c) => h`<option value="${c}">`)}</datalist>
    ${s.status !== "closed" ? h`<fieldset class="no-print"><legend>Check items out to this show</legend><div class="errbox" id="coerr" hidden></div>
      <div id="stlines"></div>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0 14px">${fld("Date checked out", dateInp("co_date", todayISO()))}<button type="button" class="btn primary" id="cobtn">Check out to ${s.title}</button></div>
      <div id="pick"></div></fieldset>` : h`<div class="note no-print">This show is closed. Its record below is kept as history. Reopen it with <b>Edit show</b> to check out more items.</div>`}
    <section class="panel"><header><h2>Costumes, props &amp; pieces used</h2><span class="more small muted">Grouped by character</span></header>
      ${items.length ? h`<div class="tablewrap"><table><tr><th>Item</th><th>Scene / act</th><th>Actor</th><th>How it's used</th><th>Alterations</th><th>Out</th><th>Back</th><th class="no-print"></th></tr>
        ${Object.entries(groups).map(([g, ls]) => h`<tr class="group-h"><td colspan="8">${g}</td></tr>${ls.map((l) => h`<tr>
          <td><a href="#/item/${l.item_id}">${tag(l.tag)}</a> <b>${l.name}</b>${l.qty > 1 ? ` × ${l.qty}` : ""}<div class="small muted">${[l.category, l.size && "Size " + l.size, l.location].filter(Boolean).join(" · ")}</div></td>
          <td>${l.scene || ""}</td><td>${l.actor || ""}</td><td class="small">${l.usage_notes || ""}</td><td class="small">${l.alterations || ""}</td>
          <td class="num small">${fmtDate(l.date_out)}<div>${condBadge(l.condition_out)}</div></td>
          <td class="num small">${l.date_returned ? h`${fmtDate(l.date_returned)}<div>${condBadge(l.condition_in)}</div>${l.notes_in ? h`<div class="muted">${l.notes_in}</div>` : ""}` : h`<span class="pill warn">Out</span>`}</td>
          <td class="no-print" style="white-space:nowrap"><button class="btn sm" data-edit="${l.id}">Edit</button>${!l.date_returned || isDirector() ? h` <button class="btn sm ghost" data-del="${l.id}" title="Remove from this show">✕</button>` : ""}</td></tr>`)}`)}</table></div>`
        : h`<div class="empty">Nothing has been checked out to this show yet.</div>`}
    </section>`);
  $("#printpull").onclick = () => window.print();
  $("#browse").onclick = () => { INV = { ...INV_DEFAULT }; };
  // staging area
  if ($("#stlines")) {
    const box = $("#stlines");
    const rerender = () => bindLines(box, staged, "show", rerender);
    rerender();
    picker($("#pick"), (it) => { if (staged.some((l) => l.id === it.id)) return; staged.push(it); rerender(); });
    $("#cobtn").onclick = async () => {
      const eb = $("#coerr");
      if (!staged.length) { eb.textContent = "Add items first: search below or use your pull list."; eb.hidden = false; return; }
      try {
        await api("POST", `/api/shows/${id}/items`, { date_out: $("#f-co_date").value, items: staged.map((l) => ({ item_id: l.id, qty: l.qty || 1, character: l.character, actor: l.actor, scene: l.scene, usage_notes: l.usage_notes })) });
        const ids = new Set(staged.map((l) => l.id)); const before = S.pull.length; S.pull = S.pull.filter((p) => !ids.has(p.id)); if (S.pull.length !== before) savePull();
        toast(`Checked out ${staged.length} item${staged.length === 1 ? "" : "s"}`); viewShow(id);
      } catch (err) { eb.textContent = err.message; eb.hidden = false; }
    };
  }
  $$("[data-edit]").forEach((b) => (b.onclick = () => {
    const l = items.find((x) => x.id === +b.dataset.edit);
    modal({ title: "Edit how " + l.name + " was used",
      body: h`<datalist id="dl-characters">${chars.map((c) => h`<option value="${c}">`)}</datalist><div class="grid">
        ${fld("Character / use", h`<input type="text" name="character" id="e-char" list="dl-characters" value="${l.character || ""}">`)}${fld("Actor", h`<input type="text" name="actor" id="e-actor" value="${l.actor || ""}">`)}
        ${fld("Scene / act", h`<input type="text" name="scene" id="e-scene" value="${l.scene || ""}">`)}${fld("How it's used", h`<input type="text" name="usage_notes" id="e-use" value="${l.usage_notes || ""}">`, "full")}
        ${fld("Alterations made", h`<textarea name="alterations" id="e-alt" rows="2" placeholder="e.g. Hem taken up 2 inches; darts added at waist">${l.alterations || ""}</textarea>`, "full")}</div>`,
      onOk: async (f) => { await api("PUT", "/api/show-items/" + l.id, formData(f)); toast("Saved"); viewShow(id); } });
  }));
  $$("[data-del]").forEach((b) => (b.onclick = () => { const l = items.find((x) => x.id === +b.dataset.del);
    confirmBox("Remove from this show?", `${l.name} will be taken off ${s.title}'s record${l.date_returned ? "" : " and become available again"}.`, "Remove", async () => { await api("DELETE", "/api/show-items/" + l.id); viewShow(id); }); }));
  if ($("#returnbtn")) $("#returnbtn").onclick = () => {
    const form = modal({ title: "Return items from " + s.title, ok: "Return checked items", wide: true,
      body: h`<p class="small muted" style="margin-top:0">Inspect each piece. Untick anything not back yet.</p><div class="tablewrap"><table class="lines"><tr><th></th><th>Item</th><th style="width:170px">Condition now</th><th>Notes</th><th>Alterations</th><th>Repair</th></tr>
        ${outLines.map((l) => h`<tr data-rl="${l.id}"><td><input type="checkbox" name="back" checked aria-label="Returned"></td><td>${tag(l.tag)} <b>${l.name}</b><div class="small muted">${l.character || ""}</div></td>
          <td><select name="ci" aria-label="Condition">${condOptions(l.condition_out || l.current_condition)}</select></td><td><input type="text" name="ni" placeholder="e.g. Needs cleaning" aria-label="Notes"></td>
          <td><input type="text" name="alt" value="${l.alterations || ""}" aria-label="Alterations"></td><td><label class="check small"><input type="checkbox" name="rp"> Send</label></td></tr>`)}</table></div>
        <div class="grid" style="margin-top:12px">${fld("Returned on", dateInp("ret_date", todayISO()))}<div style="align-self:end"><label class="check"><input type="checkbox" id="closeshow" ${s.close_date && s.close_date <= todayISO() ? raw("checked") : ""}> Mark the show closed</label></div></div>`,
      onOk: async (f) => {
        const rows = $$("tr[data-rl]", f).filter((tr) => $("[name=back]", tr).checked);
        if (!rows.length) throw new Error("Tick at least one item that came back.");
        await api("POST", `/api/shows/${id}/return`, { date_returned: $("#f-ret_date", f).value, close_show: $("#closeshow", f).checked && rows.length === outLines.length,
          items: rows.map((tr) => ({ id: +tr.dataset.rl, condition_in: +$("[name=ci]", tr).value, notes_in: $("[name=ni]", tr).value, alterations: $("[name=alt]", tr).value, send_to_repair: $("[name=rp]", tr).checked })) });
        toast(`Returned ${rows.length} item${rows.length === 1 ? "" : "s"}`); viewShow(id);
      } });
    return form;
  };
}

// ---------- activity ----------
async function viewActivity() {
  const rows = await GET("/api/activity?limit=300");
  shell("activity", h`${page("Who did what", "Activity log")}
    <section class="panel tablewrap">${rows.length ? h`<table><tr><th>When</th><th>Who</th><th>What</th></tr>${rows.map((a) => h`<tr><td class="num" style="white-space:nowrap">${a.at}</td><td>${a.user || ""}</td><td>${a.details}</td></tr>`)}</table>` : h`<div class="empty">No activity yet.</div>`}</section>`);
}

// ---------- settings ----------
async function viewSettings() {
  const sys = await GET("/api/system");
  const dir = isDirector();
  const [users, backups, cloud] = dir ? await Promise.all([GET("/api/users"), GET("/api/backups"), GET("/api/cloud")]) : [[], null, null];
  const LISTS = [["category", "Categories"], ["subcategory", "Item types"], ["era", "Eras / periods"], ["gender", "Genders"], ["size", "Sizes"], ["material", "Materials"], ["color", "Colors"], ["location", "Storage locations"], ["show_type", "Show types"], ["season", "Seasons"]];
  shell("settings", h`
    ${page("Settings", dir ? "Settings" : "My account")}
    <div class="stack">
      ${dir ? h`<section class="panel" id="cloudp"><header><h2>Cloud backup</h2>${cloud.folder ? (cloud.last_error ? h`<span class="pill bad">Problem</span>` : h`<span class="pill good">On</span>`) : h`<span class="pill warn">Off</span>`}</header><div class="body">
        <p style="margin-top:0;max-width:70ch">Keep a copy of the database and photos in your school OneDrive or Google Drive folder. The app updates the copy about a minute and a half after each change, and keeps a daily copy for 60 days. If this computer fails, install the app on a new one, set the same folder here and click <b>Restore</b>.</p>
        ${cloud.last_error ? h`<div class="errbox">${cloud.last_error}</div>` : ""}
        ${cloud.folder ? h`<p class="small">Saving to <b class="mono">${cloud.backup_folder}</b><br>Last copied: <b>${cloud.last_sync ? fmtWhen(cloud.last_sync) + " (" + cloud.last_sync + ")" : "not yet this session"}</b></p>` : ""}
        <form id="cloudf" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end" novalidate>
          <div style="flex:1 1 320px">${fld("Synced folder on this computer", h`<input type="text" name="folder" id="cf-folder" value="${cloud.folder}" placeholder="e.g. C:\\Users\\you\\OneDrive - Alton CUSD 11">`)}</div>
          <button class="btn primary">Save folder</button>${cloud.folder ? h`<button type="button" class="btn" id="syncnow">Back up now</button><button type="button" class="btn ghost" id="cloudoff">Turn off</button>` : ""}
        </form>
        ${cloud.candidates.length ? h`<p class="small" style="margin-bottom:0">Found on this computer: ${cloud.candidates.map((c) => h`<button type="button" class="btn sm" data-cand="${c.path}">${c.label}</button> `)}</p>` : h`<p class="small muted" style="margin-bottom:0">No OneDrive or Google Drive folder was found. Sign in to OneDrive (or install Google Drive for desktop), then come back.</p>`}
        ${cloud.backups.length ? h`<h3 style="margin:18px 0 8px">Copies in the cloud folder</h3><div class="tablewrap"><table><tr><th>Copy</th><th>Saved</th><th class="r">Size</th><th></th></tr>${cloud.backups.slice(0, 15).map((b) => h`<tr><td>${b.label}</td><td class="num">${b.modified}</td><td class="r num">${(b.size / 1048576).toFixed(1)} MB</td><td class="r"><button class="btn sm" data-restore-cloud="${b.name}" data-label="${b.label}">Restore</button></td></tr>`)}</table></div>` : ""}
      </div></section>` : ""}

      <section class="panel"><header><h2>My account</h2></header><div class="body">
        <p style="margin-top:0">Signed in as <b>${S.me.username}</b> (${S.me.role === "director" ? "Director" : "Assistant"}).</p>
        <form id="pwf" class="grid" style="max-width:720px" novalidate><div class="errbox full" hidden></div>
          ${fld("Current password", h`<input type="password" name="current" id="pw0" autocomplete="current-password">`)}
          ${fld("New password", h`<input type="password" name="new" id="pw1" autocomplete="new-password">`)}
          ${fld("Confirm new password", h`<input type="password" name="confirm" id="pw2" autocomplete="new-password">`)}
          <div class="full"><button class="btn">Change password</button></div></form>
      </div></section>

      ${dir ? h`<section class="panel"><header><h2>Users</h2><button class="btn sm primary more" id="adduser">${icon("plus")}Add user</button></header>
        <div class="tablewrap"><table><tr><th>Name</th><th>Username</th><th>Role</th><th>Last sign-in</th><th>Status</th><th></th></tr>
        ${users.map((u) => h`<tr><td><b>${u.display_name || ""}</b></td><td class="mono">${u.username}</td><td>${u.role === "director" ? "Director" : "Assistant"}</td><td class="num">${u.last_login ? fmtWhen(u.last_login) : "Never"}</td>
          <td>${u.active ? (u.must_change ? h`<span class="pill info">Temporary password</span>` : h`<span class="pill good">Active</span>`) : h`<span class="pill mute">Disabled</span>`}</td>
          <td class="r"><button class="btn sm" data-user="${u.id}">Manage</button></td></tr>`)}</table></div>
        <div class="body small muted">Directors can do everything. Assistants can add and edit items, renters, rentals and show checkouts, but can't delete records, change lists, manage users or restore backups.</div></section>

      <section class="panel"><header><h2>Dropdown lists</h2></header><div class="body">
        <p class="small muted" style="margin-top:0">These are the suggestions offered when you add items and the choices in the search filters. Values already used on items always appear in the filters too.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${LISTS.map(([k, t]) => h`<button class="btn sm" data-list="${k}" data-title="${t}">${t} <span class="muted">(${(S.configured[k] || []).length})</span></button>`)}</div></div></section>

      <section class="panel"><header><h2>Backups on this computer</h2><button class="btn sm more" id="bknow">Back up now</button></header><div class="body">
        <p class="small muted" style="margin-top:0">A backup is made automatically every day the program runs (the last 30 are kept), and before any restore. Folder: <span class="mono">${backups.folder}</span> <button class="btn sm ghost" id="openbk">Open folder</button></p>
        ${backups.backups.length ? h`<div class="tablewrap"><table><tr><th>File</th><th>Saved</th><th class="r">Size</th><th></th></tr>${backups.backups.slice(0, 12).map((b) => h`<tr><td class="mono small">${b.name}</td><td class="num">${b.modified}</td><td class="r num">${(b.size / 1048576).toFixed(1)} MB</td><td class="r"><button class="btn sm" data-restore-local="${b.name}">Restore</button></td></tr>`)}</table></div>` : h`<p class="muted">No backups yet.</p>`}
      </div></section>` : ""}

      <section class="panel"><header><h2>Export to Excel</h2></header><div class="body" style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="/api/export/items.csv">Inventory</a><a class="btn" href="/api/export/shows.csv">Show history</a><a class="btn" href="/api/export/rentals.csv">Rental history</a><a class="btn" href="/api/export/renters.csv">Renters</a></div></section>

      <section class="panel"><header><h2>About this installation</h2></header><div class="body small">
        <div class="dl"><div><span>Version</span><b>${sys.version}</b></div><div><span>Address</span><b class="mono">http://127.0.0.1:${sys.port}</b></div><div style="grid-column:1/-1"><span>Data folder</span><b class="mono">${sys.data_folder}</b></div></div>
        ${sys.network && sys.lan_urls && sys.lan_urls.length ? h`<p>Other computers on the school network can open: ${sys.lan_urls.map((u) => h`<span class="mono">${u}</span> `)}</p>` : ""}
        ${dir ? h`<p style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:0"><button class="btn sm" id="opendata">Open data folder</button><button class="btn sm danger" id="quit">Close the inventory program</button></p>` : ""}
      </div></section>
    </div>`);

  const pwf = $("#pwf");
  pwf.onsubmit = async (e) => { e.preventDefault(); const d = formData(pwf), eb = $(".errbox", pwf);
    if (d.new !== d.confirm) { eb.textContent = "The two new passwords don't match."; eb.hidden = false; return; }
    try { await api("POST", "/api/me/password", d); pwf.reset(); eb.hidden = true; toast("Password changed"); } catch (err) { eb.textContent = err.message; eb.hidden = false; } };
  if (!dir) return;

  // cloud
  const cf = $("#cloudf");
  const saveCloud = async (folder, sync) => {
    try {
      const r = await api("PUT", "/api/cloud", { folder, sync });
      if (r.existing) {
        modal({ title: "This folder already has a backup", ok: null,
          body: h`<p>The cloud folder already holds an inventory backup saved <b>${r.existing}</b>, probably from another computer.</p>
            <p><b>Setting up a new computer?</b> Restore it to bring all your items, shows, rentals and photos here.</p><p><b>Otherwise</b>, replace it with this computer's data.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><button type="button" class="btn primary" id="m-restore">Restore that backup here</button><button type="button" class="btn" id="m-over">Replace it with this computer's data</button></div>` });
        $("#m-restore").onclick = () => restore("cloud", "inventory-latest.db", "the most recent cloud copy");
        $("#m-over").onclick = async () => { await saveCloud(folder, true); };
        return;
      }
      toast(folder ? "Cloud backup is on" : "Cloud backup turned off"); viewSettings();
    } catch (err) { toast(err.message, true); }
  };
  cf.onsubmit = (e) => { e.preventDefault(); saveCloud($("#cf-folder").value.trim(), false); };
  $$("[data-cand]").forEach((b) => (b.onclick = () => { $("#cf-folder").value = b.dataset.cand; }));
  if ($("#syncnow")) $("#syncnow").onclick = async () => { try { await api("POST", "/api/cloud/sync"); toast("Backed up to the cloud folder"); viewSettings(); } catch (err) { toast(err.message, true); } };
  if ($("#cloudoff")) $("#cloudoff").onclick = () => confirmBox("Turn off cloud backup?", "Copies already in the cloud folder are left there.", "Turn off", () => saveCloud("", false));
  const restore = (source, name, label) => modal({ title: "Restore " + label + "?", ok: "Restore", okClass: "primary",
    body: h`<p>Everything in the inventory will be replaced with this backup. A safety copy of the current data is saved first, so you can undo this from the backups list.</p><p class="small muted">Users and passwords come from the backup too. After restoring, sign in with an account from that backup.</p>`,
    onOk: async () => { const r = await api("POST", "/api/restore", { source, name }); toast(`Restored${r.photos ? `, plus ${r.photos} photos` : ""}`); setTimeout(() => location.reload(), 900); } });
  $$("[data-restore-cloud]").forEach((b) => (b.onclick = () => restore("cloud", b.dataset.restoreCloud, b.dataset.label.toLowerCase())));
  $$("[data-restore-local]").forEach((b) => (b.onclick = () => restore("local", b.dataset.restoreLocal, b.dataset.restoreLocal)));

  // users
  $("#adduser").onclick = () => modal({ title: "Add a user", ok: "Add user",
    body: h`<div class="grid">${fld("Name", h`<input type="text" name="display_name" id="u-name" placeholder="e.g. Jordan (stage manager)">`, "full")}${fld("Username", h`<input type="text" name="username" id="u-user" autocomplete="off">`)}
      ${fld("Role", sel("role", [["assistant", "Assistant"], ["director", "Director"]], "assistant"))}${fld("Temporary password", h`<input type="text" name="password" id="u-pw" autocomplete="off">`, "full", "At least 8 characters. They'll choose their own when they first sign in.")}</div>`,
    onOk: async (f) => { await api("POST", "/api/users", formData(f)); toast("User added"); viewSettings(); } });
  $$("[data-user]").forEach((b) => (b.onclick = () => {
    const u = users.find((x) => x.id === +b.dataset.user), self = u.id === S.me.id;
    modal({ title: "Manage " + (u.display_name || u.username),
      body: h`<div class="grid">${fld("Name", h`<input type="text" name="display_name" id="mu-name" value="${u.display_name || ""}">`, "full")}
        ${self ? "" : h`${fld("Role", sel("role", [["assistant", "Assistant"], ["director", "Director"]], u.role))}<div style="align-self:end"><label class="check"><input type="checkbox" name="active" id="mu-act" ${u.active ? raw("checked") : ""}> Account enabled</label></div>`}
        ${fld("Set a new temporary password", h`<input type="text" name="password" id="mu-pw" autocomplete="off" placeholder="Leave blank to keep the current one">`, "full", self ? "To change your own password, use My account." : "They'll be asked to change it at their next sign-in.")}</div>`,
      onOk: async (f) => { const d = formData(f); if (self) delete d.password; await api("PUT", "/api/users/" + u.id, d); toast("Saved"); viewSettings(); } });
  }));
  // lists
  $$("[data-list]").forEach((b) => (b.onclick = () => modal({ title: b.dataset.title,
    body: h`<label for="lv">One per line, in the order you want them shown</label><textarea id="lv" rows="14">${(S.configured[b.dataset.list] || []).join("\n")}</textarea>`,
    onOk: async (f) => { await api("PUT", "/api/lookups", { list: b.dataset.list, values: $("#lv", f).value.split("\n") }); await refreshLookups(); toast("List saved"); viewSettings(); } })));
  $("#bknow").onclick = async () => { try { const r = await api("POST", "/api/backups"); toast("Saved " + r.name); viewSettings(); } catch (err) { toast(err.message, true); } };
  $("#openbk").onclick = () => api("POST", "/api/open-folder", { which: "backups" });
  $("#opendata").onclick = () => api("POST", "/api/open-folder", { which: "data" });
  $("#quit").onclick = () => confirmBox("Close the inventory program?", "Everything is saved. Open it again any time from the desktop shortcut.", "Close program", async () => {
    await api("POST", "/api/shutdown");
    $("#app").innerHTML = h`<div class="boot"><img src="logo.png" alt="" width="96" height="96"><p>The inventory program is closed. You can close this tab.</p></div>`.s;
  });
}

boot();
