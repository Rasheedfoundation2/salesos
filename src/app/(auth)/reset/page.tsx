"use client";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/ui";
import { requestResetAction } from "@/app/actions/auth";

export default function ResetRequestPage() {
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
      <p className="mt-1 text-sm text-muted">We’ll email you a link that is valid for 60 minutes.</p>
      <ActionForm action={requestResetAction} className="mt-6 space-y-4">
        {({ pending, errors, state }) => state?.ok ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">{state.message}</p>
        ) : (<>
          <Field label="Email" name="email" error={errors.email}><Input id="email" name="email" type="email" autoFocus /></Field>
          <Button type="submit" className="w-full" size="lg" loading={pending}>Send reset link</Button>
        </>)}
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-brand-600 hover:underline">Back to sign in</Link></p>
    </>
  );
}
