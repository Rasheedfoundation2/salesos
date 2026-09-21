"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { useStageMove } from "@/components/crm/stage-move";
import { updateHandoverAction } from "@/app/actions/crm";
import type { Stage } from "@/lib/services/lookups";
import { cn, money, titleCase } from "@/lib/utils";

export function StagePath({ stages, current, oppId, oppName, disabled, lostReasons, role, contacts }: { stages: Stage[]; current: string; oppId: string; oppName: string; disabled: boolean; lostReasons: { id: string; name: string }[]; role: string; contacts: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const { move, dialog, busy } = useStageMove(lostReasons, () => router.refresh());
  const idx = stages.findIndex((s) => s.id === current);
  const cur = stages[idx];
  return (
    <>
      <div className="flex overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-card scrollbar-thin" role="list" aria-label="Pipeline stages">
        {stages.map((s, i) => {
          const done = cur?.kind === "open" ? i < idx : cur?.kind === "won" && s.kind === "open";
          const active = s.id === current;
          return (
            <button key={s.id} role="listitem" disabled={disabled || active || busy} onClick={() => { if (s.restricted_roles.includes(role)) { toast.error(`Your role cannot move deals into ${s.name}.`); return; } move({ oppId, oppName, stageId: s.id, stageName: s.name, kind: s.kind, contacts }); }}
              title={`${s.name} · ${s.probability}%`}
              className={cn("flex shrink-0 grow items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                active ? "font-semibold text-white" : done ? "bg-emerald-50 text-emerald-800" : "text-muted hover:bg-slate-100", !disabled && !active && "cursor-pointer")}
              style={active ? { background: s.color } : undefined}>
              {done && <Check className="size-3" />}{s.name}
            </button>
          );
        })}
      </div>
      {dialog}
    </>
  );
}

export function HandoverForm({ h, oppId, users, canEdit, currency }: { h: Record<string, any>; oppId: string; users: { id: string; name: string }[]; canEdit: boolean; currency: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const router = useRouter();
  const T = (name: string, label: string) => <Field label={label} name={name}><Textarea id={name} name={name} defaultValue={h[name] ?? ""} rows={3} disabled={!canEdit} /></Field>;
  return (
    <Card>
      <CardHeader title="Client handover" description={`Created automatically on Closed Won. Commercial value locked at ${money(h.commercial_value, h.currency ?? currency)} · Services: ${(h.services ?? []).join(", ") || "—"}`} />
      <ActionForm action={updateHandoverAction} className="space-y-4 p-4" onSuccess={() => router.refresh()}>
        {({ pending }) => (<>
          <input type="hidden" name="opportunity_id" value={oppId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery owner" name="delivery_owner_id"><Select id="delivery_owner_id" name="delivery_owner_id" defaultValue={h.delivery_owner_id ?? ""} disabled={!canEdit}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Status" name="status"><Select id="status" name="status" defaultValue={h.status} disabled={!canEdit}>{["pending", "accepted", "in_onboarding", "complete"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="Payment schedule / terms" name="payment_terms"><Input id="payment_terms" name="payment_terms" defaultValue={h.payment_terms ?? ""} disabled={!canEdit} placeholder="e.g. 50% upfront, 50% on launch" /></Field>
            <Field label="Deadlines" name="deadlines"><Input id="deadlines" name="deadlines" defaultValue={h.deadlines ?? ""} disabled={!canEdit} /></Field>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {T("deliverables", "Deliverables")}{T("client_expectations", "Client expectations")}{T("commitments", "Important commitments made in sales")}{T("stakeholders", "Primary stakeholders")}
            {T("assets", "Brand / project assets & access requirements")}{T("risks", "Risks")}
          </div>
          {T("sales_notes", "Sales notes")}
          {canEdit && <div className="flex justify-end"><Button type="submit" loading={pending}>Save handover</Button></div>}
        </>)}
      </ActionForm>
    </Card>
  );
}
