/**
 * The front door.
 *
 * A visitor arrives knowing nothing about PalBoard, so this screen has to do
 * three things before it asks for anything: say what the app does, say plainly
 * that the save never leaves their machine, and tell them where the save lives.
 * Only then does it offer the picker.
 */
import { useRef, useState, type DragEvent } from 'react'
import {
  Activity, ChevronDown, FolderOpen, HardDriveDownload, Loader2, Lock,
  MonitorSmartphone, Radio, Upload,
} from 'lucide-react'
import { cx } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

/** Where Palworld keeps saves, per platform. */
const SAVE_LOCATIONS: Array<{ platform: string; path: string }> = [
  { platform: 'Steam (Windows)', path: '%LOCALAPPDATA%\\Pal\\Saved\\SaveGames\\<steam-id>' },
  { platform: 'Game Pass / Xbox', path: '%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_*\\SystemAppData\\wgs' },
  { platform: 'Steam (Linux / Proton)', path: '~/.steam/steam/steamapps/compatdata/1623730/pfx/drive_c/users/steamuser/AppData/Local/Pal/Saved/SaveGames' },
  { platform: 'Dedicated server', path: '<server>/Pal/Saved/SaveGames/0' },
]

export function LandingPage() {
  const status = useSyncStore((s) => s.status)
  const error = useSyncStore((s) => s.error)
  const openFiles = useSyncStore((s) => s.openFiles)
  const openDirectory = useSyncStore((s) => s.openDirectory)

  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = status === 'loading'
  const canOpenDirectory = window.palboard.canOpenDirectory

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const files = await filesFromDrop(event.dataTransfer)
    if (files.length > 0) await openFiles(files)
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
        <header className="animate-rise text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-accent/15 text-accent">
            <HardDriveDownload size={24} strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            See your whole <span className="text-accent-gradient">Palworld</span> save
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-muted sm:text-base">
            Every pal, base, chest and statistic in your world — read straight out of your
            save file, in your browser. No account, no upload, no mods.
          </p>
        </header>

        {/* The picker */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => void onDrop(e)}
          className={cx(
            'animate-rise mt-8 rounded-card border-2 border-dashed p-6 text-center transition-colors sm:p-10',
            dragging ? 'border-accent bg-accent/5' : 'border-line bg-surface/60',
          )}
          style={{ animationDelay: '60ms' }}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 size={26} className="animate-spin text-accent" />
              <p className="text-sm text-ink-muted">Reading your save…</p>
              <p className="text-xs text-ink-faint">A big world takes a second or two.</p>
            </div>
          ) : (
            <>
              <Upload size={26} className="mx-auto text-ink-faint" />
              <p className="mt-3 text-sm font-medium">Drop your Palworld save folder here</p>
              <p className="mt-1 text-xs text-ink-faint">
                The folder containing <code className="font-mono">Level.sav</code> — or the
                <code className="mx-1 font-mono">SaveGames</code> folder above it.
              </p>

              <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                {canOpenDirectory ? (
                  <button
                    onClick={() => void openDirectory()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 sm:w-auto"
                  >
                    <FolderOpen size={15} />
                    Choose save folder
                  </button>
                ) : null}
                <button
                  onClick={() => inputRef.current?.click()}
                  className={cx(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors sm:w-auto',
                    canOpenDirectory
                      ? 'border border-line-soft bg-surface text-ink-muted hover:border-line hover:text-ink'
                      : 'bg-accent text-canvas hover:opacity-90',
                  )}
                >
                  <FolderOpen size={15} />
                  {canOpenDirectory ? 'Browse instead' : 'Choose save folder'}
                </button>
              </div>

              {canOpenDirectory ? (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
                  <Radio size={11} className="text-mint" />
                  Choosing a folder also keeps the dashboard live while you play.
                </p>
              ) : null}

              <input
                ref={inputRef}
                type="file"
                multiple
                // Directory upload: not in the HTML spec, but universally supported.
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (files.length > 0) void openFiles(files)
                }}
              />
            </>
          )}

          {error && !busy ? (
            <p className="mx-auto mt-4 max-w-md rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
              {error}
            </p>
          ) : null}
        </div>

        {/* Trust */}
        <section
          className="animate-rise mt-4 grid gap-2 sm:grid-cols-3"
          style={{ animationDelay: '120ms' }}
        >
          <Assurance
            icon={Lock}
            title="Nothing is uploaded"
            detail="Your save is read and decoded inside this page. There is no server to send it to."
          />
          <Assurance
            icon={Activity}
            title="Read-only"
            detail="PalBoard never writes to a save. Your world cannot be changed by opening it here."
          />
          <Assurance
            icon={MonitorSmartphone}
            title="Nothing is kept"
            detail="Close the tab and it is gone. Only your chart history stays, in this browser."
          />
        </section>

        {/* Where is my save */}
        <details
          className="animate-rise mt-4 rounded-card border border-line-soft bg-surface"
          style={{ animationDelay: '180ms' }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            Where is my save file?
            <ChevronDown size={15} className="shrink-0 text-ink-faint transition-transform" />
          </summary>
          <div className="border-t border-line-soft px-4 py-3">
            <ul className="space-y-2.5">
              {SAVE_LOCATIONS.map(({ platform, path }) => (
                <li key={platform}>
                  <p className="text-xs font-medium text-ink-muted">{platform}</p>
                  <code className="mt-0.5 block overflow-x-auto whitespace-nowrap rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-faint">
                    {path}
                  </code>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-ink-faint">
              Inside is one folder per world, named with a long hex id. Pick the one holding{' '}
              <code className="font-mono">Level.sav</code>, or just drop the whole{' '}
              <code className="font-mono">SaveGames</code> folder and PalBoard will find the world
              you played last.
            </p>
          </div>
        </details>

        <p className="mt-8 text-center text-[11px] text-ink-faint">
          PalBoard is not affiliated with Pocketpair. Palworld and its assets belong to their
          owners.
        </p>
      </div>
    </div>
  )
}

function Assurance({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Lock
  title: string
  detail: string
}) {
  return (
    <div className="rounded-card border border-line-soft bg-surface p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <Icon size={14} className="shrink-0 text-mint" />
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{detail}</p>
    </div>
  )
}

/**
 * Pulls a whole dropped folder out of a DataTransfer.
 *
 * `dataTransfer.files` flattens to the top level only, so a dropped directory
 * arrives as a single unusable entry. `webkitGetAsEntry` is the only way to walk
 * into it, and the entries must be captured synchronously — the DataTransfer is
 * neutered as soon as the drop handler yields.
 */
async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry))

  if (entries.length === 0) return Array.from(transfer.files)

  const files: File[] = []
  await Promise.all(entries.map((entry) => collect(entry, files)))
  return files
}

/** Depth-limited so a mis-drop cannot walk an entire drive. */
async function collect(entry: FileSystemEntry, out: File[], depth = 4): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      ;(entry as FileSystemFileEntry).file(resolve, () => resolve(null))
    })
    if (!file) return
    // Preserve the tree: the loader needs to know what sat in Players/.
    Object.defineProperty(file, 'webkitRelativePath', {
      value: entry.fullPath.replace(/^\//, ''),
      configurable: true,
    })
    out.push(file)
    return
  }
  if (!entry.isDirectory || depth <= 0) return
  if (entry.name === 'backup') return // the game's own rolling copies

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries returns at most 100 per call; keep going until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]))
    })
    if (batch.length === 0) break
    await Promise.all(batch.map((child) => collect(child, out, depth - 1)))
  }
}
