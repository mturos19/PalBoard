import { FolderOpen, HardDriveDownload, RefreshCw } from 'lucide-react'
import { formatBytes, formatRelativeTime } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

/**
 * Shown when no world is loaded — either nothing was auto-detected, or the user
 * has not chosen one yet. Auto-detected worlds are offered as one-click picks.
 */
export function WelcomePage() {
  const worlds = useSyncStore((s) => s.worlds)
  const error = useSyncStore((s) => s.error)
  const selectWorld = useSyncStore((s) => s.selectWorld)
  const browseForWorld = useSyncStore((s) => s.browseForWorld)
  const rescanWorlds = useSyncStore((s) => s.rescanWorlds)

  return (
    <div className="flex h-full items-center justify-center bg-canvas p-8">
      <div className="w-full max-w-lg animate-rise">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-accent/15 text-accent">
            <HardDriveDownload size={22} strokeWidth={2} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Welcome to PalBoard</h1>
          <p className="mt-1 text-sm text-ink-muted">
            A live, read-only dashboard for your Palworld save.
          </p>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
            {error}
          </p>
        ) : null}

        {worlds.length > 0 ? (
          <div className="mb-4 overflow-hidden rounded-card border border-line-soft bg-surface">
            <p className="border-b border-line-soft px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Worlds found on this PC
            </p>
            <ul>
              {worlds.map((world) => (
                <li key={world.path}>
                  <button
                    onClick={() => void selectWorld(world.path)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-ink">{world.worldId}</p>
                      <p className="text-[11px] text-ink-faint">
                        Saved {formatRelativeTime(world.modifiedAt)} · {formatBytes(world.sizeBytes)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-accent">Open</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mb-4 rounded-card border border-line-soft bg-surface px-4 py-6 text-center">
            <p className="text-sm text-ink-muted">No Palworld saves found automatically.</p>
            <p className="mt-1 text-xs text-ink-faint">
              Saves normally live in
              <br />
              <code className="font-mono text-[11px]">
                %LOCALAPPDATA%\Pal\Saved\SaveGames\&lt;steam-id&gt;\&lt;world&gt;
              </code>
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => void browseForWorld()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            <FolderOpen size={15} />
            Choose save folder
          </button>
          <button
            onClick={() => void rescanWorlds()}
            title="Scan again"
            className="flex items-center justify-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2.5 text-sm text-ink-muted transition-colors hover:border-line hover:text-ink"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-faint">
          PalBoard only ever reads your save files. It never writes to them.
        </p>
      </div>
    </div>
  )
}
