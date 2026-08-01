/**
 * Watches a world folder for save writes.
 *
 * Palworld rewrites Level.sav wholesale on autosave, so a naive `change` handler
 * fires while the file is still being written and the parse sees a truncated
 * container. chokidar's `awaitWriteFinish` polls the size until it stops
 * growing, which is what makes "update within a few seconds" reliable rather
 * than racy.
 *
 * This watcher is strictly read-only; it never opens the save for writing.
 */
import { EventEmitter } from 'node:events'
import chokidar, { type FSWatcher } from 'chokidar'

export interface SaveWatcherOptions {
  /** Quiet period the file size must hold before we consider a write complete. */
  stabilityThresholdMs?: number
  /** How often to poll during a write. */
  pollIntervalMs?: number
  /** Extra debounce after stability, coalescing the sibling .sav writes. */
  debounceMs?: number
  /** Longest {@link SaveWatcher.start} will block waiting for the initial scan. */
  readyTimeoutMs?: number
}

export interface SaveWatcherEvents {
  /** A completed save write was detected; the payload lists changed files. */
  change: [files: string[]]
  error: [error: Error]
}

/**
 * Emits a coalesced `change` event after Palworld finishes writing a save.
 *
 * Palworld touches Level.sav, LevelMeta.sav and the player saves in quick
 * succession. Each settles independently, so we additionally debounce to emit
 * one event per autosave rather than four.
 */
export class SaveWatcher extends EventEmitter<SaveWatcherEvents> {
  private watcher: FSWatcher | null = null
  private pending = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  /** Incremented per {@link start}, so a superseded start abandons its watcher. */
  private startToken = 0

  private readonly stabilityThresholdMs: number
  private readonly pollIntervalMs: number
  private readonly debounceMs: number
  private readonly readyTimeoutMs: number

  constructor(opts: SaveWatcherOptions = {}) {
    super()
    this.stabilityThresholdMs = opts.stabilityThresholdMs ?? 400
    this.pollIntervalMs = opts.pollIntervalMs ?? 100
    this.debounceMs = opts.debounceMs ?? 350
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 10_000
  }

  get watching(): boolean {
    return this.watcher !== null
  }

  /**
   * Starts watching a world folder. Replaces any previous watch.
   *
   * Resolves once the initial scan completes. It always resolves: a watch that
   * never becomes ready (an unreadable folder, a stalled network drive) must not
   * strand the caller, because `start` sits directly in the path of selecting a
   * world and a pending promise there would freeze the app on an empty screen.
   */
  async start(worldDir: string): Promise<void> {
    const token = ++this.startToken
    await this.stop()
    // A newer start() arrived while we were closing; that one owns the watcher.
    if (token !== this.startToken) return

    // chokidar 4 dropped glob patterns: a path containing `*` is now treated as
    // a literal filename, which silently watches nothing at all. The supported
    // shape is "watch the directory, filter with `ignored`" — depth 1 reaches
    // the world's own saves plus Players/, and no further.
    const watcher = chokidar.watch(worldDir, {
      ignoreInitial: true,
      depth: 1,
      ignored: (path, stats) => {
        // Do not descend into the game's own backup folder.
        if (BACKUP_DIR.test(path)) return true
        // Directories must stay walkable, and an entry whose kind we do not know
        // yet is offered again with stats before anything is emitted for it.
        return stats?.isFile() === true && !isSaveFile(path)
      },
      awaitWriteFinish: {
        stabilityThreshold: this.stabilityThresholdMs,
        pollInterval: this.pollIntervalMs,
      },
    })
    this.watcher = watcher

    watcher.on('add', (path) => this.queue(path))
    watcher.on('change', (path) => this.queue(path))
    // Attached before the ready race so chokidar never emits an unhandled
    // 'error', which on an EventEmitter would throw and take down the process.
    watcher.on('error', (err) => this.emit('error', asError(err)))

    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        watcher.off('ready', done)
        watcher.off('error', done)
        resolve()
      }
      const timer = setTimeout(done, this.readyTimeoutMs)
      // Do not keep the process alive purely for this timeout.
      timer.unref?.()
      watcher.once('ready', done)
      watcher.once('error', done)
    })
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
    if (this.watcher) {
      const w = this.watcher
      this.watcher = null
      // A close failure leaves nothing to clean up beyond what we already did.
      await w.close().catch(() => {})
    }
  }

  private queue(path: string): void {
    // `ignored` is advisory until stats are known; the emitted path is final.
    if (!isSaveFile(path) || BACKUP_DIR.test(path)) return
    this.pending.add(path)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const files = [...this.pending]
      this.pending.clear()
      if (files.length) this.emit('change', files)
    }, this.debounceMs)
  }
}

const BACKUP_DIR = /[\\/]backup(?:[\\/]|$)/i

/**
 * True for a save file the loader actually reads.
 *
 * `Players/<uid>_dps.sav` holds damage statistics, which the loader skips. It is
 * rewritten on its own schedule, so treating it as a save would spend a full
 * re-parse producing a snapshot identical to the last one.
 */
function isSaveFile(path: string): boolean {
  const name = path.toLowerCase()
  return name.endsWith('.sav') && !name.endsWith('_dps.sav')
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))
