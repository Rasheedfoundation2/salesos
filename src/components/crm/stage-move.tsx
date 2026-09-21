"use client";
import * as React from "react";
import { toast } from "sonner";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { moveStageAction } from "@/app/actions/crm";
import { STAGE_REQUIRABLE_FIELDS } from "@/lib/constants";

export interface MoveRequest { oppId: string; oppName: string; stageId: string; stageName: string; kind: string; contacts?: { id: string; full_name: string }[] }

/** Runs a stage move; when the stage needs data (required fields, lost reason) it asks for it, then retries. */
export function useStageMove(lostReasons: { id: string; name: string }[], onDone?: (ok: boolean, handoverId?: string | null) => void) {
  const [req, setReq] = React.useState<MoveRequest | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const attempt = async (r: MoveRequest, fields?: Record<string, string>) => {
    setBusy(true);
    const res = await moveStageAction(r.oppId, { stage_id: r.stageId, lost_reason: fields?.lost_reason || null, lost_notes: fields?.lost_notes || null, fields: fields ? Object.fromEntries(Object.entries(fields).filter(([k]) => !["lost_reason", "lost_notes"].includes(k))) : undefined });
    setBusy(false);
    if (res.ok) {
      const h = (res.data as { handoverId: string | null } | undefined)?.handoverId;
      toast.success(r.kind === "won" ? `🎉 ${r.oppName} won — handover created` : `Moved to ${r.stageName}`);
      setReq(null); setMissing([]); setVals({}); onDone?.(true, h); return;
    }
    const fe = Object.keys(res.fieldErrors ?? {});
    if (fe.length) { setReq(r); setMissing(fe); if (!req) toast.message(res.error); else toast.error(res.error); }
    else { toast.error(res.error); setReq(null); onDone?.(false); }
  };
  const move = (r: MoveRequest) => { setVals({}); if (r.kind === "lost") { setReq(r); setMissing(["lost_reason"]); return; } void attempt(r); };

  const dialog = (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) { setReq(null); onDone?.(false); } }} title={req?.kind === "lost" ? `Close “${req?.oppName}” as lost` : `Move to ${req?.stageName}`}
      description={req?.kind === "lost" ? "A lost reason is required and feeds the win/loss report." : "This stage requires the following information."} size="sm"
      footer={<><Button variant="secondary" onClick={() => { setReq(null); onDone?.(false); }}>Cancel</Button><Button loading={busy} onClick={() => req && attempt(req, vals)}>{req?.kind === "lost" ? "Mark as lost" : "Save & move"}</Button></>}>
      <div className="space-y-3">
        {missing.map((f) => f === "lost_reason" ? (
          <React.Fragment key={f}>
            <Field label="Lost reason" required><Select value={vals.lost_reason ?? ""} onChange={(e) => setVals({ ...vals, lost_reason: e.target.value })}><option value="">Choose…</option>{lostReasons.map((l) => <option key={l.id}>{l.name}</option>)}</Select></Field>
            <Field label="Notes"><Textarea value={vals.lost_notes ?? ""} onChange={(e) => setVals({ ...vals, lost_notes: e.target.value })} rows={3} /></Field>
          </React.Fragment>
        ) : (
          <Field key={f} label={STAGE_REQUIRABLE_FIELDS[f] ?? f} required>
            {f === "expected_close_date" ? <Input type="date" value={vals[f] ?? ""} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} />
              : f === "contact_id" && req?.contacts?.length ? <Select value={vals[f] ?? ""} onChange={(e) => setVals({ ...vals, [f]: e.target.value })}><option value="">Choose…</option>{req.contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select>
              : f === "contact_id" || f === "company_id" ? <p className="text-sm text-muted">Open the opportunity and link a {f === "contact_id" ? "contact" : "company"} first.</p>
              : <Input inputMode={f === "value" ? "decimal" : undefined} value={vals[f] ?? ""} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} />}
          </Field>
        ))}
      </div>
    </Dialog>
  );
  return { move, dialog, busy };
}
