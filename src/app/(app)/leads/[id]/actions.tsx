"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRightLeft, ChevronDown, GitMerge, Lightbulb, MoreHorizontal, UserPlus } from "lucide-react";
import { Button, Card, Confirm, Dialog, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger, Select } from "@/components/ui";
import { bulkLeadsAction, convertLeadAction, mergeLeadsAction, updateLeadAction } from "@/app/actions/crm";
import { callAction } from "@/components/action-form";
import { CURRENCIES, LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import type { Nba } from "@/lib/nba";
import { cn } from "@/lib/utils";

export function LeadActions(p: { id: string; status: string; ownerId: string | null; users: { id: string; name: string }[]; canAssign: boolean; canEdit: boolean; canArchive: boolean;
  pipelines: { id: string; name: string }[]; companies: { id: string; name: string }[]; companyName: string | null; value: string | null; currency: string; archived: boolean; convertedOpp: string | null }) {
  const router = useRouter();
  const [convert, setConvert] = React.useState(false);
  const [assign, setAssign] = React.useState(false);
  const [owner, setOwner] = React.useState(p.ownerId ?? "");
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({ company_id: "", create_opportunity: true, opportunity_name: "", pipeline_id: p.pipelines[0]?.id ?? "", value: p.value ? String(Number(p.value)) : "", currency: p.currency, expected_close_date: "" });
  const match = p.companies.find((c) => p.companyName && c.name.toLowerCase() === p.companyName.toLowerCase());
  if (p.archived) return p.canArchive ? <Button variant="secondary" size="sm" onClick={async () => { await callAction(bulkLeadsAction([p.id], { kind: "restore" }), "Lead restored"); router.refresh(); }}>Restore lead</Button> : null;
  return (
    <>
      {p.convertedOpp && <Link href={`/opportunities/${p.convertedOpp}`}><Button size="sm" variant="secondary">Open opportunity</Button></Link>}
      {p.canEdit && p.status !== "converted" && <Button size="sm" onClick={() => { setF((x) => ({ ...x, company_id: match?.id ?? "" })); setConvert(true); }}><ArrowRightLeft />Convert</Button>}
      {p.canEdit && p.status !== "converted" && (
        <Menu>
          <MenuTrigger asChild><Button size="sm" variant="secondary">Status <ChevronDown /></Button></MenuTrigger>
          <MenuContent>{LEAD_STATUSES.filter((s) => s !== "converted" && s !== p.status).map((s) => <MenuItem key={s} onSelect={() => void callAction(updateLeadAction(p.id, { status: s }))}>{LEAD_STATUS_LABELS[s]}</MenuItem>)}</MenuContent>
        </Menu>
      )}
      {(p.canAssign || p.canArchive) && (
        <Menu>
          <MenuTrigger asChild><Button size="icon" variant="secondary" aria-label="More actions"><MoreHorizontal /></Button></MenuTrigger>
          <MenuContent>
            {p.canAssign && <MenuItem onSelect={() => setAssign(true)}><UserPlus />Assign / transfer</MenuItem>}
            {p.canArchive && <MenuItem danger onSelect={async () => { const r = await callAction(bulkLeadsAction([p.id], { kind: "archive" }), "Lead archived"); if (r.ok) router.push("/leads"); }}><Archive />Archive lead</MenuItem>}
          </MenuContent>
        </Menu>
      )}
      <Dialog open={assign} onOpenChange={setAssign} title="Assign lead" size="sm"
        footer={<><Button variant="secondary" onClick={() => setAssign(false)}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); const r = await callAction(updateLeadAction(p.id, { owner_id: owner || null }), "Lead reassigned"); setBusy(false); if (r.ok) setAssign(false); }}>Assign</Button></>}>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="">Unassigned</option>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <p className="mt-2 text-xs text-muted">Transfers are recorded in the audit log and the new owner is notified.</p>
      </Dialog>
      <Dialog open={convert} onOpenChange={setConvert} title="Convert lead" description="Creates (or links) a contact and company, and optionally an opportunity. Activity history moves with it." size="md"
        footer={<><Button variant="secondary" onClick={() => setConvert(false)}>Cancel</Button><Button loading={busy} onClick={async () => {
          setBusy(true);
          const r = await callAction(convertLeadAction(p.id, { company_id: f.company_id || null, create_opportunity: f.create_opportunity, opportunity_name: f.opportunity_name || undefined, pipeline_id: f.pipeline_id, value: f.value ? Number(f.value) : null, currency: f.currency, expected_close_date: f.expected_close_date || null }));
          setBusy(false);
          if (r.ok) { setConvert(false); const d = r.data as { opportunityId: string | null; contactId: string }; router.push(d.opportunityId ? `/opportunities/${d.opportunityId}` : `/contacts/${d.contactId}`); }
        }}>Convert</Button></>}>
        <div className="space-y-3">
          <Field label="Company"><Select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}><option value="">{p.companyName ? `Create or match “${p.companyName}”` : "No company"}</option>{p.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.create_opportunity} onChange={(e) => setF({ ...f, create_opportunity: e.target.checked })} /> Create an opportunity</label>
          {f.create_opportunity && (<>
            <Field label="Opportunity name" hint="Leave blank for an automatic name"><Input value={f.opportunity_name} onChange={(e) => setF({ ...f, opportunity_name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pipeline"><Select value={f.pipeline_id} onChange={(e) => setF({ ...f, pipeline_id: e.target.value })}>{p.pipelines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field label="Expected close"><Input type="date" value={f.expected_close_date} onChange={(e) => setF({ ...f, expected_close_date: e.target.value })} /></Field>
              <Field label="Value"><Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
              <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
          </>)}
        </div>
      </Dialog>
    </>
  );
}

export function NbaCard({ nba }: { nba: Nba }) {
  const tone = { red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-brand-100 bg-brand-50 text-navy-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }[nba.tone];
  return (
    <Card className={cn("border p-4", tone)}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80"><Lightbulb className="size-3.5" />Next best action</p>
      <p className="mt-1 font-semibold">{nba.title}</p>
      <p className="mt-0.5 text-sm opacity-90">{nba.detail}</p>
    </Card>
  );
}

export function MergeButton({ primary, secondary, label }: { primary: string; secondary: string; label: string }) {
  const router = useRouter();
  return <Confirm trigger={<Button size="sm" variant="secondary"><GitMerge />Merge</Button>} title={`Merge “${label}” into this lead?`}
    description="Empty fields are filled from the duplicate, its activities and tasks move here, and the duplicate is archived. This is recorded in the audit log."
    confirmLabel="Merge" onConfirm={async () => { const r = await callAction(mergeLeadsAction(primary, secondary)); if (r.ok) router.refresh(); }} />;
}
