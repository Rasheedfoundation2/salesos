"use client";
import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

type Act = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;

/** Form bound to a server action with pending state, field errors and toasts. */
export function ActionForm({ action, children, className, onSuccess, successToast = true, resetOnSuccess }: {
  action: Act; children: (s: { pending: boolean; errors: Record<string, string[]>; state: ActionResult<unknown> | null }) => React.ReactNode;
  className?: string; onSuccess?: (r: { ok: true; data?: any; message?: string }) => void; successToast?: boolean; resetOnSuccess?: boolean; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const ref = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult<unknown> | null, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r?.ok) { if (successToast && r.message) toast.success(r.message); if (resetOnSuccess) ref.current?.reset(); onSuccess?.(r); }
    else if (r && !r.ok) toast.error(r.error);
    return r;
  }, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  // Submit via onSubmit (not the `action` prop) so React doesn't reset the form — failed submissions keep what the user typed.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    React.startTransition(() => formAction(fd));
  };
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className={className} noValidate>
      {state && !state.ok && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {children({ pending, errors, state })}
    </form>
  );
}

/** Calls a server action imperatively with toast handling. */
export async function callAction<T>(p: Promise<ActionResult<T>>, success?: string): Promise<ActionResult<T>> {
  const r = await p;
  if (r.ok) { if (success ?? r.message) toast.success(success ?? r.message!); }
  else toast.error(r.error);
  return r;
}
