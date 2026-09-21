import { Forbidden } from "@/components/forbidden";
import { Download } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listActivities } from "@/lib/services/activities";
import { getLookups } from "@/lib/services/lookups";
import { PageHeader } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { ActivityList } from "@/components/crm/record";
import { Card } from "@/components/ui";
import { buttonVariants } from "@/components/ui/variants";
import { ACTIVITY_LABELS, ACTIVITY_TYPES } from "@/lib/constants";

export const metadata = { title: "Activities" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ActivitiesPage(props: PageProps<"/activities">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "activities", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const [items, lookups] = await Promise.all([listActivities(ctx, { owner: one(sp.owner), type: one(sp.type), from: one(sp.from), to: one(sp.to), limit: 200 }), getLookups(ctx)]);
  return (
    <div className="pb-10">
      <PageHeader title="Activities" description="Calls, emails, WhatsApp messages, meetings and notes across all records" actions={can(ctx.role, "export", "export") && <a href="/api/export/activities" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download />Export CSV</a>} />
      <FilterBar hideSearch filters={[
        { key: "type", label: "Type", options: ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_LABELS[t]! })) },
        ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] }] : []),
      ]} />
      <div className="px-4 sm:px-6"><Card><ActivityList items={items} showRelated /></Card>{items.length === 200 && <p className="mt-2 text-xs text-muted">Showing the latest 200 activities — narrow the filters or export for more.</p>}</div>
    </div>
  );
}
