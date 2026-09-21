"use client";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/ui";
import { acceptInviteAction } from "@/app/actions/auth";

export function InviteForm({ token, userExists, name }: { token: string; userExists: boolean; name: string }) {
  return (
    <ActionForm action={acceptInviteAction} className="mt-6 space-y-4">
      {({ pending, errors }) => (<>
        <input type="hidden" name="token" value={token} />
        {!userExists && <Field label="Full name" name="name" error={errors.name}><Input id="name" name="name" defaultValue={name} /></Field>}
        <Field label={userExists ? "Your existing SalesOS password" : "Create a password"} name="password" error={errors.password} hint={userExists ? "You already have an account — confirm it to join." : "At least 10 characters with letters and numbers."}>
          <Input id="password" name="password" type="password" autoComplete={userExists ? "current-password" : "new-password"} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={pending}>Accept invitation</Button>
      </>)}
    </ActionForm>
  );
}
