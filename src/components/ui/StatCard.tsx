import type { LucideIcon } from 'lucide-react'
import { cx } from '@/lib/format'

export type StatTone = 'default' | 'accent' | 'mint' | 'amber' | 'rose' | 'violet'

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-ink',
  accent: 'text-accent',
  mint: 'text-mint',
  amber: 'text-amber',
  rose: 'text-rose',
  violet: 'text-violet',
}

const TONE_ICON: Record<StatTone, string> = {
  default: 'bg-surface-3 text-ink-muted',
  accent: 'bg-accent/12 text-accent',
  mint: 'bg-mint/12 text-mint',
  amber: 'bg-amber/12 text-amber',
  rose: 'bg-rose/12 text-rose',
  violet: 'bg-violet/12 text-violet',
}

interface StatCardProps {
  label: string
  value: string | number
  /** Small caption under the value, e.g. "3 alpha". */
  detail?: string
  icon?: LucideIcon
  tone?: StatTone
  index?: number
  onClick?: () => void
}

/**
 * A single dashboard metric.
 *
 * The value uses tabular figures so a live-updating number does not shift the
 * layout as digits change width.
 */
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  index = 0,
  onClick,
}: StatCardProps) {
  const interactive = Boolean(onClick)
  const Element = interactive ? 'button' : 'div'

  return (
    <Element
      onClick={onClick}
      className={cx(
        'animate-rise flex w-full items-center gap-3 rounded-card border border-line-soft bg-surface p-3.5 text-left',
        'transition-all duration-200',
        interactive && 'hover:-translate-y-0.5 hover:border-line hover:bg-surface-2',
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      {Icon ? (
        <div className={cx('grid size-9 shrink-0 place-items-center rounded-lg', TONE_ICON[tone])}>
          <Icon size={17} strokeWidth={2} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </p>
        <p className={cx('truncate text-xl font-semibold tabular-nums', TONE_TEXT[tone])}>{value}</p>
        {detail ? <p className="truncate text-[11px] text-ink-faint">{detail}</p> : null}
      </div>
    </Element>
  )
}
