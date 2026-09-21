"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as RDialog } from "radix-ui";
import { Briefcase, Building2, CheckSquare, Activity, Loader2, Plus, Search, Target, UserRound, ArrowRight } from "lucide-react";
import { searchAction } from "@/app/actions/shell";
import type { SearchHit } from "@/lib/services/search";
import type { SideItem } from "./sidebar";
import { NAV_ICONS } from "./icons";

const TYPE_ICON = { lead: Target, contact: UserRound, company: Building2, opportunity: Briefcase, task: CheckSquare, activity: Activity };

export function CommandPalette({ open, setOpen, nav, creates }: { open: boolean; setOpen: (o: boolean) => void; nav: SideItem[]; creates: { label: string; href: string }[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); }
      const t = e.target as HTMLElement;
      if (e.key === "/" && !open && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => { try { setHits(await searchAction(q)); } finally { setLoading(false); } }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-navy-950/40" />
        <RDialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-pop">
          <RDialog.Title className="sr-only">Search and commands</RDialog.Title>
          <RDialog.Description className="sr-only">Search records or run a command</RDialog.Description>
          <Command shouldFilter={false} label="Command palette">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search leads, contacts, companies, deals, tasks… or type a command" className="h-12 flex-1 bg-transparent text-sm outline-none" />
              {loading && <Loader2 className="size-4 animate-spin text-muted" />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              {q.trim().length >= 2 && !loading && hits.length === 0 && <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No records match “{q}”.</Command.Empty>}
              {hits.length > 0 && (
                <Command.Group heading="Records" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                  {hits.map((h) => { const I = TYPE_ICON[h.type]; return (
                    <Command.Item key={h.type + h.id} value={h.type + h.id} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-slate-100">
                      <I className="size-4 text-muted" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{h.title}</p>{h.subtitle && <p className="truncate text-xs text-muted">{h.subtitle}</p>}</div>
                      <span className="text-[11px] capitalize text-muted">{h.type}</span>
                    </Command.Item>); })}
                </Command.Group>
              )}
              {q.trim().length < 2 && (<>
                <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                  {creates.map((c) => <Command.Item key={c.href} onSelect={() => go(c.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-slate-100"><Plus className="size-4 text-muted" />{c.label}</Command.Item>)}
                </Command.Group>
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                  {nav.filter((n) => !n.phase).map((n) => { const I = NAV_ICONS[n.icon]!; return <Command.Item key={n.href} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-slate-100"><I className="size-4 text-muted" />{n.label}<ArrowRight className="ml-auto size-3.5 text-slate-300" /></Command.Item>; })}
                </Command.Group>
              </>)}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line bg-slate-50 px-4 py-2 text-[11px] text-muted"><span><kbd className="rounded border bg-white px-1">↑↓</kbd> navigate</span><span><kbd className="rounded border bg-white px-1">↵</kbd> open</span><span><kbd className="rounded border bg-white px-1">esc</kbd> close</span><span className="ml-auto"><kbd className="rounded border bg-white px-1">⌘K</kbd> or <kbd className="rounded border bg-white px-1">/</kbd> anywhere</span></div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
