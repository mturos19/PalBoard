import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cx, formatRelativeTime } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

/**
 * Live-sync status pill.
 *
 * The "x ago" label is derived from a timestamp, so it needs its own tick to
 * stay honest — the store only updates when the save actually changes.
 */
export function SyncIndicator() {
  const status = useSyncStore((s) => s.status)
  const syncing = useSyncStore((s) => s.syncing)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const error = useSyncStore((s) => s.error)
  const reload = useSyncStore((s) => s.reload)

  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (status === 'error') {
    return (
      <button
        onClick={() => void reload()}
        title={error ?? undefined}
        className="flex items-center gap-2 rounded-full border border-rose/30 bg-rose/10 px-3 py-1.5 text-xs font-medium text-rose transition-colors hover:bg-rose/15"
      >
        <AlertTriangle size={13} />
        <span className="max-w-56 truncate">{error ?? 'Save could not be read'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={() => void reload()}
      title="Reload now"
      className="group flex items-center gap-2 rounded-full border border-line-soft bg-surface-2 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line hover:text-ink"
    >
      <span
        className={cx(
          'size-1.5 rounded-full',
          syncing ? 'animate-pulse-dot bg-amber' : 'bg-mint',
        )}
      />
      <span className="tabular-nums">
        {syncing ? 'Syncing…' : `Synced ${formatRelativeTime(lastSyncedAt)}`}
      </span>
      <RefreshCw
        size={12}
        className={cx('opacity-0 transition-opacity group-hover:opacity-60', syncing && 'animate-spin opacity-60')}
      />
    </button>
  )
}
