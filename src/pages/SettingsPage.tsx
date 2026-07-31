import { FolderOpen, FolderSearch, RefreshCw, ShieldCheck } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/Card'
import { formatBytes, formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

export function SettingsPage() {
  const worldPath = useSyncStore((s) => s.worldPath)
  const worlds = useSyncStore((s) => s.worlds)
  const snapshot = useSyncStore((s) => s.snapshot)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const selectWorld = useSyncStore((s) => s.selectWorld)
  const browseForWorld = useSyncStore((s) => s.browseForWorld)
  const reload = useSyncStore((s) => s.reload)
  const revealSaveFolder = useSyncStore((s) => s.revealSaveFolder)

  const d = snapshot?.diagnostics

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <Card index={0}>
        <CardTitle
          action={
            <div className="flex gap-2">
              <button
                onClick={() => void reload()}
                className="flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-2 px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-line hover:text-ink"
              >
                <RefreshCw size={12} /> Reload
              </button>
              <button
                onClick={() => void revealSaveFolder()}
                className="flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-2 px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-line hover:text-ink"
              >
                <FolderOpen size={12} /> Open folder
              </button>
            </div>
          }
        >
          Current save
        </CardTitle>
        <p className="break-all font-mono text-xs text-ink-muted">{worldPath ?? 'None selected'}</p>
        <p className="mt-1 text-[11px] text-ink-faint">
          Last synced {formatRelativeTime(lastSyncedAt)}
          {snapshot ? ` · revision ${snapshot.revision}` : ''}
        </p>
      </Card>

      <Card index={1}>
        <CardTitle
          action={
            <button
              onClick={() => void browseForWorld()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
            >
              <FolderSearch size={12} /> Browse…
            </button>
          }
        >
          Switch world
        </CardTitle>
        {worlds.length === 0 ? (
          <p className="text-sm text-ink-faint">No worlds auto-detected.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {worlds.map((world) => {
              const active = world.path === worldPath
              return (
                <li key={world.path} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-ink">{world.worldId}</p>
                    <p className="text-[11px] text-ink-faint">
                      Saved {formatRelativeTime(world.modifiedAt)} · {formatBytes(world.sizeBytes)}
                    </p>
                  </div>
                  {active ? (
                    <span className="shrink-0 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] text-mint">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => void selectWorld(world.path)}
                      className="shrink-0 text-xs text-accent hover:underline"
                    >
                      Open
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {d ? (
        <Card index={2}>
          <CardTitle>Parser</CardTitle>
          <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <Row label="Container format" value={d.format} />
            <Row label="World saved at" value={snapshot ? formatDateTime(snapshot.world.savedAt) : '—'} />
            <Row label="Compressed size" value={formatBytes(d.compressedBytes)} />
            <Row label="Decompressed size" value={formatBytes(d.decompressedBytes)} />
            <Row label="Decompress" value={formatDuration(d.decompressMs)} />
            <Row label="Parse" value={formatDuration(d.parseMs)} />
            <Row label="Build model" value={formatDuration(d.buildMs)} />
            <Row label="Engine" value={snapshot?.world.engineVersion ?? '—'} />
          </dl>
          {d.warnings.length > 0 ? (
            <details className="mt-3 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-amber">
                {d.warnings.length} warning{d.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink-faint">
                {d.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Card index={3}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint" />
          <div>
            <p className="text-sm font-medium">Read-only by design</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              PalBoard opens your save files for reading only and never writes to them. It is safe to
              keep running while you play.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="whitespace-nowrap text-ink-faint">{label}</dt>
      <dd className="truncate font-medium tabular-nums text-ink">{value}</dd>
    </div>
  )
}
