"use client";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/ui";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction} className="mt-6 space-y-4">
      {({ pending, errors }) => (<>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" error={errors.email}><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
        <Field label="Password" name="password" error={errors.password}><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="flex justify-end"><Link href="/reset" className="text-sm text-brand-600 hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" size="lg" loading={pending}>Sign in</Button>
      </>)}
    </ActionForm>
  );
}
