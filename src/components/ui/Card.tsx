import type { ReactNode } from 'react'
import { cx } from '@/lib/format'

interface CardProps {
  children: ReactNode
  className?: string
  /** Staggers the entrance animation when cards are rendered in a grid. */
  index?: number
}

export function Card({ children, className, index = 0 }: CardProps) {
  return (
    <div
      className={cx(
        'animate-rise rounded-card border border-line-soft bg-surface p-4',
        'transition-colors duration-200 hover:border-line',
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink-faint">{hint}</p> : null}
    </div>
  )
}
