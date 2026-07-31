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
import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'

export interface SaveWatcherOptions {
  /** Quiet period the file size must hold before we consider a write complete. */
  stabilityThresholdMs?: number
  /** How often to poll during a write. */
  pollIntervalMs?: number
  /** Extra debounce after stability, coalescing the sibling .sav writes. */
  debounceMs?: number
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

  private readonly stabilityThresholdMs: number
  private readonly pollIntervalMs: number
  private readonly debounceMs: number

  constructor(opts: SaveWatcherOptions = {}) {
    super()
    this.stabilityThresholdMs = opts.stabilityThresholdMs ?? 400
    this.pollIntervalMs = opts.pollIntervalMs ?? 100
    this.debounceMs = opts.debounceMs ?? 350
  }

  get watching(): boolean {
    return this.watcher !== null
  }

  /** Starts watching a world folder. Replaces any previous watch. */
  async start(worldDir: string): Promise<void> {
    await this.stop()

    this.watcher = chokidar.watch(
      [join(worldDir, '*.sav'), join(worldDir, 'Players', '*.sav')],
      {
        ignoreInitial: true,
        // Do not descend into the game's own backup folder.
        ignored: (path) => /[\\/]backup[\\/]/i.test(path),
        awaitWriteFinish: {
          stabilityThreshold: this.stabilityThresholdMs,
          pollInterval: this.pollIntervalMs,
        },
      },
    )

    this.watcher.on('add', (path) => this.queue(path))
    this.watcher.on('change', (path) => this.queue(path))
    this.watcher.on('error', (err) => this.emit('error', err as Error))

    await new Promise<void>((resolve) => {
      this.watcher?.once('ready', () => resolve())
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
      await w.close()
    }
  }

  private queue(path: string): void {
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
