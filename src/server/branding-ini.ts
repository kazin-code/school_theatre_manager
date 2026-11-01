import { dir } from "./paths";
import { pjoin, writeFile } from "./fsx";

/** The Windows installer reads the school details from this file when it is run again (Keep). UTF-16 so any name works. */
export function writeBrandingIni(b: { school?: string | null; program?: string | null; short?: string | null; tagline?: string | null }) {
  const clean = (v?: string | null) => (v ?? "").replace(/[\r\n]+/g, " ").trim();
  const text = `[branding]\r\nschool=${clean(b.school)}\r\nprogram=${clean(b.program)}\r\nshort=${clean(b.short)}\r\ntagline=${clean(b.tagline)}\r\n`;
  writeFile(pjoin(dir("branding"), "branding.ini"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}
