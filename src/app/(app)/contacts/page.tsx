import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { Download, UserRound } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listContacts, listCompanies } from "@/lib/services/accounts";
import { getLookups } from "@/lib/services/lookups";
import { PageHeader, Pagination, th, td } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { Badge, EmptyState } from "@/components/ui";
import { buttonVariants } from "@/components/ui/variants";
import { term } from "@/lib/nav";
import { relTime, titleCase } from "@/lib/utils";
import { NewContactButton } from "./client";

export const metadata = { title: "Contacts" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ContactsPage(props: PageProps<"/contacts">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "contacts", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const [data, lookups, companies] = await Promise.all([
    listContacts(ctx, { q: one(sp.q), owner: one(sp.owner), company: one(sp.company), consent: one(sp.consent), archived: one(sp.archived), page: Number(one(sp.page) ?? 1) }),
    getLookups(ctx), listCompanies(ctx, { per: 200 }),
  ]);
  const label = term(ctx.org.terminology, "contacts", "Contacts");
  return (
    <div className="pb-10">
      <PageHeader title={label} description={`${data.total.toLocaleString("en-GB")} people across your accounts`} actions={<>
        {can(ctx.role, "contacts", "export") && <a href="/api/export/contacts" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download />Export CSV</a>}
        {can(ctx.role, "contacts", "create") && <NewContactButton companies={companies.rows.map((c) => ({ id: c.id, name: c.name }))} users={lookups.users} canAssign={can(ctx.role, "contacts", "assign")} autoOpen={one(sp.create) === "1"} />}
      </>} />
      <FilterBar searchPlaceholder="Name, email, phone, company…" filters={[
        { key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] },
        { key: "company", label: "Company", options: companies.rows.map((c) => ({ value: c.id, label: c.name })) },
        { key: "consent", label: "Consent", options: ["unknown", "granted", "denied", "unsubscribed"].map((c) => ({ value: c, label: titleCase(c) })) },
        ...(can(ctx.role, "contacts", "archive") ? [{ key: "archived", label: "Archived", options: [{ value: "1", label: "Show archived" }] }] : []),
      ]} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        {data.rows.length === 0 ? <EmptyState icon={<UserRound />} title="No contacts found" description="Contacts are created when you convert leads, or add them directly." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-separate border-spacing-0">
            <thead><tr><th className={th}>Name</th><th className={th}>Company</th><th className={th}>Email</th><th className={th}>Phone</th><th className={th}>Role</th><th className={th}>Consent</th><th className={th}>Owner</th><th className={th}>Added</th></tr></thead>
            <tbody>{data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/80">
                <td className={td}><Link href={`/contacts/${c.id}`} className="font-medium hover:text-brand-600">{c.full_name}</Link><p className="text-xs text-muted">{c.job_title ?? ""}</p></td>
                <td className={td}>{c.company_id ? <Link className="hover:text-brand-600" href={`/companies/${c.company_id}`}>{c.company_name}</Link> : "—"}</td>
                <td className={td}>{c.email ?? "—"}</td><td className={td}>{c.phone ?? "—"}</td>
                <td className={td}>{c.decision_role ? titleCase(c.decision_role) : "—"}</td>
                <td className={td}><Badge tone={c.consent_status === "granted" ? "green" : c.consent_status === "unknown" ? "slate" : "red"}>{titleCase(c.consent_status)}</Badge></td>
                <td className={td}>{c.owner_name ?? "—"}</td><td className={`${td} text-muted`}>{relTime(c.created_at)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={data.page} per={data.per} total={data.total} basePath="/contacts" params={sp} />
      </div>
    </div>
  );
}
