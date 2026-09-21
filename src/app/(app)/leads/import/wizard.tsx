"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Undo2, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, Confirm, Field, Input, Select } from "@/components/ui";
import { undoImportAction } from "@/app/actions/admin";
import { callAction } from "@/components/action-form";
import { cn, fmtDateTime } from "@/lib/utils";

interface Preview { headers: string[]; sample: string[][]; total: number; mapping: Record<string, string>; fields: { key: string; label: string }[] }
interface Report { total: number; created: number; updated: number; skipped: number; errors: { row: number; message: string; data?: string }[]; batchId?: string; byOwner: Record<string, number>; preview?: Record<string, unknown>[] }
type U = { id: string; name: string; role?: string };

export function ImportWizard({ users, agents, sources }: { users: U[]; agents: U[]; sources: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [o, setO] = React.useState({ duplicateMode: "skip", ownerMode: "round_robin", ownerId: "", sourceId: "", tags: "", createTasks: true, rr: agents.map((a) => a.id) });
  const [dry, setDry] = React.useState<Report | null>(null);
  const [done, setDone] = React.useState<Report | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const upload = async (f: File) => {
    setFile(f); setPreview(null); setDry(null); setDone(null); setBusy("preview");
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/import/preview", { method: "POST", body: fd }); const j = await r.json(); setBusy(null);
    if (!r.ok) { toast.error(j.error?.message ?? "Could not read file"); return; }
    setPreview(j); setMapping(j.mapping);
    if (Object.values(j.mapping as Record<string, string>).includes("owner_email")) setO((x) => ({ ...x, ownerMode: "column" }));
  };
  const run = async (dryRun: boolean) => {
    if (!file) return;
    if (o.ownerMode === "round_robin" && o.rr.length === 0) { toast.error("Select at least one agent for round robin."); return; }
    setBusy(dryRun ? "validate" : "import");
    const fd = new FormData(); fd.append("file", file);
    fd.append("options", JSON.stringify({ mapping, duplicateMode: o.duplicateMode, ownerMode: o.ownerMode, ownerId: o.ownerId || null, roundRobinUsers: o.rr, sourceId: o.sourceId || null, tags: o.tags.split(",").map((t) => t.trim()).filter(Boolean), createTasks: o.createTasks, dryRun }));
    const r = await fetch("/api/import/commit", { method: "POST", body: fd }); const j = await r.json(); setBusy(null);
    if (!r.ok) { toast.error(j.error?.message ?? "Import failed"); return; }
    if (dryRun) setDry(j); else { setDone(j); toast.success(`Imported ${j.created} leads`); router.refresh(); }
  };
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const hasIdentity = ["full_name", "first_name", "last_name", "email", "company_name"].some((k) => mapped.has(k));
  const errCsv = (rep: Report) => "data:text/csv;charset=utf-8," + encodeURIComponent("row,message,data\n" + rep.errors.map((e) => `${e.row},"${e.message.replace(/"/g, '""')}","${(e.data ?? "").replace(/"/g, '""')}"`).join("\n"));

  if (done) return (
    <Card className="p-6">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 text-emerald-600" /><div>
        <h2 className="text-lg font-semibold">Import complete</h2>
        <p className="text-sm text-muted">{done.created} created · {done.updated} updated · {done.skipped} skipped · {done.errors.filter((e) => !/^Skipped|^Duplicate/.test(e.message)).length} errors (of {done.total} rows)</p>
        {Object.keys(done.byOwner).length > 0 && <p className="mt-2 text-sm">Assigned: {Object.entries(done.byOwner).map(([id, n]) => `${users.find((u) => u.id === id)?.name ?? "User"} (${n})`).join(", ")}. Each agent has been notified{o.createTasks ? " and has first-contact tasks" : ""}.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/leads?sort=created&dir=desc"><Button size="sm">View leads</Button></Link>
          {done.errors.length > 0 && <a href={errCsv(done)} download="import-errors.csv"><Button size="sm" variant="secondary"><Download />Error report</Button></a>}
          <Button size="sm" variant="ghost" onClick={() => { setDone(null); setFile(null); setPreview(null); setDry(null); }}>Import another file</Button>
        </div>
      </div></div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Upload file" description="CSV or Excel (.xlsx), up to 10,000 rows / 10 MB. First row must contain column headers." />
        <label className={cn("m-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-6 py-10 text-center hover:border-brand-500 hover:bg-brand-50/40", busy === "preview" && "opacity-60")}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
          {file ? <FileSpreadsheet className="size-8 text-brand-600" /> : <Upload className="size-8 text-slate-400" />}
          <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop your file here or click to browse"}</p>
          <p className="text-xs text-muted">{preview ? `${preview.total.toLocaleString("en-GB")} data rows detected` : "Tip: include an “Owner email” column to assign each lead to a specific agent."}</p>
          <input type="file" accept=".csv,.xlsx,.tsv,.txt" className="sr-only" aria-label="Upload file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
      </Card>

      {preview && (<>
        <Card>
          <CardHeader title="2. Map columns" description="We matched what we could. Unmapped columns are ignored." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-muted"><th className="px-4 py-2">File column</th><th className="px-4 py-2">Sample values</th><th className="px-4 py-2">Maps to</th></tr></thead>
              <tbody>{preview.headers.map((h, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className="px-4 py-2 font-medium">{h}</td>
                  <td className="max-w-[320px] truncate px-4 py-2 text-muted">{preview.sample.map((r) => r[i]).filter(Boolean).slice(0, 3).join(" · ") || "—"}</td>
                  <td className="px-4 py-2"><Select aria-label={`Map ${h}`} value={mapping[String(i)] ?? ""} onChange={(e) => setMapping({ ...mapping, [String(i)]: e.target.value })} className={cn(mapping[String(i)] ? "border-brand-500" : "")}>
                    <option value="">— Don’t import —</option>
                    {preview.fields.map((f) => <option key={f.key} value={f.key} disabled={mapped.has(f.key) && mapping[String(i)] !== f.key}>{f.label}</option>)}
                  </Select></td>
                </tr>))}</tbody>
            </table>
          </div>
          {!hasIdentity && <p className="px-4 py-3 text-sm text-red-600">Map at least a name, email or company column.</p>}
        </Card>

        <Card>
          <CardHeader title="3. Assignment & options" />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <Field label="Assign leads to">
              <Select value={o.ownerMode} onChange={(e) => setO({ ...o, ownerMode: e.target.value })}>
                <option value="round_robin">Round robin across selected agents</option>
                <option value="column" disabled={!mapped.has("owner_email")}>Owner column in the file{mapped.has("owner_email") ? "" : " (map an Owner column)"}</option>
                <option value="user">One specific agent</option>
                <option value="rule">Organisation assignment rule</option>
                <option value="none">Leave unassigned</option>
              </Select>
            </Field>
            {o.ownerMode === "user" && <Field label="Agent"><Select value={o.ownerId} onChange={(e) => setO({ ...o, ownerId: e.target.value })}><option value="">Choose…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
            {o.ownerMode === "round_robin" && (
              <Field label="Agents in rotation">
                <div className="flex flex-wrap gap-2 rounded-lg border border-line p-2">
                  {agents.length === 0 && <span className="text-sm text-muted">No sales reps yet — <Link className="text-brand-600 underline" href="/team">add your team</Link>.</span>}
                  {agents.map((a) => <label key={a.id} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-sm"><input type="checkbox" checked={o.rr.includes(a.id)} onChange={(e) => setO({ ...o, rr: e.target.checked ? [...o.rr, a.id] : o.rr.filter((x) => x !== a.id) })} />{a.name}</label>)}
                </div>
              </Field>
            )}
            <Field label="If a lead already exists (same email/phone)">
              <Select value={o.duplicateMode} onChange={(e) => setO({ ...o, duplicateMode: e.target.value })}>
                <option value="skip">Skip it (recommended)</option><option value="update">Fill empty fields on the existing lead</option><option value="create">Create a duplicate anyway</option>
              </Select>
            </Field>
            <Field label="Lead source" hint="Used when the file has no Source column"><Select value={o.sourceId} onChange={(e) => setO({ ...o, sourceId: e.target.value })}><option value="">CSV import</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Tag every imported lead" hint="Comma-separated, e.g. expo-sept-2026"><Input value={o.tags} onChange={(e) => setO({ ...o, tags: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={o.createTasks} onChange={(e) => setO({ ...o, createTasks: e.target.checked })} /> Create a first-contact task for each assigned lead</label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="secondary" loading={busy === "validate"} disabled={!hasIdentity || !!busy} onClick={() => run(true)}>Validate</Button>
            <Button loading={busy === "import"} disabled={!hasIdentity || !!busy || !dry} onClick={() => run(false)}>Import {preview.total.toLocaleString("en-GB")} rows</Button>
          </div>
        </Card>

        {dry && (
          <Card>
            <CardHeader title="4. Validation result" description="Nothing has been saved yet." />
            <div className="flex flex-wrap gap-2 p-4 text-sm"><Badge tone="green">{dry.created} will be created</Badge>{dry.updated > 0 && <Badge tone="blue">{dry.updated} will update existing</Badge>}<Badge tone="amber">{dry.skipped} skipped</Badge><Badge tone="red">{dry.errors.filter((e) => !/^Skipped|^Duplicate/.test(e.message)).length} errors</Badge></div>
            {dry.preview && dry.preview.length > 0 && (
              <div className="overflow-x-auto border-t border-line"><table className="w-full text-sm"><thead><tr className="text-left text-[11.5px] uppercase text-muted"><th className="px-4 py-2">Row</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Company</th><th className="px-4 py-2">Owner</th></tr></thead>
                <tbody>{dry.preview.map((p, i) => <tr key={i} className="border-t border-line/70">{["row", "name", "email", "phone", "company", "owner"].map((k) => <td key={k} className="px-4 py-1.5">{String(p[k] ?? "—")}</td>)}</tr>)}</tbody></table></div>
            )}
            {dry.errors.length > 0 && (
              <div className="border-t border-line">
                <ul className="max-h-60 divide-y divide-line overflow-y-auto text-sm">{dry.errors.slice(0, 200).map((e, i) => <li key={i} className="px-4 py-1.5"><span className="tabular mr-2 text-muted">Row {e.row}</span>{e.message}</li>)}</ul>
                <div className="px-4 py-2"><a href={errCsv(dry)} download="validation-errors.csv" className="text-sm text-brand-600 hover:underline">Download full error report</a></div>
              </div>
            )}
          </Card>
        )}
      </>)}
    </div>
  );
}

export function ImportHistory({ items }: { items: { id: string; filename: string; status: string; total_rows: number; created_count: number; skipped_count: number; error_count: number; created_at: string; undone_at: string | null; user_name: string | null }[] }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader title="Recent imports" description="Undo archives the leads an import created (converted leads are kept)." />
      <ul className="divide-y divide-line">{items.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <div><p className="font-medium">{b.filename}</p><p className="text-xs text-muted">{b.user_name} · {fmtDateTime(b.created_at)} · {b.created_count} created · {b.skipped_count} skipped/updated · {b.error_count} errors</p></div>
          {b.undone_at ? <Badge>Undone</Badge> : b.status === "completed" && b.created_count > 0 && (
            <Confirm trigger={<Button size="sm" variant="secondary"><Undo2 />Undo</Button>} title={`Undo import of ${b.filename}?`} description={`Archives up to ${b.created_count} leads created by this import and cancels their open tasks.`} danger confirmLabel="Undo import"
              onConfirm={async () => { const r = await callAction(undoImportAction(b.id)); if (r.ok) router.refresh(); }} />
          )}
        </li>))}</ul>
    </Card>
  );
}
