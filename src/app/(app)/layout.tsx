import { requireCtx, getSessionUser } from "@/lib/auth/context";
import { NAV, term } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { AppShell } from "@/components/shell/app-shell";
import { listNotifications } from "@/lib/services/settings";
import { recentRecords } from "@/lib/services/search";
import { ForcePasswordChange } from "./force-password";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireCtx();
  const su = (await getSessionUser())!;
  if (ctx.user.must_change_password) return <ForcePasswordChange name={ctx.user.name} />;
  const t = ctx.org.terminology;
  const nav = NAV.filter((n) => !n.module || can(ctx.role, n.module, "view"))
    .filter((n) => n.href !== "/team" || ["owner", "admin", "manager"].includes(ctx.role))
    .map((n) => ({ href: n.href, label: n.termKey ? term(t, n.termKey, n.label) : n.label, icon: n.icon, phase: n.phase }));
  const creates = [
    can(ctx.role, "leads", "create") && { label: `New ${term(t, "lead", "lead").toLowerCase()}`, href: "/leads?create=1" },
    can(ctx.role, "contacts", "create") && { label: "New contact", href: "/contacts?create=1" },
    can(ctx.role, "companies", "create") && { label: "New company", href: "/companies?create=1" },
    can(ctx.role, "opportunities", "create") && { label: `New ${term(t, "opportunity", "opportunity").toLowerCase()}`, href: "/opportunities?create=1" },
    can(ctx.role, "tasks", "create") && { label: "New task", href: "/tasks?create=1" },
    can(ctx.role, "import", "import") && { label: "Import leads (CSV / Excel)", href: "/leads/import" },
  ].filter(Boolean) as { label: string; href: string }[];
  const [notifications, recent] = await Promise.all([listNotifications(ctx), recentRecords(ctx)]);
  return (
    <AppShell nav={nav} creates={creates} notifications={notifications} recent={recent}
      user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role, isPlatformAdmin: ctx.user.is_platform_admin }}
      org={{ id: ctx.orgId, name: ctx.org.name, plan: ctx.org.plan_code }} memberships={su.memberships.filter((m) => m.org_status === "active")}>
      {children}
    </AppShell>
  );
}
