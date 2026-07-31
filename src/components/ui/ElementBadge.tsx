import type { PalElement } from '@shared/domain'
import { ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/elements'

export function ElementBadge({ element, compact = false }: { element: PalElement; compact?: boolean }) {
  const color = ELEMENT_COLORS[element]
  if (compact) {
    return (
      <span
        title={ELEMENT_LABELS[element]}
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `${color}1f`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {ELEMENT_LABELS[element]}
    </span>
  )
}
