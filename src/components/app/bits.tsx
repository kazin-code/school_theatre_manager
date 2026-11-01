import { Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { COND } from "@/lib/format";
import { photoUrl } from "@/lib/urls";

/** Condition 1–5 as five pips plus a word. */
export function Condition({ value, className }: { value?: number | null; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = value >= 4 ? "bg-emerald-600" : value === 3 ? "bg-amber-500" : "bg-red-600";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)} title={`${value} of 5`}>
      <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={cn("h-3 w-1.5 rounded-sm", i <= value ? tone : "bg-muted-foreground/20")} />)}</span>
      {COND[value]}
    </span>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return <span className="inline-block rounded border border-dashed border-border bg-background px-1.5 font-mono text-[11px] font-semibold whitespace-nowrap">{tag}</span>;
}

type Avail = { status: string; quantity: number; rentOut: number; showOut: number };
export function Availability({ it }: { it: Avail }) {
  const S: Record<string, [string, string]> = { repair: ["In repair", "amber"], retired: ["Retired", "slate"], lost: ["Lost", "red"] };
  if (it.status !== "active") { const [t, c] = S[it.status] ?? [it.status, "slate"]; return <Pill tone={c}>{t}</Pill>; }
  const free = it.quantity - it.rentOut - it.showOut;
  if (free <= 0) return <Pill tone="red">{it.rentOut ? "Rented out" : "In a show"}</Pill>;
  if (free < it.quantity) return <Pill tone="amber">{free} of {it.quantity} free</Pill>;
  return <Pill tone="green">{it.quantity > 1 ? `All ${it.quantity} available` : "Available"}</Pill>;
}

const TONES: Record<string, string> = {
  green: "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  red: "border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  blue: "border-sky-600/30 bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  slate: "border-border bg-muted text-muted-foreground",
};
export function Pill({ tone = "slate", children, className }: { tone?: string; children: React.ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("font-medium", TONES[tone] ?? TONES.slate, className)}>{children}</Badge>;
}

export function Thumb({ file, className, alt = "" }: { file?: string | null; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (file) return <img src={photoUrl(file)} alt={alt} loading="lazy" className={cn("size-11 shrink-0 rounded-md bg-muted object-cover", className)} />;
  return <span className={cn("grid size-11 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground/60", className)}><Shirt className="size-5" /></span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

/** 1–5 stars, read-only. */
export function Stars({ value, className }: { value?: number | null; className?: string }) {
  if (value == null) return <span className={cn("text-xs text-muted-foreground", className)}>Not rated</span>;
  const full = Math.round(value);
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)} title={`${value} of 5`} aria-label={`${value} of 5 stars`}><span className="tracking-tight text-amber-500" aria-hidden>{"★".repeat(full)}<span className="text-muted-foreground/30">{"★".repeat(5 - full)}</span></span><span className="text-xs text-muted-foreground tabular">{value}</span></span>;
}
