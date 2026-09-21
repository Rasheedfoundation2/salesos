import { Forbidden } from "@/components/forbidden";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listInvitations, listMembers, listTeams } from "@/lib/services/team";
import { PageHeader } from "@/components/crm/bits";
import { TeamClient } from "./client";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireCtx();
  if (!["owner", "admin", "manager"].includes(ctx.role)) return <Forbidden />;
  const manage = can(ctx.role, "team", "manage");
  const [members, teams, invites] = await Promise.all([listMembers(ctx), listTeams(ctx), manage ? listInvitations(ctx) : Promise.resolve([])]);
  return (
    <div className="pb-10">
      <PageHeader title="Team" description={manage ? "Add your sales agents in bulk, set roles, targets, territories and lead-assignment weights." : "Your organisation’s members and workload."} />
      <TeamClient members={members} teams={teams} invites={invites} canManage={manage} actorRole={ctx.role} selfId={ctx.userId} currency={ctx.org.currency} />
    </div>
  );
}
