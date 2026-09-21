import Link from "next/link";
import { ShieldAlert } from "lucide-react";
export function Forbidden() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <ShieldAlert className="size-8 text-amber-500" />
      <h1 className="mt-2 text-lg font-semibold">You don’t have access to this page</h1>
      <p className="mt-1 max-w-md text-sm text-muted">Your role doesn’t include this module. Ask an organisation admin if you need access.</p>
      <Link href="/home" className="mt-4 text-sm text-brand-600 hover:underline">Back to home</Link>
    </div>
  );
}
