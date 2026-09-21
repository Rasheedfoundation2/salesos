"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useStageMove } from "@/components/crm/stage-move";
import type { OppRow } from "@/lib/services/opportunities";
import type { Stage } from "@/lib/services/lookups";
import { cn, fmtDate, money } from "@/lib/utils";

export function Board({ stages, rows, currency, lostReasons, canMove, role, contacts }: { stages: Stage[]; rows: OppRow[]; currency: string; lostReasons: { id: string; name: string }[]; canMove: boolean; role: string; contacts: { id: string; full_name: string; company_id: string | null }[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(rows);
  React.useEffect(() => setItems(rows), [rows]);
  const prev = React.useRef(rows);
  const { move, dialog } = useStageMove(lostReasons, (ok) => { if (!ok) setItems(prev.current); router.refresh(); });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onEnd = (e: DragEndEvent) => {
    const id = String(e.active.id); const to = e.over?.id ? String(e.over.id) : null;
    const opp = items.find((i) => i.id === id); const stage = stages.find((s) => s.id === to);
    if (!opp || !stage || opp.stage_id === stage.id) return;
    if (stage.restricted_roles.includes(role)) { toast.error(`Your role cannot move deals into ${stage.name}.`); return; }
    prev.current = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, stage_id: stage.id, probability: stage.probability } : x)));
    move({ oppId: id, oppName: opp.name, stageId: stage.id, stageName: stage.name, kind: stage.kind, contacts: contacts.filter((c) => !opp.company_id || c.company_id === opp.company_id) });
  };
  return (
    <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onEnd}>
      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:px-6">
        {stages.map((s) => {
          const col = items.filter((i) => i.stage_id === s.id);
          const sum = col.reduce((a, r) => a + Number(r.value_base ?? 0), 0);
          return <Column key={s.id} stage={s} count={col.length} sum={money(sum, currency, sum >= 100000)} disabled={!canMove}>
            {col.map((o) => <Card key={o.id} o={o} draggable={canMove} />)}
          </Column>;
        })}
      </div>
      {dialog}
    </DndContext>
  );
}

function Column({ stage, count, sum, children, disabled }: { stage: Stage; count: number; sum: string; children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled });
  return (
    <section ref={setNodeRef} aria-label={`${stage.name} stage`} className={cn("flex w-[272px] shrink-0 flex-col rounded-xl border border-line bg-slate-100/70", isOver && "border-brand-500 bg-brand-50")}>
      <header className="border-b border-line px-3 py-2.5" style={{ borderTop: `3px solid ${stage.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
        <div className="flex items-center justify-between"><h2 className="truncate text-[13px] font-semibold">{stage.name}</h2><span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-muted">{count}</span></div>
        <p className="tabular text-xs text-muted">{sum} · {stage.probability}%</p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">{children}{count === 0 && <p className="py-6 text-center text-xs text-slate-400">Drop deals here</p>}</div>
    </section>
  );
}

function Card({ o, draggable }: { o: OppRow; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: o.id, disabled: !draggable });
  const stuck = o.status === "open" && o.max_days && new Date(o.stage_entered_at).getTime() < Date.now() - o.max_days * 86400000;
  const late = o.status === "open" && o.expected_close_date && new Date(o.expected_close_date).getTime() < Date.now() - 86400000;
  return (
    <article ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("rounded-lg border border-line bg-white p-2.5 shadow-card", draggable && "cursor-grab active:cursor-grabbing", isDragging && "z-50 rotate-1 shadow-pop", o.status === "lost" && "opacity-60")}>
      <Link href={`/opportunities/${o.id}`} className="line-clamp-2 text-[13px] font-medium leading-snug hover:text-brand-600" onPointerDown={(e) => e.stopPropagation()}>{o.name}</Link>
      <p className="mt-0.5 truncate text-xs text-muted">{o.company_name ?? "No company"}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="tabular text-[13px] font-semibold">{o.value == null ? "—" : money(o.value, o.currency)}</span>
        {o.owner_name && <Avatar name={o.owner_name} className="size-6 text-[10px]" />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        {o.expected_close_date && <span className={cn("inline-flex items-center gap-1", late && "font-medium text-red-600")}><CalendarClock className="size-3" />{fmtDate(o.expected_close_date, { day: "2-digit", month: "short" })}</span>}
        {(stuck || o.risk_level === "high") && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="size-3" />{stuck ? "Stuck" : "High risk"}</span>}
        {!o.next_action && o.status === "open" && <span className="text-amber-700">No next action</span>}
      </div>
    </article>
  );
}
