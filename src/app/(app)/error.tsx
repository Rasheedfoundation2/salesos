"use client";
import { Button } from "@/components/ui";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.message?.includes("permission");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-lg font-semibold">{forbidden ? "You don’t have access to this page" : "Something went wrong"}</h1>
      <p className="mt-1 max-w-md text-sm text-muted">{forbidden ? "Your role doesn’t include this module. Ask an organisation admin if you need access." : "The error has been logged. Try again, or go back to the previous page."}{error.digest && <span className="mt-2 block font-mono text-xs">Ref: {error.digest}</span>}</p>
      {!forbidden && <Button className="mt-4" onClick={reset}>Try again</Button>}
    </div>
  );
}
