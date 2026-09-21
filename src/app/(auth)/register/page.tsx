"use client";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input, Select } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";
import { CURRENCIES } from "@/lib/constants";

export default function RegisterPage() {
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Create your organisation</h2>
      <p className="mt-1 text-sm text-muted">14-day trial. You become the Organisation Owner and can invite your team.</p>
      <ActionForm action={registerAction} className="mt-6 space-y-4">
        {({ pending, errors }) => (<>
          <Field label="Organisation name" name="orgName" error={errors.orgName} required><Input id="orgName" name="orgName" placeholder="e.g. DigiFalx" /></Field>
          <Field label="Your full name" name="name" error={errors.name} required><Input id="name" name="name" autoComplete="name" /></Field>
          <Field label="Work email" name="email" error={errors.email} required><Input id="email" name="email" type="email" autoComplete="email" /></Field>
          <Field label="Password" name="password" error={errors.password} hint="At least 10 characters with letters and numbers." required><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
          <Field label="Base currency" name="currency"><Select id="currency" name="currency" defaultValue="AED">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Button type="submit" className="w-full" size="lg" loading={pending}>Create organisation</Button>
        </>)}
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link></p>
    </>
  );
}
