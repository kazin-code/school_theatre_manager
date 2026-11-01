/** Formatting shared by server and client components. */
export const COND: Record<number, string> = { 5: "Excellent", 4: "Good", 3: "Fair", 2: "Poor", 1: "Needs repair" };

export function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d.slice(0, 10) + "T12:00:00");
  return isNaN(+dt) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function fmtWhen(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(+dt)) return d;
  return new Date().toDateString() === dt.toDateString()
    ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: dt.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export const money = (v?: number | null) => (v == null ? "—" : "$" + v.toFixed(2).replace(/\.00$/, ""));
export const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
