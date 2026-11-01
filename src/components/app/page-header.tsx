import Link from "next/link";
import { Fragment } from "react";

export function PageHeader({ eyebrow, title, actions, crumbs, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; actions?: React.ReactNode; crumbs?: { href: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="no-print text-sm text-muted-foreground">
          {crumbs.map((c, i) => <Fragment key={c.href}>{i > 0 && " / "}<Link href={c.href} className="hover:text-foreground hover:underline">{c.label}</Link></Fragment>)}
        </nav>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-xs font-semibold tracking-widest text-link uppercase">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        </div>
        {actions && <div className="no-print ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
