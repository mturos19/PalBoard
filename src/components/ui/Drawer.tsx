import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Right-hand slide-over panel. Esc or backdrop click closes. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 'w-[420px]',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className={`animate-slide-in absolute inset-y-0 right-0 flex ${width} max-w-[92vw] flex-col border-l border-line bg-surface card-shadow`}
        role="dialog"
        aria-modal
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line-soft px-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  )
}
