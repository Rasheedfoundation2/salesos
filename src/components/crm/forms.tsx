"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { createLeadAction, createOpportunityAction, logActivityAction, saveCompanyAction, saveContactAction, saveTaskAction } from "@/app/actions/crm";
import { ACTIVITY_LABELS, ACTIVITY_TYPES, COMPANY_SIZES, CURRENCIES, LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES } from "@/lib/constants";
import { DEFAULT_SCORING } from "@/lib/scoring";
import type { Lookups } from "@/lib/services/lookups";
import type { DuplicateMatch } from "@/lib/services/leads";
import { titleCase } from "@/lib/utils";

type L = Pick<Lookups, "sources" | "campaigns" | "users" | "teams" | "pipelines">;
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Oman", "Bahrain", "Kuwait", "United Kingdom", "India", "United States", "Other"];
const DUP_HREF: Record<string, string> = { lead: "/leads/", contact: "/contacts/", company: "/companies/" };

export function Datalist({ id, values }: { id: string; values: string[] }) {
  return <datalist id={id}>{values.map((v) => <option key={v} value={v} />)}</datalist>;
}

// ───────── Lead ─────────
export function LeadFormDialog({ open, onOpenChange, lookups, canAssign, currency }: { open: boolean; onOpenChange: (o: boolean) => void; lookups: L; canAssign: boolean; currency: string }) {
  const router = useRouter();
  const [dups, setDups] = React.useState<DuplicateMatch[] | null>(null);
  const [force, setForce] = React.useState(false);
  React.useEffect(() => { if (!open) { setDups(null); setForce(false); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New lead" description="Validation, duplicate check, assignment, scoring and first follow-up happen automatically." size="lg">
      <ActionForm action={createLeadAction} successToast={false} onSuccess={(r) => {
        const d = r.data as { id?: string; duplicates?: DuplicateMatch[] };
        if (d?.duplicates?.length) { setDups(d.duplicates); return; }
        onOpenChange(false); router.push(`/leads/${d.id}`);
      }}>
        {({ pending, errors }) => (<div className="space-y-4">
          {dups && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-amber-900"><AlertTriangle className="size-4" /> Possible duplicates found</p>
              <ul className="mt-2 space-y-1">{dups.map((d) => <li key={d.entity + d.id}><Link className="text-brand-700 underline" href={DUP_HREF[d.entity] + d.id} target="_blank">{d.label}</Link> <span className="text-amber-800">— {d.reason} ({d.entity})</span></li>)}</ul>
              <label className="mt-2 flex items-center gap-2 text-amber-900"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Create anyway</label>
            </div>
          )}
          <input type="hidden" name="allow_duplicate" value={force ? "1" : "0"} />
          <Grid>
            <Field label="First name" name="first_name" error={errors.first_name}><Input id="first_name" name="first_name" autoFocus /></Field>
            <Field label="Last name" name="last_name" error={errors.last_name ?? errors.full_name}><Input id="last_name" name="last_name" /></Field>
            <Field label="Company" name="company_name" error={errors.company_name}><Input id="company_name" name="company_name" /></Field>
            <Field label="Job title" name="job_title"><Input id="job_title" name="job_title" /></Field>
            <Field label="Email" name="email" error={errors.email}><Input id="email" name="email" type="email" /></Field>
            <Field label="Mobile" name="phone" error={errors.phone} hint="Include country code, e.g. +971 50 123 4567"><Input id="phone" name="phone" type="tel" /></Field>
            <Field label="WhatsApp" name="whatsapp" error={errors.whatsapp}><Input id="whatsapp" name="whatsapp" type="tel" /></Field>
            <Field label="Country" name="country"><Select id="country" name="country" defaultValue=""><option value="">—</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="City" name="city"><Input id="city" name="city" /></Field>
            <Field label="Website" name="website"><Input id="website" name="website" placeholder="https://" /></Field>
            <Field label="Industry" name="industry"><Input id="industry" name="industry" list="industries" /><Datalist id="industries" values={DEFAULT_SCORING.target_industries} /></Field>
            <Field label="Company size" name="company_size"><Select id="company_size" name="company_size" defaultValue=""><option value="">—</option>{COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Lead source" name="source_id"><Select id="source_id" name="source_id" defaultValue=""><option value="">Manual entry</option>{lookups.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Campaign" name="campaign_id"><Select id="campaign_id" name="campaign_id" defaultValue=""><option value="">—</option>{lookups.campaigns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Required services" name="services" hint="Comma-separated"><Input id="services" name="services" list="svc" placeholder="SEO, Website Development" /><Datalist id="svc" values={DEFAULT_SCORING.core_services} /></Field>
            <Field label="Estimated budget" name="estimated_budget" error={errors.estimated_budget}>
              <div className="flex gap-2"><Input id="estimated_budget" name="estimated_budget" inputMode="decimal" /><Select name="currency" defaultValue={currency} className="w-24" aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
            </Field>
            <Field label="Timeframe" name="timeframe"><Select id="timeframe" name="timeframe" defaultValue=""><option value="">—</option><option>Immediate</option><option>0-3 months</option><option>3-6 months</option><option>6-12 months</option></Select></Field>
            <Field label="Priority" name="priority"><Select id="priority" name="priority" defaultValue="medium">{PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select></Field>
            {canAssign && <Field label="Owner" name="owner_id" hint="Leave blank to apply the assignment rule"><Select id="owner_id" name="owner_id" defaultValue=""><option value="">Auto-assign</option>{lookups.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
            <Field label="Tags" name="tags" hint="Comma-separated"><Input id="tags" name="tags" /></Field>
          </Grid>
          <Field label="Notes" name="notes"><Textarea id="notes" name="notes" rows={3} /></Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>{dups && force ? "Create anyway" : "Create lead"}</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

// ───────── Company ─────────
export function CompanyFormDialog({ open, onOpenChange, initial, users, canAssign }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Record<string, unknown>; users: { id: string; name: string }[]; canAssign: boolean }) {
  const router = useRouter(); const v = (k: string) => (initial?.[k] as string) ?? "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? "Edit company" : "New company"} size="lg">
      <ActionForm action={saveCompanyAction} onSuccess={(r) => { onOpenChange(false); if (!initial) router.push(`/companies/${r.data}`); else router.refresh(); }}>
        {({ pending, errors }) => (<div className="space-y-4">
          {initial && <input type="hidden" name="id" value={v("id")} />}
          <Grid>
            <Field label="Company name" name="name" error={errors.name} required><Input id="name" name="name" defaultValue={v("name")} autoFocus /></Field>
            <Field label="Website" name="website"><Input id="website" name="website" defaultValue={v("website")} placeholder="https://" /></Field>
            <Field label="Industry" name="industry"><Input id="industry" name="industry" list="c-ind" defaultValue={v("industry")} /><Datalist id="c-ind" values={DEFAULT_SCORING.target_industries} /></Field>
            <Field label="Company size" name="company_size"><Select id="company_size" name="company_size" defaultValue={v("company_size")}><option value="">—</option>{COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Annual revenue range" name="revenue_range"><Select id="revenue_range" name="revenue_range" defaultValue={v("revenue_range")}><option value="">—</option>{["< 1M", "1M–10M", "10M–50M", "50M–250M", "250M+"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Phone" name="phone" error={errors.phone}><Input id="phone" name="phone" defaultValue={v("phone")} /></Field>
            <Field label="Email" name="email" error={errors.email}><Input id="email" name="email" defaultValue={v("email")} /></Field>
            <Field label="LinkedIn" name="linkedin_url"><Input id="linkedin_url" name="linkedin_url" defaultValue={v("linkedin_url")} /></Field>
            <Field label="Country" name="country"><Select id="country" name="country" defaultValue={v("country")}><option value="">—</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="City" name="city"><Input id="city" name="city" defaultValue={v("city")} /></Field>
            <Field label="Client status" name="client_status"><Select id="client_status" name="client_status" defaultValue={v("client_status") || "prospect"}>{["prospect", "active_client", "former_client", "partner"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="Health" name="health"><Select id="health" name="health" defaultValue={v("health")}><option value="">—</option>{["healthy", "watch", "at_risk"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            {canAssign && <Field label="Account owner" name="owner_id"><Select id="owner_id" name="owner_id" defaultValue={v("owner_id")}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
            <Field label="Tags" name="tags" hint="Comma-separated"><Input id="tags" name="tags" defaultValue={((initial?.tags as string[]) ?? []).join(", ")} /></Field>
          </Grid>
          <Field label="Billing address" name="billing_address"><Input id="billing_address" name="billing_address" defaultValue={v("billing_address")} /></Field>
          <Field label="Notes" name="notes"><Textarea id="notes" name="notes" defaultValue={v("notes")} /></Field>
          {errors.name?.[0] === "Possible duplicate" && <label className="flex items-center gap-2 text-sm text-amber-800"><input type="checkbox" name="allow_duplicate" value="1" /> This is a different company — create anyway</label>}
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>Save company</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

// ───────── Contact ─────────
export function ContactFormDialog({ open, onOpenChange, initial, companies, users, canAssign, companyId }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Record<string, unknown>; companies: { id: string; name: string }[]; users: { id: string; name: string }[]; canAssign: boolean; companyId?: string }) {
  const router = useRouter(); const v = (k: string) => (initial?.[k] as string) ?? "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? "Edit contact" : "New contact"} size="lg">
      <ActionForm action={saveContactAction} onSuccess={(r) => { onOpenChange(false); if (!initial && !companyId) router.push(`/contacts/${r.data}`); else router.refresh(); }}>
        {({ pending, errors }) => (<div className="space-y-4">
          {initial && <input type="hidden" name="id" value={v("id")} />}
          <Grid>
            <Field label="First name" name="first_name" error={errors.first_name} required><Input id="first_name" name="first_name" defaultValue={v("first_name")} autoFocus /></Field>
            <Field label="Last name" name="last_name"><Input id="last_name" name="last_name" defaultValue={v("last_name")} /></Field>
            <Field label="Company" name="company_id"><Select id="company_id" name="company_id" defaultValue={companyId ?? v("company_id")}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Job title" name="job_title"><Input id="job_title" name="job_title" defaultValue={v("job_title")} /></Field>
            <Field label="Email" name="email" error={errors.email}><Input id="email" name="email" type="email" defaultValue={v("email")} /></Field>
            <Field label="Phone" name="phone" error={errors.phone}><Input id="phone" name="phone" defaultValue={v("phone")} /></Field>
            <Field label="Mobile" name="mobile" error={errors.mobile}><Input id="mobile" name="mobile" defaultValue={v("mobile")} /></Field>
            <Field label="WhatsApp" name="whatsapp" error={errors.whatsapp}><Input id="whatsapp" name="whatsapp" defaultValue={v("whatsapp")} /></Field>
            <Field label="Decision role" name="decision_role"><Select id="decision_role" name="decision_role" defaultValue={v("decision_role")}><option value="">—</option>{["decision_maker", "influencer", "champion", "user", "gatekeeper", "finance", "other"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="Preferred channel" name="preferred_channel"><Select id="preferred_channel" name="preferred_channel" defaultValue={v("preferred_channel")}><option value="">—</option>{["email", "phone", "whatsapp", "linkedin", "meeting"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="Country" name="country"><Select id="country" name="country" defaultValue={v("country")}><option value="">—</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Consent" name="consent_status"><Select id="consent_status" name="consent_status" defaultValue={v("consent_status") || "unknown"}>{["unknown", "granted", "denied", "unsubscribed"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="LinkedIn" name="linkedin_url"><Input id="linkedin_url" name="linkedin_url" defaultValue={v("linkedin_url")} /></Field>
            {canAssign && <Field label="Owner" name="owner_id"><Select id="owner_id" name="owner_id" defaultValue={v("owner_id")}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
          </Grid>
          <Field label="Notes" name="notes"><Textarea id="notes" name="notes" defaultValue={v("notes")} /></Field>
          {errors.email?.[0] === "Possible duplicate" && <label className="flex items-center gap-2 text-sm text-amber-800"><input type="checkbox" name="allow_duplicate" value="1" /> Create anyway</label>}
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>Save contact</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

// ───────── Opportunity ─────────
export function OpportunityFormDialog({ open, onOpenChange, lookups, companies, contacts, defaults, canAssign, currency }: {
  open: boolean; onOpenChange: (o: boolean) => void; lookups: L; companies: { id: string; name: string }[]; contacts: { id: string; full_name: string; company_id: string | null }[];
  defaults?: { company_id?: string; contact_id?: string; pipeline_id?: string }; canAssign: boolean; currency: string;
}) {
  const router = useRouter();
  const [pipelineId, setPipelineId] = React.useState(defaults?.pipeline_id ?? lookups.pipelines[0]?.id ?? "");
  const [companyId, setCompanyId] = React.useState(defaults?.company_id ?? "");
  const stages = lookups.pipelines.find((p) => p.id === pipelineId)?.stages.filter((s) => s.kind === "open" || s.kind === "nurture") ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New opportunity" size="lg">
      <ActionForm action={createOpportunityAction} onSuccess={(r) => { onOpenChange(false); router.push(`/opportunities/${r.data}`); }}>
        {({ pending, errors }) => (<div className="space-y-4">
          {errors._ && <p className="text-sm text-red-600">{errors._[0]}</p>}
          <Field label="Opportunity name" name="name" error={errors.name} required><Input id="name" name="name" autoFocus placeholder="e.g. Palm Crest — Q4 campaign" /></Field>
          <Grid>
            <Field label="Company" name="company_id" error={errors.company_id}><Select id="company_id" name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Primary contact" name="contact_id" error={errors.contact_id}><Select id="contact_id" name="contact_id" defaultValue={defaults?.contact_id ?? ""}><option value="">—</option>{contacts.filter((c) => !companyId || c.company_id === companyId).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select></Field>
            <Field label="Pipeline" name="pipeline_id"><Select id="pipeline_id" name="pipeline_id" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>{lookups.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Stage" name="stage_id" error={errors.stage_id}><Select id="stage_id" name="stage_id" key={pipelineId}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>)}</Select></Field>
            <Field label="Deal value" name="value" error={errors.value}>
              <div className="flex gap-2"><Input id="value" name="value" inputMode="decimal" /><Select name="currency" defaultValue={currency} className="w-24" aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
            </Field>
            <Field label="Expected close date" name="expected_close_date" error={errors.expected_close_date}><Input id="expected_close_date" name="expected_close_date" type="date" /></Field>
            <Field label="Services" name="services" hint="Comma-separated"><Input id="services" name="services" list="o-svc" /><Datalist id="o-svc" values={DEFAULT_SCORING.core_services} /></Field>
            <Field label="Source" name="source_id"><Select id="source_id" name="source_id" defaultValue=""><option value="">—</option>{lookups.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            {canAssign && <Field label="Owner" name="owner_id"><Select id="owner_id" name="owner_id" defaultValue=""><option value="">Me</option>{lookups.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
            <Field label="Next action" name="next_action"><Input id="next_action" name="next_action" /></Field>
          </Grid>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>Create opportunity</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

// ───────── Activity ─────────
export function ActivityFormDialog({ open, onOpenChange, related, defaultType = "call" }: { open: boolean; onOpenChange: (o: boolean) => void; related: Partial<Record<"lead_id" | "contact_id" | "company_id" | "opportunity_id", string>>; defaultType?: string }) {
  const router = useRouter();
  const [type, setType] = React.useState(defaultType);
  React.useEffect(() => { if (open) setType(defaultType); }, [open, defaultType]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Log activity" size="md">
      <ActionForm action={logActivityAction} onSuccess={() => { onOpenChange(false); router.refresh(); }}>
        {({ pending, errors }) => (<div className="space-y-3">
          {Object.entries(related).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Activity type">
            {ACTIVITY_TYPES.map((t) => <button type="button" key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`rounded-full border px-2.5 py-1 text-xs ${type === t ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white hover:bg-slate-50"}`}>{ACTIVITY_LABELS[t]}</button>)}
          </div>
          <input type="hidden" name="type" value={type} />
          <Field label="Subject" name="subject" error={errors.subject} required><Input id="subject" name="subject" defaultValue={type === "call" ? "Call" : ""} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Direction" name="direction"><Select id="direction" name="direction" defaultValue="outbound"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></Select></Field>
            <Field label="Outcome" name="outcome"><Input id="outcome" name="outcome" list="outcomes" /><Datalist id="outcomes" values={["Connected — interested", "Connected — not interested", "No answer", "Left voicemail", "Replied", "Meeting booked", "Wrong number"]} /></Field>
            <Field label="Duration (min)" name="duration_min"><Input id="duration_min" name="duration_min" inputMode="numeric" /></Field>
          </div>
          <Field label="When" name="occurred_at"><Input id="occurred_at" name="occurred_at" type="datetime-local" /></Field>
          <Field label="Notes" name="body"><Textarea id="body" name="body" rows={4} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Next action" name="next_action"><Input id="next_action" name="next_action" placeholder="e.g. Send proposal" /></Field>
            <Field label="Follow-up on" name="follow_up_at" hint="Creates a follow-up task"><Input id="follow_up_at" name="follow_up_at" type="datetime-local" /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>Log activity</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

// ───────── Task ─────────
export function TaskFormDialog({ open, onOpenChange, related, users, canAssign, initial }: { open: boolean; onOpenChange: (o: boolean) => void; related?: Partial<Record<"lead_id" | "contact_id" | "company_id" | "opportunity_id", string>>; users: { id: string; name: string }[]; canAssign: boolean; initial?: Record<string, unknown> }) {
  const router = useRouter(); const v = (k: string) => (initial?.[k] as string) ?? "";
  const local = (iso: string) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? "Edit task" : "New task"} size="md">
      <ActionForm action={saveTaskAction} onSuccess={() => { onOpenChange(false); router.refresh(); }}>
        {({ pending, errors }) => (<div className="space-y-3">
          {initial && <input type="hidden" name="id" value={v("id")} />}
          {related && Object.entries(related).map(([k, val]) => val && <input key={k} type="hidden" name={k} value={val} />)}
          <Field label="Title" name="title" error={errors.title} required><Input id="title" name="title" defaultValue={v("title")} autoFocus /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due" name="due_at" error={errors.due_at}><Input id="due_at" name="due_at" type="datetime-local" defaultValue={local(v("due_at"))} /></Field>
            <Field label="Priority" name="priority"><Select id="priority" name="priority" defaultValue={v("priority") || "medium"}>{PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</Select></Field>
            <Field label="Reminder" name="reminder_at"><Input id="reminder_at" name="reminder_at" type="datetime-local" defaultValue={local(v("reminder_at"))} /></Field>
            <Field label="Repeat" name="recurrence"><Select id="recurrence" name="recurrence" defaultValue={v("recurrence")}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
            {canAssign && <Field label="Owner" name="owner_id"><Select id="owner_id" name="owner_id" defaultValue={v("owner_id")}><option value="">Me</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
          </div>
          <Field label="Description" name="description"><Textarea id="description" name="description" defaultValue={v("description")} /></Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending}>Save task</Button></div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}

export { LEAD_STATUSES, LEAD_STATUS_LABELS };
