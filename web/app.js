"use strict";
/* School Theatre Manager — browser interface. Talks to the local server at /api. */

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
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  program: '<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="M9 11h6M9 14h6M9 17h4"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
};
const icon = (n) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`);

// ---------- state ----------
const S = { me: null, lists: {}, configured: {}, shows: [], pull: loadPull(), staged: null, brand: { product: "School Theatre Manager", name: "School Theatre Manager" } };

// ---------- school branding ----------
const BN = () => S.brand.name || "School Theatre Manager";          // the theatre program's name
const logoURL = () => "/branding/logo.png" + (S.brand.logo_version ? "?v=" + S.brand.logo_version : "");
function hexToRgb(hx) { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgbToHex = (r) => "#" + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (hx) => { const [r, g, b] = hexToRgb(hx).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function applyBrand() {
  const b = S.brand, st = document.documentElement.style;
  document.title = BN();
  let fav = $('link[rel="icon"]'); if (fav) fav.href = logoURL();
  if (b.accent && /^#[0-9a-f]{6}$/i.test(b.accent)) {
    const light = luminance(b.accent) > 0.4;
    st.setProperty("--red", b.accent);
    st.setProperty("--red-ink", light ? mixHex(b.accent, "#000000", 0.45) : mixHex(b.accent, "#000000", 0.2));
    st.setProperty("--red-wash", mixHex(b.accent, "#ffffff", 0.9));
    st.setProperty("--on-accent", light ? "#1b1717" : "#ffffff");
  } else ["--red", "--red-ink", "--red-wash", "--on-accent"].forEach((k) => st.removeProperty(k));
}
async function loadBrand() { try { S.brand = await GET("/api/branding"); } catch {} applyBrand(); }
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
  try { res = await fetch(url, opt); } catch { throw new ApiError(`${BN()} isn't running. Open it from the desktop shortcut, then try again.`, 0); }
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
const SHOWSTATUS = { planning: ["Planning", "info"], "in production": ["In production", "warn"], closed: ["Past show", "mute"] };
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
    if (el.type === "radio") { if (el.checked) o[el.name] = el.value; }
    else if (el.type === "checkbox") o[el.name] = el.checked;
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
  ["dashboard", "Dashboard", "home"], ["items", "Inventory", "box"], ["shows", "Current shows", "mask"], ["past-shows", "Past shows", "archive"], ["rentals", "Rentals", "swap"], ["renters", "Renters", "users"], ["sponsors", "Sponsors", "star"],
  null, ["pull", "Pull list", "list"], ["activity", "Activity log", "clock"], ["settings", "Settings", "gear"],
];
function shell(active, content) {
  const pullN = S.pull.length;
  $("#app").innerHTML = h`<div class="shell">
    <aside class="side no-print">
      <div class="brand"><img src="${logoURL()}" alt="${BN()} logo"><div><b>${BN()}</b>${S.brand.school && S.brand.school !== BN() ? h`<span>${S.brand.school}</span>` : ""}</div></div>
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

// ---------- password rule ----------
const PW_RULE = "At least 8 characters, including a capital letter and a special character such as ! @ # $ % &.";
const pwChecks = (pw) => [[pw.length >= 8, "8 or more characters"], [/\p{Lu}/u.test(pw), "a capital letter"], [/[^\p{L}\p{N}\s]/u.test(pw), "a special character (! @ # $ % & …)"]];
const pwOK = (pw) => pwChecks(pw).every(([ok]) => ok);
// Shows a live checklist under a new-password field.
function pwMeter(input) {
  const box = document.createElement("ul"); box.className = "pwcheck"; box.setAttribute("aria-live", "polite");
  input.insertAdjacentElement("afterend", box);
  const draw = () => { box.innerHTML = pwChecks(input.value).map(([ok, t]) => h`<li class="${ok ? "ok" : ""}">${ok ? "✓" : "○"} ${t}</li>`.s).join(""); };
  input.addEventListener("input", draw); draw();
}

// ---------- auth screens ----------
function authFrame(inner) {
  $("#app").innerHTML = h`<div class="login"><div class="curtain"><img src="${logoURL()}" alt="${BN()} logo"><h1>${BN()}</h1>${S.brand.school && S.brand.school !== BN() ? h`<p class="school">${S.brand.school}</p>` : ""}<p>${S.brand.tagline || "Shows, cast and crew, costumes, props and set pieces: what we own, where it is, and every production it has been part of."}</p></div>${inner}</div>`.s;
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
    <div><h2>Create the director account</h2><p class="muted small">This account owns ${BN()}. It can add other users, change settings and restore backups.</p></div>
    <div class="errbox" hidden></div>
    ${fld("Your name", h`<input type="text" name="display_name" id="sd" placeholder="e.g. Ms. Rivera">`)}
    ${fld("Username", h`<input type="text" name="username" id="su" autocomplete="username">`, "", "Letters, numbers, dots or dashes.")}
    ${fld("Password", h`<input type="password" name="password" id="sp" autocomplete="new-password">`)}
    ${fld("Confirm password", h`<input type="password" name="confirm" id="sc" autocomplete="new-password">`)}
    <button class="btn primary" style="justify-content:center;padding:10px">Create account</button>
  </form>`);
  const f = $("#setupf");
  pwMeter($("#sp"));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    if (!pwOK(d.password)) { eb.textContent = "Choose a stronger password. " + PW_RULE; eb.hidden = false; return; }
    if (d.password !== d.confirm) { eb.textContent = "The two passwords don't match."; eb.hidden = false; return; }
    try { await api("POST", "/api/setup", d); await boot(); } catch (err) { eb.textContent = err.message; eb.hidden = false; }
  };
}
function renderMustChange() {
  authFrame(h`<form id="mcf" novalidate>
    <div><h2>Choose a new password</h2><p class="muted small">Your password is temporary or doesn't meet the new security rule. Pick a new one only you know.</p></div>
    <div class="errbox" hidden></div>
    ${fld("Current password", h`<input type="password" name="current" id="mc0" autocomplete="current-password">`)}
    ${fld("New password", h`<input type="password" name="new" id="mc1" autocomplete="new-password">`)}
    ${fld("Confirm new password", h`<input type="password" name="confirm" id="mc2" autocomplete="new-password">`)}
    <button class="btn primary" style="justify-content:center;padding:10px">Save password</button>
  </form>`);
  const f = $("#mcf");
  pwMeter($("#mc1"));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f);
    if (!pwOK(d.new)) { eb.textContent = "Choose a stronger password. " + PW_RULE; eb.hidden = false; return; }
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
  [/^#\/past-shows$/, viewPastShows],
  [/^#\/past-shows\/new$/, () => viewShowForm(null, true)],
  [/^#\/show\/(\d+)$/, (m) => viewShow(+m[1])],
  [/^#\/show\/(\d+)\/program$/, (m) => viewProgram(+m[1])],
  [/^#\/show\/(\d+)\/(people|numbers|materials|photos)$/, (m) => viewShow(+m[1], m[2])],
  [/^#\/sponsors$/, () => viewSponsors()],
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
  await loadBrand();
  try { S.me = await GET("/api/me"); } catch (e) { if (e.code === 401 || e.code === 428) return; $("#app").innerHTML = h`<div class="boot"><img src="${logoURL()}" alt="" width="96" height="96"><p>${e.message}</p></div>`.s; return; }
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
    ${page(S.brand.school || BN(), `Welcome back, ${S.me.display_name || S.me.username}`)}
    <div class="quick no-print">
      <a class="btn primary" href="#/items/new">${icon("plus")}Add an item</a>
      <a class="btn" href="#/items">${icon("search")}Search inventory</a>
      <a class="btn" href="#/shows/new">${icon("mask")}Create a show</a>
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
          ${d.shows.length ? h`<div class="tablewrap"><table><tr><th>Show</th><th>Opens</th><th class="r">Pieces out</th></tr>${d.shows.map((s) => h`<tr class="click" data-go="#/show/${s.id}"><td style="display:flex;gap:10px;align-items:center">${s.cover ? h`<img class="thumb cov" src="${showFileURL(s.cover)}" alt="" loading="lazy">` : h`<span class="thumb ph">${icon("mask")}</span>`}<span><b>${s.title}</b><div class="small muted">${[s.type, showLabel(s)].filter(Boolean).join(" · ")}</div></span></td><td class="num">${fmtDate(s.open_date)}</td><td class="r num">${s.out_pieces || 0}</td></tr>`)}</table></div>`
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
      <button class="btn sm addpull" type="button" data-pull="${i.id}" title="Add to pull list">+ Pull</button>${i.photo_count > 1 ? h`<span class="pcount">${i.photo_count} photos</span>` : ""}
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

// ---------- pictures & files: shared helpers ----------
// Phone photos are often 4–8 MB. Shrink them in the browser before upload so the database,
// backups and cloud copies stay small. Anything that can't be decoded is sent unchanged.
async function shrinkImage(file, max = 2400, quality = 0.86) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}
const fmtSize = (b) => b == null ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB";
const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name);

// Upload files in small batches, reporting progress in a status element.
async function uploadAll(url, field, files, { photos = false, extra = {}, status } = {}) {
  const per = photos ? 6 : 1;
  for (let i = 0; i < files.length; i += per) {
    const batch = files.slice(i, i + per);
    if (status) status.textContent = `Uploading ${Math.min(i + batch.length, files.length)} of ${files.length}…`;
    const fd = new FormData();
    for (const f of batch) fd.append(field, photos ? await shrinkImage(f) : f);
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") fd.append(k, v);
    await api("POST", url, fd);
  }
  if (status) status.textContent = "";
}

// A drop area: click to choose, drag files onto it, or paste a copied picture.
function dropzone(el, { accept = "", label, sub, onFiles }) {
  el.classList.add("drop");
  el.innerHTML = h`<input type="file" multiple ${accept ? raw(`accept="${accept}"`) : ""} hidden><div class="dz-l">${icon("upload")}<b>${label}</b></div><div class="small muted">${sub}</div><div class="dz-s small" aria-live="polite"></div>`.s;
  const input = $("input", el);
  const take = (list) => { const files = [...list].filter((f) => f.size > 0); if (files.length) onFiles(files, $(".dz-s", el)); };
  el.tabIndex = 0; el.setAttribute("role", "button");
  el.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.onchange = () => { take(input.files); input.value = ""; };
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); take(e.dataTransfer.files); });
  el.addEventListener("paste", (e) => take(e.clipboardData.files));
  return el;
}

// Full-screen picture viewer with arrows and keyboard.
function lightbox(list, start = 0) {
  let i = start;
  const root = document.createElement("div");
  root.className = "lb"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Photo viewer");
  const draw = () => {
    const p = list[i];
    root.innerHTML = h`<button class="lb-x" aria-label="Close">✕</button>
      ${list.length > 1 ? h`<button class="lb-prev" aria-label="Previous photo">‹</button><button class="lb-next" aria-label="Next photo">›</button>` : ""}
      <figure><img src="${p.src}" alt="${p.caption || ""}"><figcaption>${p.caption || ""}<span class="muted"> ${list.length > 1 ? `${i + 1} of ${list.length}` : ""}</span></figcaption></figure>`.s;
    $(".lb-x", root).onclick = close;
    if ($(".lb-prev", root)) { $(".lb-prev", root).onclick = (e) => { e.stopPropagation(); go(-1); }; $(".lb-next", root).onclick = (e) => { e.stopPropagation(); go(1); }; }
  };
  const go = (d) => { i = (i + d + list.length) % list.length; draw(); };
  const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
  function close() { document.removeEventListener("keydown", key); root.remove(); }
  root.addEventListener("click", (e) => { if (e.target === root || e.target.tagName === "FIGURE") close(); });
  document.addEventListener("keydown", key);
  draw(); document.body.appendChild(root); $(".lb-x", root).focus();
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
      <div id="gallery"></div>
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
    <div id="tagcard"><div class="bar"><img src="${logoURL()}" alt=""><b>${BN()}</b></div><div class="t">${it.tag}</div><div class="n">${it.name}</div>
      <div class="small">${[it.category, it.era, it.gender, it.size && "Size " + it.size].filter(Boolean).join(" · ")}</div><div class="small">${meas}</div><div class="small">Home: ${it.location || "—"}</div></div>`);
  bindRows();
  itemGallery($("#gallery"), it, d.photos);
  $$("[data-tab]").forEach((b) => (b.onclick = () => { $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab)); }));
  $("#pullit").onclick = () => addToPull(it);
  $("#printtag").onclick = () => { document.body.classList.add("print-tag"); window.print(); setTimeout(() => document.body.classList.remove("print-tag"), 500); };
  $("#inspect").onclick = () => modal({
    title: "Record condition", ok: "Save condition",
    body: h`<div class="grid">${fld("Condition now", h`<select name="condition" id="m-cond">${condOptions(it.condition)}</select>`, "full")}
      ${fld("Status", sel("status", [["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"]], it.status), "full")}
      ${fld("What you found", h`<textarea name="notes" id="m-notes" rows="3" placeholder="e.g. Hem re-sewn, small stain on left cuff">${it.condition_notes || ""}</textarea>`, "full")}</div>`,
    onOk: async (f) => { await api("POST", `/api/items/${id}/condition`, formData(f)); toast("Condition recorded"); viewItem(id); },
  });
  if ($("#delitem")) $("#delitem").onclick = () => confirmBox("Delete this item?", `${it.tag} ${it.name} and its photos will be removed permanently. Items with show or rental history can't be deleted; retire them instead.`, "Delete item", async () => { await api("DELETE", "/api/items/" + id); toast("Item deleted"); location.hash = "#/items"; });
}

// Photo gallery for one item: big picture, thumbnail strip, captions, main photo, order, drop zone.
function itemGallery(box, it, photos, cur = 0) {
  cur = Math.min(cur, Math.max(photos.length - 1, 0));
  const p = photos[cur];
  const isMain = p && p.file === it.photo;
  box.innerHTML = h`
    <div class="photo ${p ? "has" : ""}" id="mainphoto" ${p ? raw('title="Click to view full screen"') : ""}>${p ? h`<img src="${photoURL(p.file)}" alt="${p.caption || it.name}">` : h`<div class="ph-empty">${icon("camera")}<span class="small">No photos yet</span></div>`}</div>
    ${p ? h`<div class="pcap no-print"><span>${p.caption ? p.caption : h`<span class="muted">No caption</span>`}${isMain ? h` <span class="pill info">Main photo</span>` : ""}</span>
      <span class="pact">${photos.length > 1 && !isMain ? h`<button class="btn sm" data-pa="main">Make main</button>` : ""}
        <button class="btn sm ghost" data-pa="caption">Caption</button>
        ${photos.length > 1 ? h`<button class="btn sm ghost" data-pa="left" ${cur === 0 ? raw("disabled") : ""} aria-label="Move earlier">←</button><button class="btn sm ghost" data-pa="right" ${cur === photos.length - 1 ? raw("disabled") : ""} aria-label="Move later">→</button>` : ""}
        <button class="btn sm ghost danger" data-pa="delete">Delete</button></span></div>` : ""}
    ${photos.length > 1 ? h`<div class="thumbs no-print">${photos.map((x, i) => h`<button type="button" class="${i === cur ? "on" : ""}" data-ti="${i}" aria-label="Photo ${i + 1}${x.caption ? ": " + x.caption : ""}"><img src="${photoURL(x.file)}" alt="" loading="lazy"></button>`)}</div>` : ""}
    <div class="no-print" id="itemdrop" style="margin-top:10px"></div>`.s;
  const redraw = (list, at = cur) => { it.photo = list.length ? (list.find((x) => x.file === it.photo) ? it.photo : list[0].file) : null; itemGallery(box, it, list, at); };
  $$("[data-ti]", box).forEach((b) => (b.onclick = () => itemGallery(box, it, photos, +b.dataset.ti)));
  if (p) $("#mainphoto", box).onclick = () => lightbox(photos.map((x) => ({ src: photoURL(x.file), caption: x.caption })), cur);
  const act = async (a) => {
    try {
      if (a === "main") { const r = await api("PUT", "/api/item-photos/" + p.id, { main: true }); it.photo = p.file; toast("Main photo set"); redraw(r.photos, 0); }
      if (a === "left" || a === "right") { const r = await api("PUT", "/api/item-photos/" + p.id, { move: a }); redraw(r.photos, cur + (a === "left" ? -1 : 1)); }
      if (a === "caption") modal({ title: "Photo caption", body: h`<label for="cap">Caption</label><input type="text" id="cap" value="${p.caption || ""}" placeholder="e.g. Back view, Label inside collar, Tear on left sleeve">`,
        onOk: async (f) => { const r = await api("PUT", "/api/item-photos/" + p.id, { caption: $("#cap", f).value }); redraw(r.photos); } });
      if (a === "delete") confirmBox("Delete this photo?", "The picture will be removed from this item permanently.", "Delete photo", async () => { const r = await api("DELETE", "/api/item-photos/" + p.id); toast("Photo deleted"); redraw(r.photos, cur); });
    } catch (err) { toast(err.message, true); }
  };
  $$("[data-pa]", box).forEach((b) => (b.onclick = () => act(b.dataset.pa)));
  dropzone($("#itemdrop", box), { accept: "image/jpeg,image/png,image/webp,image/gif", label: photos.length ? "Add more photos" : "Add photos",
    sub: "Click to choose, or drag pictures here. Front, back, labels, details: add as many as you like.",
    onFiles: async (files, status) => {
      const imgs = files.filter(isImage);
      if (!imgs.length) { toast("Those files aren't photos. Use JPG, PNG, WEBP or GIF.", true); return; }
      try { await uploadAll(`/api/items/${it.id}/photos`, "photo", imgs, { photos: true, status }); const d = await GET("/api/items/" + it.id); it.photo = d.item.photo; toast(`Added ${imgs.length} photo${imgs.length === 1 ? "" : "s"}`); itemGallery(box, it, d.photos, photos.length); }
      catch (err) { status.textContent = ""; toast(err.message, true); }
    } });
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
        <div class="full"><label class="check"><input type="checkbox" name="approved" id="f-approved" ${r.approved ? raw("checked") : ""}> Approved to rent from ${BN()}</label></div>
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
  return h`<div class="tablewrap"><table class="lines"><tr><th>Item</th><th style="width:70px">Qty</th><th>Character / use</th><th>Actor</th><th>Scene / number</th><th>How it's used</th><th></th></tr>
    ${lines.map((l, i) => h`<tr><td>${tag(l.tag)} <b>${l.name}</b><div class="small muted">${[l.category, l.size].filter(Boolean).join(" · ")}</div></td>
      <td><input type="number" min="1" max="${l.max || 99}" value="${l.qty}" data-l="${i}" data-k="qty" aria-label="Quantity"></td>
      <td><input type="text" list="dl-characters" value="${l.character || ""}" data-l="${i}" data-k="character" placeholder="e.g. Mrs. Lovett" aria-label="Character"></td>
      <td><input type="text" list="dl-actors" value="${l.actor || ""}" data-l="${i}" data-k="actor" aria-label="Actor"></td>
      <td><input type="text" list="dl-scenes" value="${l.scene || ""}" data-l="${i}" data-k="scene" placeholder="e.g. Act 1 Sc 3" aria-label="Scene or number"></td>
      <td><input type="text" value="${l.usage_notes || ""}" data-l="${i}" data-k="usage_notes" placeholder="e.g. Wedding dress, finale" aria-label="How it's used"></td>
      <td><button type="button" class="btn sm ghost" data-rml="${i}">Remove</button></td></tr>`)}</table></div>`;
}
function bindLines(box, lines, kind, rerender) {
  box.innerHTML = linesTable(lines, kind).s;
  $$("[data-l]", box).forEach((el) => el.addEventListener("input", () => { const l = lines[+el.dataset.l]; l[el.dataset.k] = el.dataset.k === "qty" || el.dataset.k === "condition_out" ? Number(el.value) : el.value; }));
  $$("[data-rml]", box).forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.rml, 1); rerender(); }));
  if (kind === "show") $$("[data-k=character]", box).forEach((el) => { const i = +el.dataset.l; autoActor(el, $(`[data-l="${i}"][data-k=actor]`, box), (who) => (lines[i].actor = who)); });
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
    <div class="print-only" style="margin-bottom:12px"><b>${[S.brand.school, BN() !== S.brand.school ? BN() : ""].filter(Boolean).join(" · ") || BN()} — Rental agreement #${id}</b></div>
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
      <div class="sig"><div>Renter signature &amp; date</div><div>${BN()} signature &amp; date</div></div></div>`);
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
const KIND = { team: "Production team", cast: "Cast", pit: "Pit orchestra / band", crew: "Crew" };
const ROLE_LABEL = { team: "Position", cast: "Character", pit: "Instrument", crew: "Position" };
const roleList = (kind) => ({ team: "team_position", crew: "crew_position", pit: "instrument" }[kind] || "characters");
// Musicals (and revues, cabarets, operas) get musical numbers, a pit orchestra and voice parts.
const isMusical = (type) => /musical|revue|cabaret|opera|operetta|concert|showcase/i.test(type || "");
const lookupDLs = () => ""; // every dropdown list is already rendered by shell()
// Show type as clear buttons. Types come from Settings → Dropdown lists → Show types.
function typePicker(cur) {
  const types = S.lists.show_type && S.lists.show_type.length ? [...S.lists.show_type] : ["Play", "Musical"];
  if (cur && !types.includes(cur)) types.push(cur);
  return h`<div class="typepick" role="radiogroup" aria-label="Type of show">${types.map((t, i) => h`<label class="${t === cur ? "on" : ""}"><input type="radio" name="type" id="ty-${i}" value="${t}" ${t === cur ? raw("checked") : ""}><span>${t}</span></label>`)}</div>`;
}
function bindTypePicker(root, onChange) {
  $$(".typepick input", root).forEach((r) => r.addEventListener("change", () => { $$(".typepick label", root).forEach((l) => l.classList.toggle("on", $("input", l).checked)); onChange && onChange(r.value); }));
}

// ---- musical numbers ----
function parseNumbers(text) {
  let act = ""; const out = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let map = null;
  if (lines.length && lines[0].includes("\t")) {
    const head = lines[0].split("\t").map((c) => c.trim().toLowerCase());
    if (head.some((c) => /(title|song|number)/.test(c))) {
      const f = (re) => head.findIndex((c) => re.test(c));
      map = { act: f(/^act/), number: f(/^(no|#|num)/), title: f(/(title|song)/), singers: f(/(sung|singer|perform|who|character)/), scene: f(/scene/), notes: f(/note/) };
      lines.shift();
    }
  }
  for (const l of lines) {
    const am = l.match(/^(act|part)\s+([\w]+)\s*:?\s*$/i);
    if (am) { act = am[2]; continue; }
    if (map) { const c = l.split("\t").map((x) => x.trim()); const at = (i) => (i >= 0 && i < c.length ? c[i] : ""); out.push({ act: at(map.act) || act, number: at(map.number), title: at(map.title), singers: at(map.singers), scene: at(map.scene), notes: at(map.notes) }); continue; }
    let cells = l.includes("\t") ? l.split("\t").map((x) => x.trim()) : null;
    let number = "", rest = l;
    if (cells) { if (/^\d+[a-z]?\.?$|^[ivx]+\.?$/i.test(cells[0])) number = cells.shift().replace(/\.$/, ""); out.push({ act, number, title: cells[0] || "", singers: cells[1] || "", scene: cells[2] || "" }); continue; }
    const m = l.match(/^(\d+[a-z]?|[ivx]+)[.)]\s*(.+)$/i);
    if (m) { number = m[1]; rest = m[2]; }
    const parts = rest.split(/\s+[-–—]\s+|\s*\.{3,}\s*/);
    out.push({ act, number, title: parts[0].replace(/^["“]|["”]$/g, "").trim(), singers: parts.slice(1).join(", ") });
  }
  return out.filter((n) => n.title);
}
function numbersImporter(box) {
  box.innerHTML = h`<textarea rows="8" data-num placeholder="Act 1\n1. Prologue – Ensemble\n2. Skid Row (Downtown) – Seymour, Audrey, Mushnik, Ensemble\nAct 2\n10. Call Back in the Morning – Seymour, Audrey\n\nPaste the song list from the script or program. One song per line; “Act 1” lines start a new act."></textarea>
    <div class="small muted" data-numprev style="margin-top:6px">Number and singers are optional. A spreadsheet works too: Act, No., Song, Sung by, Scene.</div>`.s;
  const ta = $("[data-num]", box);
  const get = () => parseNumbers(ta.value);
  ta.addEventListener("input", () => { const n = get(); $("[data-numprev]", box).innerHTML = n.length ? h`<b>${n.length} number${n.length === 1 ? "" : "s"}</b>: ${n.slice(0, 5).map((x, i) => h`${i ? ", " : ""}${x.number ? x.number + ". " : ""}${x.title}`)}${n.length > 5 ? ` and ${n.length - 5} more` : ""}.`.s : "Number and singers are optional. A spreadsheet works too: Act, No., Song, Sung by, Scene."; });
  return get;
}
const numberLabel = (n) => [n.act ? "Act " + n.act : "", (n.number ? n.number + ". " : "") + n.title].filter(Boolean).join(" · ");

let SQ = { q: "", status: "" };
async function viewShows() {
  shell("shows", h`
    ${page("Productions", "Current shows", h`<a class="btn" href="#/past-shows">${icon("archive")}Past shows</a><a class="btn primary" href="#/shows/new">${icon("plus")}Create a show</a>`)}
    <p class="muted" style="max-width:70ch;margin-top:-8px">Shows in planning or production. When a show closes, move it to <a href="#/past-shows">Past shows</a>, where its cast, crew, materials, photos and every costume and prop it used are kept.</p>
    <div id="closing"></div>
    <div class="searchbar"><div class="q">${icon("search")}<input type="search" id="s-q" placeholder="Search current shows by title, director or season" value="${SQ.q}"></div>
      <select id="s-st" style="width:auto">${[["current", "Planning & in production"], ["planning", "Planning"], ["in production", "In production"]].map(([v, t]) => h`<option value="${v}" ${(SQ.status || "current") === v ? raw("selected") : ""}>${t}</option>`)}</select></div>
    <div id="slist"></div>`);
  let t;
  const run = async () => {
    const rows = await GET("/api/shows" + qs({ q: SQ.q, status: SQ.status || "current" }));
    const ended = rows.filter((s) => s.close_date && s.close_date < todayISO());
    $("#closing").innerHTML = ended.length && !SQ.q ? h`<div class="note">${ended.length === 1 ? h`<b>${ended[0].title}</b> closed on ${fmtDate(ended[0].close_date)}.` : h`${ended.length} shows have passed their closing date.`} Move ${ended.length === 1 ? "it" : "them"} to Past shows to keep this list tidy.
      ${ended.map((s) => h` <button type="button" class="btn sm" data-arch="${s.id}">Move ${s.title} to past</button>`)}</div>`.s : "";
    $("#slist").innerHTML = rows.length ? h`<section class="panel tablewrap"><table><tr><th></th><th>Show</th><th>Season</th><th>Director</th><th>Run</th><th>Status</th><th class="r">Cast</th><th class="r">Pieces out</th><th></th></tr>
      ${rows.map((s) => h`<tr class="click" data-go="#/show/${s.id}"><td>${s.cover ? h`<img class="thumb cov" src="${showFileURL(s.cover)}" alt="" loading="lazy">` : h`<span class="thumb ph">${icon("mask")}</span>`}</td>
        <td><b>${s.title}</b><div class="small muted">${[s.type, s.photo_count ? `${s.photo_count} photos` : "", s.material_count ? `${s.material_count} materials` : ""].filter(Boolean).join(" · ")}</div></td><td>${showLabel(s)}</td><td>${s.director || ""}</td>
        <td class="num small">${s.open_date ? fmtDate(s.open_date) + (s.close_date ? " – " + fmtDate(s.close_date) : "") : "—"}</td><td>${showPill(s.status)}</td><td class="r num">${s.cast_count || ""}</td><td class="r num">${s.out_pieces || ""}</td>
        <td class="r"><button type="button" class="btn sm" data-arch="${s.id}" title="Move to past shows">${icon("archive")}Move to past</button></td></tr>`)}</table></section>`.s
      : h`<div class="panel"><div class="empty">${SQ.q ? "No current shows match." : h`No current shows. <a href="#/shows/new">Create the next show</a> to add its cast, crew and materials and check out costumes for it.`}</div></div>`.s;
    bindRows($("#slist"));
    $$("[data-arch]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const sh = rows.find((x) => x.id === +b.dataset.arch); moveToPast(sh, run); }));
  };
  $("#s-q").oninput = (e) => { SQ.q = e.target.value; clearTimeout(t); t = setTimeout(run, 200); };
  $("#s-st").onchange = (e) => { SQ.status = e.target.value; run(); };
  run();
}

// Past shows: the archive, grouped by year, newest first.
let PQ = { q: "", type: "" };
async function viewPastShows() {
  shell("past-shows", h`
    ${page("Archive", "Past shows", h`<a class="btn" href="/api/export/shows.csv">Export pieces used</a><a class="btn" href="/api/export/people.csv">Export cast &amp; crew</a><a class="btn" href="#/past-shows/new">${icon("plus")}Add a past show</a>`)}
    <p class="muted" style="max-width:70ch;margin-top:-8px">Every finished production with its cast, crew, songs, materials, photos and the costumes and props it used. Use <b>Add a past show</b> to record productions from before you started using the program.</p>
    <div class="searchbar"><div class="q">${icon("search")}<input type="search" id="p-q" placeholder="Search past shows by title, director, season or year" value="${PQ.q}"></div>
      <select id="p-ty" style="width:auto"><option value="">All types</option>${(S.lists.show_type || []).map((t) => h`<option ${PQ.type === t ? raw("selected") : ""}>${t}</option>`)}</select></div>
    <div id="plist"></div>`);
  let t;
  const run = async () => {
    let rows = await GET("/api/shows" + qs({ q: PQ.q, status: "past" }));
    if (PQ.type) rows = rows.filter((s) => (s.type || "") === PQ.type);
    const yearOf = (s) => s.year || (s.open_date || s.close_date || "").slice(0, 4) || "Undated";
    const groups = []; rows.forEach((s) => { const y = String(yearOf(s)); let g = groups.find((x) => x[0] === y); if (!g) groups.push((g = [y, []])); g[1].push(s); });
    $("#plist").innerHTML = rows.length ? groups.map(([y, ss]) => h`<section class="pastyear"><h2>${y}</h2><div class="pastgrid">${ss.map((s) => h`<a class="pastcard" href="#/show/${s.id}">
        <div class="pc-img">${s.cover ? h`<img src="${showFileURL(s.cover)}" alt="" loading="lazy">` : icon("mask")}</div>
        <div class="pc-b"><b>${s.title}</b><div class="small muted">${[s.type, s.season, s.director ? "dir. " + s.director : ""].filter(Boolean).join(" · ")}</div>
          <div class="small">${[s.cast_count ? `${s.cast_count} cast` : "", s.crew_count ? `${s.crew_count} team & crew` : "", s.pieces ? `${s.pieces} pieces used` : "", s.photo_count ? `${s.photo_count} photos` : ""].filter(Boolean).join(" · ") || h`<span class="muted">No details yet</span>`}</div>
          ${s.out_pieces ? h`<span class="pill warn">${s.out_pieces} still checked out</span>` : ""}</div></a>`)}</div></section>`).join("")
      : h`<div class="panel"><div class="empty">${PQ.q || PQ.type ? "No past shows match." : h`No past shows yet. When a current show closes, use <b>Move to past</b>. To record an older production, <a href="#/past-shows/new">add a past show</a>.`}</div></div>`.s;
  };
  $("#p-q").oninput = (e) => { PQ.q = e.target.value; clearTimeout(t); t = setTimeout(run, 200); };
  $("#p-ty").onchange = (e) => { PQ.type = e.target.value; run(); };
  run();
}

// Move a show to Past shows. Offers to check in anything still out.
function moveToPast(s, after) {
  const out = s.out_pieces || 0;
  modal({ title: `Move ${s.title} to past shows?`, ok: "Move to past shows",
    body: h`<p style="margin-top:0">The show and everything recorded for it (cast, crew, songs, materials, photos and the costumes and props it used) moves to <b>Past shows</b>. You can still add photos or notes, or move it back later.</p>
      ${out ? h`<div class="note"><b>${out} piece${out === 1 ? " is" : "s are"} still checked out</b> to this show.</div>
        <label class="check"><input type="checkbox" id="mp-ret" checked> Check ${out === 1 ? "it" : "them"} back in now, keeping each item's current condition</label>
        <p class="small muted">To record damage or alterations piece by piece, cancel and use <b>Return items</b> on the show's page first.</p>` : ""}
      <div class="grid" style="margin-top:10px">${fld(out ? "Returned and closed on" : "Closed on", dateInp("mp_date", s.close_date && s.close_date <= todayISO() ? s.close_date : todayISO()))}</div>`,
    onOk: async (f) => { const r = await api("POST", `/api/shows/${s.id}/archive`, { return_items: !!($("#mp-ret", f) && $("#mp-ret", f).checked), date: $("#f-mp_date", f).value });
      toast(`${s.title} moved to past shows${r.returned ? `; ${r.returned} piece${r.returned === 1 ? "" : "s"} checked in` : ""}`); after ? after() : viewShow(s.id); } });
}

// Delete a show entirely (for example, a cancelled production). Director only; typed confirmation.
function deleteShowModal(s, counts) {
  const out = counts.out || 0;
  const f = modal({ title: `Delete ${s.title}?`, ok: "Delete show", okClass: "danger-solid",
    body: h`<p style="margin-top:0">Use this for a show that was cancelled or created by mistake. This removes the show along with its production team, cast and crew${counts.numbers ? ", musical numbers" : ""}, materials, photos and its record of costumes and props${out ? h`, and puts the <b>${out} piece${out === 1 ? "" : "s"} still checked out</b> back on the shelf` : ""}.</p>
      <p class="small muted">To keep a finished show's history, use <b>Move to past shows</b> instead. A backup is saved before deleting, so a mistake can be undone from Settings → Backups within 60 days.</p>
      ${fld("Reason (optional)", h`<input type="text" id="ds-why" placeholder="e.g. Cancelled: rights not granted">`)}
      <div style="margin-top:12px">${fld(raw(`Type <b>${esc(s.title)}</b> to confirm`), h`<input type="text" id="ds-confirm" autocomplete="off">`)}</div>`,
    onOk: async (form) => { const r = await api("DELETE", "/api/shows/" + s.id, { confirm: $("#ds-confirm", form).value, reason: $("#ds-why", form).value });
      toast(`${s.title} deleted${r.returned ? `; ${r.returned} piece${r.returned === 1 ? "" : "s"} back on the shelf` : ""}`); location.hash = "#/shows"; } });
  const btn = $("footer .btn:last-child", f), inp = $("#ds-confirm", f);
  const norm = (x) => x.trim().replace(/\s+/g, " ").toLowerCase();
  const check = () => (btn.disabled = norm(inp.value) !== norm(s.title));
  inp.addEventListener("input", check); check();
}

// Author credits for a show, combining roles held by the same person ("Music & Lyrics by …").
function creditLines(s) {
  const t = (v) => (v || "").trim().replace(/^(written\s+)?by\s+/i, "");
  const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
  const out = [], wr = t(s.written_by), bk = t(s.book_by), mu = t(s.music_by), ly = t(s.lyrics_by);
  if (wr) out.push(["Written by", wr]);
  if (bk && same(bk, mu) && same(bk, ly)) out.push(["Book, Music & Lyrics by", bk]);
  else if (same(mu, ly)) { if (bk) out.push(["Book by", bk]); out.push(["Music & Lyrics by", mu]); }
  else if (same(bk, ly)) { out.push(["Book & Lyrics by", bk]); if (mu) out.push(["Music by", mu]); }
  else if (same(bk, mu)) { out.push(["Book & Music by", bk]); if (ly) out.push(["Lyrics by", ly]); }
  else { if (bk) out.push(["Book by", bk]); if (mu) out.push(["Music by", mu]); if (ly) out.push(["Lyrics by", ly]); }
  const based = (s.based_on || "").trim().replace(/^based\s+on\s+/i, "");
  if (based) out.push(["Based on", based]);
  return out;
}
const showFileURL = (f, dl) => "/files/show/" + encodeURIComponent(f) + (dl ? "?download=1" : "");

// ---- reading pasted or uploaded cast & crew lists ----
function csvCells(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((s) => s.trim());
}
const csvToTabs = (text) => text.split(/\r?\n/).map((l) => (l.trim() ? csvCells(l).join("\t") : "")).join("\n");
function splitPerson(line) {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(/\s*\.{3,}\s*|\s+[-–—]\s+|\s*:\s+|\s*,\s*|\s{3,}/).map((s) => s.trim()).filter(Boolean);
}
// order: "name" = name first, then role; "role" = role first, then name
function parsePeople(text, kind, order) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let map = null;
  const head = splitPerson(lines[0]).map((c) => c.toLowerCase());
  if (head.some((c) => /^(name|student|actor|person)/.test(c)) && head.length > 1) {
    const find = (re) => head.findIndex((c) => re.test(c));
    map = { name: find(/^(name|student|actor|person|first)/), role: find(/(role|character|part|position|job|instrument)/), voice_part: find(/(voice|vocal|range)/), grade: find(/(grade|year|class)/), email: find(/mail/), phone: find(/(phone|cell|mobile)/) };
    lines.shift();
  }
  return lines.map((l) => {
    const c = splitPerson(l);
    const at = (i) => (i >= 0 && i < c.length ? c[i] : "");
    if (map) return { kind, name: at(map.name), role: at(map.role), voice_part: at(map.voice_part), grade: at(map.grade), email: at(map.email), phone: at(map.phone) };
    const [a = "", b = "", grade = "", email = "", phone = ""] = c;
    const p = order === "role" ? { kind, role: a, name: b || a, grade, email, phone } : { kind, name: a, role: b, grade, email, phone };
    // cast lists for musicals often carry a voice part in the third column
    if (kind === "cast" && grade && (S.lists.voice_part || []).some((v) => v.toLowerCase() === grade.toLowerCase())) { p.voice_part = grade; p.grade = email; p.email = phone; p.phone = c[5] || ""; }
    return p;
  }).filter((p) => p.name);
}

// A paste box with "upload a CSV" and a live preview. Returns a function that gives the parsed people.
function peopleImporter(box, kind) {
  const rl = ROLE_LABEL[kind].toLowerCase();
  box.innerHTML = h`<div class="importer">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <label class="small" style="margin:0">Each line is</label>
      <select data-order style="width:auto;min-height:30px;padding:2px 6px"><option value="name">Name, then ${rl}</option><option value="role">${ROLE_LABEL[kind]}, then name</option></select>
      <label class="btn sm" style="margin:0;font-weight:500">Upload a spreadsheet (.csv)<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden data-csv></label>
    </div>
    <textarea rows="6" data-paste placeholder="${{ cast: "Jane Doe – Meg March\nSam Lee – Laurie", pit: "Maria Chen – Keyboard 1\nDevon Price – Drums", crew: "Alex Kim – Light Board Operator\nJordan Ruiz – Running Crew" }[kind] || ""}\n\nPaste from Excel, Google Sheets or Word. One person per line."></textarea>
    <div class="small muted" data-preview style="margin-top:6px">Tip: columns after the ${rl} can hold grade, email and phone.</div></div>`.s;
  const ta = $("[data-paste]", box), ord = $("[data-order]", box);
  if (kind === "cast") ord.value = "name";
  const get = () => parsePeople(ta.value, kind, ord.value);
  const preview = () => {
    const ps = get();
    $("[data-preview]", box).innerHTML = ps.length ? h`<b>${ps.length} ${ps.length === 1 ? "person" : "people"}</b> will be added: ${ps.slice(0, 6).map((p, i) => h`${i ? ", " : ""}${p.name}${p.role ? h` <span class="muted">(${p.role})</span>` : ""}`)}${ps.length > 6 ? ` and ${ps.length - 6} more` : ""}. Wrong way round? Change “Each line is”.`.s
      : `Tip: columns after the ${rl} can hold grade, email and phone.`;
  };
  ta.addEventListener("input", preview); ord.onchange = preview;
  $("[data-csv]", box).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { toast("Save the spreadsheet as CSV first (File → Save As → CSV), or copy the cells and paste them here.", true); return; }
    const text = await f.text(); ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + csvToTabs(text); preview(); e.target.value = "";
  };
  return get;
}

// Position + name rows for the production team. Prefilled with the first positions in Settings.
function teamForm(box, rows) {
  const draw = () => {
    box.innerHTML = h`<div class="tablewrap"><table class="lines"><tr><th style="width:34%">Position</th><th>Name</th><th>Email</th><th>Phone</th><th></th></tr>
      ${rows.map((r, i) => h`<tr><td><input type="text" list="dl-team_position" value="${r.role || ""}" data-i="${i}" data-k="role" aria-label="Position"></td>
        <td><input type="text" value="${r.name || ""}" data-i="${i}" data-k="name" aria-label="Name" placeholder="Leave blank if not filled yet"></td>
        <td><input type="email" value="${r.email || ""}" data-i="${i}" data-k="email" aria-label="Email"></td><td><input type="tel" value="${r.phone || ""}" data-i="${i}" data-k="phone" aria-label="Phone"></td>
        <td><button type="button" class="btn sm ghost" data-rm="${i}" aria-label="Remove row">✕</button></td></tr>`)}</table></div>
      <button type="button" class="btn sm" data-addrow style="margin-top:8px">${icon("plus")}Add a position</button>
      <span class="small muted" style="margin-left:8px">Pick from the list or type any position. Directors can change the list in Settings.</span>`.s;
    $$("[data-k]", box).forEach((el) => el.addEventListener("input", () => (rows[+el.dataset.i][el.dataset.k] = el.value)));
    $$("[data-rm]", box).forEach((b) => (b.onclick = () => { rows.splice(+b.dataset.rm, 1); draw(); }));
    $("[data-addrow]", box).onclick = () => { rows.push({ role: "", name: "" }); draw(); $$("[data-k=role]", box).pop().focus(); };
  };
  draw();
  return () => rows.filter((r) => (r.name || "").trim()).map((r) => ({ kind: "team", role: r.role, name: r.name, email: r.email, phone: r.phone }));
}

async function viewShowForm(id, past) {
  const y = new Date().getFullYear();
  let s = { status: past ? "closed" : "planning", year: past ? y - 1 : y, type: "Play", director: past ? "" : S.me.display_name || "" };
  if (id) s = (await GET("/api/shows/" + id)).show;
  const posDL = lookupDLs();
  const listKey = s.status === "closed" ? "past-shows" : "shows", listName = s.status === "closed" ? "Past shows" : "Current shows";
  shell(listKey, h`
    ${page(listName, id ? "Edit " + s.title : past ? "Add a past show" : "Create a show", "", id ? h`<a href="#/${listKey}">${listName}</a> / <a href="#/show/${id}">${s.title}</a>` : h`<a href="#/${listKey}">${listName}</a>`)}
    ${past ? h`<p class="muted" style="max-width:70ch;margin-top:-8px">Record a production from before you started using the program. Add its cast, crew, materials and photos now or later, and link costumes and props from the show's page.</p>` : ""}
    <form id="showf" novalidate><div class="errbox" hidden></div>
      <fieldset><legend>Production</legend><div class="grid">
        ${fld("Title *", inp("title", s, 'placeholder="e.g. Little Shop of Horrors"'), "wide")}
        <div class="full"><label>Type of show</label>${typePicker(s.type || "Play")}</div>
        ${fld("Season", listInp("season", s))}
        ${fld("School year / year", numInp("year", s, "1", 'min="1990" max="2100"'))}
        ${fld("Director", inp("director", s))}
        ${fld("Venue", inp("venue", s, 'placeholder="e.g. School auditorium"'))}
        ${fld("Opening", dateInp("open_date", s.open_date))}${fld("Closing", dateInp("close_date", s.close_date))}
        ${fld("Status", sel("status", [["planning", "Planning"], ["in production", "In production"], ["closed", "Past show"]], s.status))}
        ${fld("Notes", area("notes", s, 3), "full")}
      </div></fieldset>
      <fieldset><legend>Authors &amp; rights</legend>
        <p class="hint" style="margin:-6px 0 10px">Copy these from your license agreement or the script's title page. The program prints only the lines you fill in.</p>
        <div class="grid">
          <div class="playonly wide">${fld("Written by", inp("written_by", s, 'placeholder="e.g. Thornton Wilder"'), "", "The playwright.")}</div>
          <div class="musonly">${fld("Book by", inp("book_by", s, 'placeholder="e.g. Howard Ashman"'))}</div>
          <div class="musonly">${fld("Music by", inp("music_by", s, 'placeholder="e.g. Alan Menken"'))}</div>
          <div class="musonly">${fld("Lyrics by", inp("lyrics_by", s, 'placeholder="e.g. Howard Ashman"'), "", "Same person as another credit? Type the name again and the program combines them.")}</div>
          ${fld("Based on", inp("based_on", s, 'placeholder="e.g. the film by Roger Corman, screenplay by Charles Griffith"'), "full")}
          ${fld("Other required credits", area("additional_credits", s, 2), "full", "Anything else the license asks you to print, one line each, e.g. “Orchestrations by …” or “Originally produced by …”.")}
          ${fld("Licensed through", h`<input type="text" id="f-licensor" name="licensor" list="dl-licensor" value="${val(s, "licensor")}" placeholder="e.g. Music Theatre International (MTI)">`, "wide")}
          ${fld("Licensing notice (exact wording)", area("licensing_notice", s, 3), "full", "If your licensor supplies required wording, paste it here. Left blank, the program prints the standard “presented through special arrangement with …” line when a licensor is filled in.")}
        </div></fieldset>
      ${id ? h`<p class="note">Production team, cast, crew, materials and photos are managed on the <a href="#/show/${id}">show's page</a>.</p>` : h`
      <fieldset><legend>Cover image</legend><p class="hint" style="margin:-6px 0 10px">The show's title artwork, logo or poster, often supplied by the licensing company. It appears on the show's page and in the show lists.</p>
        <div class="coverpick"><div class="coverbox" id="newcover">${icon("mask")}<span class="small muted">No cover yet</span></div><div id="coverdrop" style="flex:1;min-width:220px"></div></div></fieldset>
      <fieldset><legend>Production team</legend><p class="hint" style="margin:-6px 0 10px">Fill in whoever is set. You can add or change people later.</p><div id="teambox"></div></fieldset>
      <fieldset><legend>Cast</legend><div id="castbox"></div><p class="hint musonly" style="margin:8px 0 0">For a musical, add a voice part as a third column (e.g. “Jane Doe – Audrey – Soprano”), or set it later on the show's page.</p></fieldset>
      <fieldset class="musonly"><legend>Musical numbers</legend><div id="numbox"></div></fieldset>
      <fieldset class="musonly"><legend>Pit orchestra / band</legend><div id="pitbox"></div></fieldset>
      <fieldset><legend>Crew</legend><div id="crewbox"></div></fieldset>
      <fieldset><legend>Show materials</legend><p class="hint" style="margin:-6px 0 10px">Scripts, scores, rehearsal tracks, programs, schedules, design drawings, anything the show needs. Up to 200 MB per file.</p>
        <div class="grid" style="margin-bottom:10px">${fld("Type of material", h`<input type="text" id="mat-cat" list="dl-material_type" placeholder="e.g. Script">`, "", "Applied to the files you add next.")}</div>
        <div id="matdrop"></div><div id="matlist" class="filelist"></div></fieldset>
      <fieldset><legend>Show photos</legend><div id="photodrop"></div><div id="photolist" class="pgrid" style="margin-top:10px"></div></fieldset>`}
      ${posDL}
      <div class="formbar"><span class="small muted" id="savestatus" aria-live="polite"></span><a class="btn ghost" href="${id ? "#/show/" + id : "#/" + listKey}">Cancel</a>${id && isDirector() ? h`<button type="button" class="btn danger" id="delshow">Delete show</button>` : ""}<button class="btn primary" id="savebtn">${id ? "Save changes" : past ? "Add past show" : "Create show"}</button></div>
    </form>`);
  const f = $("#showf");
  let getTeam, getCast, getCrew, getPit, getNums, coverFile = null; const mats = [], pics = [];
  // musicals have book, music and lyrics; plays have a playwright. Anything already filled in stays visible.
  const filled = (el) => $$("input,textarea", el).some((x) => x.value.trim());
  const musical = (t) => { const m = isMusical(t); $$(".musonly", f).forEach((el) => (el.hidden = !m && !filled(el))); $$(".playonly", f).forEach((el) => (el.hidden = m && !filled(el))); };
  bindTypePicker(f, musical); musical(s.type || "Play");
  if (!id) {
    getTeam = teamForm($("#teambox"), (S.lists.team_position || []).slice(0, 8).map((role) => ({ role, name: "" })));
    getCast = peopleImporter($("#castbox"), "cast");
    getCrew = peopleImporter($("#crewbox"), "crew");
    getPit = peopleImporter($("#pitbox"), "pit");
    getNums = numbersImporter($("#numbox"));
    const drawMats = () => { $("#matlist").innerHTML = mats.map((m, i) => h`<div>${fileBadge(m.file.name)}<span class="grow">${m.file.name} <span class="muted small">${fmtSize(m.file.size)}${m.category ? " · " + m.category : ""}</span></span><button type="button" class="btn sm ghost" data-rmm="${i}">Remove</button></div>`.s).join("");
      $$("[data-rmm]").forEach((b) => (b.onclick = () => { mats.splice(+b.dataset.rmm, 1); drawMats(); })); };
    const drawPics = () => { $("#photolist").innerHTML = pics.map((p, i) => h`<figure><img src="${p.url}" alt=""><button type="button" class="btn sm" data-rmp="${i}">Remove</button></figure>`.s).join("");
      $$("[data-rmp]").forEach((b) => (b.onclick = () => { URL.revokeObjectURL(pics[+b.dataset.rmp].url); pics.splice(+b.dataset.rmp, 1); drawPics(); })); };
    dropzone($("#coverdrop"), { accept: "image/jpeg,image/png,image/webp,image/gif", label: "Choose a cover image", sub: "Click to choose, or drag the artwork here. JPG, PNG, WEBP or GIF.",
      onFiles: (files) => { const img = files.find(isImage); if (!img) { toast("The cover must be a picture: JPG, PNG, WEBP or GIF.", true); return; }
        coverFile = img; $("#newcover").innerHTML = h`<img src="${URL.createObjectURL(img)}" alt="Cover preview"><button type="button" class="btn sm" id="nocover">Remove</button>`.s;
        $("#nocover").onclick = (e) => { e.stopPropagation(); coverFile = null; $("#newcover").innerHTML = h`${icon("mask")}<span class="small muted">No cover yet</span>`.s; }; } });
    dropzone($("#matdrop"), { label: "Add materials", sub: "Click to choose files, or drag them here.", onFiles: (files) => { files.forEach((file) => mats.push({ file, category: $("#mat-cat").value.trim() })); drawMats(); } });
    dropzone($("#photodrop"), { accept: "image/jpeg,image/png,image/webp,image/gif", label: "Add photos", sub: "Rehearsals, the set, the cast, opening night. Click or drag pictures here.",
      onFiles: (files) => { files.filter(isImage).forEach((file) => pics.push({ file, url: URL.createObjectURL(file) })); drawPics(); } });
  }
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f), eb = $(".errbox", f), st = $("#savestatus"), btn = $("#savebtn");
    if (!(d.title || "").trim()) { eb.textContent = "Enter the show's title."; eb.hidden = false; window.scrollTo(0, 0); return; }
    if (id) {
      try { await api("PUT", "/api/shows/" + id, d); toast("Saved"); location.hash = "#/show/" + id; } catch (err) { eb.textContent = err.message; eb.hidden = false; }
      return;
    }
    btn.disabled = true;
    let showId;
    try {
      st.textContent = "Creating the show…";
      showId = (await api("POST", "/api/shows", d)).id;
      const mus = isMusical(d.type);
      const people = [...getTeam(), ...getCast(), ...(mus ? getPit() : []), ...getCrew()];
      if (people.length) { st.textContent = `Adding ${people.length} people…`; await api("POST", `/api/shows/${showId}/people`, { people }); }
      const nums = mus ? getNums() : [];
      if (nums.length) { st.textContent = `Adding ${nums.length} musical numbers…`; await api("POST", `/api/shows/${showId}/numbers`, { numbers: nums }); }
      const byCat = {}; mats.forEach((m) => (byCat[m.category] ||= []).push(m.file));
      for (const [category, files] of Object.entries(byCat)) await uploadAll(`/api/shows/${showId}/files?kind=material`, "file", files, { extra: { category }, status: st });
      if (coverFile) { st.textContent = "Uploading the cover image…"; const fd = new FormData(); fd.append("file", await shrinkImage(coverFile, 2000)); await api("POST", `/api/shows/${showId}/cover`, fd); }
      if (pics.length) await uploadAll(`/api/shows/${showId}/files?kind=photo`, "file", pics.map((p) => p.file), { photos: true, status: st });
      toast(`Created ${d.title}`); location.hash = "#/show/" + showId;
    } catch (err) {
      btn.disabled = false; st.textContent = "";
      if (showId) { toast("The show was created, but something didn't save: " + err.message, true); location.hash = "#/show/" + showId; }
      else { eb.textContent = err.message; eb.hidden = false; window.scrollTo(0, 0); }
    }
  };
  if ($("#delshow")) $("#delshow").onclick = async () => { const d = await GET("/api/shows/" + id); deleteShowModal(s, { out: d.items.filter((l) => !l.date_returned).reduce((a, l) => a + l.qty, 0), numbers: d.numbers.length }); };
}

const FILEKIND = [[/\.pdf$/i, "PDF"], [/\.(docx?|odt|rtf|pages)$/i, "DOC"], [/\.(xlsx?|ods|csv|numbers)$/i, "XLS"], [/\.(pptx?|odp|key)$/i, "PPT"], [/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i, "AUDIO"],
  [/\.(mp4|mov|m4v|avi|wmv|mkv|webm)$/i, "VIDEO"], [/\.(jpe?g|png|gif|webp|heic|tiff?|bmp)$/i, "IMG"], [/\.(zip|7z|rar)$/i, "ZIP"], [/\.(mus|musx|sib|mscz|xml|mxl)$/i, "SCORE"], [/\.txt$/i, "TXT"]];
const fileBadge = (name) => { const k = (FILEKIND.find(([re]) => re.test(name)) || [0, "FILE"])[1]; return h`<span class="fbadge" data-k="${k}">${k}</span>`; };

let SHOW_TAB = "pieces";
async function viewShow(id, tab) {
  if (tab) SHOW_TAB = tab;
  if (viewShow.last !== id) { SHOW_TAB = tab || "pieces"; viewShow.last = id; }
  const d = await GET("/api/shows/" + id);
  const s = d.show, items = d.items, people = d.people;
  const outLines = items.filter((l) => !l.date_returned);
  const staged = (S.staged || []).map((l) => ({ ...l }));
  if (S.staged) { S.staged = null; SHOW_TAB = "pieces"; }
  const pieces = items.reduce((a, l) => a + l.qty, 0);
  const cats = {}; items.forEach((l) => (cats[l.category || "Other"] = (cats[l.category || "Other"] || 0) + l.qty));
  const cast = people.filter((p) => p.kind === "cast");
  const castByRole = {}; cast.forEach((p) => p.role && (castByRole[p.role.toLowerCase()] = p.name));
  S.castByRole = castByRole;
  const chars = [...new Set([...cast.map((p) => p.role).filter(Boolean), ...items.map((l) => l.character).filter(Boolean)])];
  const mus = isMusical(s.type) || d.numbers.length > 0;
  S.showMusical = mus;
  const tabs = [["pieces", `Costumes & props (${items.length})`], ["people", `Cast & crew (${people.length})`], ...(mus ? [["numbers", `Musical numbers (${d.numbers.length})`]] : []), ["materials", `Materials (${d.materials.length})`], ["photos", `Photos (${d.photos.length})`]];
  if (SHOW_TAB === "numbers" && !mus) SHOW_TAB = "pieces";
  const isPast = s.status === "closed";
  shell(isPast ? "past-shows" : "shows", h`
    ${page([s.type, showLabel(s)].filter(Boolean).join(" · ") || "Show", s.title, h`
      <button class="btn" id="printpull">${icon("print")}Print</button>
      ${outLines.length ? h`<button class="btn dark" id="returnbtn">Return items (${outLines.length})</button>` : ""}
      ${isPast ? h`<button class="btn" id="reopen">Move back to current shows</button>` : h`<button class="btn" id="archive">${icon("archive")}Move to past shows</button>`}
      <a class="btn primary" href="#/show/${id}/program">${icon("program")}Program</a>
      <a class="btn" href="#/show/${id}/edit">Edit show</a>`, isPast ? h`<a href="#/past-shows">Past shows</a>` : h`<a href="#/shows">Current shows</a>`)}
    ${isPast ? h`<div class="note no-print">This is a past show${s.close_date ? `, closed ${fmtDate(s.close_date)}` : ""}. Its record is kept as history. You can still add photos, materials or notes.${outLines.length ? h` <b>${outLines.reduce((a, l) => a + l.qty, 0)} piece(s) are still checked out</b>; use Return items to check them in.` : ""}</div>` : ""}
    <div class="showhead"><div class="coverwrap">
        <button type="button" class="coverbox ${s.cover ? "has" : ""}" id="coverimg" aria-label="${s.cover ? "View the cover image" : "Add a cover image"}">${s.cover ? h`<img src="${showFileURL(s.cover)}" alt="${s.title} cover">` : h`${icon("upload")}<span class="small">Add a cover image</span>`}</button>
        <input type="file" id="coverfile" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
        ${s.cover ? h`<div class="coveract no-print"><button type="button" class="btn sm" id="coverchange">Change cover</button><button type="button" class="btn sm ghost" id="coverremove">Remove</button></div>` : ""}</div>
      <div class="avail" style="margin:0;flex:1">${showPill(s.status)}
        <span class="small">${s.director ? "Directed by " + s.director : ""}${s.open_date ? ` · ${fmtDate(s.open_date)}${s.close_date ? " – " + fmtDate(s.close_date) : ""}` : ""}${s.venue ? " · " + s.venue : ""}</span>
        <span class="small muted" style="margin-left:auto">${mus && d.numbers.length ? `${d.numbers.length} musical numbers · ` : ""}${cast.length} in the cast · ${people.length - cast.length} on the team${mus ? ", pit" : ""} &amp; crew · ${pieces} piece${pieces === 1 ? "" : "s"} used${outLines.length ? ` · ${outLines.reduce((a, l) => a + l.qty, 0)} still out` : ""}</span></div></div>
    ${creditLines(s).length ? h`<p class="small credline">${creditLines(s).map(([k, v], i) => h`${i ? " · " : ""}${k} <b>${v}</b>`)}${s.licensor ? h` · <span class="muted">Licensed through ${s.licensor}</span>` : ""}</p>` : ""}
    ${s.notes ? h`<p class="small" style="max-width:70ch">${s.notes}</p>` : ""}
    <datalist id="dl-characters">${chars.map((c) => h`<option value="${c}">`)}</datalist>
    <datalist id="dl-actors">${cast.map((p) => h`<option value="${p.name}">`)}</datalist>
    <datalist id="dl-scenes">${d.numbers.map((n) => h`<option value="${numberLabel(n)}">`)}</datalist>
    ${lookupDLs()}
    <div class="tabs bigtabs no-print" role="tablist">${tabs.map(([k, t]) => h`<button type="button" data-stab="${k}" class="${SHOW_TAB === k ? "on" : ""}" role="tab" aria-selected="${SHOW_TAB === k}">${t}</button>`)}</div>
    <div id="stab"></div>
    ${isDirector() ? h`<p class="no-print" style="margin-top:28px"><button class="btn sm danger" id="delshowpage">Delete this show</button> <span class="small muted">For cancelled shows. Finished shows belong in Past shows.</span></p>` : ""}`);
  if ($("#archive")) $("#archive").onclick = () => moveToPast({ ...s, out_pieces: outLines.reduce((a, l) => a + l.qty, 0) });
  if ($("#reopen")) $("#reopen").onclick = () => confirmBox(`Move ${s.title} back to current shows?`, "It will appear under Current shows again, so you can check out more costumes and props for it.", "Move back", async () => { await api("POST", `/api/shows/${id}/reopen`); toast("Moved back to current shows"); viewShow(id); });
  if ($("#delshowpage")) $("#delshowpage").onclick = () => deleteShowModal(s, { out: outLines.reduce((a, l) => a + l.qty, 0), numbers: d.numbers.length });
  $$("[data-stab]").forEach((b) => (b.onclick = () => { SHOW_TAB = b.dataset.stab; $$("[data-stab]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); }); drawTab(); }));
  $("#printpull").onclick = () => window.print();
  const pickCover = () => $("#coverfile").click();
  $("#coverimg").onclick = () => { if (!s.cover) return pickCover(); const inGallery = d.photos.findIndex((p) => p.file === s.cover);
    lightbox(inGallery >= 0 ? d.photos.map((p) => ({ src: showFileURL(p.file), caption: p.caption })) : [{ src: showFileURL(s.cover), caption: s.title + " — cover" }], Math.max(0, inGallery)); };
  $("#coverfile").onchange = async (e) => { const f = e.target.files[0]; if (!f) return;
    try { const fd = new FormData(); fd.append("file", await shrinkImage(f, 2000)); await api("POST", `/api/shows/${id}/cover`, fd); toast("Cover image updated"); viewShow(id); } catch (err) { toast(err.message, true); } };
  if ($("#coverchange")) $("#coverchange").onclick = pickCover;
  if ($("#coverremove")) $("#coverremove").onclick = () => confirmBox("Remove the cover image?", "The show will appear without a cover until you add one. Gallery photos aren't affected.", "Remove cover", async () => { await api("DELETE", `/api/shows/${id}/cover`); toast("Cover removed"); viewShow(id); });
  if ($("#returnbtn")) $("#returnbtn").onclick = () => returnModal(id, s, outLines);
  const reload = () => viewShow(id);
  const drawTab = () => {
    const box = $("#stab");
    if (SHOW_TAB === "people") return showPeopleTab(box, id, people, items, reload);
    if (SHOW_TAB === "numbers") return showNumbersTab(box, id, d.numbers, items, reload);
    if (SHOW_TAB === "materials") return showMaterialsTab(box, id, d.materials, reload);
    if (SHOW_TAB === "photos") return showPhotosTab(box, id, s, d.photos, reload);
    showPiecesTab(box, id, s, items, staged, chars, reload);
  };
  drawTab();
}

function showPiecesTab(box, id, s, items, staged, chars, reload) {
  const groups = {}; items.forEach((l) => (groups[l.character || "No character assigned"] ||= []).push(l));
  box.innerHTML = h`
    <div class="print-only"><h2>${s.title} — costumes &amp; props</h2></div>
    ${s.status !== "closed" ? h`<fieldset class="no-print"><legend>Check items out to this show</legend><div class="errbox" id="coerr" hidden></div>
      <div id="stlines"></div>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0 14px">${fld("Date checked out", dateInp("co_date", todayISO()))}<button type="button" class="btn primary" id="cobtn">Check out to ${s.title}</button>
        <a class="btn ghost" href="#/items" id="browse">${icon("search")}Search the full inventory</a></div>
      <div id="pick"></div></fieldset>` : ""}
    <section class="panel"><header><h2>Costumes, props &amp; pieces used</h2><span class="more small muted">Grouped by character</span></header>
      ${items.length ? h`<div class="tablewrap"><table><tr><th>Item</th><th>Scene / act</th><th>Actor</th><th>How it's used</th><th>Alterations</th><th>Out</th><th>Back</th><th class="no-print"></th></tr>
        ${Object.entries(groups).map(([g, ls]) => h`<tr class="group-h"><td colspan="8">${g}${S.castByRole[g.toLowerCase()] ? h` <span class="muted" style="font-weight:400">· ${S.castByRole[g.toLowerCase()]}</span>` : ""}</td></tr>${ls.map((l) => h`<tr>
          <td><a href="#/item/${l.item_id}">${tag(l.tag)}</a> <b>${l.name}</b>${l.qty > 1 ? ` × ${l.qty}` : ""}<div class="small muted">${[l.category, l.size && "Size " + l.size, l.location].filter(Boolean).join(" · ")}</div></td>
          <td>${l.scene || ""}</td><td>${l.actor || ""}</td><td class="small">${l.usage_notes || ""}</td><td class="small">${l.alterations || ""}</td>
          <td class="num small">${fmtDate(l.date_out)}<div>${condBadge(l.condition_out)}</div></td>
          <td class="num small">${l.date_returned ? h`${fmtDate(l.date_returned)}<div>${condBadge(l.condition_in)}</div>${l.notes_in ? h`<div class="muted">${l.notes_in}</div>` : ""}` : h`<span class="pill warn">Out</span>`}</td>
          <td class="no-print" style="white-space:nowrap"><button class="btn sm" data-edit="${l.id}">Edit</button>${!l.date_returned || isDirector() ? h` <button class="btn sm ghost" data-del="${l.id}" title="Remove from this show">✕</button>` : ""}</td></tr>`)}`)}</table></div>`
        : h`<div class="empty">Nothing has been checked out to this show yet.</div>`}
    </section>`.s;
  if ($("#browse", box)) $("#browse", box).onclick = () => { INV = { ...INV_DEFAULT }; };
  if ($("#stlines", box)) {
    const lb = $("#stlines", box);
    const rerender = () => bindLines(lb, staged, "show", rerender);
    rerender();
    picker($("#pick", box), (it) => { if (staged.some((l) => l.id === it.id)) return; staged.push(it); rerender(); });
    $("#cobtn", box).onclick = async () => {
      const eb = $("#coerr", box);
      if (!staged.length) { eb.textContent = "Add items first: search below or use your pull list."; eb.hidden = false; return; }
      try {
        await api("POST", `/api/shows/${id}/items`, { date_out: $("#f-co_date", box).value, items: staged.map((l) => ({ item_id: l.id, qty: l.qty || 1, character: l.character, actor: l.actor, scene: l.scene, usage_notes: l.usage_notes })) });
        const ids = new Set(staged.map((l) => l.id)); const before = S.pull.length; S.pull = S.pull.filter((p) => !ids.has(p.id)); if (S.pull.length !== before) savePull();
        toast(`Checked out ${staged.length} item${staged.length === 1 ? "" : "s"}`); reload();
      } catch (err) { eb.textContent = err.message; eb.hidden = false; }
    };
  }
  $$("[data-edit]", box).forEach((b) => (b.onclick = () => {
    const l = items.find((x) => x.id === +b.dataset.edit);
    const f = modal({ title: "Edit how " + l.name + " was used",
      body: h`<div class="grid">
        ${fld("Character / use", h`<input type="text" name="character" id="e-char" list="dl-characters" value="${l.character || ""}">`)}${fld("Actor", h`<input type="text" name="actor" id="e-actor" list="dl-actors" value="${l.actor || ""}">`)}
        ${fld("Scene / number", h`<input type="text" name="scene" id="e-scene" list="dl-scenes" value="${l.scene || ""}">`)}${fld("How it's used", h`<input type="text" name="usage_notes" id="e-use" value="${l.usage_notes || ""}">`, "full")}
        ${fld("Alterations made", h`<textarea name="alterations" id="e-alt" rows="2" placeholder="e.g. Hem taken up 2 inches; darts added at waist">${l.alterations || ""}</textarea>`, "full")}</div>`,
      onOk: async (f) => { await api("PUT", "/api/show-items/" + l.id, formData(f)); toast("Saved"); reload(); } });
    autoActor($("#e-char", f), $("#e-actor", f));
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = () => { const l = items.find((x) => x.id === +b.dataset.del);
    confirmBox("Remove from this show?", `${l.name} will be taken off ${s.title}'s record${l.date_returned ? "" : " and become available again"}.`, "Remove", async () => { await api("DELETE", "/api/show-items/" + l.id); reload(); }); }));
}
// When a character from the cast list is chosen, fill in who plays them.
function autoActor(charEl, actorEl, onSet) {
  charEl.addEventListener("change", () => { const who = (S.castByRole || {})[charEl.value.trim().toLowerCase()]; if (who && !actorEl.value) { actorEl.value = who; if (onSet) onSet(who); } });
}

function returnModal(id, s, outLines) {
  modal({ title: "Return items from " + s.title, ok: "Return checked items", wide: true,
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
}

function showPeopleTab(box, id, people, items, reload) {
  const pieceCount = {}; items.forEach((l) => l.character && (pieceCount[l.character.toLowerCase()] = (pieceCount[l.character.toLowerCase()] || 0) + l.qty));
  const contact = (p) => [p.email, p.phone].filter(Boolean).join(" · ");
  const mus = S.showMusical;
  const vp = (kind) => mus && kind === "cast";
  const section = (kind) => {
    const list = people.filter((p) => p.kind === kind);
    return h`<section class="panel" style="margin-bottom:18px"><header><h2>${KIND[kind]}</h2><span class="muted small">${list.length}</span>
      <span class="more no-print" style="display:flex;gap:6px">${kind === "team" ? h`<button class="btn sm" data-fillteam>Fill in positions</button>` : h`<button class="btn sm" data-import="${kind}">Paste or upload a list</button>`}</span></header>
      ${list.length ? h`<div class="tablewrap"><table><tr><th>${ROLE_LABEL[kind]}</th><th>Name</th>${vp(kind) ? h`<th>Voice part</th>` : ""}${kind !== "team" ? h`<th>Grade</th>` : ""}<th>Contact</th>${kind === "cast" ? h`<th class="r">Costumes &amp; props</th>` : ""}<th class="no-print"></th></tr>
        ${list.map((p, i) => h`<tr><td><b>${p.role || "—"}</b></td><td>${p.name}${p.notes ? h`<div class="small muted">${p.notes}</div>` : ""}</td>${vp(kind) ? h`<td>${p.voice_part || ""}</td>` : ""}${kind !== "team" ? h`<td>${p.grade || ""}</td>` : ""}<td class="small">${contact(p)}</td>
          ${kind === "cast" ? h`<td class="r num">${p.role && pieceCount[p.role.toLowerCase()] ? pieceCount[p.role.toLowerCase()] : ""}</td>` : ""}
          <td class="no-print r" style="white-space:nowrap"><button class="btn sm ghost" data-mv="up" data-pid="${p.id}" ${i === 0 ? raw("disabled") : ""} aria-label="Move up">↑</button><button class="btn sm ghost" data-mv="down" data-pid="${p.id}" ${i === list.length - 1 ? raw("disabled") : ""} aria-label="Move down">↓</button>
            <button class="btn sm" data-pedit="${p.id}">Edit</button> <button class="btn sm ghost" data-pdel="${p.id}" aria-label="Remove ${p.name}">✕</button></td></tr>`)}</table></div>` : h`<div class="empty small">No one added yet.</div>`}
      <form class="addrow no-print" data-add="${kind}" novalidate><input type="text" name="role" list="dl-${roleList(kind)}" placeholder="${ROLE_LABEL[kind]}" aria-label="${ROLE_LABEL[kind]}"><input type="text" name="name" placeholder="Name" aria-label="Name">
        ${vp(kind) ? h`<input type="text" name="voice_part" list="dl-voice_part" placeholder="Voice part" aria-label="Voice part" style="max-width:140px">` : ""}
        ${kind !== "team" ? h`<input type="text" name="grade" placeholder="Grade" aria-label="Grade" style="max-width:90px">` : ""}<button class="btn sm primary">${icon("plus")}Add</button></form>
    </section>`;
  };
  const hasPit = mus || people.some((p) => p.kind === "pit");
  box.innerHTML = h`<div class="print-only"><h2>Cast &amp; crew</h2></div>${section("team")}${section("cast")}${hasPit ? section("pit") : ""}${section("crew")}`.s;
  $$("[data-add]", box).forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const d = formData(f);
    if (!d.name.trim()) { $("[name=name]", f).focus(); return; }
    try { await api("POST", `/api/shows/${id}/people`, { people: [{ ...d, kind: f.dataset.add }] }); SHOW_TAB = "people"; reload(); } catch (err) { toast(err.message, true); }
  }));
  $$("[data-mv]", box).forEach((b) => (b.onclick = async () => { await api("PUT", "/api/show-people/" + b.dataset.pid, { move: b.dataset.mv }); reload(); }));
  $$("[data-pdel]", box).forEach((b) => (b.onclick = () => { const p = people.find((x) => x.id === +b.dataset.pdel);
    confirmBox(`Remove ${p.name}?`, `${p.name}${p.role ? " (" + p.role + ")" : ""} will be taken off this show's list.`, "Remove", async () => { await api("DELETE", "/api/show-people/" + p.id); reload(); }); }));
  $$("[data-pedit]", box).forEach((b) => (b.onclick = () => {
    const p = people.find((x) => x.id === +b.dataset.pedit);
    const f = modal({ title: "Edit " + p.name,
      body: h`<div class="grid">${fld("Group", sel("kind", [["team", "Production team"], ["cast", "Cast"], ["pit", "Pit orchestra / band"], ["crew", "Crew"]], p.kind))}${fld("Name", inp("name", p))}
        ${fld("Role / position / instrument", h`<input type="text" id="f-role" name="role" list="dl-${roleList(p.kind)}" value="${p.role || ""}">`)}
        ${fld("Voice part", h`<input type="text" id="f-voice_part" name="voice_part" list="dl-voice_part" value="${p.voice_part || ""}">`)}${fld("Grade", inp("grade", p))}
        ${fld("Email", h`<input type="email" id="f-email" name="email" value="${p.email || ""}">`)}${fld("Phone", h`<input type="tel" id="f-phone" name="phone" value="${p.phone || ""}">`)}
        ${fld("Notes", inp("notes", p, 'placeholder="e.g. Understudy for Jo; needs a quick change in Act 2"'), "full")}</div>`,
      onOk: async (f) => { await api("PUT", "/api/show-people/" + p.id, formData(f)); toast("Saved"); reload(); } });
    $("#f-kind", f).onchange = (e) => { $("#f-role", f).setAttribute("list", "dl-" + roleList(e.target.value)); };
  }));
  $$("[data-import]", box).forEach((b) => (b.onclick = () => {
    const kind = b.dataset.import;
    let get;
    const f = modal({ title: "Add " + KIND[kind].toLowerCase() + " from a list", ok: "Add people", wide: true, body: h`<div id="impbox"></div>`,
      onOk: async () => { const ps = get(); if (!ps.length) throw new Error("Paste at least one name first."); await api("POST", `/api/shows/${id}/people`, { people: ps }); toast(`Added ${ps.length} ${ps.length === 1 ? "person" : "people"}`); reload(); } });
    get = peopleImporter($("#impbox", f), kind);
    $("[data-paste]", f).focus();
  }));
  const fill = $("[data-fillteam]", box);
  if (fill) fill.onclick = () => {
    const have = new Set(people.filter((p) => p.kind === "team").map((p) => (p.role || "").toLowerCase()));
    const rows = (S.lists.team_position || []).filter((r) => !have.has(r.toLowerCase())).slice(0, 10).map((role) => ({ role, name: "" }));
    let get;
    const f = modal({ title: "Fill in production team positions", ok: "Add to team", wide: true, body: h`<div id="teamm"></div>`,
      onOk: async () => { const ps = get(); if (!ps.length) throw new Error("Type a name next to at least one position."); await api("POST", `/api/shows/${id}/people`, { people: ps }); toast("Production team updated"); reload(); } });
    get = teamForm($("#teamm", f), rows.length ? rows : [{ role: "", name: "" }]);
  };
}

function showNumbersTab(box, id, numbers, items, reload) {
  const used = {}; items.forEach((l) => l.scene && (used[l.scene.toLowerCase()] = (used[l.scene.toLowerCase()] || 0) + l.qty));
  const acts = []; numbers.forEach((n) => { const a = n.act ? "Act " + n.act : "Songs"; let g = acts.find((x) => x[0] === a); if (!g) acts.push((g = [a, []])); g[1].push(n); });
  box.innerHTML = h`<div class="print-only"><h2>Musical numbers</h2></div>
    <section class="panel"><header><h2>Musical numbers</h2><span class="muted small">${numbers.length}</span><span class="more no-print"><button class="btn sm" data-numimport>Paste a song list</button></span></header>
    ${numbers.length ? h`<div class="tablewrap"><table><tr><th style="width:52px">No.</th><th>Song</th><th>Sung by</th><th>Scene</th><th class="r">Costumes</th><th class="no-print"></th></tr>
      ${acts.map(([a, ns]) => h`<tr class="group-h"><td colspan="6">${a}</td></tr>${ns.map((n) => h`<tr><td class="num">${n.number || ""}</td><td><b>${n.title}</b>${n.notes ? h`<div class="small muted">${n.notes}</div>` : ""}</td><td class="small">${n.singers || ""}</td><td class="small">${n.scene || ""}</td>
        <td class="r num">${used[numberLabel(n).toLowerCase()] || ""}</td>
        <td class="no-print r" style="white-space:nowrap"><button class="btn sm ghost" data-nmv="up" data-nid="${n.id}" ${n === numbers[0] ? raw("disabled") : ""} aria-label="Move up">↑</button><button class="btn sm ghost" data-nmv="down" data-nid="${n.id}" ${n === numbers[numbers.length - 1] ? raw("disabled") : ""} aria-label="Move down">↓</button>
          <button class="btn sm" data-nedit="${n.id}">Edit</button> <button class="btn sm ghost" data-ndel="${n.id}" aria-label="Remove ${n.title}">✕</button></td></tr>`)}`)}</table></div>`
      : h`<div class="empty">No musical numbers yet. Paste the song list from the script or program, or add songs one at a time below.</div>`}
    <form class="addrow no-print" id="numadd" novalidate><input type="text" name="act" placeholder="Act" aria-label="Act" style="max-width:70px" value="${numbers.length ? numbers[numbers.length - 1].act || "" : "1"}"><input type="text" name="number" placeholder="No." aria-label="Number" style="max-width:70px">
      <input type="text" name="title" placeholder="Song title" aria-label="Song title"><input type="text" name="singers" placeholder="Sung by" aria-label="Sung by" list="dl-characters"><button class="btn sm primary">${icon("plus")}Add</button></form></section>
    <p class="small muted no-print" style="margin-top:10px">Songs show up as scene choices when you check costumes and props out to this show, so you can see what each number needs.</p>`.s;
  $("#numadd", box).onsubmit = async (e) => { e.preventDefault(); const d = formData($("#numadd", box)); if (!d.title.trim()) { $("#numadd [name=title]", box).focus(); return; }
    try { await api("POST", `/api/shows/${id}/numbers`, { numbers: [d] }); reload(); } catch (err) { toast(err.message, true); } };
  $$("[data-nmv]", box).forEach((b) => (b.onclick = async () => { await api("PUT", "/api/show-numbers/" + b.dataset.nid, { move: b.dataset.nmv }); reload(); }));
  $$("[data-ndel]", box).forEach((b) => (b.onclick = () => { const n = numbers.find((x) => x.id === +b.dataset.ndel); confirmBox(`Remove “${n.title}”?`, "It will be taken off this show's song list.", "Remove", async () => { await api("DELETE", "/api/show-numbers/" + n.id); reload(); }); }));
  $$("[data-nedit]", box).forEach((b) => (b.onclick = () => { const n = numbers.find((x) => x.id === +b.dataset.nedit);
    modal({ title: "Edit " + n.title, body: h`<div class="grid">${fld("Act", inp("act", n))}${fld("No.", inp("number", n))}${fld("Song title", inp("title", n), "wide")}${fld("Sung by", h`<input type="text" id="f-singers" name="singers" list="dl-characters" value="${n.singers || ""}">`, "full")}
      ${fld("Scene", inp("scene", n))}${fld("Notes", inp("notes", n, 'placeholder="e.g. Quick change into Act 2 dress before this"'), "wide")}</div>`,
      onOk: async (f) => { await api("PUT", "/api/show-numbers/" + n.id, formData(f)); reload(); } }); }));
  $("[data-numimport]", box).onclick = () => { let get;
    const f = modal({ title: "Paste a song list", ok: "Add songs", wide: true, body: h`<div id="numimp"></div>`,
      onOk: async () => { const ns = get(); if (!ns.length) throw new Error("Paste at least one song first."); await api("POST", `/api/shows/${id}/numbers`, { numbers: ns }); toast(`Added ${ns.length} song${ns.length === 1 ? "" : "s"}`); reload(); } });
    get = numbersImporter($("#numimp", f)); $("[data-num]", f).focus(); };
}

function showMaterialsTab(box, id, mats, reload) {
  const groups = {}; mats.forEach((m) => (groups[m.category || "Other materials"] ||= []).push(m));
  box.innerHTML = h`
    <section class="panel no-print" style="margin-bottom:18px"><div class="body">
      <div class="grid" style="margin-bottom:10px">${fld("Type of material", h`<input type="text" id="mat-cat" list="dl-material_type" placeholder="e.g. Script">`, "", "Applied to the files you add next.")}${fld("Description (optional)", h`<input type="text" id="mat-cap" placeholder="e.g. Final rehearsal draft, revised 3/2">`, "wide")}</div>
      <div id="matdrop"></div></div></section>
    <datalist id="dl-material_type">${(S.lists.material_type || []).map((v) => h`<option value="${v}">`)}</datalist>
    ${mats.length ? Object.entries(groups).map(([g, ms]) => h`<section class="panel" style="margin-bottom:14px"><header><h2>${g}</h2><span class="muted small">${ms.length}</span></header><div class="tablewrap"><table>
      ${ms.map((m) => h`<tr><td style="width:56px">${fileBadge(m.original_name || m.file)}</td>
        <td><a href="${showFileURL(m.file)}" target="_blank" rel="noopener"><b>${m.original_name || m.file}</b></a>${m.caption ? h`<div class="small muted">${m.caption}</div>` : ""}</td>
        <td class="small num" style="white-space:nowrap">${fmtSize(m.size)}</td><td class="small muted">${fmtDate(m.created_at)}${m.created_by ? " · " + m.created_by : ""}</td>
        <td class="r no-print" style="white-space:nowrap"><a class="btn sm" href="${showFileURL(m.file, true)}">Download</a> <button class="btn sm ghost" data-medit="${m.id}">Edit</button> <button class="btn sm ghost" data-mdel="${m.id}" aria-label="Delete ${m.original_name}">✕</button></td></tr>`)}</table></div></section>`)
      : h`<div class="panel"><div class="empty">No materials yet. Add the script, score, rehearsal schedule or anything else the show needs.</div></div>`}`.s;
  dropzone($("#matdrop", box), { label: "Add materials", sub: "Click to choose files, or drag them here. PDFs, Word, Excel, audio, video, images and zip files; up to 200 MB each.",
    onFiles: async (files, status) => {
      try { await uploadAll(`/api/shows/${id}/files?kind=material`, "file", files, { extra: { category: $("#mat-cat", box).value.trim(), caption: $("#mat-cap", box).value.trim() }, status }); toast(`Added ${files.length} file${files.length === 1 ? "" : "s"}`); reload(); }
      catch (err) { status.textContent = ""; toast(err.message, true); }
    } });
  $$("[data-medit]", box).forEach((b) => (b.onclick = () => { const m = mats.find((x) => x.id === +b.dataset.medit);
    modal({ title: "Edit " + (m.original_name || "file"), body: h`<div class="grid">${fld("Type of material", h`<input type="text" name="category" id="me-cat" list="dl-material_type" value="${m.category || ""}">`)}${fld("Description", h`<input type="text" name="caption" id="me-cap" value="${m.caption || ""}">`, "full")}</div>`,
      onOk: async (f) => { await api("PUT", "/api/show-files/" + m.id, formData(f)); reload(); } }); }));
  $$("[data-mdel]", box).forEach((b) => (b.onclick = () => { const m = mats.find((x) => x.id === +b.dataset.mdel);
    confirmBox("Delete this file?", `${m.original_name} will be removed from this show permanently.`, "Delete file", async () => { await api("DELETE", "/api/show-files/" + m.id); toast("File deleted"); reload(); }); }));
}

function showPhotosTab(box, id, s, photos, reload) {
  box.innerHTML = h`<section class="panel no-print" style="margin-bottom:18px"><div class="body"><div id="photodrop"></div></div></section>
    ${photos.length ? h`<div class="pgrid big">${photos.map((p, i) => h`<figure>
      <button type="button" class="pimg" data-open="${i}" aria-label="View photo ${i + 1}"><img src="${showFileURL(p.file)}" alt="${p.caption || ""}" loading="lazy"></button>
      <figcaption>${p.caption || h`<span class="muted">No caption</span>`}${p.file === s.cover ? h` <span class="pill info">Cover</span>` : ""}</figcaption>
      <div class="pact no-print">${p.file !== s.cover ? h`<button class="btn sm" data-cover="${p.id}">Make cover</button>` : ""}<button class="btn sm ghost" data-pcap="${p.id}">Caption</button><button class="btn sm ghost danger" data-phdel="${p.id}">Delete</button></div></figure>`)}</div>`
      : h`<div class="panel"><div class="empty">No photos yet. Add rehearsal shots, the set, costumes on stage, cast photos or the poster.</div></div>`}`.s;
  dropzone($("#photodrop", box), { accept: "image/jpeg,image/png,image/webp,image/gif", label: "Add show photos", sub: "Click to choose, or drag pictures here. Large phone photos are resized automatically.",
    onFiles: async (files, status) => {
      const imgs = files.filter(isImage);
      if (!imgs.length) { toast("Those files aren't photos. Add other files under Materials.", true); return; }
      try { await uploadAll(`/api/shows/${id}/files?kind=photo`, "file", imgs, { photos: true, status }); toast(`Added ${imgs.length} photo${imgs.length === 1 ? "" : "s"}`); reload(); }
      catch (err) { status.textContent = ""; toast(err.message, true); }
    } });
  $$("[data-open]", box).forEach((b) => (b.onclick = () => lightbox(photos.map((p) => ({ src: showFileURL(p.file), caption: p.caption })), +b.dataset.open)));
  $$("[data-cover]", box).forEach((b) => (b.onclick = async () => { await api("PUT", "/api/show-files/" + b.dataset.cover, { cover: true }); toast("Cover photo set"); reload(); }));
  $$("[data-pcap]", box).forEach((b) => (b.onclick = () => { const p = photos.find((x) => x.id === +b.dataset.pcap);
    modal({ title: "Photo caption", body: h`<label for="pc">Caption</label><input type="text" id="pc" value="${p.caption || ""}" placeholder="e.g. Act 2 finale, opening night">`,
      onOk: async (f) => { await api("PUT", "/api/show-files/" + p.id, { caption: $("#pc", f).value }); reload(); } }); }));
  $$("[data-phdel]", box).forEach((b) => (b.onclick = () => confirmBox("Delete this photo?", "The photo will be removed from this show permanently.", "Delete photo", async () => { await api("DELETE", "/api/show-files/" + b.dataset.phdel); toast("Photo deleted"); reload(); })));
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
  const LISTS = [["category", "Categories"], ["subcategory", "Item types"], ["era", "Eras / periods"], ["gender", "Genders"], ["size", "Sizes"], ["material", "Materials"], ["color", "Colors"], ["location", "Storage locations"], ["show_type", "Show types"], ["season", "Seasons"], ["team_position", "Production team positions"], ["crew_position", "Crew positions"], ["instrument", "Pit instruments"], ["voice_part", "Voice parts"], ["material_type", "Show material types"], ["sponsor_tier", "Sponsor tiers"], ["ad_size", "Program ad sizes"], ["licensor", "Licensing companies"]];
  shell("settings", h`
    ${page("Settings", dir ? "Settings" : "My account")}
    <div class="stack">
      ${dir ? h`<section class="panel" id="brandp"><header><h2>School &amp; branding</h2></header><div class="body">
        <p class="small muted" style="margin-top:0;max-width:70ch">How the program presents itself: the sign-in screen, sidebar, browser tab, printed tags and rental agreements, and exported file names.</p>
        <div class="brandgrid">
          <div><div class="brandlogo"><img src="${logoURL()}" alt="Current logo"></div>
            <div id="logodrop" style="margin-top:8px"></div>
            ${S.brand.has_logo ? h`<button type="button" class="btn sm ghost" id="logoreset" style="margin-top:6px">Use the default stage logo</button>` : ""}</div>
          <form id="brandf" class="grid" novalidate style="align-content:start">
            ${fld("School name", h`<input type="text" id="b-school" name="school" maxlength="100" value="${S.brand.school || ""}" placeholder="e.g. Lincoln High School">`, "wide")}
            ${fld("Theatre program name", h`<input type="text" id="b-program" name="program" maxlength="60" value="${S.brand.program || ""}" placeholder="e.g. Lincoln Drama Club">`, "", "Shown as the program's name.")}
            ${fld("Short name", h`<input type="text" id="b-short" name="short" maxlength="12" value="${S.brand.short || ""}" placeholder="e.g. LHS">`, "", "Used in file names.")}
            ${fld("Motto or tagline", h`<input type="text" id="b-tagline" name="tagline" maxlength="120" value="${S.brand.tagline || ""}" placeholder="e.g. All the world’s a stage">`, "full")}
            <div class="full"><label>Accent color</label><div class="swatches">
              <input type="color" id="b-accent" name="accent" value="${S.brand.accent || "#c21d2b"}" aria-label="Accent color">
              ${["#c21d2b", "#8a1538", "#e36f1e", "#d4a017", "#2e7d32", "#00695c", "#1565c0", "#0d2c6c", "#5e35b1", "#4a4343"].map((c) => h`<button type="button" class="sw" data-sw="${c}" style="background:${c}" aria-label="Use ${c}"></button>`)}
              <button type="button" class="btn sm ghost" id="b-accent-reset">Default red</button></div><div class="hint">Use your school colors. Buttons and highlights change right away.</div></div>
            <div class="full"><button class="btn primary">Save branding</button></div>
          </form>
        </div></div></section>

      <section class="panel" id="cloudp"><header><h2>Cloud backup</h2>${cloud.folder ? (cloud.last_error ? h`<span class="pill bad">Problem</span>` : h`<span class="pill good">On</span>`) : h`<span class="pill warn">Off</span>`}</header><div class="body">
        <p style="margin-top:0;max-width:70ch">Keep a copy of the database, photos and show materials in your school OneDrive or Google Drive folder. The app updates the copy about a minute and a half after each change, and keeps a daily copy for 60 days. If this computer fails, install the app on a new one, set the same folder here and click <b>Restore</b>.</p>
        ${cloud.last_error ? h`<div class="errbox">${cloud.last_error}</div>` : ""}
        ${cloud.folder ? h`<p class="small">Saving to <b class="mono">${cloud.backup_folder}</b><br>Last copied: <b>${cloud.last_sync ? fmtWhen(cloud.last_sync) + " (" + cloud.last_sync + ")" : "not yet this session"}</b></p>` : ""}
        <form id="cloudf" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end" novalidate>
          <div style="flex:1 1 320px">${fld("Synced folder on this computer", h`<input type="text" name="folder" id="cf-folder" value="${cloud.folder}" placeholder="e.g. C:\\Users\\you\\OneDrive - Your School District">`)}</div>
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
        <div class="body small muted">Directors can do everything. Assistants can add and edit items, renters, rentals, shows, cast and crew, materials and photos, but can't delete records, change lists, manage users or restore backups.</div></section>

      <section class="panel"><header><h2>Dropdown lists</h2></header><div class="body">
        <p class="small muted" style="margin-top:0">These are the suggestions offered when you add items, shows, cast and crew, and the choices in the search filters. Add any positions your shows need; people can also type a one-off position on a show. The first positions in the production team list are the ones offered when you create a show.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${LISTS.map(([k, t]) => h`<button class="btn sm" data-list="${k}" data-title="${t}">${t} <span class="muted">(${(S.configured[k] || []).length})</span></button>`)}</div></div></section>

      <section class="panel"><header><h2>Backups on this computer</h2><button class="btn sm more" id="bknow">Back up now</button></header><div class="body">
        <p class="small muted" style="margin-top:0">A backup of the database is made automatically every day the program runs (the last 30 are kept), and before any restore. Photos and show files stay in the data folder and are included in cloud backup. Folder: <span class="mono">${backups.folder}</span> <button class="btn sm ghost" id="openbk">Open folder</button></p>
        ${backups.backups.length ? h`<div class="tablewrap"><table><tr><th>File</th><th>Saved</th><th class="r">Size</th><th></th></tr>${backups.backups.slice(0, 12).map((b) => h`<tr><td class="mono small">${b.name}</td><td class="num">${b.modified}</td><td class="r num">${(b.size / 1048576).toFixed(1)} MB</td><td class="r"><button class="btn sm" data-restore-local="${b.name}">Restore</button></td></tr>`)}</table></div>` : h`<p class="muted">No backups yet.</p>`}
      </div></section>` : ""}

      <section class="panel"><header><h2>Export to Excel</h2></header><div class="body" style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="/api/export/items.csv">Inventory</a><a class="btn" href="/api/export/shows.csv">Show history</a><a class="btn" href="/api/export/people.csv">Cast &amp; crew</a><a class="btn" href="/api/export/numbers.csv">Musical numbers</a><a class="btn" href="/api/export/rentals.csv">Rental history</a><a class="btn" href="/api/export/renters.csv">Renters</a></div></section>

      <section class="panel"><header><h2>About this installation</h2></header><div class="body small">
        <div class="dl"><div><span>Program</span><b>School Theatre Manager ${sys.version}</b></div><div><span>Address</span><b class="mono">http://127.0.0.1:${sys.port}</b></div><div style="grid-column:1/-1"><span>Data folder</span><b class="mono">${sys.data_folder}</b></div></div>
        ${sys.network && sys.lan_urls && sys.lan_urls.length ? h`<p>Other computers on the school network can open: ${sys.lan_urls.map((u) => h`<span class="mono">${u}</span> `)}</p>` : ""}
        ${dir ? h`<p style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:0"><button class="btn sm" id="opendata">Open data folder</button><button class="btn sm danger" id="quit">Close the program</button></p>` : ""}
      </div></section>
    </div>`);

  const pwf = $("#pwf");
  pwMeter($("#pw1"));
  pwf.onsubmit = async (e) => { e.preventDefault(); const d = formData(pwf), eb = $(".errbox", pwf);
    if (!pwOK(d.new)) { eb.textContent = "Choose a stronger password. " + PW_RULE; eb.hidden = false; return; }
    if (d.new !== d.confirm) { eb.textContent = "The two new passwords don't match."; eb.hidden = false; return; }
    try { await api("POST", "/api/me/password", d); pwf.reset(); $("#pw1").dispatchEvent(new Event("input")); eb.hidden = true; toast("Password changed"); } catch (err) { eb.textContent = err.message; eb.hidden = false; } };
  if (!dir) return;

  // branding
  const bf = $("#brandf");
  let accent = S.brand.accent || "";
  const preview = (c) => { accent = c; $("#b-accent").value = c || "#c21d2b"; S.brand = { ...S.brand, accent: c }; applyBrand(); };
  $("#b-accent").addEventListener("input", (e) => preview(e.target.value));
  $$("[data-sw]").forEach((b) => (b.onclick = () => preview(b.dataset.sw)));
  $("#b-accent-reset").onclick = () => preview("");
  bf.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(bf); d.accent = accent;
    try { S.brand = await api("PUT", "/api/branding", d); applyBrand(); toast("Branding saved"); viewSettings(); } catch (err) { toast(err.message, true); }
  };
  dropzone($("#logodrop"), { accept: "image/png,image/jpeg,image/gif,.ico,image/x-icon,image/vnd.microsoft.icon", label: "Change the logo", sub: "PNG, JPG, GIF or ICO. A square logo looks best.",
    onFiles: async (files, status) => {
      const fd = new FormData(); fd.append("logo", files[0]); status.textContent = "Uploading…";
      try { S.brand = await api("POST", "/api/branding/logo", fd); applyBrand(); toast("Logo updated"); viewSettings(); } catch (err) { status.textContent = ""; toast(err.message, true); }
    } });
  if ($("#logoreset")) $("#logoreset").onclick = () => confirmBox("Use the default logo?", "Your school's logo will be removed and the built-in stage logo used instead.", "Use default", async () => { S.brand = await api("DELETE", "/api/branding/logo"); applyBrand(); viewSettings(); });

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
    body: h`<p>Everything in the application will be replaced with this backup. A safety copy of the current data is saved first, so you can undo this from the backups list.</p><p class="small muted">Users and passwords come from the backup too. After restoring, sign in with an account from that backup.</p>`,
    onOk: async () => { const r = await api("POST", "/api/restore", { source, name }); toast(`Restored${r.photos ? `, plus ${r.photos} photos` : ""}`); setTimeout(() => location.reload(), 900); } });
  $$("[data-restore-cloud]").forEach((b) => (b.onclick = () => restore("cloud", b.dataset.restoreCloud, b.dataset.label.toLowerCase())));
  $$("[data-restore-local]").forEach((b) => (b.onclick = () => restore("local", b.dataset.restoreLocal, b.dataset.restoreLocal)));

  // users
  $("#adduser").onclick = () => { const mf = modal({ title: "Add a user", ok: "Add user",
    body: h`<div class="grid">${fld("Name", h`<input type="text" name="display_name" id="u-name" placeholder="e.g. Jordan (stage manager)">`, "full")}${fld("Username", h`<input type="text" name="username" id="u-user" autocomplete="off">`)}
      ${fld("Role", sel("role", [["assistant", "Assistant"], ["director", "Director"]], "assistant"))}${fld("Temporary password", h`<input type="text" name="password" id="u-pw" autocomplete="off">`, "full", "They'll choose their own when they first sign in.")}</div>`,
    onOk: async (f) => { const d = formData(f); if (!pwOK(d.password)) throw new Error("The temporary password needs " + PW_RULE.charAt(0).toLowerCase() + PW_RULE.slice(1)); await api("POST", "/api/users", d); toast("User added"); viewSettings(); } });
    pwMeter($("#u-pw", mf)); };
  $$("[data-user]").forEach((b) => (b.onclick = () => {
    const u = users.find((x) => x.id === +b.dataset.user), self = u.id === S.me.id;
    const mf = modal({ title: "Manage " + (u.display_name || u.username),
      body: h`<div class="grid">${fld("Name", h`<input type="text" name="display_name" id="mu-name" value="${u.display_name || ""}">`, "full")}
        ${self ? "" : h`${fld("Role", sel("role", [["assistant", "Assistant"], ["director", "Director"]], u.role))}<div style="align-self:end"><label class="check"><input type="checkbox" name="active" id="mu-act" ${u.active ? raw("checked") : ""}> Account enabled</label></div>`}
        ${fld("Set a new temporary password", h`<input type="text" name="password" id="mu-pw" autocomplete="off" placeholder="Leave blank to keep the current one">`, "full", self ? "To change your own password, use My account." : "They'll be asked to change it at their next sign-in.")}</div>`,
      onOk: async (f) => { const d = formData(f); if (self) delete d.password; if (d.password && !pwOK(d.password)) throw new Error("The temporary password needs " + PW_RULE.charAt(0).toLowerCase() + PW_RULE.slice(1)); await api("PUT", "/api/users/" + u.id, d); toast("Saved"); viewSettings(); } });
    if (!self) pwMeter($("#mu-pw", mf));
  }));
  // lists
  $$("[data-list]").forEach((b) => (b.onclick = () => modal({ title: b.dataset.title,
    body: h`<label for="lv">One per line, in the order you want them shown</label><textarea id="lv" rows="14">${(S.configured[b.dataset.list] || []).join("\n")}</textarea>`,
    onOk: async (f) => { await api("PUT", "/api/lookups", { list: b.dataset.list, values: $("#lv", f).value.split("\n") }); await refreshLookups(); toast("List saved"); viewSettings(); } })));
  $("#bknow").onclick = async () => { try { const r = await api("POST", "/api/backups"); toast("Saved " + r.name); viewSettings(); } catch (err) { toast(err.message, true); } };
  $("#openbk").onclick = () => api("POST", "/api/open-folder", { which: "backups" });
  $("#opendata").onclick = () => api("POST", "/api/open-folder", { which: "data" });
  $("#quit").onclick = () => confirmBox(`Close ${BN()}?`, "Everything is saved. Open it again any time from the desktop shortcut.", "Close program", async () => {
    await api("POST", "/api/shutdown");
    $("#app").innerHTML = h`<div class="boot"><img src="${logoURL()}" alt="" width="96" height="96"><p>${BN()} is closed. You can close this tab.</p></div>`.s;
  });
}

boot();
