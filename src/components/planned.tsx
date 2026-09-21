import Link from "next/link";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/crm/bits";

/** Honest placeholder for modules scheduled in later phases — no fake data, no dead buttons. */
export function Planned({ title, phase, summary, bullets, now }: { title: string; phase: 2 | 3; summary: string; bullets: string[]; now?: { href: string; label: string }[] }) {
  return (
    <div className="pb-10">
      <PageHeader title={title} description={`Scheduled for Phase ${phase}`} />
      <div className="px-4 sm:px-6">
        <Card className="max-w-3xl p-6">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Not yet available</span>
          <p className="mt-3 text-sm text-slate-700">{summary}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Planned scope</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          {now && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Available today</p><div className="mt-2 flex flex-wrap gap-2">{now.map((n) => <Link key={n.href} href={n.href} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-slate-50">{n.label}</Link>)}</div></>}
        </Card>
      </div>
    </div>
  );
}
