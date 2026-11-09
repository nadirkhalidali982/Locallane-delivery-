import { cn } from '../lib/cn'

/** LocalLane lockup on a white chip (the logo's navy needs a light background), plus the Delivery tag. */
export default function Logo({ className, tag = true }: { className?: string; tag?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex items-center rounded-xl bg-white px-2.5 py-1">
        <img src="/brand/logo-lockup.png" alt="LocalLane" width={900} height={249} className="h-8 w-auto" />
      </span>
      {tag && <span className="rounded-md bg-accent-500 px-2 py-0.5 text-xs font-bold text-ink-950">Delivery</span>}
    </span>
  )
}
