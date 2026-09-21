import { Forbidden } from "@/components/forbidden";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/services/lookups";
import { listImports } from "@/lib/services/imports";
import { PageHeader } from "@/components/crm/bits";
import { ImportWizard, ImportHistory } from "./wizard";

export const metadata = { title: "Import leads" };

export default async function ImportPage() {
  const ctx = await requireCtx();
  if (!can(ctx.role, "import", "import")) return <Forbidden />;
  const [lookups, history] = await Promise.all([getLookups(ctx), listImports(ctx)]);
  const agents = lookups.users.filter((u) => ["rep", "manager"].includes(u.role));
  return (
    <div className="pb-10">
      <PageHeader breadcrumb={{ href: "/leads", label: "Leads" }} title="Import leads" description="Upload a CSV or Excel (.xlsx) file, map the columns, validate, then import and assign to your sales agents." />
      <div className="space-y-6 px-4 sm:px-6">
        <ImportWizard users={lookups.users} agents={agents} sources={lookups.sources} />
        <ImportHistory items={history} />
      </div>
    </div>
  );
}
