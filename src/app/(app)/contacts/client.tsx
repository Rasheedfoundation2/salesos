"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus } from "lucide-react";
import { Button, Confirm } from "@/components/ui";
import { ContactFormDialog, CompanyFormDialog, OpportunityFormDialog } from "@/components/crm/forms";
import { archiveAction } from "@/app/actions/crm";
import { callAction } from "@/components/action-form";
import type { Lookups } from "@/lib/services/lookups";

type U = { id: string; name: string };
export function NewContactButton({ companies, users, canAssign, autoOpen, companyId, label = "New contact", variant = "primary" }: { companies: U[]; users: U[]; canAssign: boolean; autoOpen?: boolean; companyId?: string; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = React.useState(!!autoOpen); const router = useRouter();
  return <><Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus />{label}</Button>
    <ContactFormDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && autoOpen) router.replace("/contacts"); }} companies={companies} users={users} canAssign={canAssign} companyId={companyId} /></>;
}
export function EditContactButton({ initial, companies, users, canAssign }: { initial: Record<string, unknown>; companies: U[]; users: U[]; canAssign: boolean }) {
  const [open, setOpen] = React.useState(false);
  return <><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Pencil />Edit</Button><ContactFormDialog open={open} onOpenChange={setOpen} initial={initial} companies={companies} users={users} canAssign={canAssign} /></>;
}
export function NewCompanyButton({ users, canAssign, autoOpen }: { users: U[]; canAssign: boolean; autoOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!autoOpen); const router = useRouter();
  return <><Button size="sm" onClick={() => setOpen(true)}><Plus />New company</Button><CompanyFormDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && autoOpen) router.replace("/companies"); }} users={users} canAssign={canAssign} /></>;
}
export function EditCompanyButton({ initial, users, canAssign }: { initial: Record<string, unknown>; users: U[]; canAssign: boolean }) {
  const [open, setOpen] = React.useState(false);
  return <><Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Pencil />Edit</Button><CompanyFormDialog open={open} onOpenChange={setOpen} initial={initial} users={users} canAssign={canAssign} /></>;
}
export function ArchiveButton({ entity, id, label }: { entity: "companies" | "contacts" | "opportunities"; id: string; label: string }) {
  const router = useRouter();
  return <Confirm danger trigger={<Button size="sm" variant="secondary"><Archive />Archive</Button>} title={`Archive ${label}?`} description="Archived records are hidden from lists but kept for reporting and can be restored by an admin." confirmLabel="Archive"
    onConfirm={async () => { const r = await callAction(archiveAction(entity, id)); if (r.ok) router.push(`/${entity}`); }} />;
}
export function NewOpportunityButton({ lookups, companies, contacts, defaults, canAssign, currency, autoOpen, variant = "primary" }: { lookups: Lookups; companies: U[]; contacts: { id: string; full_name: string; company_id: string | null }[]; defaults?: { company_id?: string; contact_id?: string }; canAssign: boolean; currency: string; autoOpen?: boolean; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = React.useState(!!autoOpen); const router = useRouter();
  return <><Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus />New opportunity</Button>
    <OpportunityFormDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && autoOpen) router.replace("/opportunities"); }} lookups={lookups} companies={companies} contacts={contacts} defaults={defaults} canAssign={canAssign} currency={currency} /></>;
}
