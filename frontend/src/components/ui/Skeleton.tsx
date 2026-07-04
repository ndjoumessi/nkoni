import { cn } from '@/lib/utils'

/** Bloc de chargement avec balayage (nk-shimmer). Base de tous les squelettes. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('nk-shimmer relative overflow-hidden rounded-lg bg-surface-2', className)}
      {...props}
    />
  )
}

/** Squelette d'une carte de statistique (aligne StatCard). */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-32" />
    </div>
  )
}

/** Squelette de lignes de tableau/liste. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-hairline">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export default Skeleton
