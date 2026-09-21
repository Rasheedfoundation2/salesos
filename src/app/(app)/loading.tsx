import { Skeleton } from "@/components/ui";
export default function Loading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-80" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <div className="space-y-2 rounded-xl border border-line bg-white p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
    </div>
  );
}
