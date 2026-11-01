"use strict";
/* Program (playbill) builder. Uses the helpers in app.js (h, raw, $, api, modal, dropzone…).
   A program is { size, style, paper, border, accent, pageNumbers, pages: [{ id, name, blocks: [...] }] }.
   Blocks like the cast list are drawn from the show's data each time, so they stay current. */

const PSIZES = { half: { w: 5.5, h: 8.5, label: "Booklet page — 5.5 × 8.5 in (letter paper folded in half)" }, letter: { w: 8.5, h: 11, label: "Full page — 8.5 × 11 in" } };
const PSTYLES = {
  classic: { label: "Classic", display: '"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif', body: 'Georgia,"Times New Roman",serif', hcase: "none", hls: "0", hw: 700 },
  broadway: { label: "Broadway marquee", display: 'Bahnschrift,"Arial Narrow","Franklin Gothic Medium",Impact,sans-serif', body: '"Segoe UI",Arial,sans-serif', hcase: "uppercase", hls: ".08em", hw: 700, stretch: "condensed" },
  elegant: { label: "Elegant", display: 'Gabriola,"Palatino Linotype","Book Antiqua",serif', body: 'Constantia,Georgia,serif', hcase: "none", hls: "0", hw: 400, hscale: 1.3 },
  modern: { label: "Modern", display: '"Segoe UI Semibold","Segoe UI",Arial,sans-serif', body: '"Segoe UI",Arial,sans-serif', hcase: "none", hls: "-.01em", hw: 600 },
  typewriter: { label: "Typewriter", display: '"Courier New",Courier,monospace', body: '"Courier New",Courier,monospace', hcase: "uppercase", hls: ".04em", hw: 700 },
};
const PAPERS = { white: { label: "White", paper: "#ffffff", ink: "#1b1717", muted: "#5f5757" }, cream: { label: "Cream", paper: "#fbf6ea", ink: "#2a211a", muted: "#6d6255" }, black: { label: "Black", paper: "#141112", ink: "#f4efe9", muted: "#b9b0a8" } };
const BORDERS = { none: "None", thin: "Thin line", double: "Double line", deco: "Theatre corners" };
const HSIZES = [13, 17, 23, 31, 42];      // heading sizes in points, small → huge
const TSIZES = [7.5, 8.5, 9.5, 10.5, 12]; // body text sizes in points
const SIZE_NAMES = ["Smallest", "Small", "Medium", "Large", "Largest"];
const P = { showId: 0, doc: null, ctx: null, sel: null, cur: 0, undo: [], redo: [], saveT: null, saving: false, status: "", editOnce: null, panel: "add" };
const puid = () => Math.random().toString(36).slice(2, 9);

// ---------- text helpers ----------
// Text blocks keep only bold, italic, underline and line breaks.
function cleanHTML(html) {
  const t = document.createElement("div"); t.innerHTML = html || "";
  const walk = (n) => [...n.childNodes].map((c) => {
    if (c.nodeType === 3) return esc(c.textContent);
    if (c.nodeType !== 1) return "";
    const tag = c.tagName.toLowerCase(), inner = walk(c);
    if (tag === "b" || tag === "strong") return inner ? `<b>${inner}</b>` : "";
    if (tag === "i" || tag === "em") return inner ? `<i>${inner}</i>` : "";
    if (tag === "u") return inner ? `<u>${inner}</u>` : "";
    if (tag === "br") return "<br>";
    if (tag === "div" || tag === "p") return inner + "<br>";
    return inner;
  }).join("");
  return walk(t).replace(/(<br>\s*)+$/, "");
}
const plain = (s) => (s || "").replace(/\s+/g, " ").trim();
function runLine(s) {
  if (!s.open_date) return "";
  const o = new Date(s.open_date + "T12:00:00"), c = s.close_date ? new Date(s.close_date + "T12:00:00") : null;
  const m = (d) => d.toLocaleDateString(undefined, { month: "long" });
  if (!c || +c === +o) return o.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  if (o.getFullYear() === c.getFullYear() && o.getMonth() === c.getMonth()) return `${m(o)} ${o.getDate()}–${c.getDate()}, ${o.getFullYear()}`;
  if (o.getFullYear() === c.getFullYear()) return `${m(o)} ${o.getDate()} – ${m(c)} ${c.getDate()}, ${o.getFullYear()}`;
  return `${o.toLocaleDateString()} – ${c.toLocaleDateString()}`;
}

// ---------- blocks ----------
const B = {
  heading: (text, o = {}) => ({ id: puid(), type: "heading", text, size: 3, align: "center", color: "ink", font: "display", ...o }),
  text: (html, o = {}) => ({ id: puid(), type: "text", html, size: 2, align: "left", color: "ink", ...o }),
  image: (o = {}) => ({ id: puid(), type: "image", src: "upload", file: "", width: 80, maxh: 4, align: "center", caption: "", ...o }),
  info: (o = {}) => ({ id: puid(), type: "info", dates: true, venue: true, director: false, size: 2, align: "center", ...o }),
  people: (kind, o = {}) => ({ id: puid(), type: "people", kind, cols: 1, style: "leaders", order: "role", voice: false, grade: false, size: 2, ...o }),
  songs: (o = {}) => ({ id: puid(), type: "songs", singers: true, size: 2, ...o }),
  sponsors: (o = {}) => ({ id: puid(), type: "sponsors", tiers: [], layout: "tiers", names: true, messages: true, scale: 2, ...o }),
  credits: (part, o = {}) => ({ id: puid(), type: "credits", part, size: part === "license" ? 1 : 2, align: "center", ...o }),
  divider: (o = {}) => ({ id: puid(), type: "divider", style: "ornament", ...o }),
  spacer: (o = {}) => ({ id: puid(), type: "spacer", size: 2, ...o }),
};
const BLOCK_LABEL = { credits: "Credits", heading: "Heading", text: "Text", image: "Picture", info: "Show details", people: "People list", songs: "Musical numbers", sponsors: "Sponsors", divider: "Divider", spacer: "Space" };
const PEOPLE_LABEL = { cast: "Cast", team: "Production team", crew: "Crew", pit: "Pit orchestra" };

// Ready-made pages, filled in from the show.
function pageTemplate(kind, ctx) {
  const s = ctx.show, br = S.brand, title = s.title;
  const dir = s.director || "";
  const has = (k) => ctx.people.some((p) => p.kind === k);
  const pg = (name, blocks) => ({ id: puid(), name, blocks });
  switch (kind) {
    case "cover": return pg("Cover", [
      B.image({ src: "logo", width: 22, maxh: 1.1 }),
      B.heading(br.school || BN(), { size: 1, color: "accent" }),
      br.program && br.program !== br.school ? B.heading(br.program, { size: 1, font: "body", color: "muted" }) : null,
      B.spacer({ size: 2 }),
      B.heading(title, { size: 5 }),
      B.spacer({ size: 1 }),
      B.image({ src: "cover", width: 84, maxh: 3.6 }),
      B.spacer({ size: 1 }),
      dir ? B.heading("Directed by " + dir, { size: 1, font: "body" }) : null,
      B.info({ size: 3 }),
    ].filter(Boolean));
    case "title": return pg("Title page", [
      B.spacer({ size: 3 }),
      B.text(`<i>${esc(br.school || BN())} presents</i>`, { align: "center", size: 3, color: "muted" }),
      B.heading(title, { size: 4 }),
      B.credits("authors"),
      B.divider(),
      B.info({ director: true }),
      B.spacer({ size: 4 }),
      B.credits("license"),
    ]);
    case "note": return pg("Director's note", [
      B.heading("From the Director", { size: 3 }),
      B.divider({ style: "line" }),
      B.text("Welcome to our production of <i>" + esc(title) + "</i>!<br><br>Write a few words about why you chose this show, what the students have put into it, and who you'd like to thank. Click this text to edit it.<br><br>Enjoy the show!", { size: 3 }),
      B.text(dir ? "— " + esc(dir) + ", Director" : "— The Director", { align: "right", size: 3 }),
    ]);
    case "cast": return pg("Cast", [B.heading("Cast", { size: 3 }), B.divider({ style: "line" }), B.people("cast", { cols: ctx.people.filter((p) => p.kind === "cast").length > 18 ? 2 : 1 })]);
    case "songs": return pg("Musical numbers", [B.heading("Musical Numbers", { size: 3 }), B.divider({ style: "line" }), B.songs()]);
    case "team": return pg("Team & crew", [
      B.heading("Production Team", { size: 2 }), B.people("team"),
      has("pit") || isMusical(s.type) ? B.heading("Pit Orchestra", { size: 2 }) : null, has("pit") || isMusical(s.type) ? B.people("pit") : null,
      B.heading("Crew", { size: 2 }), B.people("crew", { cols: ctx.people.filter((p) => p.kind === "crew").length > 14 ? 2 : 1 }),
    ].filter(Boolean));
    case "sponsors": return pg("Sponsors", [B.heading("Thank You to Our Sponsors", { size: 3 }), B.text("This production is made possible by the generous support of our sponsors. Please thank them with your business!", { align: "center", size: 2, color: "muted" }), B.sponsors()]);
    case "thanks": return pg("Special thanks", [B.heading("Special Thanks", { size: 3 }), B.text("Our families · Our principal and administration · The custodial staff · The music department · Everyone who helped build, sew, paint and sell tickets<br><br>Click here to edit.", { align: "center", size: 3 })]);
    case "notes": return pg("Notes & autographs", [B.heading("Notes & Autographs", { size: 2 })]);
    case "back": return pg("Back cover", [
      B.heading("Special Thanks", { size: 2 }),
      B.text("Click here to list the people and groups who helped make this show happen.", { align: "center", size: 2 }),
      B.spacer({ size: 4 }),
      B.text("<b>Please silence all phones.</b> The videotaping or other video or audio recording of this production is strictly prohibited.", { align: "center", size: 2 }),
      B.divider(),
      B.image({ src: "logo", width: 24, maxh: 1.1 }),
      B.heading(br.school || BN(), { size: 1 }),
      br.tagline ? B.text(`<i>${esc(br.tagline)}</i>`, { align: "center", size: 2, color: "muted" }) : null,
    ].filter(Boolean));
    default: return pg("New page", [B.heading("New page", { size: 3 })]);
  }
}
const PAGE_TEMPLATES = [["blank", "Blank page"], ["note", "Director's note"], ["cast", "Cast"], ["songs", "Musical numbers"], ["team", "Team & crew"], ["sponsors", "Sponsors"], ["thanks", "Special thanks"], ["notes", "Notes & autographs"], ["title", "Title page"], ["cover", "Cover"], ["back", "Back cover"]];

function defaultProgram(ctx) {
  const mus = isMusical(ctx.show.type) || ctx.numbers.length > 0;
  const kinds = ["cover", "title", "note", "cast", ...(mus ? ["songs"] : []), "team", ...(ctx.sponsors.length ? ["sponsors"] : []), "back"];
  return { v: 1, size: "half", style: "classic", paper: "white", border: "none", accent: S.brand.accent || "", pageNumbers: true, pages: kinds.map((k) => (k === "blank" ? { id: puid(), name: "Blank", blocks: [] } : pageTemplate(k, ctx))) };
}

// ---------- drawing ----------
function pageStyle(doc) {
  const st = PSTYLES[doc.style] || PSTYLES.classic, pa = PAPERS[doc.paper] || PAPERS.white, sz = PSIZES[doc.size] || PSIZES.half;
  const accent = /^#[0-9a-f]{6}$/i.test(doc.accent || "") ? doc.accent : S.brand.accent || "#9d1420";
  return `width:${sz.w}in;height:${sz.h}in;--p-paper:${pa.paper};--p-ink:${pa.ink};--p-muted:${pa.muted};--p-accent:${accent};--p-display:${st.display};--p-body:${st.body};--p-hcase:${st.hcase};--p-hls:${st.hls};--p-hw:${st.hw};--p-stretch:${st.stretch || "normal"};--p-hscale:${st.hscale || 1}`;
}
const colorVar = (c) => (c === "accent" ? "var(--p-accent)" : c === "muted" ? "var(--p-muted)" : "var(--p-ink)");

function imgSrc(b, ctx) {
  if (b.src === "logo") return logoURL();
  if (b.src === "cover") return ctx.show.cover ? showFileURL(ctx.show.cover) : "";
  return b.file ? showFileURL(b.file) : "";
}

function drawBlock(b, ctx, editing) {
  const al = `text-align:${b.align || "left"}`;
  switch (b.type) {
    case "heading": return h`<div class="pb-h" style="${al};font-size:calc(${HSIZES[(b.size || 3) - 1]}pt * var(--p-hscale));color:${colorVar(b.color)};font-family:${b.font === "body" ? "var(--p-body)" : "var(--p-display)"}" ${editing ? raw('contenteditable="plaintext-only" spellcheck="true" data-edit="text"') : ""}>${b.text || ""}</div>`;
    case "text": return h`<div class="pb-t" style="${al};font-size:${TSIZES[(b.size || 2) - 1]}pt;color:${colorVar(b.color)}" ${editing ? raw('contenteditable="true" spellcheck="true" data-edit="html"') : ""}>${raw(cleanHTML(b.html))}</div>`;
    case "image": {
      const src = imgSrc(b, ctx);
      const box = `max-width:${b.width || 80}%;max-height:${b.maxh || 4}in`;
      return h`<figure class="pb-img" style="${al}">${src ? h`<img src="${src}" alt="" style="${box}">` : h`<div class="pb-imgph" style="width:${b.width || 80}%">${b.src === "cover" ? "This show has no cover image yet. Add one on the show's page." : "Choose a picture in the panel →"}</div>`}${b.caption ? h`<figcaption>${b.caption}</figcaption>` : ""}</figure>`;
    }
    case "info": {
      const s = ctx.show, parts = [b.dates && runLine(s), b.venue && s.venue, b.director && s.director && "Directed by " + s.director].filter(Boolean);
      return h`<div class="pb-info" style="${al};font-size:${TSIZES[(b.size || 2) - 1]}pt">${parts.length ? parts.map((p, i) => h`${i ? h`<span class="sep"> · </span>` : ""}<span>${p}</span>`) : editing ? h`<span class="pb-hint">Add opening and closing dates and a venue in Edit show to fill this in.</span>` : ""}</div>`;
    }
    case "people": {
      const list = ctx.people.filter((p) => p.kind === b.kind);
      const fs = `font-size:${TSIZES[(b.size || 2) - 1]}pt`;
      if (!list.length) return editing ? h`<div class="pb-hint" style="${fs}">No ${PEOPLE_LABEL[b.kind].toLowerCase()} added yet. Add people on the show's Cast &amp; crew tab and they appear here.</div>` : "";
      const named = list.filter((p) => p.role), ensemble = list.filter((p) => !p.role);
      const extra = (p) => [b.voice && p.voice_part, b.grade && p.grade && "Gr. " + p.grade].filter(Boolean).join(", ");
      const row = (p) => {
        const nm = h`<span class="pp-n">${p.name}${extra(p) ? h` <span class="pp-x">(${extra(p)})</span>` : ""}</span>`, rl = h`<span class="pp-r">${p.role}</span>`;
        if (b.style === "stacked") return h`<div class="pp st">${b.order === "name" ? h`${nm}${rl}` : h`${rl}${nm}`}</div>`;
        return h`<div class="pp">${b.order === "name" ? h`${nm}<span class="pp-d"></span>${rl}` : h`${rl}<span class="pp-d"></span>${nm}`}</div>`;
      };
      return h`<div class="pb-people" style="${fs};columns:${b.cols || 1}">${named.map(row)}${ensemble.length ? h`<div class="pp-ens"><span class="pp-r">${b.kind === "cast" ? "Ensemble" : b.kind === "crew" ? "Crew" : "Also"}</span> ${ensemble.map((p, i) => h`${i ? ", " : ""}${p.name}`)}</div>` : ""}</div>`;
    }
    case "songs": {
      const fs = `font-size:${TSIZES[(b.size || 2) - 1]}pt`;
      if (!ctx.numbers.length) return editing ? h`<div class="pb-hint" style="${fs}">No musical numbers yet. Add the song list on the show's Musical numbers tab.</div>` : "";
      const acts = []; ctx.numbers.forEach((n) => { const a = n.act || ""; let g = acts.find((x) => x[0] === a); if (!g) acts.push((g = [a, []])); g[1].push(n); });
      const actName = (a) => { const w = ["", "One", "Two", "Three", "Four"][+a]; return a ? "Act " + (w || a) : ""; };
      return h`<div class="pb-songs" style="${fs}">${acts.map(([a, ns]) => h`${a ? h`<div class="ps-act">${actName(a)}</div>` : ""}${ns.map((n) => h`<div class="pp"><span class="pp-r">${n.number ? n.number + ". " : ""}${n.title}</span>${b.singers && n.singers ? h`<span class="pp-d"></span><span class="pp-n ps-s">${n.singers}</span>` : ""}</div>`)}`)}</div>`;
    }
    case "sponsors": return drawSponsors(b, ctx, editing);
    case "credits": {
      const s = ctx.show, fs = `font-size:${TSIZES[(b.size || 2) - 1]}pt`, lines = (t) => (t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (b.part === "license") {
        const notice = lines(s.licensing_notice), lic = (s.licensor || "").trim();
        if (!notice.length && !lic) return editing ? h`<div class="pb-hint" style="${fs}">Licensing notice: fill in <b>Licensed through</b> (or paste the exact wording) in Edit show → Authors &amp; rights. Nothing prints until you do.</div>` : "";
        return h`<div class="pb-lic" style="${al};${fs}">${notice.length ? notice.map((l, i) => h`${i ? raw("<br>") : ""}${l}`) : h`<i>${s.title}</i> is presented through special arrangement with ${lic}. All authorized performance materials are also supplied by ${lic}.`}</div>`;
      }
      const cr = creditLines(s), extra = lines(s.additional_credits);
      if (!cr.length && !extra.length) return editing ? h`<div class="pb-hint" style="${fs}">Author credits: fill in who wrote the show in Edit show → Authors &amp; rights. Only the lines you fill in will print.</div>` : "";
      return h`<div class="pb-cred" style="${al};${fs}">${cr.map(([k, v]) => h`<div class="cr-l"><span class="cr-k">${k}</span> <span class="cr-v">${v}</span></div>`)}${extra.map((l) => h`<div class="cr-x">${l}</div>`)}</div>`;
    }
    case "divider": return h`<div class="pb-div ${b.style || "ornament"}">${b.style === "ornament" ? raw("<span>✦ &nbsp; ✦ &nbsp; ✦</span>") : ""}</div>`;
    case "spacer": return h`<div class="pb-sp" style="height:${(b.size || 2) * 0.12}in">${editing ? raw('<span class="pb-sp-l">space</span>') : ""}</div>`;
  }
  return "";
}

// Sponsors grouped by tier; ads sized by what each sponsor bought.
const AD_SPAN = { "Full page": "full", "Half page": "half", "Quarter page": "quarter", "Business card": "card" };
function drawSponsors(b, ctx, editing) {
  let list = ctx.sponsors.filter((s) => !b.tiers || !b.tiers.length || b.tiers.includes(s.tier || ""));
  if (!list.length) return editing ? h`<div class="pb-hint">No sponsors to show yet. Add them under <b>Sponsors</b> in the sidebar or the panel → and they appear here.</div>` : "";
  const order = S.lists.sponsor_tier || [];
  const tiers = []; list.forEach((s) => { const t = s.tier || ""; let g = tiers.find((x) => x[0] === t); if (!g) tiers.push((g = [t, []])); g[1].push(s); });
  tiers.sort((a, z) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(z[0]) + 1 || 99));
  const sc = (b.scale || 3) / 3;
  if (b.layout === "names") return h`<div class="pb-sp-names">${tiers.map(([t, ss]) => h`${t ? h`<div class="ps-tier">${t}</div>` : ""}<div class="ps-names">${ss.map((s, i) => h`${i ? raw(" &nbsp;·&nbsp; ") : ""}<span>${s.name}</span>`)}</div>`)}</div>`;
  return h`<div class="pb-sponsors">${tiers.map(([t, ss]) => {
    const ads = ss.filter((s) => AD_SPAN[s.ad_size] || s.logo), names = ss.filter((s) => !(AD_SPAN[s.ad_size] || s.logo));
    return h`${t ? h`<div class="ps-tier">${t}</div>` : ""}
      ${ads.length ? h`<div class="ps-grid">${ads.map((s) => { const k = AD_SPAN[s.ad_size] || "quarter";
        return h`<div class="ps-ad ${k}">${s.logo ? h`<img src="/files/sponsor/${encodeURIComponent(s.logo)}" alt="${s.name}" style="max-height:${({ full: 5.2, half: 2.4, quarter: 1.5, card: 0.9 }[k] * sc).toFixed(2)}in">` : ""}
          ${b.names || !s.logo ? h`<div class="ps-n">${s.name}</div>` : ""}${b.messages && s.message ? h`<div class="ps-m">${s.message}</div>` : ""}</div>`; })}</div>` : ""}
      ${names.length ? h`<div class="ps-names">${names.map((s, i) => h`${i ? raw(" &nbsp;·&nbsp; ") : ""}<span>${s.name}</span>${b.messages && s.message ? h` <i class="ps-m">— ${s.message}</i>` : ""}`)}</div>` : ""}`;
  })}</div>`;
}

function drawPage(pg, i, doc, ctx, editing) {
  const sel = (bi) => (editing && P.sel && P.sel.pi === i && P.sel.bi === bi ? "sel" : "");
  const folio = doc.pageNumbers && i > 0 && i < doc.pages.length - 1;
  return h`<section class="ppage b-${doc.border || "none"}" style="${pageStyle(doc)}" data-pi="${i}">
    ${doc.border === "deco" ? raw('<i class="dc tl"></i><i class="dc tr"></i><i class="dc bl"></i><i class="dc br"></i>') : ""}
    <div class="pcontent" data-pi="${i}">${pg.blocks.map((b, bi) => editing ? h`<div class="pblock ${sel(bi)}" data-pi="${i}" data-bi="${bi}" data-type="${b.type}">
        <div class="pbar"><button type="button" class="pdrag" data-act="drag" title="Drag to move" aria-label="Drag to move">⠿</button><button type="button" data-act="up" title="Move up" aria-label="Move up">↑</button><button type="button" data-act="down" title="Move down" aria-label="Move down">↓</button><button type="button" data-act="dup" title="Duplicate" aria-label="Duplicate">⧉</button><button type="button" data-act="del" title="Delete" aria-label="Delete">✕</button></div>
        ${drawBlock(b, ctx, true)}</div>` : drawBlock(b, ctx, false))}
      ${editing && !pg.blocks.length ? h`<div class="pb-hint pempty" data-pi="${i}">Empty page. Add blocks from the panel →, or drag blocks here.</div>` : ""}</div>
    ${folio ? h`<div class="pfolio">${i + 1}</div>` : ""}</section>`;
}

// Programs started before version 2.3 had fill-in-the-blank author and licensing lines.
// Swap any still unedited for credit blocks that read the show's Authors & rights.
function upgradeProgram(doc) {
  let changed = false;
  doc.pages.forEach((pg) => {
    let placed = false;
    pg.blocks = pg.blocks.flatMap((b) => {
      if (b.type !== "text") return [b];
      const t = (b.html || "").replace(/<[^>]+>/g, "");
      if (/_{4,}/.test(t) && /(book|music|lyrics|written|based on)/i.test(t)) { changed = true; if (placed) return []; placed = true; return [B.credits("authors", { align: b.align || "center" })]; }
      if (/\[licensing company/i.test(t)) { changed = true; return [B.credits("license", { align: b.align || "center" })]; }
      return [b];
    });
  });
  return changed;
}

// ---------- editor ----------
async function viewProgram(id) {
  const d = await GET(`/api/shows/${id}/program`);
  P.showId = id; P.ctx = d; P.undo = []; P.redo = []; P.sel = null; P.cur = 0; P.status = d.meta ? "Saved" : "";
  P.doc = d.doc && d.doc.pages ? d.doc : defaultProgram(d);
  const upgraded = upgradeProgram(P.doc);
  const s = d.show;
  shell(s.status === "closed" ? "past-shows" : "shows", h`
    <div class="crumb no-print"><a href="#/${s.status === "closed" ? "past-shows" : "shows"}">${s.status === "closed" ? "Past shows" : "Current shows"}</a> / <a href="#/show/${id}">${s.title}</a></div>
    <div class="pagehead"><div><div class="eyebrow">Program</div><h1>${s.title}</h1></div>
      <div class="actions no-print"><span class="small muted" id="psave" aria-live="polite"></span>
        <button class="btn" id="pundo" title="Undo (Ctrl+Z)">↶ Undo</button><button class="btn" id="predo" title="Redo (Ctrl+Y)">↷ Redo</button>
        <button class="btn" id="pmore">More…</button><button class="btn" id="pprint">${icon("print")}Print single pages</button><button class="btn primary" id="pbook">${icon("print")}Print as booklet</button></div></div>
    ${!d.doc ? h`<div class="note no-print">This is a standard program layout filled in from ${s.title}'s details. Click any text to change it, add or move blocks and pages, and pick a style in the panel. It saves as you go.</div>` : ""}
    <div class="pedit">
      <aside class="prail no-print" id="prail"></aside>
      <div class="pcanvas" id="pcanvas"></div>
      <aside class="ppanel no-print"><div class="tabs pptabs" role="tablist">${[["add", "Add"], ["edit", "Edit"], ["style", "Style"], ["images", "Pictures"], ["sponsors", "Sponsors"]].map(([k, t]) => h`<button type="button" data-ptab="${k}" class="${P.panel === k ? "on" : ""}">${t}</button>`)}</div><div id="ppanel"></div></aside>
    </div>`);
  $$("[data-ptab]").forEach((b) => (b.onclick = () => { P.panel = b.dataset.ptab; drawPanel(); }));
  $("#pundo").onclick = undo; $("#predo").onclick = redo;
  $("#pprint").onclick = () => printProgram("single");
  $("#pbook").onclick = () => printProgram("booklet");
  $("#pmore").onclick = moreMenu;
  if (!d.doc || upgraded) save(true);
  drawAll(); drawPanel(); setStatus(P.status);
}

function setStatus(t) { P.status = t; const el = $("#psave"); if (el) el.textContent = t; const u = $("#pundo"), r = $("#predo"); if (u) u.disabled = !P.undo.length; if (r) r.disabled = !P.redo.length; }
function scheduleSave() { setStatus("Saving…"); clearTimeout(P.saveT); P.saveT = setTimeout(() => save(), 700); }
async function save(quiet) {
  clearTimeout(P.saveT); P.saveT = null;
  const id = P.showId, doc = JSON.parse(JSON.stringify(P.doc));
  try { await api("PUT", `/api/shows/${id}/program`, { doc }); if (P.showId === id) setStatus("Saved"); }
  catch (err) { if (!quiet) toast("The program couldn't be saved: " + err.message, true); setStatus("Not saved — will retry"); P.saveT = setTimeout(() => save(true), 4000); }
}
window.addEventListener("hashchange", () => { if (P.saveT) save(true); });
window.addEventListener("beforeunload", () => { if (P.saveT) save(true); });

function snapshot() { P.undo.push(JSON.stringify(P.doc)); if (P.undo.length > 80) P.undo.shift(); P.redo = []; }
function change(fn, opts = {}) { snapshot(); fn(P.doc); if (opts.render !== false) drawAll(); if (opts.panel !== false) drawPanel(); scheduleSave(); }
function undo() { if (!P.undo.length) return; P.redo.push(JSON.stringify(P.doc)); P.doc = JSON.parse(P.undo.pop()); P.sel = null; drawAll(); drawPanel(); scheduleSave(); }
function redo() { if (!P.redo.length) return; P.undo.push(JSON.stringify(P.doc)); P.doc = JSON.parse(P.redo.pop()); P.sel = null; drawAll(); drawPanel(); scheduleSave(); }
document.addEventListener("keydown", (e) => {
  if (!$("#pcanvas") || e.target.closest("[contenteditable],input,textarea,select")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
});

const selBlock = () => (P.sel ? (P.doc.pages[P.sel.pi] || {}).blocks?.[P.sel.bi] : null);

function drawAll() {
  const doc = P.doc, cv = $("#pcanvas"); if (!cv) return;
  const sz = PSIZES[doc.size] || PSIZES.half;
  // fit a whole page on screen: as wide as the desk allows, but never taller than the window
  const zoom = Math.min(1.1, (cv.clientWidth - 24) / (sz.w * 96), Math.max(0.45, (window.innerHeight - 200) / (sz.h * 96)));
  cv.style.setProperty("--pz", zoom.toFixed(3));
  cv.innerHTML = doc.pages.map((pg, i) => h`<div class="pwrap ${P.cur === i ? "cur" : ""}" data-pi="${i}">
      <div class="ptools no-print"><b>${i + 1}</b> <span class="pname">${pg.name || "Page"}</span>
        <span class="ptbtn"><button type="button" class="btn sm ghost" data-pg="rename" data-pi="${i}">Rename</button><button type="button" class="btn sm ghost" data-pg="up" data-pi="${i}" ${i === 0 ? raw("disabled") : ""} aria-label="Move page up">↑</button><button type="button" class="btn sm ghost" data-pg="down" data-pi="${i}" ${i === doc.pages.length - 1 ? raw("disabled") : ""} aria-label="Move page down">↓</button><button type="button" class="btn sm ghost" data-pg="dup" data-pi="${i}">Duplicate</button><button type="button" class="btn sm ghost danger" data-pg="del" data-pi="${i}">Delete</button></span></div>
      ${drawPage(pg, i, doc, P.ctx, true)}
      <div class="pover no-print" hidden>This page is too full and will be cut off. Move a block to another page, make text smaller, or use two columns.</div>
      <button type="button" class="btn sm paddpage no-print" data-pg="add" data-pi="${i}">${icon("plus")}Add a page here</button></div>`.s).join("");
  bindCanvas();
  checkOverflow();
  drawRail();
}

function checkOverflow() {
  $$("#pcanvas .pwrap").forEach((w) => {
    const c = $(".pcontent", w), over = c.scrollHeight > c.clientHeight + 2;
    $(".pover", w).hidden = !over; w.classList.toggle("over", over);
  });
  drawRail();
}

function drawRail() {
  const r = $("#prail"); if (!r) return;
  const over = new Set($$("#pcanvas .pwrap.over").map((w) => +w.dataset.pi));
  const n = P.doc.pages.length, pad = (4 - (n % 4)) % 4;
  r.innerHTML = h`<div class="small muted" style="margin-bottom:6px">${n} page${n === 1 ? "" : "s"}${P.doc.size === "half" && pad ? h` <span title="Booklets need a multiple of 4 pages">(+${pad} blank when printed as a booklet)</span>` : ""}</div>
    ${P.doc.pages.map((pg, i) => h`<button type="button" class="prail-i ${P.cur === i ? "on" : ""} ${over.has(i) ? "warn" : ""}" data-goto="${i}"><b>${i + 1}</b> ${pg.name || "Page"}${over.has(i) ? h` <span class="pill bad">Too full</span>` : ""}</button>`)}
    <div class="small" style="margin-top:10px"><label for="paddtpl" style="margin-bottom:2px">Add a page</label><select id="paddtpl"><option value="">Choose…</option>${PAGE_TEMPLATES.map(([k, t]) => h`<option value="${k}">${t}</option>`)}</select></div>`.s;
  $$("[data-goto]", r).forEach((b) => (b.onclick = () => { P.cur = +b.dataset.goto; const w = $(`#pcanvas .pwrap[data-pi="${P.cur}"]`); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" }); $$(".prail-i", r).forEach((x) => x.classList.toggle("on", x === b)); $$("#pcanvas .pwrap").forEach((x) => x.classList.toggle("cur", +x.dataset.pi === P.cur)); }));
  $("#paddtpl", r).onchange = (e) => { const k = e.target.value; if (!k) return; addPage(k, P.doc.pages.length - 1); };
}

function addPage(kind, after) {
  change((doc) => { const pg = kind === "blank" ? { id: puid(), name: "Blank page", blocks: [] } : pageTemplate(kind, P.ctx); doc.pages.splice(after + 1, 0, pg); P.cur = after + 1; P.sel = null; });
  setTimeout(() => { const w = $(`#pcanvas .pwrap[data-pi="${P.cur}"]`); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
}

function bindCanvas() {
  const cv = $("#pcanvas");
  // select blocks and pages
  $$(".pblock", cv).forEach((el) => el.addEventListener("mousedown", (e) => {
    if (e.target.closest(".pbar")) return;
    const pi = +el.dataset.pi, bi = +el.dataset.bi;
    if (!P.sel || P.sel.pi !== pi || P.sel.bi !== bi) { P.sel = { pi, bi }; P.cur = pi; $$(".pblock.sel", cv).forEach((x) => x.classList.remove("sel")); el.classList.add("sel"); $$("#pcanvas .pwrap").forEach((x) => x.classList.toggle("cur", +x.dataset.pi === pi)); P.panel = "edit"; drawPanel(); }
  }));
  $$(".pwrap", cv).forEach((w) => w.addEventListener("mousedown", (e) => { if (!e.target.closest(".pblock")) { P.cur = +w.dataset.pi; $$("#pcanvas .pwrap").forEach((x) => x.classList.toggle("cur", x === w)); } }));
  // inline text editing
  $$("[data-edit]", cv).forEach((el) => {
    const blk = el.closest(".pblock"), pi = +blk.dataset.pi, bi = +blk.dataset.bi;
    el.addEventListener("focus", () => (P.editOnce = null));
    el.addEventListener("input", () => {
      const key = pi + ":" + bi; if (P.editOnce !== key) { snapshot(); P.editOnce = key; }
      const b = P.doc.pages[pi].blocks[bi];
      if (el.dataset.edit === "text") b.text = el.innerText.replace(/\n+/g, " "); else b.html = cleanHTML(el.innerHTML);
      scheduleSave(); checkOverflow(); setStatus("Saving…");
    });
    el.addEventListener("paste", (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
  });
  // block toolbar
  $$(".pbar button", cv).forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const blk = btn.closest(".pblock"), pi = +blk.dataset.pi, bi = +blk.dataset.bi, a = btn.dataset.act;
    if (a === "drag") return;
    change((doc) => {
      const pg = doc.pages[pi], arr = pg.blocks;
      if (a === "up") { if (bi > 0) { [arr[bi - 1], arr[bi]] = [arr[bi], arr[bi - 1]]; P.sel = { pi, bi: bi - 1 }; } else if (pi > 0) { doc.pages[pi - 1].blocks.push(arr.splice(bi, 1)[0]); P.sel = { pi: pi - 1, bi: doc.pages[pi - 1].blocks.length - 1 }; } }
      if (a === "down") { if (bi < arr.length - 1) { [arr[bi + 1], arr[bi]] = [arr[bi], arr[bi + 1]]; P.sel = { pi, bi: bi + 1 }; } else if (pi < doc.pages.length - 1) { doc.pages[pi + 1].blocks.unshift(arr.splice(bi, 1)[0]); P.sel = { pi: pi + 1, bi: 0 }; } }
      if (a === "dup") { arr.splice(bi + 1, 0, { ...JSON.parse(JSON.stringify(arr[bi])), id: puid() }); P.sel = { pi, bi: bi + 1 }; }
      if (a === "del") { arr.splice(bi, 1); P.sel = null; }
    });
  }));
  // drag and drop blocks within and between pages
  let drag = null;
  $$(".pdrag", cv).forEach((hd) => hd.addEventListener("mousedown", () => { const blk = hd.closest(".pblock"); blk.draggable = true; }));
  $$(".pblock", cv).forEach((blk) => {
    blk.addEventListener("dragstart", (e) => { drag = { pi: +blk.dataset.pi, bi: +blk.dataset.bi }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "block"); blk.classList.add("dragging"); });
    blk.addEventListener("dragend", () => { blk.draggable = false; blk.classList.remove("dragging"); $$(".drop-b,.drop-a", cv).forEach((x) => x.classList.remove("drop-b", "drop-a")); drag = null; });
    blk.addEventListener("dragover", (e) => { if (!drag) return; e.preventDefault(); const r = blk.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; $$(".drop-b,.drop-a", cv).forEach((x) => x.classList.remove("drop-b", "drop-a")); blk.classList.add(after ? "drop-a" : "drop-b"); });
    blk.addEventListener("drop", (e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = blk.getBoundingClientRect(); moveBlock(drag, +blk.dataset.pi, +blk.dataset.bi + (e.clientY > r.top + r.height / 2 ? 1 : 0)); });
  });
  $$(".pcontent", cv).forEach((pc) => {
    pc.addEventListener("dragover", (e) => { if (drag) e.preventDefault(); });
    pc.addEventListener("drop", (e) => { if (!drag) return; e.preventDefault(); moveBlock(drag, +pc.dataset.pi, P.doc.pages[+pc.dataset.pi].blocks.length); });
  });
  // page toolbar
  $$("[data-pg]", cv).forEach((b) => (b.onclick = () => {
    const i = +b.dataset.pi, a = b.dataset.pg;
    if (a === "add") return addPageMenu(i);
    if (a === "rename") return modal({ title: "Rename page", body: h`<label for="pgn">Page name</label><input type="text" id="pgn" value="${P.doc.pages[i].name || ""}">`, onOk: async (f) => change((doc) => (doc.pages[i].name = $("#pgn", f).value.trim() || "Page")) });
    if (a === "del") return confirmBox("Delete this page?", `Page ${i + 1} (${P.doc.pages[i].name || "Page"}) and everything on it will be removed. You can undo this.`, "Delete page", async () => change((doc) => { doc.pages.splice(i, 1); P.sel = null; P.cur = Math.max(0, i - 1); }));
    change((doc) => {
      const pg = doc.pages;
      if (a === "up" && i > 0) { [pg[i - 1], pg[i]] = [pg[i], pg[i - 1]]; P.cur = i - 1; }
      if (a === "down" && i < pg.length - 1) { [pg[i + 1], pg[i]] = [pg[i], pg[i + 1]]; P.cur = i + 1; }
      if (a === "dup") { const c = JSON.parse(JSON.stringify(pg[i])); c.id = puid(); c.name = (c.name || "Page") + " (copy)"; c.blocks.forEach((x) => (x.id = puid())); pg.splice(i + 1, 0, c); P.cur = i + 1; }
      P.sel = null;
    });
  }));
}
function moveBlock(from, toPi, toBi) {
  change((doc) => {
    const blk = doc.pages[from.pi].blocks.splice(from.bi, 1)[0];
    if (from.pi === toPi && from.bi < toBi) toBi--;
    doc.pages[toPi].blocks.splice(toBi, 0, blk); P.sel = { pi: toPi, bi: toBi }; P.cur = toPi;
  });
}
function addPageMenu(after) {
  modal({ title: "Add a page", ok: null, body: h`<p class="small muted" style="margin-top:0">Pick a ready-made page. It's filled in from the show, and you can change anything on it.</p><div class="tplgrid">${PAGE_TEMPLATES.map(([k, t]) => h`<button type="button" class="btn" data-tpl="${k}">${t}</button>`)}</div>` });
  $$("[data-tpl]").forEach((b) => (b.onclick = () => { $("#modal-root").innerHTML = ""; addPage(b.dataset.tpl, after); }));
}

// Insert a new block after the selected one, or at the end of the current page.
function insertBlock(b) {
  change((doc) => {
    let pi = P.sel ? P.sel.pi : Math.min(P.cur, doc.pages.length - 1), bi = P.sel ? P.sel.bi + 1 : doc.pages[pi].blocks.length;
    if (pi < 0) { doc.pages.push({ id: puid(), name: "Page", blocks: [] }); pi = 0; bi = 0; }
    doc.pages[pi].blocks.splice(bi, 0, b); P.sel = { pi, bi }; P.cur = pi; P.panel = "edit";
  });
  setTimeout(() => { const el = $(`.pblock[data-pi="${P.sel.pi}"][data-bi="${P.sel.bi}"]`); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); const ed = $("[data-edit]", el); if (ed) { ed.focus(); document.execCommand && document.execCommand("selectAll"); } } }, 60);
}

// ---------- side panel ----------
function drawPanel() {
  $$("[data-ptab]").forEach((b) => b.classList.toggle("on", b.dataset.ptab === P.panel));
  const box = $("#ppanel"); if (!box) return;
  ({ add: panelAdd, edit: panelEdit, style: panelStyle, images: panelImages, sponsors: panelSponsors }[P.panel] || panelAdd)(box);
}
const seg = (name, opts, cur) => h`<div class="seg pseg" data-seg="${name}">${opts.map(([v, t]) => h`<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${t}</button>`)}</div>`;
function bindSeg(box, name, fn) { const s = $(`[data-seg="${name}"]`, box); if (s) $$("button", s).forEach((b) => (b.onclick = () => fn(b.dataset.v))); }
const setB = (k, v) => change(() => { const b = selBlock(); if (b) b[k] = v; });

function panelAdd(box) {
  const items = [["heading", "Heading", "Big title text"], ["text", "Text", "Paragraphs, notes, thanks"], ["image", "Picture", "Photo, artwork or ad"], ["cover", "Show cover", "The show's cover image"], ["logo", "School logo", "Your logo"], ["info", "Show details", "Dates, venue, director"],
    ["cast", "Cast list", "Character … actor"], ["team", "Production team", "Director, TD, MD…"], ["crew", "Crew list", "Positions and names"], ["pit", "Pit orchestra", "Instruments and players"], ["songs", "Musical numbers", "Song list by act"], ["credits", "Author credits", "Book, music, lyrics, based on"], ["license", "Licensing notice", "Required rights wording"], ["sponsors", "Sponsors", "Logos, ads and names"],
    ["divider", "Divider", "Line or ornament"], ["spacer", "Space", "Breathing room"]];
  box.innerHTML = h`<p class="small muted" style="margin:0 0 8px">Adds ${P.sel ? "below the selected block" : `to the end of page ${P.cur + 1}`}.</p>
    <div class="addgrid">${items.map(([k, t, d]) => h`<button type="button" data-add="${k}"><b>${t}</b><span>${d}</span></button>`)}</div>`.s;
  $$("[data-add]", box).forEach((b) => (b.onclick = () => {
    const k = b.dataset.add;
    const nb = { heading: () => B.heading("New heading"), text: () => B.text("Click to type…", { size: 3 }), image: () => B.image(), cover: () => B.image({ src: "cover" }), logo: () => B.image({ src: "logo", width: 25, maxh: 1.2 }), info: () => B.info(),
      cast: () => B.people("cast"), team: () => B.people("team"), crew: () => B.people("crew"), pit: () => B.people("pit"), songs: () => B.songs(), credits: () => B.credits("authors"), license: () => B.credits("license"), sponsors: () => B.sponsors(), divider: () => B.divider(), spacer: () => B.spacer() }[k]();
    insertBlock(nb);
    if (k === "image") { P.panel = "images"; drawPanel(); }
  }));
}

function panelEdit(box) {
  const b = selBlock();
  if (!b) { box.innerHTML = h`<p class="muted small">Click a block on a page to change it. Text can be edited right on the page.</p>`.s; return; }
  const sizeSeg = (n = 5) => seg("size", SIZE_NAMES.slice(0, n).map((t, i) => [i + 1, String(i + 1)]), b.size);
  const alignSeg = () => seg("align", [["left", "Left"], ["center", "Center"], ["right", "Right"]], b.align);
  const colorSeg = () => seg("color", [["ink", "Text"], ["muted", "Soft"], ["accent", "Accent"]], b.color);
  let body = "";
  if (b.type === "heading") body = h`${fld("Size", sizeSeg())}${fld("Line up", alignSeg())}${fld("Color", colorSeg())}${fld("Font", seg("font", [["display", "Headline"], ["body", "Body"]], b.font))}`;
  if (b.type === "text") body = h`${fld("Style the selected words", h`<div class="seg pseg"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button></div>`, "", "Select words on the page, then click.")}${fld("Size", sizeSeg())}${fld("Line up", alignSeg())}${fld("Color", colorSeg())}`;
  if (b.type === "image") {
    const imgs = P.ctx.images, photos = P.ctx.photos;
    body = h`${fld("Picture", h`<select id="pe-src"><option value="cover" ${b.src === "cover" ? raw("selected") : ""}>The show's cover image</option><option value="logo" ${b.src === "logo" ? raw("selected") : ""}>School logo</option>
        ${imgs.length ? h`<optgroup label="Uploaded for the program">${imgs.map((x) => h`<option value="f:${x.file}" ${b.src === "upload" && b.file === x.file ? raw("selected") : ""}>${x.original_name || x.file}</option>`)}</optgroup>` : ""}
        ${photos.length ? h`<optgroup label="Show photos">${photos.map((x) => h`<option value="f:${x.file}" ${b.src === "upload" && b.file === x.file ? raw("selected") : ""}>${x.caption || x.original_name || x.file}</option>`)}</optgroup>` : ""}</select>`, "", "Upload more on the Pictures tab.")}
      ${fld(`Width (${b.width}%)`, h`<input type="range" id="pe-w" min="10" max="100" step="5" value="${b.width}">`)}
      ${fld(`Tallest (${b.maxh} in)`, h`<input type="range" id="pe-h" min="0.5" max="${(PSIZES[P.doc.size] || PSIZES.half).h - 1}" step="0.25" value="${b.maxh}">`)}
      ${fld("Line up", alignSeg())}${fld("Caption", h`<input type="text" id="pe-cap" value="${b.caption || ""}" placeholder="Optional">`)}`;
  }
  if (b.type === "info") body = h`${fld("Show", h`<label class="check"><input type="checkbox" id="pe-dates" ${b.dates ? raw("checked") : ""}> Dates</label><label class="check"><input type="checkbox" id="pe-venue" ${b.venue ? raw("checked") : ""}> Venue</label><label class="check"><input type="checkbox" id="pe-dir" ${b.director ? raw("checked") : ""}> Director</label>`, "", "Taken from Edit show.")}${fld("Size", sizeSeg())}${fld("Line up", alignSeg())}`;
  if (b.type === "people") body = h`${fld("Who", seg("kind", Object.entries(PEOPLE_LABEL), b.kind))}${fld("Layout", seg("style", [["leaders", "Dotted line"], ["stacked", "Stacked"]], b.style))}
      ${fld("Order", seg("order", [["role", b.kind === "cast" ? "Character first" : "Role first"], ["name", "Name first"]], b.order))}${fld("Columns", seg("cols", [[1, "1"], [2, "2"], [3, "3"]], b.cols))}
      ${fld("Also show", h`${b.kind === "cast" ? h`<label class="check"><input type="checkbox" id="pe-voice" ${b.voice ? raw("checked") : ""}> Voice part</label>` : ""}<label class="check"><input type="checkbox" id="pe-grade" ${b.grade ? raw("checked") : ""}> Grade</label>`)}${fld("Size", sizeSeg())}
      <p class="small muted">Names come from the show's Cast &amp; crew tab. People without a role are listed together at the end. <a href="#/show/${P.showId}/people">Edit the list</a></p>`;
  if (b.type === "songs") body = h`${fld("Also show", h`<label class="check"><input type="checkbox" id="pe-sing" ${b.singers ? raw("checked") : ""}> Who sings</label>`)}${fld("Size", sizeSeg())}<p class="small muted">Songs come from the show's Musical numbers tab. <a href="#/show/${P.showId}/numbers">Edit the list</a></p>`;
  if (b.type === "sponsors") {
    const tiers = [...new Set([...(S.lists.sponsor_tier || []), ...P.ctx.sponsors.map((s) => s.tier).filter(Boolean)])];
    body = h`${fld("Layout", seg("layout", [["tiers", "Logos & ads"], ["names", "Names only"]], b.layout))}
      ${fld("Which sponsors", h`<div class="tierchecks">${tiers.map((t) => h`<label class="check"><input type="checkbox" data-tier="${t}" ${!b.tiers.length || b.tiers.includes(t) ? raw("checked") : ""}> ${t}</label>`)}</div>`, "", "Split tiers across pages by adding two Sponsors blocks.")}
      ${b.layout !== "names" ? h`${fld("Also show", h`<label class="check"><input type="checkbox" id="pe-names" ${b.names ? raw("checked") : ""}> Names under logos</label><label class="check"><input type="checkbox" id="pe-msg" ${b.messages ? raw("checked") : ""}> Messages</label>`)}${fld("Logo size", seg("scale", [[1, "S"], [2, "M"], [3, "L"], [4, "XL"]], b.scale))}` : ""}
      <p class="small muted">${P.ctx.sponsors.length} active sponsor${P.ctx.sponsors.length === 1 ? "" : "s"}. Manage them on the Sponsors tab or the <a href="#/sponsors">Sponsors page</a>.</p>`;
  }
  if (b.type === "credits") body = h`${fld("Show", seg("part", [["authors", "Author credits"], ["license", "Licensing notice"]], b.part))}${fld("Size", sizeSeg())}${fld("Line up", alignSeg())}
      <p class="small muted">Taken from the show's Authors &amp; rights. Only filled-in lines print. <a href="#/show/${P.showId}/edit">Edit authors &amp; rights</a></p>`;
  if (b.type === "divider") body = fld("Style", seg("style", [["ornament", "✦ ✦ ✦"], ["line", "Line"], ["double", "Double"], ["dots", "Dots"]], b.style));
  if (b.type === "spacer") body = fld("Height", seg("size", [[1, "XS"], [2, "S"], [3, "M"], [4, "L"], [6, "XL"]], b.size));
  box.innerHTML = h`<div class="pedit-h"><b>${BLOCK_LABEL[b.type]}</b>${b.type === "people" ? h` · ${PEOPLE_LABEL[b.kind]}` : b.type === "credits" ? h` · ${b.part === "license" ? "Licensing notice" : "Authors"}` : ""}<span class="small muted"> on page ${P.sel.pi + 1}</span></div><div class="pfields">${body}</div>
    <div class="pact" style="margin-top:12px"><button type="button" class="btn sm" id="pe-dup">Duplicate</button><button type="button" class="btn sm ghost danger" id="pe-del">Delete block</button></div>`.s;
  for (const k of ["size", "align", "color", "font", "kind", "style", "order", "layout", "part"]) bindSeg(box, k, (v) => setB(k, k === "size" ? +v : v));
  bindSeg(box, "cols", (v) => setB("cols", +v)); bindSeg(box, "scale", (v) => setB("scale", +v));
  $$("[data-cmd]", box).forEach((x) => x.addEventListener("mousedown", (e) => { e.preventDefault(); document.execCommand(x.dataset.cmd); const el = $(`.pblock[data-pi="${P.sel.pi}"][data-bi="${P.sel.bi}"] [data-edit]`); if (el) el.dispatchEvent(new Event("input")); }));
  const chk = (id, k) => { const el = $("#" + id, box); if (el) el.onchange = () => setB(k, el.checked); };
  chk("pe-dates", "dates"); chk("pe-venue", "venue"); chk("pe-dir", "director"); chk("pe-voice", "voice"); chk("pe-grade", "grade"); chk("pe-sing", "singers"); chk("pe-names", "names"); chk("pe-msg", "messages");
  if ($("#pe-src", box)) $("#pe-src", box).onchange = (e) => { const v = e.target.value; change(() => { const x = selBlock(); if (v.startsWith("f:")) { x.src = "upload"; x.file = v.slice(2); } else { x.src = v; x.file = ""; } }); };
  const range = (id, k) => { const el = $("#" + id, box); if (!el) return; let snapped = false;
    el.oninput = () => { if (!snapped) { snapshot(); snapped = true; } selBlock()[k] = +el.value; drawAll(); scheduleSave(); };
    el.onchange = () => { snapped = false; drawPanel(); }; };
  range("pe-w", "width"); range("pe-h", "maxh");
  if ($("#pe-cap", box)) $("#pe-cap", box).onchange = (e) => setB("caption", e.target.value.trim());
  $$("[data-tier]", box).forEach((c) => (c.onchange = () => { const on = $$("[data-tier]", box).filter((x) => x.checked).map((x) => x.dataset.tier); setB("tiers", on.length === $$("[data-tier]", box).length ? [] : on); }));
  $("#pe-dup", box).onclick = () => change((doc) => { const arr = doc.pages[P.sel.pi].blocks; arr.splice(P.sel.bi + 1, 0, { ...JSON.parse(JSON.stringify(b)), id: puid() }); P.sel.bi++; });
  $("#pe-del", box).onclick = () => change((doc) => { doc.pages[P.sel.pi].blocks.splice(P.sel.bi, 1); P.sel = null; });
}

function panelStyle(box) {
  const d = P.doc;
  box.innerHTML = h`${fld("Page size", h`<select id="ps-size">${Object.entries(PSIZES).map(([k, v]) => h`<option value="${k}" ${d.size === k ? raw("selected") : ""}>${v.label}</option>`)}</select>`, "", d.size === "half" ? "Prints two to a sheet of letter paper; fold in half for a booklet." : "Booklet printing uses 11 × 17 in (tabloid) paper.")}
    <label style="margin-top:12px">Style</label><div class="stylegrid">${Object.entries(PSTYLES).map(([k, v]) => h`<button type="button" data-style="${k}" class="${d.style === k ? "on" : ""}" style="font-family:${v.display};text-transform:${v.hcase};letter-spacing:${v.hls};font-stretch:${v.stretch || "normal"}"><span style="font-size:${17 * (v.hscale || 1)}px">${P.ctx.show.title.slice(0, 18)}</span><small style="font-family:${v.body};text-transform:none;letter-spacing:0">${v.label}</small></button>`)}</div>
    ${fld("Paper", seg("paper", Object.entries(PAPERS).map(([k, v]) => [k, v.label]), d.paper))}
    ${fld("Border", h`<select id="ps-border">${Object.entries(BORDERS).map(([k, v]) => h`<option value="${k}" ${d.border === k ? raw("selected") : ""}>${v}</option>`)}</select>`)}
    <div><label>Accent color</label><div class="swatches"><input type="color" id="ps-accent" value="${d.accent || S.brand.accent || "#9d1420"}" aria-label="Accent color"><button type="button" class="btn sm ghost" id="ps-school">Use school color</button></div></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="ps-num" ${d.pageNumbers ? raw("checked") : ""}> Page numbers (not on the covers)</label>`.s;
  $("#ps-size", box).onchange = (e) => change((x) => (x.size = e.target.value));
  $$("[data-style]", box).forEach((b) => (b.onclick = () => change((x) => (x.style = b.dataset.style))));
  bindSeg(box, "paper", (v) => change((x) => (x.paper = v)));
  $("#ps-border", box).onchange = (e) => change((x) => (x.border = e.target.value));
  let snapped = false;
  $("#ps-accent", box).oninput = (e) => { if (!snapped) { snapshot(); snapped = true; } P.doc.accent = e.target.value; drawAll(); scheduleSave(); };
  $("#ps-accent", box).onchange = () => (snapped = false);
  $("#ps-school", box).onclick = () => change((x) => (x.accent = ""));
  $("#ps-num", box).onchange = (e) => change((x) => (x.pageNumbers = e.target.checked));
}

function panelImages(box) {
  const b = selBlock(), replacing = b && b.type === "image";
  const all = [...P.ctx.images.map((x) => ({ ...x, grp: "Uploaded" })), ...P.ctx.photos.map((x) => ({ ...x, grp: "Show photo" }))];
  box.innerHTML = h`<div id="pimgdrop"></div>
    <p class="small muted" style="margin:8px 0">${replacing ? "Click a picture to put it in the selected picture block." : "Click a picture to add it to the page."} Show photos from the Photos tab are here too.</p>
    <div class="pimgs">${all.map((x) => h`<button type="button" data-img="${x.file}" title="${x.caption || x.original_name || ""}"><img src="${showFileURL(x.file)}" alt="" loading="lazy"><span>${x.grp}</span></button>`)}</div>
    ${!all.length ? h`<p class="small muted">No pictures yet. Upload cast photos, artwork, a headshot collage or a sponsor's ad.</p>` : ""}`.s;
  dropzone($("#pimgdrop", box), { accept: "image/jpeg,image/png,image/webp,image/gif", label: "Upload pictures", sub: "For this program only. JPG, PNG, WEBP or GIF.",
    onFiles: async (files, status) => {
      const imgs = files.filter(isImage); if (!imgs.length) return;
      try { await uploadAll(`/api/shows/${P.showId}/files?kind=program`, "file", imgs, { photos: true, status });
        const d = await GET(`/api/shows/${P.showId}/program`); P.ctx.images = d.images; P.ctx.photos = d.photos; toast(`Uploaded ${imgs.length} picture${imgs.length === 1 ? "" : "s"}`); drawPanel(); }
      catch (err) { status.textContent = ""; toast(err.message, true); }
    } });
  $$("[data-img]", box).forEach((x) => (x.onclick = () => {
    const f = x.dataset.img;
    if (replacing) change(() => { const s = selBlock(); s.src = "upload"; s.file = f; }, { panel: false });
    else insertBlock(B.image({ file: f }));
  }));
}

function panelSponsors(box) {
  const sp = P.ctx.sponsors;
  box.innerHTML = h`<p class="small muted" style="margin-top:0">Sponsors are shared by every show's program. Inactive sponsors don't appear.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn sm primary" id="psp-add">${icon("plus")}Add a sponsor</button><button type="button" class="btn sm" id="psp-block">Add sponsors to the page</button><a class="btn sm ghost" href="#/sponsors">All sponsors</a></div>
    ${sp.length ? h`<div class="psplist">${sp.map((s) => h`<button type="button" data-sp="${s.id}">${s.logo ? h`<img src="/files/sponsor/${encodeURIComponent(s.logo)}" alt="">` : h`<span class="noimg">${(s.name || "?").slice(0, 1)}</span>`}<span><b>${s.name}</b><small>${[s.tier, s.ad_size].filter(Boolean).join(" · ")}</small></span></button>`)}</div>` : h`<p class="small muted">No sponsors yet.</p>`}`.s;
  const refresh = async () => { P.ctx.sponsors = (await GET(`/api/shows/${P.showId}/program`)).sponsors; drawAll(); drawPanel(); };
  $("#psp-add", box).onclick = () => sponsorModal(null, refresh);
  $("#psp-block", box).onclick = () => insertBlock(B.sponsors());
  $$("[data-sp]", box).forEach((b) => (b.onclick = () => sponsorModal(sp.find((x) => x.id === +b.dataset.sp), refresh)));
}

function moreMenu() {
  const others = P.ctx.others || [];
  modal({ title: "More program options", ok: null, body: h`
    <h3 style="margin:0 0 6px">Start from another show's program</h3>
    ${others.length ? h`<p class="small muted" style="margin-top:0">Copies its pages, text, style and pictures. Lists like the cast fill in from <b>${P.ctx.show.title}</b>. This replaces the current program (you can undo by copying back).</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><select id="pm-from" style="flex:1 1 220px">${others.map((o) => h`<option value="${o.id}">${o.title}${o.year ? " (" + [o.season, o.year].filter(Boolean).join(" ") + ")" : ""}</option>`)}</select><button type="button" class="btn" id="pm-copy">Copy it</button></div>`
      : h`<p class="small muted" style="margin-top:0">No other show has a program yet. Once you've made one, you can reuse its layout and text here.</p>`}
    <h3 style="margin:18px 0 6px">Start over</h3><p class="small muted" style="margin-top:0">Replace this program with a fresh standard layout filled in from the show.</p><button type="button" class="btn danger" id="pm-reset">Start over with the standard layout</button>` });
  if ($("#pm-copy")) $("#pm-copy").onclick = async () => { await api("POST", `/api/shows/${P.showId}/program/copy`, { from: +$("#pm-from").value }); $("#modal-root").innerHTML = ""; toast("Program copied"); viewProgram(P.showId); };
  $("#pm-reset").onclick = () => { $("#modal-root").innerHTML = ""; confirmBox("Start over?", "The current pages and text will be replaced by the standard layout. Uploaded pictures are kept.", "Start over", async () => { snapshot(); P.doc = defaultProgram(P.ctx); P.sel = null; drawAll(); drawPanel(); await save(); toast("Started over — Undo brings the old version back"); }); };
}

// ---------- printing ----------
function printProgram(mode) {
  const doc = P.doc, sz = PSIZES[doc.size] || PSIZES.half, n = doc.pages.length;
  const over = $$("#pcanvas .pwrap.over").length;
  const pages = doc.pages.map((pg, i) => drawPage(pg, i, doc, P.ctx, false).s);
  const blank = () => h`<section class="ppage" style="${pageStyle(doc)}"></section>`.s;
  const pad = mode === "booklet" ? (4 - (n % 4)) % 4 : 0;
  const sheetPaper = doc.size === "half" ? "letter paper (8.5 × 11 in)" : "tabloid paper (11 × 17 in)";
  const go = () => {
    let html, pageCss;
    if (mode === "booklet") {
      // Saddle-stitch order: sheet k front = [last-2k, first+2k], back = [first+2k+1, last-2k-1]
      const all = [...pages.slice(0, n - 1), ...Array(pad).fill(0).map(blank), pages[n - 1]];
      const N = all.length, sides = [];
      for (let k = 0; k < N / 4; k++) { sides.push([all[N - 1 - 2 * k], all[2 * k]]); sides.push([all[2 * k + 1], all[N - 2 - 2 * k]]); }
      html = sides.map(([l, r]) => `<div class="psheet" style="width:${sz.w * 2}in;height:${sz.h}in">${l}${r}</div>`).join("");
      pageCss = `@page { size: ${sz.w * 2}in ${sz.h}in; margin: 0 }`;
    } else { html = pages.join(""); pageCss = `@page { size: ${sz.w}in ${sz.h}in; margin: 0 }`; }
    let root = $("#progprint"); if (!root) { root = document.createElement("div"); root.id = "progprint"; document.body.appendChild(root); }
    root.innerHTML = `<style>${pageCss}</style>${html}`;
    document.body.classList.add("printing-program");
    const done = () => { document.body.classList.remove("printing-program"); root.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 300);
  };
  modal({ title: mode === "booklet" ? "Print as a booklet" : "Print single pages", ok: "Print", onOk: async () => go(),
    body: h`${over ? h`<div class="errbox">${over} page${over === 1 ? " is" : "s are"} too full and will be cut off. Fix ${over === 1 ? "it" : "them"} first, or print anyway.</div>` : ""}
      ${mode === "booklet" ? h`<p style="margin-top:0">Pages are arranged two to a side so the printed stack folds straight into a booklet: <b>${(n + pad) / 4} sheet${(n + pad) / 4 === 1 ? "" : "s"}</b> of ${sheetPaper} per program.${pad ? h` <b>${pad} blank page${pad === 1 ? "" : "s"}</b> will be added before the back cover, because booklets need a multiple of 4 pages.` : ""}</p>
        <ol class="small" style="padding-left:18px"><li>Choose your printer and <b>${doc.size === "half" ? "Letter" : "Tabloid / 11 × 17"}</b> paper, <b>Landscape</b>.</li><li>Turn on <b>Print on both sides</b> and choose <b>Flip on short edge</b>.</li><li>Under <b>More settings</b>, set Scale to <b>100%</b> (or "Actual size") and tick <b>Background graphics</b>.</li><li>Print one copy first, fold it, and check the page order. Then print the rest.</li></ol>`
      : h`<p style="margin-top:0">Each page prints on its own ${sz.w} × ${sz.h} in sheet. To make a PDF to email or post online, choose <b>Save as PDF</b> as the printer.</p>
        <p class="small">Under <b>More settings</b>, tick <b>Background graphics</b> so paper colors and borders print, and keep Scale at <b>100%</b>.</p>`}` });
}

// ---------- sponsors library ----------
function sponsorModal(sp, after) {
  const s = sp || { active: 1, tier: (S.lists.sponsor_tier || [])[0] || "", ad_size: "Quarter page" };
  let logoFile = null;
  const f = modal({ title: sp ? "Edit " + sp.name : "Add a sponsor", wide: true,
    body: h`<div class="sponsorform"><div><div class="spbox" id="sp-prev">${s.logo ? h`<img src="/files/sponsor/${encodeURIComponent(s.logo)}" alt="">` : h`<span class="small muted">No logo or ad</span>`}</div><div id="sp-drop" style="margin-top:8px"></div>
        ${s.logo ? h`<label class="check small" style="margin-top:6px"><input type="checkbox" id="sp-rmlogo"> Remove the current picture</label>` : ""}</div>
      <div class="grid">${fld("Name *", h`<input type="text" name="name" id="sp-name" value="${s.name || ""}" placeholder="e.g. Main Street Bakery or The Lopez Family">`, "wide")}
        ${fld("Tier", h`<input type="text" name="tier" id="sp-tier" list="dl-sponsor_tier" value="${s.tier || ""}">`)}
        ${fld("Ad size", h`<select name="ad_size" id="sp-ad">${(S.lists.ad_size || ["Full page", "Half page", "Quarter page", "Business card", "Name listing"]).map((a) => h`<option ${s.ad_size === a ? raw("selected") : ""}>${a}</option>`)}</select>`, "", "Name listings print as text only.")}
        ${fld("Message (optional)", h`<input type="text" name="message" id="sp-msg" value="${s.message || ""}" placeholder="e.g. Break a leg, Emma! Love, Mom & Dad">`, "full")}
        ${fld("Amount ($)", h`<input type="number" name="amount" id="sp-amt" min="0" step="0.01" value="${s.amount ?? ""}">`)}${fld("Website", h`<input type="text" name="website" id="sp-web" value="${s.website || ""}">`)}
        ${fld("Contact", h`<input type="text" name="contact_name" id="sp-contact" value="${s.contact_name || ""}">`)}${fld("Email", h`<input type="email" name="email" id="sp-email" value="${s.email || ""}">`)}${fld("Phone", h`<input type="tel" name="phone" id="sp-phone" value="${s.phone || ""}">`)}
        <div class="full"><label class="check"><input type="checkbox" name="active" id="sp-active" ${s.active ? raw("checked") : ""}> Show in programs</label></div>
        ${fld("Notes", h`<input type="text" name="notes" id="sp-notes" value="${s.notes || ""}" placeholder="e.g. Paid by check #1043; renew each fall">`, "full")}</div></div>`,
    onOk: async (form) => {
      const d = formData(form);
      if (!d.name.trim()) throw new Error("Enter the sponsor's name.");
      let id = sp && sp.id;
      if (id) await api("PUT", "/api/sponsors/" + id, d); else id = (await api("POST", "/api/sponsors", d)).id;
      if (logoFile) { const fd = new FormData(); fd.append("logo", await shrinkImage(logoFile, 2400, 0.9)); await api("POST", `/api/sponsors/${id}/logo`, fd); }
      else if ($("#sp-rmlogo", form) && $("#sp-rmlogo", form).checked) await api("DELETE", `/api/sponsors/${id}/logo`);
      toast("Sponsor saved"); after && after();
    } });
  dropzone($("#sp-drop", f), { accept: "image/jpeg,image/png,image/webp,image/gif", label: "Logo or ad", sub: "JPG, PNG, WEBP or GIF",
    onFiles: (files) => { const img = files.find(isImage); if (!img) return; logoFile = img; $("#sp-prev", f).innerHTML = h`<img src="${URL.createObjectURL(img)}" alt="">`.s; } });
  return f;
}

async function viewSponsors() {
  const rows = await GET("/api/sponsors");
  const total = rows.filter((s) => s.active).reduce((a, s) => a + (+s.amount || 0), 0);
  shell("sponsors", h`
    ${page("Programs", "Sponsors", h`<button class="btn primary" id="spadd">${icon("plus")}Add a sponsor</button>`)}
    <p class="muted" style="max-width:70ch;margin-top:-8px">Businesses, families and patrons who support your shows. Active sponsors appear in every show's program wherever you place a Sponsors block, grouped by tier and laid out by the ad size they bought.${total ? h` Active sponsorships total <b>${money(total)}</b>.` : ""}</p>
    ${rows.length ? h`<section class="panel tablewrap"><table><tr><th></th><th>Sponsor</th><th>Tier</th><th>Ad size</th><th>Message</th><th class="r">Amount</th><th>Contact</th><th>In programs</th></tr>
      ${rows.map((s) => h`<tr class="click" data-sp="${s.id}"><td>${s.logo ? h`<img class="thumb cov" src="/files/sponsor/${encodeURIComponent(s.logo)}" alt="">` : h`<span class="thumb ph">${icon("users")}</span>`}</td><td><b>${s.name}</b>${s.website ? h`<div class="small muted">${s.website}</div>` : ""}</td><td>${s.tier || ""}</td><td>${s.ad_size || ""}</td>
        <td class="small">${s.message || ""}</td><td class="r num">${s.amount != null ? money(s.amount) : ""}</td><td class="small">${[s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")}</td><td>${s.active ? h`<span class="pill good">Active</span>` : h`<span class="pill mute">Off</span>`}</td></tr>`)}</table></section>`
      : h`<div class="panel"><div class="empty">No sponsors yet. <a href="#" id="spadd2">Add your first sponsor</a>: a local business with a logo or ad, or a family sending a message to the cast.</div></div>`}`);
  const open = (sp) => sponsorModal(sp, viewSponsors);
  $("#spadd").onclick = () => open(null);
  if ($("#spadd2")) $("#spadd2").onclick = (e) => { e.preventDefault(); open(null); };
  $$("[data-sp]").forEach((tr) => (tr.onclick = () => {
    const sp = rows.find((x) => x.id === +tr.dataset.sp);
    const f = open(sp);
    if (isDirector()) { const del = document.createElement("button"); del.type = "button"; del.className = "btn danger"; del.textContent = "Delete sponsor"; del.style.marginRight = "auto";
      del.onclick = () => confirmBox(`Delete ${sp.name}?`, "They'll be removed from every program. To keep them for next year, untick “Show in programs” instead.", "Delete sponsor", async () => { await api("DELETE", "/api/sponsors/" + sp.id); viewSponsors(); });
      $("footer", f).prepend(del); }
  }));
}
