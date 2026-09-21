"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Plus, Tag, Target, UserPlus } from "lucide-react";
import { Avatar, Button, Dialog, EmptyState, Input, Select } from "@/components/ui";
import { LeadStatus, Score, SortHeader, th, td } from "@/components/crm";
import { LeadFormDialog } from "@/components/crm/forms";
import { bulkLeadsAction } from "@/app/actions/crm";
import { callAction } from "@/components/action-form";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import type { LeadRow } from "@/lib/services/leads";
import type { Lookups } from "@/lib/services/lookups";
import { cn, relTime } from "@/lib/utils";

export function NewLeadButton({ lookups, canAssign, currency, autoOpen }: { lookups: Lookups; canAssign: boolean; currency: string; autoOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!autoOpen);
  const router = useRouter();
  return <>
    <Button size="sm" onClick={() => setOpen(true)}><Plus />New lead</Button>
    <LeadFormDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && autoOpen) router.replace("/leads"); }} lookups={lookups} canAssign={canAssign} currency={currency} />
  </>;
}

export function LeadsTable({ rows, users, canAssign, canArchive, canEdit, archived }: { rows: LeadRow[]; users: { id: string; name: string }[]; canAssign: boolean; canArchive: boolean; canEdit: boolean; archived: boolean }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<null | "assign" | "status" | "tag">(null);
  const [val, setVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setSel(new Set()), [rows]);
  const all = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = async (op: Parameters<typeof bulkLeadsAction>[1]) => {
    setBusy(true);
    const r = await callAction(bulkLeadsAction([...sel], op));
    setBusy(false);
    if (r.ok) { setDialog(null); setVal(""); setSel(new Set()); toast.success(`${r.data} lead${r.data === 1 ? "" : "s"} updated`); }
  };
  if (rows.length === 0) return <EmptyState icon={<Target />} title="No leads match this view" description="Adjust the filters, add a lead, or import a CSV/Excel list for your sales team." />;
  return (
    <>
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-700">{sel.size} selected</span>
          {canAssign && <Button size="sm" variant="secondary" onClick={() => setDialog("assign")}><UserPlus />Assign</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setDialog("status")}>Change status</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setDialog("tag")}><Tag />Add tag</Button>}
          {canArchive && (archived
            ? <Button size="sm" variant="secondary" loading={busy} onClick={() => apply({ kind: "restore" })}><ArchiveRestore />Restore</Button>
            : <Button size="sm" variant="secondary" loading={busy} onClick={() => apply({ kind: "archive" })}><Archive />Archive</Button>)}
          <button className="ml-auto text-xs text-muted hover:underline" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] border-separate border-spacing-0">
          <thead><tr>
            <th className={cn(th, "w-9")}><input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
            <th className={th}><SortHeader k="name" label="Name" /></th><th className={th}>Company</th><th className={th}>Status</th>
            <th className={th}><SortHeader k="score" label="Score" /></th><th className={th}>Owner</th><th className={th}>Source</th>
            <th className={th}><SortHeader k="follow_up" label="Next follow-up" /></th><th className={th}><SortHeader k="created" label="Created" /></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const breached = !r.first_contacted_at && r.first_response_due_at && new Date(r.first_response_due_at) < new Date() && !["converted", "unqualified", "do_not_contact", "nurturing"].includes(r.status);
              const overdue = r.next_follow_up_at && new Date(r.next_follow_up_at) < new Date() && !["converted", "unqualified", "do_not_contact"].includes(r.status);
              return (
                <tr key={r.id} className={cn("hover:bg-slate-50/80", sel.has(r.id) && "bg-brand-50/50")}>
                  <td className={td}><input type="checkbox" aria-label={`Select ${r.full_name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className={td}><Link href={`/leads/${r.id}`} className="font-medium text-ink hover:text-brand-600">{r.full_name}</Link>
                    <p className="text-xs text-muted">{r.email ?? r.phone ?? "—"}</p></td>
                  <td className={td}>{r.company_name ?? "—"}{r.country && <p className="text-xs text-muted">{[r.city, r.country].filter(Boolean).join(", ")}</p>}</td>
                  <td className={td}><LeadStatus status={r.status} />{breached && <p className="mt-0.5 text-[11px] font-medium text-red-600">SLA breached</p>}</td>
                  <td className={td}><Score score={r.score} /></td>
                  <td className={td}>{r.owner_name ? <span className="inline-flex items-center gap-2"><Avatar name={r.owner_name} className="size-6 text-[10px]" />{r.owner_name}</span> : <span className="text-amber-700">Unassigned</span>}</td>
                  <td className={td}>{r.source_name ?? "—"}</td>
                  <td className={cn(td, overdue && "font-medium text-red-600")}>{r.next_follow_up_at ? relTime(r.next_follow_up_at) : <span className="text-muted">None</span>}</td>
                  <td className={cn(td, "text-muted")}>{relTime(r.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} size="sm"
        title={dialog === "assign" ? `Assign ${sel.size} lead(s)` : dialog === "status" ? `Change status of ${sel.size} lead(s)` : `Tag ${sel.size} lead(s)`}
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          <Button loading={busy} onClick={() => apply(dialog === "assign" ? { kind: "assign", owner_id: val || null } : dialog === "status" ? { kind: "status", status: val } : { kind: "tag", tag: val })} disabled={dialog !== "assign" && !val}>Apply</Button></>}>
        {dialog === "assign" && <Select value={val} onChange={(e) => setVal(e.target.value)} aria-label="Owner"><option value="">Unassign</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
        {dialog === "status" && <Select value={val} onChange={(e) => setVal(e.target.value)} aria-label="Status"><option value="">Choose…</option>{LEAD_STATUSES.filter((s) => s !== "converted").map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}</Select>}
        {dialog === "tag" && <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. webinar-sept" aria-label="Tag" />}
        {dialog === "assign" && <p className="mt-2 text-xs text-muted">The new owner is notified and gets a first-contact task for unworked leads.</p>}
      </Dialog>
    </>
  );
}
