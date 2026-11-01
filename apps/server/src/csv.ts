/** CSV that opens cleanly in Excel (BOM, CRLF, quoted where needed, no formula injection). */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    if (v == null) return "";
    let s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
