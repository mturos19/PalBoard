/** Header alert bell: severity-tinted badge, dropdown list, links into pages. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, Info, ShieldAlert } from 'lucide-react'
import type { Alert } from '@shared/domain'
import { cx } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

const ICONS = { critical: ShieldAlert, warning: AlertTriangle, info: Info } as const
const TONES = { critical: 'text-rose', warning: 'text-amber', info: 'text-accent' } as const

export function AlertsBell() {
  const alerts = useSyncStore((s) => s.snapshot?.alerts ?? EMPTY)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const critical = alerts.some((a) => a.severity === 'critical')

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'relative grid size-8 place-items-center rounded-lg border border-line-soft bg-surface-2 transition-colors hover:border-line',
          open && 'border-line bg-surface-3',
        )}
        title="Alerts"
      >
        <Bell size={14} className="text-ink-muted" />
        {alerts.length > 0 ? (
          <span
            className={cx(
              'absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-canvas',
              critical ? 'bg-rose' : 'bg-amber',
            )}
          >
            {alerts.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-rise absolute right-0 top-10 z-30 w-80 overflow-hidden rounded-xl border border-line bg-surface card-shadow">
          <p className="border-b border-line-soft px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Alerts
          </p>
          {alerts.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-ink-faint">
              All clear — nothing needs attention.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onGo={() => {
                    if (alert.link) navigate(alert.link)
                    setOpen(false)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function AlertRow({ alert, onGo }: { alert: Alert; onGo: () => void }) {
  const Icon = ICONS[alert.severity]
  return (
    <li>
      <button
        onClick={onGo}
        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <Icon size={14} className={cx('mt-0.5 shrink-0', TONES[alert.severity])} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{alert.title}</span>
          <span className="block truncate text-[11px] text-ink-faint">{alert.detail}</span>
        </span>
      </button>
    </li>
  )
}

const EMPTY: Alert[] = []
