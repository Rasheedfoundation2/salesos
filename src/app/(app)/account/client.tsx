"use client";
import { useRouter } from "next/navigation";
import { ActionForm, callAction } from "@/components/action-form";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { changePasswordAction, createOrgAction, revokeSessionAction } from "@/app/actions/auth";
import { CURRENCIES } from "@/lib/constants";

export function PasswordCard() {
  return (
    <Card><CardHeader title="Change password" />
      <ActionForm action={changePasswordAction} className="space-y-3 p-4" resetOnSuccess>
        {({ pending, errors }) => (<>
          <Field label="Current password" name="current" error={errors.current}><Input id="current" name="current" type="password" autoComplete="current-password" /></Field>
          <Field label="New password" name="password" error={errors.password} hint="At least 10 characters with letters and numbers."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
          <Field label="Confirm new password" name="confirm" error={errors.confirm}><Input id="confirm" name="confirm" type="password" autoComplete="new-password" /></Field>
          <div className="flex justify-end"><Button type="submit" loading={pending}>Update password</Button></div>
        </>)}
      </ActionForm>
    </Card>
  );
}
export function CreateOrgCard({ open }: { open: boolean }) {
  return (
    <Card className={open ? "ring-2 ring-brand-500" : ""}><CardHeader title="Create another organisation" description="Run a separate, fully isolated workspace (e.g. for a sister company). You become its Owner." />
      <ActionForm action={createOrgAction} className="flex flex-wrap items-end gap-2 p-4">
        {({ pending, errors }) => (<>
          <Field label="Organisation name" name="name" error={errors.name} className="min-w-[220px] flex-1"><Input id="name" name="name" autoFocus={open} /></Field>
          <Field label="Currency" name="currency"><Select id="currency" name="currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Button type="submit" loading={pending}>Create</Button>
        </>)}
      </ActionForm>
    </Card>
  );
}
export function RevokeSession({ id }: { id: string }) {
  const router = useRouter();
  return <Button size="sm" variant="ghost" onClick={async () => { await revokeSessionAction(id); router.refresh(); }}>Sign out</Button>;
}
