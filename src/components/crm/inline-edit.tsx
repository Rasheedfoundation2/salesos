"use client";
import * as React from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { updateLeadAction, updateOpportunityAction } from "@/app/actions/crm";
import { cn } from "@/lib/utils";

type Kind = "text" | "number" | "select" | "date" | "datetime" | "textarea" | "email" | "tags";
const ACTIONS = { lead: updateLeadAction, opportunity: updateOpportunityAction };

/** Click-to-edit field with autosave on blur/Enter and Escape to cancel. */
export function InlineEdit({ entity, id, field, label, value, display, kind = "text", options, disabled, className }: {
  entity: keyof typeof ACTIONS; id: string; field: string; label: string; value: string | number | string[] | null | undefined; display?: React.ReactNode;
  kind?: Kind; options?: { value: string; label: string }[]; disabled?: boolean; className?: string;
}) {
  const initial = Array.isArray(value) ? value.join(", ") : value == null ? "" : kind === "date" ? String(value).slice(0, 10) : kind === "datetime" ? toLocal(String(value)) : String(value);
  const [editing, setEditing] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setV(initial), [initial]);
  const save = async () => {
    if (v === initial) { setEditing(false); return; }
    setSaving(true);
    const r = await ACTIONS[entity](id, { [field]: kind === "tags" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v });
    setSaving(false);
    if (r.ok) { setEditing(false); toast.success(`${label} saved`); }
    else { toast.error(r.error); }
  };
  const common = { autoFocus: true, "aria-label": label, disabled: saving, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") { setV(initial); setEditing(false); } if (e.key === "Enter" && kind !== "textarea") { e.preventDefault(); void save(); } } };
  const input = "w-full rounded-md border border-brand-500 bg-white px-2 py-1 text-sm ring-2 ring-brand-100 outline-none";
  return (
    <div className={cn("group min-w-0", className)}>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {editing ? (
          <div className="flex items-start gap-1">
            {kind === "select" ? <select {...common} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} className={input}><option value="">—</option>{options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : kind === "textarea" ? <textarea {...common} value={v} onChange={(e) => setV(e.target.value)} rows={4} className={input} />
              : <input {...common} type={kind === "number" ? "text" : kind === "datetime" ? "datetime-local" : kind === "tags" ? "text" : kind} inputMode={kind === "number" ? "decimal" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} className={input} />}
            {kind === "textarea" && <><button onClick={save} aria-label="Save" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="size-4" /></button><button onClick={() => { setV(initial); setEditing(false); }} aria-label="Cancel" className="rounded p-1 text-muted hover:bg-slate-100"><X className="size-4" /></button></>}
          </div>
        ) : (
          <button type="button" disabled={disabled} onClick={() => setEditing(true)} className={cn("flex w-full items-center gap-1 rounded-md px-1 py-0.5 -mx-1 text-left", !disabled && "hover:bg-slate-100")} aria-label={`Edit ${label}`}>
            <span className={cn("min-w-0 flex-1 break-words", !initial && "text-slate-400")}>{display ?? (initial || "—")}</span>
            {!disabled && <Pencil className="size-3 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100" />}
          </button>
        )}
      </dd>
    </div>
  );
}
function toLocal(iso: string) { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
