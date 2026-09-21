"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Mail, Plus, UserMinus, UserPlus, Users, UserCheck } from "lucide-react";
import { ActionForm, callAction } from "@/components/action-form";
import { Avatar, Badge, Button, Card, CardHeader, Confirm, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { addUsersAction, createTeamAction, parseUsersAction, revokeInviteAction, setMemberStatusAction, updateMemberAction } from "@/app/actions/admin";
import { INVITABLE_ROLES, ROLE_LABELS, ROLES } from "@/lib/constants";
import type { MemberRow, AddUsersResult } from "@/lib/services/team";
import { money, relTime } from "@/lib/utils";

type Entry = { email: string; name: string | null; role: string; team_id: string | null };

export function TeamClient({ members, teams, invites, canManage, actorRole, selfId, currency }: {
  members: MemberRow[]; teams: { id: string; name: string; members: number }[]; invites: { id: string; email: string; name: string | null; role: string; created_at: string; expires_at: string; team_name: string | null }[];
  canManage: boolean; actorRole: string; selfId: string; currency: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [edit, setEdit] = React.useState<MemberRow | null>(null);
  const [teamName, setTeamName] = React.useState("");
  const active = members.filter((m) => m.status === "active");
  return (
    <div className="space-y-4 px-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="navy">{active.length} active members</Badge><Badge>{active.filter((m) => m.role === "rep").length} sales reps</Badge>{invites.length > 0 && <Badge tone="amber">{invites.length} pending invitations</Badge>}
        {canManage && <Button className="ml-auto" onClick={() => setAdding(true)}><UserPlus />Add users</Button>}
      </div>
      <Card>
        <CardHeader title="Members" description="Open leads/deals show current workload used by workload-based assignment." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-muted"><th className="px-4 py-2">Member</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Territory</th><th className="px-3 py-2 text-right">Open leads</th><th className="px-3 py-2 text-right">Open deals</th><th className="px-3 py-2">Target</th><th className="whitespace-nowrap px-3 py-2">Last sign-in</th><th className="px-3 py-2" /></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.user_id} className={`border-b border-line/70 ${m.status !== "active" ? "opacity-50" : ""}`}>
                <td className="px-4 py-2"><div className="flex items-center gap-2"><Avatar name={m.name} /><div><p className="font-medium">{m.name}{m.user_id === selfId && <span className="ml-1 text-xs text-muted">(you)</span>}</p><p className="text-xs text-muted">{m.email}</p></div></div></td>
                <td className="px-3 py-2">{ROLE_LABELS[m.role]}{m.status !== "active" && <Badge tone="red" className="ml-1">Deactivated</Badge>}{m.must_change_password && <Badge tone="amber" className="ml-1">Temp password</Badge>}</td>
                <td className="px-3 py-2">{m.team_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{m.countries.join(", ") || "—"}</td>
                <td className="tabular px-3 py-2 text-right">{m.open_leads}</td><td className="tabular px-3 py-2 text-right">{m.open_deals}</td>
                <td className="whitespace-nowrap px-3 py-2">{m.monthly_target ? money(m.monthly_target, currency) : "—"}</td>
                <td className="px-3 py-2 text-muted">{m.last_login_at ? relTime(m.last_login_at) : "Never"}</td>
                <td className="px-3 py-2 text-right">{canManage && (actorRole === "owner" || m.role !== "owner") && <Button size="sm" variant="ghost" onClick={() => setEdit(m)}>Manage</Button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
      {canManage && invites.length > 0 && (
        <Card><CardHeader title="Pending invitations" />
          <ul className="divide-y divide-line">{invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div><p className="font-medium">{i.name ? `${i.name} · ` : ""}{i.email}</p><p className="text-xs text-muted">{ROLE_LABELS[i.role]}{i.team_name ? ` · ${i.team_name}` : ""} · sent {relTime(i.created_at)} · expires {relTime(i.expires_at)}</p></div>
              <Button size="sm" variant="ghost" onClick={() => callAction(revokeInviteAction(i.id))}>Revoke</Button>
            </li>))}</ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Teams" description="Use teams for team-based visibility, reporting filters and territories." />
        <div className="flex flex-wrap gap-2 p-4">
          {teams.map((t) => <Badge key={t.id} tone="blue"><Users className="size-3" />{t.name} · {t.members}</Badge>)}
          {canManage && <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await callAction(createTeamAction(teamName)); if (r.ok) setTeamName(""); }}>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" className="h-8 w-44" aria-label="New team name" /><Button size="sm" variant="secondary" type="submit"><Plus />Add team</Button></form>}
        </div>
      </Card>
      {canManage && <AddUsersDialog open={adding} onOpenChange={setAdding} teams={teams} actorRole={actorRole} />}
      {edit && <EditMemberDialog m={edit} onClose={() => setEdit(null)} teams={teams} actorRole={actorRole} selfId={selfId} />}
    </div>
  );
}

function AddUsersDialog({ open, onOpenChange, teams, actorRole }: { open: boolean; onOpenChange: (o: boolean) => void; teams: { id: string; name: string }[]; actorRole: string }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"rows" | "paste">("rows");
  const [mode, setMode] = React.useState<"invite" | "direct">("direct");
  const [rows, setRows] = React.useState<Entry[]>([{ email: "", name: "", role: "rep", team_id: teams[0]?.id ?? null }]);
  const [text, setText] = React.useState(""); const [defRole, setDefRole] = React.useState("rep");
  const [parsed, setParsed] = React.useState<{ line: number; raw: string; data?: Entry; error?: string }[] | null>(null);
  const [result, setResult] = React.useState<AddUsersResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const roles = INVITABLE_ROLES.filter((r) => actorRole === "owner" || r !== "admin" || actorRole === "admin");
  const reset = () => { setRows([{ email: "", name: "", role: "rep", team_id: teams[0]?.id ?? null }]); setText(""); setParsed(null); setResult(null); };
  const submit = async () => {
    let entries: Entry[];
    if (tab === "rows") entries = rows.filter((r) => r.email.trim()).map((r) => ({ ...r, email: r.email.trim().toLowerCase(), name: r.name?.trim() || null }));
    else { if (!parsed) return; entries = parsed.filter((p) => p.data).map((p) => p.data!); }
    if (!entries.length) { toast.error("Add at least one user with an email."); return; }
    setBusy(true); const r = await callAction(addUsersAction(entries, mode)); setBusy(false);
    if (r.ok) { setResult(r.data!); router.refresh(); }
  };
  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success("Copied"); };
  const summary = result ? result.created.map((c) => `${c.name} <${c.email}> — ${ROLE_LABELS[c.role]}${c.tempPassword ? ` — temporary password: ${c.tempPassword}` : c.link ? ` — invitation: ${c.link}` : " — existing account added"}`).join("\n") : "";
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }} size="xl" title="Add users" description="Add one or many people at once — for example your whole sales team before importing leads."
      footer={result ? <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button> : <><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} onClick={submit}>{mode === "direct" ? "Create accounts" : "Send invitations"}</Button></>}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm"><b>{result.created.length}</b> user(s) added{result.skipped.length > 0 && <>, <b>{result.skipped.length}</b> skipped</>}.</p>
          {result.created.some((c) => c.tempPassword) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><KeyRound className="mr-1 inline size-4" />Temporary passwords are shown <b>only once</b>. Share them securely — each user must set their own password at first sign-in.</p>}
          {result.created.some((c) => c.link) && <p className="rounded-lg bg-brand-50 p-3 text-sm text-navy-900"><Mail className="mr-1 inline size-4" />Invitation emails are queued in Settings → Email outbox. Until an email provider is connected, copy the links below and send them directly.</p>}
          <Textarea readOnly value={summary} rows={Math.min(12, result.created.length + 1)} className="font-mono text-xs" aria-label="Credentials" />
          <Button variant="secondary" size="sm" onClick={() => copy(summary)}><Copy />Copy all</Button>
          {result.skipped.length > 0 && <ul className="text-sm text-muted">{result.skipped.map((s) => <li key={s.email}>{s.email} — {s.reason}</li>)}</ul>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {([["direct", UserCheck, "Create accounts now", "Accounts are active immediately with a one-time temporary password. Best when email isn’t set up yet."], ["invite", Mail, "Send invitations", "Each person gets a 7-day invitation link and sets their own password."]] as const).map(([k, I, t, d]) => (
              <button type="button" key={k} onClick={() => setMode(k)} className={`rounded-xl border p-3 text-left ${mode === k ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-line hover:bg-slate-50"}`}>
                <p className="flex items-center gap-2 text-sm font-semibold"><I className="size-4" />{t}</p><p className="mt-0.5 text-xs text-muted">{d}</p>
              </button>))}
          </div>
          <div className="flex gap-1 border-b border-line">{([["rows", "Enter users"], ["paste", "Paste a list / CSV"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand-600 font-medium" : "border-transparent text-muted"}`}>{l}</button>)}</div>
          {tab === "rows" ? (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-12 sm:col-span-4" placeholder="Email" type="email" aria-label={`Email ${i + 1}`} value={r.email} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                  <Input className="col-span-12 sm:col-span-3" placeholder="Full name" aria-label={`Name ${i + 1}`} value={r.name ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Select className="col-span-6 sm:col-span-2" aria-label={`Role ${i + 1}`} value={r.role} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{roles.map((ro) => <option key={ro} value={ro}>{ROLE_LABELS[ro]}</option>)}</Select>
                  <Select className="col-span-5 sm:col-span-2" aria-label={`Team ${i + 1}`} value={r.team_id ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, team_id: e.target.value || null } : x)))}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
                  <Button variant="ghost" size="icon" className="col-span-1" aria-label="Remove row" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}><UserMinus /></Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { email: "", name: "", role: rows[rows.length - 1]?.role ?? "rep", team_id: rows[rows.length - 1]?.team_id ?? null }])}><Plus />Add another</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <Field label="One user per line" hint="Format: email, full name, role, team — role and team are optional. A header row is ignored.">
                  <Textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} className="font-mono text-xs" placeholder={"omar@company.com, Omar Farooq, Sales Rep, Sales\npriya@company.com, Priya Nair\nsara@company.com, Sara Mathews, Marketing"} />
                </Field>
                <Field label="Default role"><Select value={defRole} onChange={(e) => setDefRole(e.target.value)}>{roles.map((ro) => <option key={ro} value={ro}>{ROLE_LABELS[ro]}</option>)}</Select></Field>
              </div>
              <Button variant="secondary" size="sm" onClick={async () => { const r = await parseUsersAction(text, defRole); if (r.ok) setParsed(r.data!); else toast.error(r.error); }}>Check list</Button>
              {parsed && (
                <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">{parsed.map((p) => (
                  <li key={p.line} className="flex items-center justify-between px-3 py-1.5">{p.data ? <span>{p.data.email} · {p.data.name ?? "—"} · {ROLE_LABELS[p.data.role]}{p.data.team_id ? ` · ${teams.find((t) => t.id === p.data!.team_id)?.name}` : ""}</span> : <span className="text-red-600">Line {p.line}: {p.error} <span className="text-muted">({p.raw})</span></span>}{p.data && <Badge tone="green">OK</Badge>}</li>))}</ul>
              )}
            </div>
          )}
          <p className="text-xs text-muted">Roles: Admins manage users and settings · Sales Managers see the whole pipeline and assign leads · Sales Reps see only their own leads and deals · Marketing manage sources/campaigns · Finance see revenue · Viewers read only.</p>
        </div>
      )}
    </Dialog>
  );
}

function EditMemberDialog({ m, onClose, teams, actorRole, selfId }: { m: MemberRow; onClose: () => void; teams: { id: string; name: string }[]; actorRole: string; selfId: string }) {
  const router = useRouter();
  const roles = ROLES.filter((r) => actorRole === "owner" || r !== "owner");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Manage ${m.name}`} description={m.email} size="md">
      <ActionForm action={updateMemberAction} onSuccess={() => { onClose(); router.refresh(); }}>
        {({ pending, errors }) => (<div className="space-y-3">
          <input type="hidden" name="user_id" value={m.user_id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" name="role" error={errors.role}><Select id="role" name="role" defaultValue={m.role}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
            <Field label="Team" name="team_id"><Select id="team_id" name="team_id" defaultValue={m.team_id ?? ""}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Job title" name="title"><Input id="title" name="title" defaultValue={m.title ?? ""} /></Field>
            <Field label="Monthly revenue target" name="monthly_target" error={errors.monthly_target}><Input id="monthly_target" name="monthly_target" inputMode="decimal" defaultValue={m.monthly_target ? String(Number(m.monthly_target)) : ""} /></Field>
            <Field label="Discount approval limit (%)" name="max_discount_pct" error={errors.max_discount_pct}><Input id="max_discount_pct" name="max_discount_pct" inputMode="decimal" defaultValue={String(Number(m.max_discount_pct))} /></Field>
            <Field label="Assignment weight" name="assignment_weight" hint="Used by weighted round robin (0 = never)"><Input id="assignment_weight" name="assignment_weight" inputMode="numeric" defaultValue={String(m.assignment_weight)} /></Field>
          </div>
          <Field label="Territory (countries)" name="countries" hint="Comma-separated — used by country-based assignment"><Input id="countries" name="countries" defaultValue={m.countries.join(", ")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accepts_leads" defaultChecked={m.accepts_leads} /> Receives automatically assigned leads</label>
          <div className="flex items-center justify-between border-t border-line pt-4">
            {m.user_id !== selfId ? (m.status === "active"
              ? <Confirm danger trigger={<Button type="button" variant="ghost" className="text-red-600">Deactivate</Button>} title={`Deactivate ${m.name}?`} description="They lose access immediately. Their records stay assigned to them until you reassign them." confirmLabel="Deactivate" onConfirm={async () => { const r = await callAction(setMemberStatusAction(m.user_id, "deactivated")); if (r.ok) { onClose(); router.refresh(); } }} />
              : <Button type="button" variant="ghost" onClick={async () => { const r = await callAction(setMemberStatusAction(m.user_id, "active")); if (r.ok) { onClose(); router.refresh(); } }}>Reactivate</Button>) : <span />}
            <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={pending}>Save</Button></div>
          </div>
        </div>)}
      </ActionForm>
    </Dialog>
  );
}
