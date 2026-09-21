"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, CalendarPlus, CheckCircle2, Circle, Mail, MessageCircle, Phone, StickyNote, Users, Video } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { ActivityFormDialog, TaskFormDialog } from "./forms";
import { setTaskStatusAction } from "@/app/actions/crm";
import { callAction } from "@/components/action-form";
import { ACTIVITY_LABELS } from "@/lib/constants";
import { cn, fmtDateTime, relTime, titleCase } from "@/lib/utils";
import { Priority, TaskStatus } from "./bits";
import type { ActivityRow, TaskRow } from "@/lib/services/activities";

type Related = Partial<Record<"lead_id" | "contact_id" | "company_id" | "opportunity_id", string>>;

export function RecordTabs({ tabs }: { tabs: { key: string; label: string; count?: number }[] }) {
  const sp = useSearchParams(); const path = usePathname(); const router = useRouter();
  const cur = sp.get("tab") ?? tabs[0]!.key;
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-4 scrollbar-thin sm:px-6">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={cur === t.key} onClick={() => { const n = new URLSearchParams(sp.toString()); n.set("tab", t.key); router.replace(`${path}?${n}`, { scroll: false }); }}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm", cur === t.key ? "border-brand-600 font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function QuickActions({ related, users, canAssign, whatsapp, phone, email, canWrite = true }: { related: Related; users: { id: string; name: string }[]; canAssign: boolean; whatsapp?: string | null; phone?: string | null; email?: string | null; canWrite?: boolean }) {
  const [act, setAct] = React.useState<string | null>(null);
  const [task, setTask] = React.useState(false);
  if (!canWrite) return null;
  const wa = (whatsapp ?? phone)?.replace(/[^\d]/g, "");
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => setAct("call")}><Phone />Log call</Button>
      <Button size="sm" variant="secondary" onClick={() => setAct("whatsapp")}><MessageCircle />WhatsApp</Button>
      <Button size="sm" variant="secondary" onClick={() => setAct("email")}><Mail />Email</Button>
      <Button size="sm" variant="secondary" onClick={() => setAct("meeting")}><Users />Meeting</Button>
      <Button size="sm" variant="secondary" onClick={() => setAct("note")}><StickyNote />Note</Button>
      <Button size="sm" variant="secondary" onClick={() => setTask(true)}><CalendarPlus />Task</Button>
      {phone && <a href={`tel:${phone}`} className="hidden" aria-hidden />}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-emerald-700 hover:bg-emerald-50"><MessageCircle className="size-4" />Open chat</a>}
      {email && <a href={`mailto:${email}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-brand-700 hover:bg-brand-50"><Mail className="size-4" />Compose</a>}
      <ActivityFormDialog open={!!act} onOpenChange={(o) => !o && setAct(null)} related={related} defaultType={act ?? "call"} />
      <TaskFormDialog open={task} onOpenChange={setTask} related={related} users={users} canAssign={canAssign} />
    </div>
  );
}

const ICON: Record<string, typeof Phone> = { call: Phone, email: Mail, whatsapp: MessageCircle, meeting: Users, video_call: Video, note: StickyNote };

export function ActivityList({ items, showRelated }: { items: ActivityRow[]; showRelated?: boolean }) {
  if (!items.length) return <EmptyState icon={<Activity />} title="No activities yet" description="Log calls, WhatsApp messages, emails and meetings to build the history." />;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => { const I = ICON[a.type] ?? Activity; return (
        <li key={a.id} className="flex gap-3 px-4 py-3">
          <span className="mt-0.5 rounded-full bg-slate-100 p-1.5 text-slate-600"><I className="size-3.5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-medium">{a.subject}</span><Badge>{ACTIVITY_LABELS[a.type]}</Badge>{a.direction && <span className="text-[11px] text-muted">{titleCase(a.direction)}</span>}{a.outcome && <Badge tone={/interest|positive|booked|replied|connected — i/i.test(a.outcome) ? "green" : /no answer|not/i.test(a.outcome) ? "amber" : "slate"}>{a.outcome}</Badge>}</div>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>}
            <p className="mt-1 text-xs text-muted">{a.owner_name ?? "System"} · {fmtDateTime(a.occurred_at)}{a.duration_min ? ` · ${a.duration_min} min` : ""}{showRelated && a.related_label ? ` · ${a.related_label}` : ""}{a.next_action ? ` · Next: ${a.next_action}` : ""}</p>
          </div>
        </li>); })}
    </ul>
  );
}

const REL: Record<string, string> = { lead: "/leads/", contact: "/contacts/", company: "/companies/", opportunity: "/opportunities/" };
export function TaskList({ items, showRelated, onEdit }: { items: TaskRow[]; showRelated?: boolean; onEdit?: (t: TaskRow) => void }) {
  const [pending, setPending] = React.useState<string | null>(null);
  if (!items.length) return <EmptyState icon={<CheckCircle2 />} title="No tasks here" description="Tasks and follow-ups you create will appear in this list." />;
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const done = t.status === "completed";
        return (
          <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
            <button aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`} disabled={pending === t.id} onClick={async () => { setPending(t.id); await callAction(setTaskStatusAction(t.id, done ? "todo" : "completed")); setPending(null); }} className="mt-0.5 text-slate-400 hover:text-emerald-600">
              {done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <button onClick={() => onEdit?.(t)} className={cn("text-left text-sm font-medium", done && "text-muted line-through", onEdit && "hover:text-brand-600")}>{t.title}</button>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <TaskStatus s={t.status} overdue={t.overdue} /><Priority p={t.priority} />
                {t.due_at && <span className={cn(t.overdue && "font-medium text-red-600")}>Due {relTime(t.due_at)}</span>}
                {t.owner_name && <span>· {t.owner_name}</span>}
                {showRelated && t.related_label && t.related_type && <Link className="text-brand-600 hover:underline" href={REL[t.related_type] + (t.opportunity_id ?? t.lead_id ?? t.contact_id ?? t.company_id)}>· {t.related_label}</Link>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TimelineList({ items }: { items: { id: number; event_type: string; summary: string; actor_name: string | null; at: string }[] }) {
  if (!items.length) return <EmptyState title="No history yet" />;
  const tone = (e: string) => (["won", "converted", "became_client", "handover_created"].includes(e) ? "bg-emerald-500" : e === "lost" ? "bg-red-500" : e.includes("stage") || e.includes("status") ? "bg-brand-500" : e === "activity" ? "bg-violet-500" : "bg-slate-300");
  return (
    <ol className="relative px-4 py-3">
      {items.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4">
          {i < items.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" />}
          <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-white", tone(e.event_type))} />
          <div className="min-w-0"><p className="text-sm">{e.summary}</p><p className="text-xs text-muted">{e.actor_name ?? "System"} · {fmtDateTime(e.at)}</p></div>
        </li>
      ))}
    </ol>
  );
}

export function AuditList({ items }: { items: { id: number; action: string; changes: Record<string, [unknown, unknown]>; actor_name: string | null; at: string }[] }) {
  if (!items.length) return <EmptyState title="No field changes recorded" description="Only Owners and Admins can view field-level audit history." />;
  const fmt = (v: unknown) => (v == null || v === "" ? "∅" : Array.isArray(v) ? v.join(", ") || "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className="px-4 py-2.5 text-sm">
          <p><span className="font-medium">{a.actor_name ?? "System"}</span> <span className="text-muted">{a.action} · {fmtDateTime(a.at)}</span></p>
          {Object.entries(a.changes ?? {}).filter(([k]) => !["score_breakdown"].includes(k)).map(([k, v]) => Array.isArray(v) && (
            <p key={k} className="mt-0.5 text-xs"><span className="font-mono text-slate-500">{k}</span>: <span className="text-red-600 line-through">{fmt(v[0]).slice(0, 80)}</span> → <span className="text-emerald-700">{fmt(v[1]).slice(0, 80)}</span></p>
          ))}
        </li>
      ))}
    </ul>
  );
}
