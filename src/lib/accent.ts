/** CSS that recolors buttons, links and highlights in the school's color (lightened in dark mode). */
export function accentCss(hex: string): string {
  const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const mix = (h: string, t: number) => "#" + rgb(h).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
  const shade = (h: string, t: number) => "#" + rgb(h).map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, "0")).join("");
  const vars = (c: string, link: string) => { const fg = lum(c) > 0.4 ? "#1b1717" : "#ffffff"; return `--primary:${c};--primary-foreground:${fg};--ring:${c}99;--sidebar-primary:${c};--sidebar-primary-foreground:${fg};--link:${link};`; };
  let light = hex; while (lum(light) > 0.18) light = shade(light, 0.12); // text on light backgrounds must stay readable
  const dark = lum(hex) < 0.12 ? mix(hex, 0.45) : hex;
  return `:root{${vars(hex, light)}}.dark{${vars(dark, dark)}}`;
}
