import { Skeleton } from "./ui/primitives";

/** Shaped like the pages they stand in for, so nothing jumps when content arrives. */
export function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface md:flex" aria-busy="true" aria-label="Loading">
      <div className="h-14 border-b border-line md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0" />
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 md:px-10 md:py-10">{children}</div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <ShellSkeleton>
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <Skeleton className="mt-6 h-40 w-full rounded-lg" />
      <Skeleton className="mt-10 h-6 w-32" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </ShellSkeleton>
  );
}

export function RunSkeleton() {
  return (
    <ShellSkeleton>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-4 w-32" />
      <Skeleton className="mt-2 h-9 w-96 max-w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </ShellSkeleton>
  );
}
