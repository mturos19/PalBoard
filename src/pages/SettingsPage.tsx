import { useState } from 'react'
import { Bell, FolderSearch, Palette, Radio, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
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
  const snapshot = useSyncStore((s) => s.snapshot)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const browseForWorld = useSyncStore((s) => s.browseForWorld)
  const reload = useSyncStore((s) => s.reload)
  const forget = useSyncStore((s) => s.forget)
  const accent = useUiStore((s) => s.accent)
  const setAccent = useUiStore((s) => s.setAccent)
  const notificationsEnabled = useUiStore((s) => s.notificationsEnabled)
  const setNotificationsEnabled = useUiStore((s) => s.setNotificationsEnabled)

  const canOpenDirectory = window.palboard.canOpenDirectory
  // Only a world opened as a folder can be followed — uploaded files are a
  // snapshot of the moment they were picked.
  const canFollow = window.palboard.canFollow()
  const [live, setLiveState] = useState(() => window.palboard.isLive())
  const toggleLive = (next: boolean) => {
    window.palboard.setLive(next)
    setLiveState(window.palboard.isLive())
  }

  const followHint = canFollow
    ? 'Re-reads the folder every few seconds and refreshes after each autosave.'
    : canOpenDirectory
      ? 'This save was uploaded, so it cannot change. Use “Open another” and choose the folder to follow it live.'
      : 'Needs a browser that can open a folder — Chrome, Edge or Opera. Elsewhere, use Reload.'

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
                onClick={() => void browseForWorld()}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
              >
                <FolderSearch size={12} /> Open another
              </button>
            </div>
          }
        >
          Current save
        </CardTitle>
        <p className="break-all font-mono text-xs text-ink-muted">{worldPath ?? 'None open'}</p>
        <p className="mt-1 text-[11px] text-ink-faint">
          Last read {formatRelativeTime(lastSyncedAt)}
          {snapshot ? ` · revision ${snapshot.revision}` : ''}
        </p>

        <div className="mt-4 flex items-center gap-3 border-t border-line-soft pt-4">
          <Radio size={15} className={live ? 'text-mint' : 'text-ink-faint'} />
          <span className="flex-1 text-sm text-ink-muted">
            Follow the save while I play
            <span className="block text-[11px] text-ink-faint">{followHint}</span>
          </span>
          <Toggle checked={live} disabled={!canFollow} onChange={toggleLive} />
        </div>
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
            Notify me about critical alerts
            <span className="block text-[11px] text-ink-faint">
              Starving or sick pals raise a system notification
            </span>
          </span>
          <Toggle
            checked={notificationsEnabled}
            onChange={(next) => {
              // The browser only grants permission from a user gesture, so ask
              // on the click that turns this on rather than at page load.
              if (next && 'Notification' in window && Notification.permission === 'default') {
                void Notification.requestPermission()
              }
              setNotificationsEnabled(next)
            }}
          />
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
          <div className="min-w-0">
            <p className="text-sm font-medium">Your save stays on your machine</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              PalBoard decodes the save inside this page. It is never uploaded — there is no server
              to upload it to — and it is opened for reading only, so playing on afterwards is safe.
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              The only thing kept between visits is the chart history below: a few counts per save,
              in this browser's local storage. Closing the tab forgets everything else.
            </p>
            <button
              onClick={() => void forget()}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-2.5 py-1.5 text-xs text-rose transition-colors hover:bg-rose/15"
            >
              <Trash2 size={12} /> Close this save and clear stored history
            </button>
          </div>
        </div>
      </Card>

      <Card index={6}>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          PalBoard 0.3 · names extracted from the game's own data tables ({NAME_COUNTS.pals} pals,{' '}
          {NAME_COUNTS.items.toLocaleString()} items, {NAME_COUNTS.skills.toLocaleString()} skills) ·
          elements curated for {SPECIES_TABLE_SIZE} species, plus the game's own subspecies suffixes.
          Not affiliated with Pocketpair.
        </p>
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

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-surface-3',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 size-4 rounded-full bg-ink transition-all',
          checked ? 'left-4.5' : 'left-0.5',
        )}
      />
    </button>
  )
}
