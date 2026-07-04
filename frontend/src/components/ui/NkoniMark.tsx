import { cn } from '@/lib/utils'

/** Monogramme NKONI — tuile laiton, lettre grotesque Bricolage. Marque réutilisable. */
export function NkoniMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br from-brass to-amber font-display text-brass-foreground shadow-[0_6px_16px_-6px_oklch(0.805_0.116_84/55%)]',
        className,
      )}
      aria-hidden="true"
    >
      <span className="translate-y-[-1px] font-semibold">N</span>
    </span>
  )
}

export default NkoniMark
