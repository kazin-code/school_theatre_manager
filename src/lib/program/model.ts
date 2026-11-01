/**
 * The program (playbill) document. Lists such as the cast, songs, credits and sponsors are
 * not copied into the document: blocks name what to show and are drawn from the show's
 * live data each time, so the program stays current as the cast list changes.
 */
import { z } from "zod";

export const PSIZES = {
  half: { w: 5.5, h: 8.5, label: "Booklet page: 5.5 × 8.5 in (letter paper folded in half)" },
  letter: { w: 8.5, h: 11, label: "Full page: 8.5 × 11 in" },
} as const;
export const PSTYLES = {
  classic: { label: "Classic", display: '"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif', body: 'Georgia,"Times New Roman",serif', hcase: "none", hls: "0", hw: 700, stretch: "normal", hscale: 1 },
  broadway: { label: "Broadway marquee", display: 'Bahnschrift,"Arial Narrow","Franklin Gothic Medium",Impact,sans-serif', body: '"Segoe UI",Arial,sans-serif', hcase: "uppercase", hls: ".08em", hw: 700, stretch: "condensed", hscale: 1 },
  elegant: { label: "Elegant", display: 'Gabriola,"Palatino Linotype","Book Antiqua",serif', body: 'Constantia,Georgia,serif', hcase: "none", hls: "0", hw: 400, stretch: "normal", hscale: 1.3 },
  modern: { label: "Modern", display: '"Segoe UI Semibold","Segoe UI",Arial,sans-serif', body: '"Segoe UI",Arial,sans-serif', hcase: "none", hls: "-.01em", hw: 600, stretch: "normal", hscale: 1 },
  typewriter: { label: "Typewriter", display: '"Courier New",Courier,monospace', body: '"Courier New",Courier,monospace', hcase: "uppercase", hls: ".04em", hw: 700, stretch: "normal", hscale: 1 },
} as const;
export const PAPERS = {
  white: { label: "White", paper: "#ffffff", ink: "#1b1717", muted: "#5f5757" },
  cream: { label: "Cream", paper: "#fbf6ea", ink: "#2a211a", muted: "#6d6255" },
  black: { label: "Black", paper: "#141112", ink: "#f4efe9", muted: "#b9b0a8" },
} as const;
export const BORDERS = { none: "None", thin: "Thin line", double: "Double line", deco: "Theatre corners" } as const;
export const HSIZES = [13, 17, 23, 31, 42]; // heading sizes (pt), small → huge
export const TSIZES = [7.5, 8.5, 9.5, 10.5, 12]; // body sizes (pt)
export const PEOPLE_LABEL = { cast: "Cast", team: "Production team", crew: "Crew", pit: "Pit orchestra" } as const;
export const BLOCK_LABEL = { credits: "Credits", heading: "Heading", text: "Text", image: "Picture", info: "Show details", people: "People list", songs: "Musical numbers", sponsors: "Sponsors", divider: "Divider", spacer: "Space" } as const;

type Align = "left" | "center" | "right";
type Color = "ink" | "muted" | "accent";
export type Kind = keyof typeof PEOPLE_LABEL;
export type Block =
  | { id: string; type: "heading"; text: string; size: number; align: Align; color: Color; font: "display" | "body" }
  | { id: string; type: "text"; html: string; size: number; align: Align; color: Color }
  | { id: string; type: "image"; src: "upload" | "logo" | "cover"; file: string; width: number; maxh: number; align: Align; caption: string }
  | { id: string; type: "info"; dates: boolean; venue: boolean; director: boolean; size: number; align: Align }
  | { id: string; type: "people"; kind: Kind; cols: number; style: "leaders" | "stacked"; order: "role" | "name"; voice: boolean; grade: boolean; size: number }
  | { id: string; type: "songs"; singers: boolean; size: number }
  | { id: string; type: "sponsors"; tiers: string[]; layout: "tiers" | "names"; names: boolean; messages: boolean; scale: number }
  | { id: string; type: "credits"; part: "authors" | "license"; size: number; align: Align }
  | { id: string; type: "divider"; style: "ornament" | "line" | "double" | "dots" }
  | { id: string; type: "spacer"; size: number };
export type BlockType = Block["type"];
export type Page = { id: string; name: string; blocks: Block[] };
export type Doc = { v: 2; size: keyof typeof PSIZES; style: keyof typeof PSTYLES; paper: keyof typeof PAPERS; border: keyof typeof BORDERS; accent: string; pageNumbers: boolean; pages: Page[] };

/** What a program is drawn from. */
export type Ctx = {
  show: { id: number; title: string; type: string; director: string | null; venue: string | null; openDate: string | null; closeDate: string | null; cover: string | null;
    writtenBy: string | null; bookBy: string | null; musicBy: string | null; lyricsBy: string | null; basedOn: string | null; additionalCredits: string | null; licensor: string | null; licensingNotice: string | null };
  people: { kind: Kind; name: string; role: string | null; voicePart: string | null; grade: string | null }[];
  numbers: { act: string | null; number: string | null; title: string; singers: string | null }[];
  sponsors: { id: number; name: string; tier: string | null; adSize: string | null; message: string | null; logo: string | null }[];
  tierOrder: string[];
  brand: { name: string; school: string; program: string; tagline: string; accent: string; logoVersion: string };
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const isMusical = (type: string) => /musical|revue|opera/i.test(type);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const B = {
  heading: (text: string, o: Partial<Extract<Block, { type: "heading" }>> = {}): Block => ({ id: uid(), type: "heading", text, size: 3, align: "center", color: "ink", font: "display", ...o }),
  text: (html: string, o: Partial<Extract<Block, { type: "text" }>> = {}): Block => ({ id: uid(), type: "text", html, size: 2, align: "left", color: "ink", ...o }),
  image: (o: Partial<Extract<Block, { type: "image" }>> = {}): Block => ({ id: uid(), type: "image", src: "upload", file: "", width: 80, maxh: 4, align: "center", caption: "", ...o }),
  info: (o: Partial<Extract<Block, { type: "info" }>> = {}): Block => ({ id: uid(), type: "info", dates: true, venue: true, director: false, size: 2, align: "center", ...o }),
  people: (kind: Kind, o: Partial<Extract<Block, { type: "people" }>> = {}): Block => ({ id: uid(), type: "people", kind, cols: 1, style: "leaders", order: "role", voice: false, grade: false, size: 2, ...o }),
  songs: (o: Partial<Extract<Block, { type: "songs" }>> = {}): Block => ({ id: uid(), type: "songs", singers: true, size: 2, ...o }),
  sponsors: (o: Partial<Extract<Block, { type: "sponsors" }>> = {}): Block => ({ id: uid(), type: "sponsors", tiers: [], layout: "tiers", names: true, messages: true, scale: 2, ...o }),
  credits: (part: "authors" | "license", o: Partial<Extract<Block, { type: "credits" }>> = {}): Block => ({ id: uid(), type: "credits", part, size: part === "license" ? 1 : 2, align: "center", ...o }),
  divider: (o: Partial<Extract<Block, { type: "divider" }>> = {}): Block => ({ id: uid(), type: "divider", style: "ornament", ...o }),
  spacer: (o: Partial<Extract<Block, { type: "spacer" }>> = {}): Block => ({ id: uid(), type: "spacer", size: 2, ...o }),
};

export const PAGE_TEMPLATES = [["blank", "Blank page"], ["note", "Director's note"], ["cast", "Cast"], ["songs", "Musical numbers"], ["team", "Team & crew"], ["sponsors", "Sponsors"], ["thanks", "Special thanks"], ["notes", "Notes & autographs"], ["title", "Title page"], ["cover", "Cover"], ["back", "Back cover"]] as const;
export type Template = (typeof PAGE_TEMPLATES)[number][0];

/** Ready-made pages, filled in from the show. */
export function pageTemplate(kind: Template, ctx: Ctx): Page {
  const s = ctx.show, br = ctx.brand, school = br.school || br.name, dir = s.director ?? "";
  const n = (k: Kind) => ctx.people.filter((p) => p.kind === k).length;
  const pg = (name: string, blocks: (Block | null | false)[]): Page => ({ id: uid(), name, blocks: blocks.filter(Boolean) as Block[] });
  switch (kind) {
    case "cover": return pg("Cover", [B.image({ src: "logo", width: 22, maxh: 1.1 }), B.heading(school, { size: 1, color: "accent" }),
      !!br.program && br.program !== school && B.heading(br.program, { size: 1, font: "body", color: "muted" }), B.spacer({ size: 2 }), B.heading(s.title, { size: 5 }), B.spacer({ size: 1 }),
      B.image({ src: "cover", width: 84, maxh: 3.6 }), B.spacer({ size: 1 }), !!dir && B.heading("Directed by " + dir, { size: 1, font: "body" }), B.info({ size: 3 })]);
    case "title": return pg("Title page", [B.spacer({ size: 3 }), B.text(`<i>${esc(school)} presents</i>`, { align: "center", size: 3, color: "muted" }), B.heading(s.title, { size: 4 }),
      B.credits("authors"), B.divider(), B.info({ director: true }), B.spacer({ size: 4 }), B.credits("license")]);
    case "note": return pg("Director's note", [B.heading("From the Director", { size: 3 }), B.divider({ style: "line" }),
      B.text(`Welcome to our production of <i>${esc(s.title)}</i>!<br><br>Write a few words about why you chose this show, what the students have put into it, and who you'd like to thank. Click this text to edit it.<br><br>Enjoy the show!`, { size: 3 }),
      B.text(dir ? `— ${esc(dir)}, Director` : "— The Director", { align: "right", size: 3 })]);
    case "cast": return pg("Cast", [B.heading("Cast", { size: 3 }), B.divider({ style: "line" }), B.people("cast", { cols: n("cast") > 18 ? 2 : 1 })]);
    case "songs": return pg("Musical numbers", [B.heading("Musical Numbers", { size: 3 }), B.divider({ style: "line" }), B.songs()]);
    case "team": { const pit = n("pit") > 0 || isMusical(s.type);
      return pg("Team & crew", [B.heading("Production Team", { size: 2 }), B.people("team"), pit && B.heading("Pit Orchestra", { size: 2 }), pit && B.people("pit"), B.heading("Crew", { size: 2 }), B.people("crew", { cols: n("crew") > 14 ? 2 : 1 })]); }
    case "sponsors": return pg("Sponsors", [B.heading("Thank You to Our Sponsors", { size: 3 }), B.text("This production is made possible by the generous support of our sponsors. Please thank them with your business!", { align: "center", size: 2, color: "muted" }), B.sponsors()]);
    case "thanks": return pg("Special thanks", [B.heading("Special Thanks", { size: 3 }), B.text("Our families · Our principal and administration · The custodial staff · The music department · Everyone who helped build, sew, paint and sell tickets<br><br>Click here to edit.", { align: "center", size: 3 })]);
    case "notes": return pg("Notes & autographs", [B.heading("Notes & Autographs", { size: 2 })]);
    case "back": return pg("Back cover", [B.heading("Special Thanks", { size: 2 }), B.text("Click here to list the people and groups who helped make this show happen.", { align: "center", size: 2 }), B.spacer({ size: 4 }),
      B.text("<b>Please silence all phones.</b> The videotaping or other video or audio recording of this production is strictly prohibited.", { align: "center", size: 2 }), B.divider(),
      B.image({ src: "logo", width: 24, maxh: 1.1 }), B.heading(school, { size: 1 }), !!br.tagline && B.text(`<i>${esc(br.tagline)}</i>`, { align: "center", size: 2, color: "muted" })]);
    default: return pg("Blank page", []);
  }
}

export function defaultProgram(ctx: Ctx): Doc {
  const mus = isMusical(ctx.show.type) || ctx.numbers.length > 0;
  const kinds: Template[] = ["cover", "title", "note", "cast", ...(mus ? (["songs"] as const) : []), "team", ...(ctx.sponsors.length ? (["sponsors"] as const) : []), "back"];
  return { v: 2, size: "half", style: "classic", paper: "white", border: "none", accent: "", pageNumbers: true, pages: kinds.map((k) => pageTemplate(k, ctx)) };
}

/** Author credit lines; shared credits are merged ("Music & Lyrics by"). Only filled-in lines appear. */
export function creditLines(s: Ctx["show"]): [string, string][] {
  const t = (v: string | null) => (v ?? "").trim().replace(/^(written\s+)?by\s+/i, "");
  const same = (a: string, b: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const out: [string, string][] = [], wr = t(s.writtenBy), bk = t(s.bookBy), mu = t(s.musicBy), ly = t(s.lyricsBy);
  if (wr) out.push(["Written by", wr]);
  if (bk && same(bk, mu) && same(bk, ly)) out.push(["Book, Music & Lyrics by", bk]);
  else if (same(mu, ly)) { if (bk) out.push(["Book by", bk]); out.push(["Music & Lyrics by", mu]); }
  else if (same(bk, ly)) { out.push(["Book & Lyrics by", bk]); if (mu) out.push(["Music by", mu]); }
  else if (same(bk, mu)) { out.push(["Book & Music by", bk]); if (ly) out.push(["Lyrics by", ly]); }
  else { if (bk) out.push(["Book by", bk]); if (mu) out.push(["Music by", mu]); if (ly) out.push(["Lyrics by", ly]); }
  const based = (s.basedOn ?? "").trim().replace(/^based\s+on\s+/i, "");
  if (based) out.push(["Based on", based]);
  return out;
}

export function runLine(s: Ctx["show"]) {
  if (!s.openDate) return "";
  const o = new Date(s.openDate + "T12:00:00"), c = s.closeDate ? new Date(s.closeDate + "T12:00:00") : null;
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
  if (!c || +c === +o) return o.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  if (o.getFullYear() === c.getFullYear() && o.getMonth() === c.getMonth()) return `${m(o)} ${o.getDate()}–${c.getDate()}, ${o.getFullYear()}`;
  if (o.getFullYear() === c.getFullYear()) return `${m(o)} ${o.getDate()} – ${m(c)} ${c.getDate()}, ${o.getFullYear()}`;
  return `${o.toLocaleDateString("en-US")} – ${c.toLocaleDateString("en-US")}`;
}

/** Text blocks keep only bold, italic, underline and line breaks (applied on the server too). */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(\/?)(strong)\b[^>]*>/gi, "<$1b>").replace(/<(\/?)(em)\b[^>]*>/gi, "<$1i>")
    .replace(/<(div|p)\b[^>]*>/gi, "").replace(/<\/(div|p)>/gi, "<br>")
    .replace(/<(?!\/?(b|i|u)>|br\s*\/?>)[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "<br>").replace(/(<br>\s*)+$/, "");
}

// ---- validation of a saved document (server side) ----
const al = z.enum(["left", "center", "right"]);
const sz = z.number().int().min(1).max(6);
const block = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(20), type: z.literal("heading"), text: z.string().max(400), size: sz, align: al, color: z.enum(["ink", "muted", "accent"]), font: z.enum(["display", "body"]) }),
  z.object({ id: z.string().max(20), type: z.literal("text"), html: z.string().max(20000).transform(sanitizeHtml), size: sz, align: al, color: z.enum(["ink", "muted", "accent"]) }),
  z.object({ id: z.string().max(20), type: z.literal("image"), src: z.enum(["upload", "logo", "cover"]), file: z.string().max(120).regex(/^[a-zA-Z0-9_.-]*$/), width: z.number().min(5).max(100), maxh: z.number().min(0.25).max(10), align: al, caption: z.string().max(300) }),
  z.object({ id: z.string().max(20), type: z.literal("info"), dates: z.boolean(), venue: z.boolean(), director: z.boolean(), size: sz, align: al }),
  z.object({ id: z.string().max(20), type: z.literal("people"), kind: z.enum(["cast", "team", "crew", "pit"]), cols: z.number().int().min(1).max(3), style: z.enum(["leaders", "stacked"]), order: z.enum(["role", "name"]), voice: z.boolean(), grade: z.boolean(), size: sz }),
  z.object({ id: z.string().max(20), type: z.literal("songs"), singers: z.boolean(), size: sz }),
  z.object({ id: z.string().max(20), type: z.literal("sponsors"), tiers: z.array(z.string().max(80)).max(30), layout: z.enum(["tiers", "names"]), names: z.boolean(), messages: z.boolean(), scale: z.number().int().min(1).max(4) }),
  z.object({ id: z.string().max(20), type: z.literal("credits"), part: z.enum(["authors", "license"]), size: sz, align: al }),
  z.object({ id: z.string().max(20), type: z.literal("divider"), style: z.enum(["ornament", "line", "double", "dots"]) }),
  z.object({ id: z.string().max(20), type: z.literal("spacer"), size: sz }),
]);
export const docSchema = z.object({
  v: z.literal(2), size: z.enum(["half", "letter"]), style: z.enum(["classic", "broadway", "elegant", "modern", "typewriter"]), paper: z.enum(["white", "cream", "black"]),
  border: z.enum(["none", "thin", "double", "deco"]), accent: z.string().regex(/^(#[0-9a-fA-F]{6})?$/), pageNumbers: z.boolean(),
  pages: z.array(z.object({ id: z.string().max(20), name: z.string().max(80), blocks: z.array(block).max(80) })).min(1, "A program needs at least one page.").max(64, "A program can have up to 64 pages."),
});
