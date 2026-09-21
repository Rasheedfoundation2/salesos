"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { NAV_ICONS } from "./icons";

export interface SideItem { href: string; label: string; icon: string; phase?: number }

export function Sidebar({ items, orgName, mobileOpen, onClose }: { items: SideItem[]; orgName: string; mobileOpen: boolean; onClose: () => void }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => { try { setCollapsed(localStorage.getItem("sos_sidebar") === "1"); } catch {} }, []);
  const toggle = () => { setCollapsed((c) => { try { localStorage.setItem("sos_sidebar", c ? "0" : "1"); } catch {} return !c; }); };
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/40 lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-900 text-slate-300 transition-all lg:sticky lg:top-0 lg:h-screen",
        collapsed ? "lg:w-[64px]" : "lg:w-[232px]", mobileOpen ? "w-[240px] translate-x-0" : "w-[240px] -translate-x-full lg:translate-x-0")}>
        <div className={cn("flex h-14 items-center gap-2.5 border-b border-white/10 px-4", collapsed && "lg:justify-center lg:px-0")}>
          <Logo className="size-7 shrink-0" />
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-semibold text-white">SalesOS</p>
            <p className="truncate text-[11px] text-slate-400">{orgName}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin" aria-label="Main">
          {items.map((it) => {
            const Icon = NAV_ICONS[it.icon]!;
            const active = path === it.href || path.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} onClick={onClose} title={collapsed ? it.label : undefined}
                className={cn("group mb-0.5 flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors",
                  active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white", collapsed && "lg:justify-center lg:px-0")}>
                <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-100" : "text-slate-400 group-hover:text-slate-200")} />
                <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{it.label}</span>
                {it.phase && <span className={cn("rounded bg-white/10 px-1 text-[10px] text-slate-400", collapsed && "lg:hidden")}>P{it.phase}</span>}
              </Link>
            );
          })}
        </nav>
        <button onClick={toggle} className="hidden h-11 items-center justify-center gap-2 border-t border-white/10 text-xs text-slate-400 hover:text-white lg:flex" aria-label="Collapse sidebar">
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </aside>
    </>
  );
}
