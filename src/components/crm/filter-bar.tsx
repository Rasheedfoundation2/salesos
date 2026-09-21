"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Search, Trash2, X } from "lucide-react";
import { Button, Dialog, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Select } from "@/components/ui";
import { deleteViewAction, saveViewAction } from "@/app/actions/crm";
import { callAction } from "@/components/action-form";

export interface FilterDef { key: string; label: string; options: { value: string; label: string }[]; allLabel?: string }
export interface SavedView { id: string; name: string; filters: Record<string, string>; is_shared: boolean; user_id: string }

/** URL-driven filters: every change updates the query string, so views are shareable and survive refresh. */
export function FilterBar({ filters, searchPlaceholder = "Search…", entity, views, userId, canShare, extra, hideSearch }: {
  filters: FilterDef[]; searchPlaceholder?: string; hideSearch?: boolean; entity?: string; views?: SavedView[]; userId?: string; canShare?: boolean; extra?: React.ReactNode;
}) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [viewName, setViewName] = React.useState(""); const [shared, setShared] = React.useState(false);
  const set = React.useCallback((k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    n.delete("page");
    router.replace(`${path}?${n.toString()}`);
  }, [sp, path, router]);
  React.useEffect(() => { const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q || null); }, 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = [...sp.keys()].filter((k) => !["page", "sort", "dir", "create", "tab"].includes(k));
  const current = Object.fromEntries([...sp.entries()].filter(([k]) => !["page", "create", "tab"].includes(k)));
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
      {!hideSearch && <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label="Search" />
      </div>}
      {filters.map((f) => (
        <Select key={f.key} aria-label={f.label} value={sp.get(f.key) ?? ""} onChange={(e) => set(f.key, e.target.value || null)} className="w-auto min-w-[130px] max-w-[240px]">
          <option value="">{f.label}: {f.allLabel ?? "All"}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ))}
      {extra}
      {active.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.replace(path); }}><X />Clear</Button>}
      {entity && views && (
        <div className="ml-auto">
          <Menu>
            <MenuTrigger asChild><Button variant="secondary" size="sm"><Bookmark />Views{views.length ? ` (${views.length})` : ""}</Button></MenuTrigger>
            <MenuContent className="w-64">
              <MenuLabel>Saved views</MenuLabel>
              {views.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">Save the current filters as a reusable view.</p>}
              {views.map((v) => (
                <MenuItem key={v.id} onSelect={() => router.replace(`${path}?${new URLSearchParams(v.filters).toString()}`)}>
                  <span className="flex-1 truncate">{v.name}</span>{v.is_shared && <span className="text-[10px] text-muted">shared</span>}
                  {v.user_id === userId && <button aria-label={`Delete ${v.name}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); void callAction(deleteViewAction(entity, v.id)); }} className="rounded p-0.5 hover:bg-red-50"><Trash2 className="!size-3.5 !text-red-500" /></button>}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem disabled={active.length === 0} onSelect={() => setSaveOpen(true)}><Bookmark />Save current filters…</MenuItem>
            </MenuContent>
          </Menu>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen} title="Save view" size="sm"
            footer={<><Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button><Button onClick={async () => { const r = await callAction(saveViewAction(entity, viewName, current, shared)); if (r.ok) { setSaveOpen(false); setViewName(""); } }}>Save view</Button></>}>
            <Input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Hot UAE leads" aria-label="View name" />
            {canShare && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with the whole team</label>}
          </Dialog>
        </div>
      )}
    </div>
  );
}

export function SortHeader({ k, label, className }: { k: string; label: string; className?: string }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const active = sp.get("sort") === k; const dir = active && sp.get("dir") === "asc" ? "desc" : "asc";
  return (
    <button className={className ?? "inline-flex items-center gap-1 uppercase hover:text-ink"} onClick={() => { const n = new URLSearchParams(sp.toString()); n.set("sort", k); n.set("dir", dir); router.replace(`${path}?${n}`); }}>
      {label}{active && <span aria-hidden>{sp.get("dir") === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}
