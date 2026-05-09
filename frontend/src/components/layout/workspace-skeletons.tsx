import { Skeleton } from "@/components/ui/skeleton";

export function MetricSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/80 px-4 py-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-10" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="size-10 rounded-lg" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-[200px] w-full rounded-xl" />
      <PanelSkeleton rows={4} />
    </div>
  );
}
