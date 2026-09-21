"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { ActionForm, callAction } from "@/components/action-form";
import { Badge, Button, Card, CardHeader, Confirm, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { addListItemAction, createApiKeyAction, createPipelineAction, deleteStageAction, moveStagePosAction, removeListItemAction, renamePipelineAction, revokeApiKeyAction, saveStageAction, updateFxAction, updateOrgAction, updateScoringAction } from "@/app/actions/admin";
import { CURRENCIES } from "@/lib/constants";
import type { Pipeline, Stage } from "@/lib/services/lookups";
import type { ScoringConfig } from "@/lib/scoring";
import { fmtDateTime, money, titleCase } from "@/lib/utils";

const TZ = ["Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Europe/London", "Europe/Paris", "America/New_York", "UTC"];

export function OrgForm({ org, settings, terminology }: { org: { name: string; currency: string; timezone: string; date_format: string }; settings: Record<string, any>; terminology: Record<string, string> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <ActionForm action={updateOrgAction} className="space-y-4">
      {({ pending, errors }) => (<>
        <Card><CardHeader title="General" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Organisation name" name="name" error={errors.name}><Input id="name" name="name" defaultValue={org.name} /></Field>
            <Field label="Base currency" name="currency" hint="Dashboards convert every deal to this currency."><Select id="currency" name="currency" defaultValue={org.currency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Timezone" name="timezone" error={errors.timezone}><Select id="timezone" name="timezone" defaultValue={org.timezone}>{TZ.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Date format" name="date_format"><Select id="date_format" name="date_format" defaultValue={org.date_format}><option value="dd/MM/yyyy">dd/MM/yyyy</option><option value="MM/dd/yyyy">MM/dd/yyyy</option><option value="yyyy-MM-dd">yyyy-MM-dd</option></Select></Field>
          </div>
        </Card>
        <Card><CardHeader title="Lead handling" description="Applies to manual entry, imports using the organisation rule, and the API." />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Assignment method" name="assignment_method"><Select id="assignment_method" name="assignment_method" defaultValue={settings.assignment?.method ?? "round_robin"}>
              <option value="round_robin">Round robin (sales reps)</option><option value="weighted">Weighted round robin</option><option value="country">By country / territory</option><option value="workload">Lowest workload</option><option value="manual">Manual — leave unassigned</option></Select></Field>
            <Field label="First-response SLA (minutes)" name="sla_minutes"><Input id="sla_minutes" name="sla_minutes" inputMode="numeric" defaultValue={settings.sla_minutes ?? 15} /></Field>
            <Field label="Sales rep visibility" name="rep_visibility" hint="Enforced in the database (row-level security)."><Select id="rep_visibility" name="rep_visibility" defaultValue={settings.rep_visibility ?? "own"}><option value="own">Own records only</option><option value="team">Own team’s records</option></Select></Field>
            <Field label="High-value deal alert threshold" name="high_value_threshold" hint={`In ${org.currency}. Managers are notified.`}><Input id="high_value_threshold" name="high_value_threshold" inputMode="decimal" defaultValue={settings.high_value_threshold ?? 100000} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="auto_first_task" defaultChecked={settings.auto_first_task !== false} /> Create a first-contact task automatically when a lead is assigned</label>
          </div>
        </Card>
        <Card><CardHeader title="Terminology" description="Rename records to match your industry — e.g. Lead → Enquiry, Buyer or Investor." />
          <div className="grid gap-3 p-4 sm:grid-cols-4">
            {[["lead", "Lead"], ["leads", "Leads"], ["opportunity", "Opportunity"], ["opportunities", "Opportunities"], ["contact", "Contact"], ["contacts", "Contacts"], ["company", "Company"], ["companies", "Companies"]].map(([k, d]) => (
              <Field key={k} label={d!} name={`term_${k}`}><Input id={`term_${k}`} name={`term_${k}`} defaultValue={terminology[k!] ?? ""} placeholder={d} /></Field>))}
          </div>
        </Card>
        <div className="flex justify-end"><Button type="submit" loading={pending}>Save settings</Button></div>
      </>)}
    </ActionForm>
  );
}

export function PipelinesEditor({ pipelines, fields, roles }: { pipelines: Pipeline[]; fields: Record<string, string>; roles: { value: string; label: string }[] }) {
  const [editing, setEditing] = React.useState<{ pipelineId: string; stage: Partial<Stage> } | null>(null);
  const [name, setName] = React.useState("");
  return (
    <div className="space-y-4">
      {pipelines.map((p) => (
        <Card key={p.id}>
          <CardHeader title={<span className="flex items-center gap-2">{p.name}{p.is_default && <Badge tone="blue">Default</Badge>}</span>}
            action={<div className="flex gap-1">{!p.is_default && <Button size="sm" variant="ghost" onClick={() => callAction(renamePipelineAction(p.id, p.name, true))}>Make default</Button>}
              <Button size="sm" variant="secondary" onClick={() => setEditing({ pipelineId: p.id, stage: { name: "", probability: 50, color: "#6366f1", kind: "open", required_fields: [], restricted_roles: [] } })}><Plus />Stage</Button></div>} />
          <ul className="divide-y divide-line">{p.stages.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: s.color }} />
              <button className="min-w-[160px] text-left font-medium hover:text-brand-600" onClick={() => setEditing({ pipelineId: p.id, stage: s })}>{s.name}</button>
              <span className="tabular w-12 text-muted">{s.probability}%</span>
              <Badge tone={s.kind === "won" ? "green" : s.kind === "lost" ? "red" : s.kind === "nurture" ? "violet" : "slate"}>{titleCase(s.kind)}</Badge>
              {s.required_fields.length > 0 && <span className="text-xs text-muted">Requires: {s.required_fields.map((f) => fields[f]).join(", ")}</span>}
              {s.max_days && <span className="text-xs text-muted">Max {s.max_days} days</span>}
              {s.restricted_roles.length > 0 && <span className="text-xs text-amber-700">Restricted: {s.restricted_roles.join(", ")}</span>}
              <span className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => callAction(moveStagePosAction(p.id, s.id, -1))}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === p.stages.length - 1} onClick={() => callAction(moveStagePosAction(p.id, s.id, 1))}><ArrowDown /></Button>
                <Confirm danger trigger={<Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`}><Trash2 /></Button>} title={`Delete stage “${s.name}”?`} description="Only possible when no opportunities are in this stage." confirmLabel="Delete" onConfirm={() => callAction(deleteStageAction(s.id))} />
              </span>
            </li>))}</ul>
        </Card>
      ))}
      <Card className="flex flex-wrap items-center gap-2 p-4"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New pipeline name, e.g. Real Estate Sales" className="max-w-sm" aria-label="New pipeline name" /><Button variant="secondary" onClick={async () => { const r = await callAction(createPipelineAction(name)); if (r.ok) setName(""); }}><Plus />Create pipeline</Button><span className="text-xs text-muted">New pipelines start with the default 12 stages.</span></Card>
      {editing && <StageDialog {...editing} onClose={() => setEditing(null)} fields={fields} roles={roles} />}
    </div>
  );
}

function StageDialog({ pipelineId, stage, onClose, fields, roles }: { pipelineId: string; stage: Partial<Stage>; onClose: () => void; fields: Record<string, string>; roles: { value: string; label: string }[] }) {
  const [s, setS] = React.useState({ name: stage.name ?? "", probability: String(stage.probability ?? 0), color: stage.color ?? "#64748b", kind: stage.kind ?? "open", required_fields: stage.required_fields ?? [], restricted_roles: stage.restricted_roles ?? [], max_days: stage.max_days ? String(stage.max_days) : "", entry_criteria: stage.entry_criteria ?? "", exit_criteria: stage.exit_criteria ?? "" });
  const [busy, setBusy] = React.useState(false);
  const toggle = (k: "required_fields" | "restricted_roles", v: string) => setS({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={stage.id ? `Edit stage: ${stage.name}` : "New stage"} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); const r = await callAction(saveStageAction(pipelineId, stage.id ?? null, s)); setBusy(false); if (r.ok) onClose(); }}>Save stage</Button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" className="sm:col-span-2"><Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Probability %"><Input inputMode="numeric" value={s.probability} onChange={(e) => setS({ ...s, probability: e.target.value })} /></Field>
          <Field label="Colour"><Input type="color" value={s.color} onChange={(e) => setS({ ...s, color: e.target.value })} className="p-1" /></Field>
          <Field label="Type"><Select value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option><option value="nurture">Nurture</option></Select></Field>
          <Field label="Max days in stage"><Input inputMode="numeric" value={s.max_days} onChange={(e) => setS({ ...s, max_days: e.target.value })} /></Field>
        </div>
        <Field label="Required to enter this stage"><div className="flex flex-wrap gap-2">{Object.entries(fields).map(([k, l]) => <label key={k} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-sm"><input type="checkbox" checked={s.required_fields.includes(k)} onChange={() => toggle("required_fields", k)} />{l}</label>)}</div></Field>
        <Field label="Roles NOT allowed to move deals into this stage"><div className="flex flex-wrap gap-2">{roles.map((r) => <label key={r.value} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-sm"><input type="checkbox" checked={s.restricted_roles.includes(r.value)} onChange={() => toggle("restricted_roles", r.value)} />{r.label}</label>)}</div></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Entry criteria"><Textarea rows={2} value={s.entry_criteria} onChange={(e) => setS({ ...s, entry_criteria: e.target.value })} /></Field><Field label="Exit criteria"><Textarea rows={2} value={s.exit_criteria} onChange={(e) => setS({ ...s, exit_criteria: e.target.value })} /></Field></div>
      </div>
    </Dialog>
  );
}

type Lists = { sources: { id: string; name: string; channel: string; active: boolean; leads: number }[]; campaigns: { id: string; name: string; status: string; budget: string | null; currency: string; source_name: string | null; leads: number }[]; lostReasons: { id: string; name: string }[]; products: { id: string; name: string; category: string | null; billing_type: string; unit_price: string; currency: string; tax_rate: string; active: boolean }[] };
export function ListsEditor({ lists, currency }: { lists: Lists; currency: string }) {
  const Add = ({ table, placeholder, extra }: { table: "lead_sources" | "campaigns" | "lost_reasons" | "products"; placeholder: string; extra?: (v: Record<string, string>, set: (v: Record<string, string>) => void) => React.ReactNode }) => {
    const [v, setV] = React.useState<Record<string, string>>({});
    return <form className="flex flex-wrap gap-2 border-t border-line p-3" onSubmit={async (e) => { e.preventDefault(); const r = await callAction(addListItemAction(table, v)); if (r.ok) setV({}); }}>
      <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={placeholder} className="h-8 max-w-xs" aria-label={placeholder} />{extra?.(v, setV)}<Button size="sm" variant="secondary" type="submit"><Plus />Add</Button></form>;
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader title="Lead sources" />
        <ul className="divide-y divide-line text-sm">{lists.sources.map((s) => <li key={s.id} className={`flex items-center justify-between px-4 py-1.5 ${s.active ? "" : "opacity-40"}`}><span>{s.name} <span className="text-xs text-muted">· {s.channel} · {s.leads} leads</span></span>{s.active && <Button size="icon" variant="ghost" aria-label={`Deactivate ${s.name}`} onClick={() => callAction(removeListItemAction("lead_sources", s.id))}><Trash2 /></Button>}</li>)}</ul>
        <Add table="lead_sources" placeholder="New source" /></Card>
      <Card><CardHeader title="Campaigns" />
        <ul className="divide-y divide-line text-sm">{lists.campaigns.map((c) => <li key={c.id} className="flex items-center justify-between px-4 py-1.5"><span>{c.name} <span className="text-xs text-muted">· {c.source_name ?? "—"} · {c.leads} leads{c.budget ? ` · ${money(c.budget, c.currency)}` : ""}</span>{c.status !== "active" && <Badge className="ml-1">{c.status}</Badge>}</span>{c.status === "active" && <Button size="icon" variant="ghost" aria-label={`Archive ${c.name}`} onClick={() => callAction(removeListItemAction("campaigns", c.id))}><Trash2 /></Button>}</li>)}</ul>
        <Add table="campaigns" placeholder="New campaign" extra={(v, set) => <Input value={v.budget ?? ""} onChange={(e) => set({ ...v, budget: e.target.value })} placeholder={`Budget (${currency})`} className="h-8 w-32" aria-label="Budget" />} /></Card>
      <Card><CardHeader title="Lost reasons" />
        <ul className="divide-y divide-line text-sm">{lists.lostReasons.map((l) => <li key={l.id} className="flex items-center justify-between px-4 py-1.5">{l.name}<Button size="icon" variant="ghost" aria-label={`Remove ${l.name}`} onClick={() => callAction(removeListItemAction("lost_reasons", l.id))}><Trash2 /></Button></li>)}</ul>
        <Add table="lost_reasons" placeholder="New lost reason" /></Card>
      <Card><CardHeader title="Products & services" />
        <ul className="divide-y divide-line text-sm">{lists.products.map((p) => <li key={p.id} className={`flex items-center justify-between px-4 py-1.5 ${p.active ? "" : "opacity-40"}`}><span>{p.name} <span className="text-xs text-muted">· {money(p.unit_price, p.currency)} · {titleCase(p.billing_type)}</span></span>{p.active && <Button size="icon" variant="ghost" aria-label={`Deactivate ${p.name}`} onClick={() => callAction(removeListItemAction("products", p.id))}><Trash2 /></Button>}</li>)}</ul>
        <Add table="products" placeholder="New product/service" extra={(v, set) => <><Input value={v.unit_price ?? ""} onChange={(e) => set({ ...v, unit_price: e.target.value })} placeholder="Price" className="h-8 w-24" aria-label="Price" /><Select value={v.billing_type ?? "one_time"} onChange={(e) => set({ ...v, billing_type: e.target.value })} className="h-8 w-32" aria-label="Billing type"><option value="one_time">One-time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></Select></>} /></Card>
    </div>
  );
}

export function ScoringForm({ cfg, labels, currency }: { cfg: ScoringConfig; labels: Record<string, string>; currency: string }) {
  const [w, setW] = React.useState(cfg.weights);
  const total = Object.values(w).reduce((a, b) => a + Number(b || 0), 0);
  return (
    <ActionForm action={updateScoringAction} className="space-y-4">
      {({ pending }) => (<>
        <Card><CardHeader title="Scoring dimensions" description={`Weights total ${total} points. Scores are normalised to 0–100 and every lead shows why it scored what it did.`} />
          <div className="grid gap-3 p-4 sm:grid-cols-3">{Object.entries(labels).map(([k, l]) => <Field key={k} label={l} name={`w_${k}`}><Input id={`w_${k}`} name={`w_${k}`} inputMode="numeric" value={String(w[k as keyof typeof w])} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) || 0 })} /></Field>)}</div></Card>
        <Card><CardHeader title="Fit criteria" />
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <Field label="Target industries" name="target_industries" hint="One per line"><Textarea id="target_industries" name="target_industries" rows={6} defaultValue={cfg.target_industries.join("\n")} /></Field>
            <Field label="Core services" name="core_services" hint="One per line"><Textarea id="core_services" name="core_services" rows={6} defaultValue={cfg.core_services.join("\n")} /></Field>
            <Field label="Target countries" name="target_countries" hint="One per line"><Textarea id="target_countries" name="target_countries" rows={6} defaultValue={cfg.target_countries.join("\n")} /></Field>
            <Field label={`Minimum budget (${currency})`} name="budget_min"><Input id="budget_min" name="budget_min" inputMode="decimal" defaultValue={cfg.budget_min} /></Field>
            <Field label={`Ideal budget (${currency})`} name="budget_ideal"><Input id="budget_ideal" name="budget_ideal" inputMode="decimal" defaultValue={cfg.budget_ideal} /></Field>
          </div></Card>
        <Card><CardHeader title="Categories" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Field label="Hot from" name="t_hot"><Input id="t_hot" name="t_hot" inputMode="numeric" defaultValue={cfg.thresholds.hot} /></Field>
            <Field label="Warm from" name="t_warm"><Input id="t_warm" name="t_warm" inputMode="numeric" defaultValue={cfg.thresholds.warm} /></Field>
            <Field label="Nurture from" name="t_nurture"><Input id="t_nurture" name="t_nurture" inputMode="numeric" defaultValue={cfg.thresholds.nurture} /></Field>
          </div></Card>
        <div className="flex justify-end"><Button type="submit" loading={pending}>Save scoring model</Button></div>
      </>)}
    </ActionForm>
  );
}

export function FxForm({ fx, base }: { fx: { currency: string; rate_to_base: string; updated_at: string }[]; base: string }) {
  return (
    <Card><CardHeader title="Exchange rates" description={`How many ${base} one unit of each currency is worth. Used to convert deals for dashboards and forecasts.`} />
      <ActionForm action={updateFxAction} className="p-4">
        {({ pending }) => (<><div className="grid gap-3 sm:grid-cols-5">{CURRENCIES.map((c) => { const r = fx.find((f) => f.currency === c); return <Field key={c} label={`1 ${c} =`} name={c} hint={r ? `Updated ${fmtDateTime(r.updated_at)}` : undefined}><Input id={c} name={c} defaultValue={r ? Number(r.rate_to_base) : ""} disabled={c === base} inputMode="decimal" /></Field>; })}</div>
          <div className="mt-4 flex justify-end"><Button type="submit" loading={pending}>Save rates</Button></div></>)}
      </ActionForm>
    </Card>
  );
}

export function ApiKeys({ keys, appUrl }: { keys: { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string }[]; appUrl: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(""); const [secret, setSecret] = React.useState<string | null>(null);
  const curl = `curl -X POST ${appUrl}/api/v1/leads \\\n  -H "Authorization: Bearer <API_KEY>" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: form-12345" \\\n  -d '{"full_name":"Jane Doe","email":"jane@acme.com","phone":"+971501234567","company_name":"Acme","source":"Website form","services":["SEO"]}'`;
  return (
    <div className="space-y-4">
      <Card><CardHeader title="API keys" description="Keys are scoped to this organisation and stored hashed. Use them for website forms, Zapier, Make, n8n or custom integrations." />
        <ul className="divide-y divide-line text-sm">{keys.map((k) => <li key={k.id} className="flex items-center justify-between px-4 py-2"><span><KeyRound className="mr-1 inline size-4 text-muted" />{k.name} <span className="font-mono text-xs text-muted">{k.prefix}…</span> <span className="text-xs text-muted">· created {fmtDateTime(k.created_at)} · {k.last_used_at ? `last used ${fmtDateTime(k.last_used_at)}` : "never used"}</span></span>{k.revoked_at ? <Badge tone="red">Revoked</Badge> : <Button size="sm" variant="ghost" onClick={() => callAction(revokeApiKeyAction(k.id))}>Revoke</Button>}</li>)}
          {keys.length === 0 && <li className="px-4 py-4 text-muted">No API keys yet.</li>}</ul>
        <form className="flex gap-2 border-t border-line p-3" onSubmit={async (e) => { e.preventDefault(); const r = await callAction(createApiKeyAction(name)); if (r.ok) { setSecret(r.data!); setName(""); router.refresh(); } }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Website form" className="h-8 max-w-xs" aria-label="Key name" /><Button size="sm" variant="secondary" type="submit"><Plus />Create key</Button></form>
      </Card>
      <Card><CardHeader title="Capture leads via API / webhook" description="POST creates a lead and runs the full capture workflow: validation, duplicate check, scoring, assignment, first task and notification." />
        <pre className="overflow-x-auto bg-navy-950 p-4 text-xs text-slate-100">{curl}</pre>
        <p className="px-4 py-3 text-sm text-muted">Full reference: <a className="text-brand-600 underline" href="/api/v1/openapi.json" target="_blank">OpenAPI specification</a>. Duplicates return <code>409</code> with the matches unless <code>allow_duplicate: true</code> is sent.</p>
      </Card>
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)} title="Copy your API key" description="This is the only time the full key is shown." size="sm" footer={<Button onClick={() => setSecret(null)}>Done</Button>}>
        <div className="flex gap-2"><Input readOnly value={secret ?? ""} className="font-mono text-xs" aria-label="API key" /><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(secret ?? ""); toast.success("Copied"); }}><Copy /></Button></div>
      </Dialog>
    </div>
  );
}
