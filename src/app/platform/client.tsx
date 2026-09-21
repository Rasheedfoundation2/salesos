"use client";
import { callAction } from "@/components/action-form";
import { Button, Select } from "@/components/ui";
import { platformPlanAction, platformStatusAction } from "@/app/actions/admin";

export function OrgControls({ id, status, plan }: { id: string; status: string; plan: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Select aria-label="Plan" defaultValue={plan} className="h-8 w-32" onChange={(e) => callAction(platformPlanAction(id, e.target.value))}>{["trial", "starter", "professional", "enterprise"].map((p) => <option key={p}>{p}</option>)}</Select>
      <Button size="sm" variant={status === "active" ? "secondary" : "primary"} onClick={() => callAction(platformStatusAction(id, status === "active" ? "suspended" : "active"))}>{status === "active" ? "Suspend" : "Reactivate"}</Button>
    </div>
  );
}
