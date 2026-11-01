"use client";
import { memo, type CSSProperties, type ReactNode } from "react";
import { creditLines, HSIZES, PAPERS, PEOPLE_LABEL, PSIZES, PSTYLES, runLine, TSIZES, type Block, type Ctx, type Doc, type Page } from "./model";
import { showFileUrl, sponsorUrl } from "@/lib/urls";

export function pageStyle(doc: Doc, ctx: Ctx): CSSProperties {
  const st = PSTYLES[doc.style] ?? PSTYLES.classic, pa = PAPERS[doc.paper] ?? PAPERS.white, sz = PSIZES[doc.size] ?? PSIZES.half;
  const accent = /^#[0-9a-f]{6}$/i.test(doc.accent) ? doc.accent : /^#[0-9a-f]{6}$/i.test(ctx.brand.accent) ? ctx.brand.accent : "#9d1420";
  return { width: `${sz.w}in`, height: `${sz.h}in`, "--p-paper": pa.paper, "--p-ink": pa.ink, "--p-muted": pa.muted, "--p-accent": accent, "--p-display": st.display, "--p-body": st.body,
    "--p-hcase": st.hcase, "--p-hls": st.hls, "--p-hw": st.hw, "--p-stretch": st.stretch, "--p-hscale": st.hscale } as CSSProperties;
}
const colorVar = (c: string) => (c === "accent" ? "var(--p-accent)" : c === "muted" ? "var(--p-muted)" : "var(--p-ink)");
const Hint = ({ children, size }: { children: ReactNode; size?: number }) => <div className="pb-hint" style={size ? { fontSize: `${TSIZES[size - 1]}pt` } : undefined}>{children}</div>;

/** Inline-editable text that React leaves alone while the user types (so the caret never jumps). */
const Editable = memo(function Editable({ html, plain, className, style, onChange }: { rev: number; html: string; plain?: boolean; className: string; style: CSSProperties; onChange: (v: string, el: HTMLElement) => void }) {
  return <div className={className} style={style} contentEditable={plain ? "plaintext-only" : true} suppressContentEditableWarning spellCheck data-edit
    onInput={(e) => onChange(plain ? e.currentTarget.innerText.replace(/\n+/g, " ") : e.currentTarget.innerHTML, e.currentTarget)}
    onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
    dangerouslySetInnerHTML={{ __html: html }} />;
}, (a, b) => a.rev === b.rev && a.className === b.className && JSON.stringify(a.style) === JSON.stringify(b.style));

const escHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function BlockView({ b, ctx, edit }: { b: Block; ctx: Ctx; edit?: { rev: number; onText: (v: string) => void } }) {
  const al: CSSProperties = "align" in b ? { textAlign: b.align } : {};
  switch (b.type) {
    case "heading": {
      const style: CSSProperties = { ...al, fontSize: `calc(${HSIZES[b.size - 1]}pt * var(--p-hscale))`, color: colorVar(b.color), fontFamily: b.font === "body" ? "var(--p-body)" : "var(--p-display)" };
      return edit ? <Editable rev={edit.rev} plain className="pb-h" style={style} html={escHtml(b.text)} onChange={edit.onText} /> : <div className="pb-h" style={style}>{b.text}</div>;
    }
    case "text": {
      const style: CSSProperties = { ...al, fontSize: `${TSIZES[b.size - 1]}pt`, color: colorVar(b.color) };
      return edit ? <Editable rev={edit.rev} className="pb-t" style={style} html={b.html} onChange={edit.onText} /> : <div className="pb-t" style={style} dangerouslySetInnerHTML={{ __html: b.html }} />;
    }
    case "image": {
      const src = b.src === "logo" ? `/api/branding/logo?v=${ctx.brand.logoVersion}` : b.src === "cover" ? (ctx.show.cover ? showFileUrl(ctx.show.cover) : "") : b.file ? showFileUrl(b.file) : "";
      return (
        <figure className="pb-img" style={al}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" style={{ maxWidth: `${b.width}%`, maxHeight: `${b.maxh}in` }} />
            : edit ? <div className="pb-imgph" style={{ width: `${b.width}%` }}>{b.src === "cover" ? "This show has no cover picture yet. Add one on the show's page." : "Choose a picture in the panel →"}</div> : null}
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      );
    }
    case "info": {
      const s = ctx.show, parts = [b.dates && runLine(s), b.venue && s.venue, b.director && s.director && `Directed by ${s.director}`].filter(Boolean) as string[];
      if (!parts.length) return edit ? <Hint>Add opening and closing dates and a venue in Edit show to fill this in.</Hint> : null;
      return <div className="pb-info" style={{ ...al, fontSize: `${TSIZES[b.size - 1]}pt` }}>{parts.map((p, i) => <span key={i}>{i > 0 && <span className="sep"> · </span>}{p}</span>)}</div>;
    }
    case "people": {
      const list = ctx.people.filter((p) => p.kind === b.kind), fs = { fontSize: `${TSIZES[b.size - 1]}pt` };
      if (!list.length) return edit ? <Hint size={b.size}>No {PEOPLE_LABEL[b.kind].toLowerCase()} yet. Add people on the show&apos;s Cast &amp; crew tab and they appear here.</Hint> : null;
      const named = list.filter((p) => p.role), ensemble = list.filter((p) => !p.role);
      const extra = (p: (typeof list)[number]) => [b.voice && p.voicePart, b.grade && p.grade && `Gr. ${p.grade}`].filter(Boolean).join(", ");
      return (
        <div className="pb-people" style={{ ...fs, columns: b.cols }}>
          {named.map((p, i) => {
            const nm = <span className="pp-n">{p.name}{extra(p) && <span className="pp-x"> ({extra(p)})</span>}</span>, rl = <span className="pp-r">{p.role}</span>;
            if (b.style === "stacked") return <div key={i} className="pp st">{b.order === "name" ? <>{nm}{rl}</> : <>{rl}{nm}</>}</div>;
            return <div key={i} className="pp">{b.order === "name" ? <>{nm}<span className="pp-d" />{rl}</> : <>{rl}<span className="pp-d" />{nm}</>}</div>;
          })}
          {ensemble.length > 0 && <div className="pp-ens"><span className="pp-r">{b.kind === "cast" ? "Ensemble" : b.kind === "crew" ? "Crew" : "Also"}</span> {ensemble.map((p) => p.name).join(", ")}</div>}
        </div>
      );
    }
    case "songs": {
      const fs = { fontSize: `${TSIZES[b.size - 1]}pt` };
      if (!ctx.numbers.length) return edit ? <Hint size={b.size}>No musical numbers yet. Add the song list on the show&apos;s Musical numbers tab.</Hint> : null;
      const acts: [string, Ctx["numbers"]][] = [];
      for (const n of ctx.numbers) { const a = n.act ?? ""; let g = acts.find((x) => x[0] === a); if (!g) acts.push((g = [a, []])); g[1].push(n); }
      const actName = (a: string) => (a ? `Act ${["", "One", "Two", "Three", "Four"][Number(a)] || a}` : "");
      return <div className="pb-songs" style={fs}>{acts.map(([a, ns]) => <div key={a}>{a && <div className="ps-act">{actName(a)}</div>}{ns.map((n, i) => (
        <div key={i} className="pp"><span className="pp-r">{n.number ? `${n.number}. ` : ""}{n.title}</span>{b.singers && n.singers && <><span className="pp-d" /><span className="pp-n ps-s">{n.singers}</span></>}</div>))}</div>)}</div>;
    }
    case "sponsors": return <Sponsors b={b} ctx={ctx} edit={!!edit} />;
    case "credits": {
      const s = ctx.show, fs = { fontSize: `${TSIZES[b.size - 1]}pt` }, lines = (t: string | null) => (t ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (b.part === "license") {
        const notice = lines(s.licensingNotice), lic = (s.licensor ?? "").trim();
        if (!notice.length && !lic) return edit ? <Hint size={b.size}>Licensing notice: fill in <b>Licensed by</b> (or paste the exact wording) in Edit show → Authors &amp; rights. Nothing prints until you do.</Hint> : null;
        return <div className="pb-lic" style={{ ...al, ...fs }}>{notice.length ? notice.map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>) : <><i>{s.title}</i> is presented through special arrangement with {lic}. All authorized performance materials are also supplied by {lic}.</>}</div>;
      }
      const cr = creditLines(s), extra = lines(s.additionalCredits);
      if (!cr.length && !extra.length) return edit ? <Hint size={b.size}>Author credits: fill in who wrote the show in Edit show → Authors &amp; rights. Only the lines you fill in will print.</Hint> : null;
      return <div className="pb-cred" style={{ ...al, ...fs }}>{cr.map(([k, v]) => <div key={k} className="cr-l"><span className="cr-k">{k}</span> <span className="cr-v">{v}</span></div>)}{extra.map((l, i) => <div key={i} className="cr-x">{l}</div>)}</div>;
    }
    case "divider": return <div className={`pb-div ${b.style}`}>{b.style === "ornament" && <span>✦ &nbsp; ✦ &nbsp; ✦</span>}</div>;
    case "spacer": return <div className="pb-sp" style={{ height: `${b.size * 0.12}in` }}>{edit && <span className="pb-sp-l">space</span>}</div>;
  }
}

const AD_SPAN: Record<string, "full" | "half" | "quarter" | "card"> = { "Full page": "full", "Half page": "half", "Quarter page": "quarter", "Business card": "card" };
const AD_H = { full: 5.2, half: 2.4, quarter: 1.5, card: 0.9 };
function Sponsors({ b, ctx, edit }: { b: Extract<Block, { type: "sponsors" }>; ctx: Ctx; edit: boolean }) {
  const list = ctx.sponsors.filter((s) => !b.tiers.length || b.tiers.includes(s.tier ?? ""));
  if (!list.length) return edit ? <Hint>No sponsors to show yet. Add them on the <b>Sponsors</b> page or in the panel → and they appear here.</Hint> : null;
  const tiers: [string, Ctx["sponsors"]][] = [];
  for (const s of list) { const t = s.tier ?? ""; let g = tiers.find((x) => x[0] === t); if (!g) tiers.push((g = [t, []])); g[1].push(s); }
  tiers.sort((a, z) => (ctx.tierOrder.indexOf(a[0]) + 1 || 99) - (ctx.tierOrder.indexOf(z[0]) + 1 || 99));
  const sc = b.scale / 3;
  if (b.layout === "names") return <div>{tiers.map(([t, ss]) => <div key={t}>{t && <div className="ps-tier">{t}</div>}<div className="ps-names">{ss.map((s, i) => <span key={s.id}>{i > 0 && "  ·  "}{s.name}</span>)}</div></div>)}</div>;
  return (
    <div>{tiers.map(([t, ss]) => {
      const ads = ss.filter((s) => (s.adSize && AD_SPAN[s.adSize]) || s.logo), names = ss.filter((s) => !((s.adSize && AD_SPAN[s.adSize]) || s.logo));
      return (
        <div key={t}>
          {t && <div className="ps-tier">{t}</div>}
          {ads.length > 0 && <div className="ps-grid">{ads.map((s) => { const k = (s.adSize && AD_SPAN[s.adSize]) || "quarter"; return (
            <div key={s.id} className={`ps-ad ${k}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.logo && <img src={sponsorUrl(s.logo)} alt={s.name} style={{ maxHeight: `${(AD_H[k] * sc).toFixed(2)}in` }} />}
              {(b.names || !s.logo) && <div className="ps-n">{s.name}</div>}{b.messages && s.message && <div className="ps-m">{s.message}</div>}
            </div>); })}</div>}
          {names.length > 0 && <div className="ps-names">{names.map((s, i) => <span key={s.id}>{i > 0 && "  ·  "}{s.name}{b.messages && s.message && <i className="ps-m"> — {s.message}</i>}</span>)}</div>}
        </div>);
    })}</div>
  );
}

/** One printed page. `children` replaces the blocks (the editor passes blocks wrapped in its own chrome). */
export function PageView({ doc, ctx, page, index, children }: { doc: Doc; ctx: Ctx; page: Page; index: number; children?: ReactNode }) {
  const folio = doc.pageNumbers && index > 0 && index < doc.pages.length - 1;
  return (
    <section className={`ppage b-${doc.border}`} style={pageStyle(doc, ctx)}>
      {doc.border === "deco" && <><i className="dc tl" /><i className="dc tr" /><i className="dc bl" /><i className="dc br" /></>}
      <div className="pcontent" data-pi={index}>{children ?? page.blocks.map((b) => <BlockView key={b.id} b={b} ctx={ctx} />)}</div>
      {folio && <div className="pfolio">{index + 1}</div>}
    </section>
  );
}

/** Pages in print order. Booklets put two pages per side in saddle-stitch order, padded to a multiple of 4. */
export function PrintSheets({ doc, ctx, mode }: { doc: Doc; ctx: Ctx; mode: "single" | "booklet" }) {
  const sz = PSIZES[doc.size], n = doc.pages.length;
  const pages = doc.pages.map((p, i) => <PageView key={p.id} doc={doc} ctx={ctx} page={p} index={i} />);
  if (mode === "single") return <><style>{`@page { size: ${sz.w}in ${sz.h}in; margin: 0 }`}</style>{pages}</>;
  const pad = (4 - (n % 4)) % 4;
  const blank = (k: number) => <section key={`blank-${k}`} className="ppage" style={pageStyle(doc, ctx)} />;
  const all = [...pages.slice(0, n - 1), ...Array.from({ length: pad }, (_, k) => blank(k)), pages[n - 1]];
  const N = all.length, sides: [ReactNode, ReactNode][] = [];
  for (let k = 0; k < N / 4; k++) { sides.push([all[N - 1 - 2 * k], all[2 * k]]); sides.push([all[2 * k + 1], all[N - 2 - 2 * k]]); }
  return <><style>{`@page { size: ${sz.w * 2}in ${sz.h}in; margin: 0 }`}</style>{sides.map(([l, r], i) => <div key={i} className="psheet" style={{ width: `${sz.w * 2}in`, height: `${sz.h}in` }}>{l}{r}</div>)}</>;
}
