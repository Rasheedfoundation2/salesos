import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONE, PRIORITY_TONE, TASK_STATUS_LABELS } from "@/lib/constants";
import { cn, money, titleCase } from "@/lib/utils";

export function PageHeader({ title, description, actions, breadcrumb }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-5 sm:px-6">
      <div className="min-w-0">
        {breadcrumb && <Link href={breadcrumb.href} className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ChevronLeft className="size-3.5" />{breadcrumb.label}</Link>}
        <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LeadStatus({ status }: { status: string }) { return <Badge tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status] ?? status}</Badge>; }
export function Priority({ p }: { p: string }) { return <Badge tone={PRIORITY_TONE[p]}>{titleCase(p)}</Badge>; }
export function TaskStatus({ s, overdue }: { s: string; overdue?: boolean }) {
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  return <Badge tone={s === "completed" ? "green" : s === "cancelled" ? "slate" : s === "waiting" ? "amber" : "blue"}>{TASK_STATUS_LABELS[s] ?? s}</Badge>;
}
export function Score({ score }: { score: number }) {
  const [tone, label] = score >= 80 ? ["red", "Hot"] : score >= 60 ? ["amber", "Warm"] : score >= 40 ? ["blue", "Nurture"] : ["slate", "Low"];
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label} (${score}/100)`}>
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-slate-200"><span className={cn("absolute inset-y-0 left-0 rounded-full", { red: "bg-red-500", amber: "bg-amber-500", blue: "bg-brand-500", slate: "bg-slate-400" }[tone])} style={{ width: `${score}%` }} /></span>
      <span className="tabular text-xs font-medium text-slate-700">{score}</span>
    </span>
  );
}
export function Stage({ name, color }: { name: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]"><span className="size-2 rounded-full" style={{ background: color }} />{name}</span>;
}
export function Money({ value, currency, className }: { value: string | number | null | undefined; currency: string; className?: string }) {
  if (value == null) return <span className="text-muted">—</span>;
  return <span className={cn("tabular", className)}>{money(value, currency)}</span>;
}

export function Pagination({ page, per, total, basePath, params }: { page: number; per: number; total: number; basePath: string; params: Record<string, string | string[] | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / per));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) { if (k === "page" || v == null) continue; (Array.isArray(v) ? v : [v]).forEach((x) => sp.append(k, x)); }
    if (p > 1) sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm text-muted">
      <span className="tabular">{total === 0 ? "No records" : `${(page - 1) * per + 1}–${Math.min(page * per, total)} of ${total.toLocaleString("en-GB")}`}</span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} href={page <= 1 ? "#" : href(page - 1)} className={cn("rounded-md border border-line bg-white p-1.5", page <= 1 && "pointer-events-none opacity-40")} aria-label="Previous page"><ChevronLeft className="size-4" /></Link>
        <span className="tabular px-2">{page} / {pages}</span>
        <Link aria-disabled={page >= pages} href={page >= pages ? "#" : href(page + 1)} className={cn("rounded-md border border-line bg-white p-1.5", page >= pages && "pointer-events-none opacity-40")} aria-label="Next page"><ChevronRight className="size-4" /></Link>
      </div>
    </div>
  );
}

export const th = "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-slate-50/95 px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted";
export const td = "whitespace-nowrap border-b border-line/70 px-3 py-2.5 text-[13px]";

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={cn("tabular mt-1 whitespace-nowrap text-[20px] font-semibold tracking-tight", tone === "bad" && "text-red-600", tone === "warn" && "text-amber-600", tone === "good" && "text-emerald-600")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
