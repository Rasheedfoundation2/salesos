"use client";
import { use } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/ui";
import { resetPasswordAction } from "@/app/actions/auth";

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Choose a new password</h2>
      <ActionForm action={resetPasswordAction} className="mt-6 space-y-4">
        {({ pending, errors }) => (<>
          <input type="hidden" name="token" value={token} />
          <Field label="New password" name="password" error={errors.password} hint="At least 10 characters with letters and numbers."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
          <Field label="Confirm password" name="confirm" error={errors.confirm}><Input id="confirm" name="confirm" type="password" autoComplete="new-password" /></Field>
          <Button type="submit" className="w-full" size="lg" loading={pending}>Update password</Button>
        </>)}
      </ActionForm>
    </>
  );
}
