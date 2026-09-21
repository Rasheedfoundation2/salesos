"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { TaskFormDialog } from "@/components/crm/forms";
import { TaskList } from "@/components/crm/record";
import type { TaskRow } from "@/lib/services/activities";

type U = { id: string; name: string };
export function NewTask({ users, canAssign, autoOpen }: { users: U[]; canAssign: boolean; autoOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!autoOpen); const router = useRouter();
  return <><Button size="sm" onClick={() => setOpen(true)}><Plus />New task</Button><TaskFormDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && autoOpen) router.replace("/tasks"); }} users={users} canAssign={canAssign} /></>;
}
export function TaskListClient({ items, users, canAssign }: { items: TaskRow[]; users: U[]; canAssign: boolean }) {
  const [edit, setEdit] = React.useState<TaskRow | null>(null);
  return <><TaskList items={items} showRelated onEdit={setEdit} />
    {edit && <TaskFormDialog open onOpenChange={(o) => !o && setEdit(null)} users={users} canAssign={canAssign} initial={edit as unknown as Record<string, unknown>} />}</>;
}
