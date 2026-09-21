"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Building, Check, ChevronDown, Clock, HelpCircle, LogOut, Menu as MenuIcon, Plus, Search, UserCog } from "lucide-react";
import { Avatar, Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui";
import { Sidebar, type SideItem } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";
import { markReadAction } from "@/app/actions/shell";
import { relTime } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/constants";

export interface ShellProps {
  nav: SideItem[]; creates: { label: string; href: string }[];
  user: { name: string; email: string; role: string; isPlatformAdmin: boolean };
  org: { id: string; name: string; plan: string };
  memberships: { org_id: string; org_name: string; role: string }[];
  notifications: { items: { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]; unread: number };
  recent: { entity_type: string; entity_id: string; label: string }[];
  children: React.ReactNode;
}

const REC_HREF: Record<string, string> = { lead: "/leads/", contact: "/contacts/", company: "/companies/", opportunity: "/opportunities/" };

export function AppShell(p: ShellProps) {
  const [mobile, setMobile] = React.useState(false);
  const [palette, setPalette] = React.useState(false);
  const router = useRouter();
  return (
    <div className="flex min-h-screen">
      <Sidebar items={p.nav} orgName={p.org.name} mobileOpen={mobile} onClose={() => setMobile(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><MenuIcon /></Button>
          <button onClick={() => setPalette(true)} className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted hover:border-slate-300" aria-label="Search">
            <Search className="size-4" /><span className="flex-1 truncate text-left">Search or jump to…</span><kbd className="hidden rounded border border-line bg-white px-1.5 text-[11px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Menu>
              <MenuTrigger asChild><Button size="sm" variant="accent" aria-label="Quick create"><Plus /><span className="hidden sm:inline">Create</span></Button></MenuTrigger>
              <MenuContent>{p.creates.map((c) => <MenuItem key={c.href} onSelect={() => router.push(c.href)}><Plus />{c.label}</MenuItem>)}</MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Recent records"><Clock /></Button></MenuTrigger>
              <MenuContent className="w-72">
                <MenuLabel>Recently viewed</MenuLabel>
                {p.recent.length === 0 && <p className="px-2.5 py-3 text-sm text-muted">Records you open appear here.</p>}
                {p.recent.map((r) => <MenuItem key={r.entity_type + r.entity_id} onSelect={() => router.push(REC_HREF[r.entity_type] + r.entity_id)}><span className="w-16 text-[11px] capitalize text-muted">{r.entity_type}</span><span className="truncate">{r.label}</span></MenuItem>)}
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Notifications (${p.notifications.unread} unread)`} className="relative">
                  <Bell />{p.notifications.unread > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{p.notifications.unread > 9 ? "9+" : p.notifications.unread}</span>}
                </Button>
              </MenuTrigger>
              <MenuContent className="w-[22rem] p-0">
                <div className="flex items-center justify-between border-b border-line px-3 py-2"><span className="text-sm font-semibold">Notifications</span>
                  {p.notifications.unread > 0 && <button className="text-xs text-brand-600 hover:underline" onClick={() => markReadAction()}>Mark all read</button>}</div>
                <div className="max-h-96 overflow-y-auto p-1 scrollbar-thin">
                  {p.notifications.items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">You’re all caught up.</p>}
                  {p.notifications.items.map((n) => (
                    <MenuItem key={n.id} className="items-start" onSelect={() => { void markReadAction(n.id); if (n.link) router.push(n.link); }}>
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand-500"}`} />
                      <div className="min-w-0"><p className="text-[13px] font-medium leading-snug">{n.title}</p>{n.body && <p className="truncate text-xs text-muted">{n.body}</p>}<p className="mt-0.5 text-[11px] text-slate-400">{relTime(n.created_at)}</p></div>
                    </MenuItem>
                  ))}
                </div>
              </MenuContent>
            </Menu>
            <Link href="/help" className="hidden sm:block"><Button variant="ghost" size="icon" aria-label="Help centre"><HelpCircle /></Button></Link>
            <Menu>
              <MenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100" aria-label="Account menu">
                  <Avatar name={p.user.name} />
                  <div className="hidden text-left md:block"><p className="max-w-[140px] truncate text-[13px] font-medium leading-tight">{p.user.name}</p><p className="max-w-[140px] truncate text-[11px] text-muted">{p.org.name}</p></div>
                  <ChevronDown className="hidden size-3.5 text-muted md:block" />
                </button>
              </MenuTrigger>
              <MenuContent className="w-64">
                <div className="px-2.5 py-2"><p className="text-sm font-medium">{p.user.name}</p><p className="truncate text-xs text-muted">{p.user.email}</p><p className="mt-1 text-[11px] text-muted">{ROLE_LABELS[p.user.role]} · {p.org.plan} plan</p></div>
                <MenuSeparator />
                <MenuLabel>Organisations</MenuLabel>
                {p.memberships.map((m) => (
                  <MenuItem key={m.org_id} onSelect={() => m.org_id !== p.org.id && switchOrgAction(m.org_id)}><Building />{m.org_name}{m.org_id === p.org.id && <Check className="ml-auto" />}</MenuItem>
                ))}
                <MenuItem onSelect={() => router.push("/account?new-org=1")}><Plus />Create organisation</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => router.push("/account")}><UserCog />Account & security</MenuItem>
                {p.user.isPlatformAdmin && <MenuItem onSelect={() => router.push("/platform")}><Building />Platform admin</MenuItem>}
                <MenuItem onSelect={() => logoutAction()}><LogOut />Sign out</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        <main className="min-w-0 flex-1">{p.children}</main>
      </div>
      <CommandPalette open={palette} setOpen={setPalette} nav={p.nav} creates={p.creates} />
    </div>
  );
}
