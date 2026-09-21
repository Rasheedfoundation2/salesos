import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listTasks } from "@/lib/services/activities";
import { getLookups } from "@/lib/services/lookups";
import { PageHeader } from "@/components/crm/bits";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NewTask, TaskListClient } from "./client";

export const metadata = { title: "Tasks" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TasksPage(props: PageProps<"/tasks">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "tasks", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const manager = ["owner", "admin", "manager"].includes(ctx.role);
  const view = one(sp.view) ?? "mine";
  const [items, lookups] = await Promise.all([listTasks(ctx, { view, owner: one(sp.owner), q: one(sp.q) }), getLookups(ctx)]);
  const views = [["mine", "My open tasks"], ["today", "Due today"], ["overdue", "Overdue"], ["upcoming", "Next 7 days"], ...(manager ? [["team", "Team tasks"], ["unowned", "Without owner"]] : []), ["completed", "Completed"]];
  return (
    <div className="pb-10">
      <PageHeader title="Tasks" description="Every lead and deal should have a dated next action." actions={can(ctx.role, "tasks", "create") && <NewTask users={lookups.users} canAssign={manager} autoOpen={one(sp.create) === "1"} />} />
      <div className="flex gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
        {views.map(([k, l]) => <Link key={k} href={`/tasks?view=${k}`} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-sm", view === k ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-muted hover:text-ink")}>{l}</Link>)}
        <Link href="/opportunities?stale=no_next" className="whitespace-nowrap rounded-full border border-dashed border-amber-300 px-3 py-1 text-sm text-amber-800 hover:bg-amber-50">Deals without next action →</Link>
      </div>
      <div className="px-4 sm:px-6"><Card><TaskListClient items={items} users={lookups.users} canAssign={manager} /></Card></div>
    </div>
  );
}
