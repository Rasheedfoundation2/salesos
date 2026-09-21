import Link from "next/link";
export default function NotFound() {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center"><p className="text-sm font-semibold text-brand-600">404</p><h1 className="mt-1 text-xl font-semibold">Record not found</h1><p className="mt-1 max-w-sm text-sm text-muted">It may have been archived, or you may not have access to it in this organisation.</p><Link href="/home" className="mt-4 text-sm text-brand-600 hover:underline">Back to home</Link></div>;
}
