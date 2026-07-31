import { Bell, FolderOpen, FolderSearch, Palette, RefreshCw, ShieldCheck } from 'lucide-react'
import { NAME_COUNTS } from '@shared/gamedata/names'
import { SPECIES_TABLE_SIZE } from '@shared/gamedata/species'
import { Card, CardTitle } from '@/components/ui/Card'
import { cx, formatBytes, formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'
import { useUiStore, type Accent } from '@/stores/uiStore'

const ACCENTS: Array<{ id: Accent; color: string; label: string }> = [
  { id: 'blue', color: '#4b9cff', label: 'Sky' },
  { id: 'violet', color: '#a78bfa', label: 'Violet' },
  { id: 'mint', color: '#3ddc97', label: 'Mint' },
  { id: 'amber', color: '#f5b23d', label: 'Amber' },
]

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl K', 'Search everything'],
  ['Ctrl R', 'Reload the save now'],
  ['Esc', 'Close drawer or palette'],
]

export function SettingsPage() {
  const worldPath = useSyncStore((s) => s.worldPath)
  const worlds = useSyncStore((s) => s.worlds)
  const snapshot = useSyncStore((s) => s.snapshot)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const selectWorld = useSyncStore((s) => s.selectWorld)
  const browseForWorld = useSyncStore((s) => s.browseForWorld)
  const reload = useSyncStore((s) => s.reload)
  const revealSaveFolder = useSyncStore((s) => s.revealSaveFolder)
  const accent = useUiStore((s) => s.accent)
  const setAccent = useUiStore((s) => s.setAccent)
  const notificationsEnabled = useUiStore((s) => s.notificationsEnabled)
  const setNotificationsEnabled = useUiStore((s) => s.setNotificationsEnabled)

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
        <CardTitle>Appearance</CardTitle>
        <div className="flex items-center gap-3">
          <Palette size={15} className="text-ink-faint" />
          <span className="flex-1 text-sm text-ink-muted">Accent colour</span>
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                title={a.label}
                className={cx(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110',
                  accent === a.id ? 'border-ink' : 'border-transparent',
                )}
                style={{ background: a.color }}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Bell size={15} className="text-ink-faint" />
          <span className="flex-1 text-sm text-ink-muted">
            Desktop notifications for critical alerts
            <span className="block text-[11px] text-ink-faint">Starving or sick pals raise a system notification</span>
          </span>
          <button
            role="switch"
            aria-checked={notificationsEnabled}
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={cx(
              'relative h-5 w-9 rounded-full transition-colors',
              notificationsEnabled ? 'bg-accent' : 'bg-surface-3',
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 size-4 rounded-full bg-ink transition-transform',
                notificationsEnabled ? 'translate-x-4.5 left-0' : 'left-0.5',
              )}
            />
          </button>
        </div>
      </Card>

      <Card index={4}>
        <CardTitle>Keyboard shortcuts</CardTitle>
        <ul className="space-y-1.5 text-xs">
          {SHORTCUTS.map(([keys, what]) => (
            <li key={keys} className="flex items-center justify-between">
              <span className="text-ink-muted">{what}</span>
              <kbd className="rounded border border-line-soft bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </Card>

      <Card index={5}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint" />
          <div>
            <p className="text-sm font-medium">Read-only by design</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              PalBoard opens your save files for reading only and never writes to them. It is safe to
              keep running while you play.
            </p>
            <p className="mt-2 text-[11px] text-ink-faint">
              PalBoard 0.2 · names extracted from the game's own data tables ({NAME_COUNTS.pals} pals,{' '}
              {NAME_COUNTS.items.toLocaleString()} items, {NAME_COUNTS.skills.toLocaleString()} skills) ·
              elements curated for {SPECIES_TABLE_SIZE} species, plus the game's own subspecies
              suffixes. Re-run <code className="font-mono">npm run extract-gamedata</code> after a game
              update.
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
