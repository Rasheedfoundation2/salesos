"use client";
import { ActionForm } from "@/components/action-form";
import { Button, Card, Field, Input } from "@/components/ui";
import { changePasswordAction, logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/logo";

export function ForcePasswordChange({ name }: { name: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <Logo className="mb-4 size-8" />
        <h1 className="text-lg font-semibold">Welcome, {name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">Your administrator created your account with a temporary password. Choose your own password to continue.</p>
        <ActionForm action={changePasswordAction} className="mt-5 space-y-4">
          {({ pending, errors }) => (<>
            <Field label="New password" name="password" error={errors.password} hint="At least 10 characters with letters and numbers."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
            <Field label="Confirm password" name="confirm" error={errors.confirm}><Input id="confirm" name="confirm" type="password" autoComplete="new-password" /></Field>
            <Button type="submit" className="w-full" loading={pending}>Save and continue</Button>
          </>)}
        </ActionForm>
        <button onClick={() => logoutAction()} className="mt-4 w-full text-center text-xs text-muted hover:underline">Sign out</button>
      </Card>
    </div>
  );
}
