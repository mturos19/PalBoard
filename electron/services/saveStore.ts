/**
 * Owns the live view of the player's save.
 *
 * Responsibilities: pick a world, parse it, watch it, and re-parse when the game
 * writes. Everything is funnelled through {@link SaveStore.state} so the
 * renderer has exactly one source of truth.
 *
 * Reloads are serialised: if a save write lands while a parse is running, the
 * store finishes the current parse and then runs exactly one more, rather than
 * queueing a parse per event.
 */
import { EventEmitter } from 'node:events'
import { discoverWorlds, resolveWorldFolder } from '../locator'
import { loadWorld } from '@core/loader'
import { fsWorldSource } from '../worldSource'
import { computeStats } from '@core/palworld/model'
import { SaveWatcher } from '../watcher'
import { HistoryStore } from './history'
import { loadPrefs, savePrefs } from './prefs'
import type { SyncState, WorldCandidate } from '../../shared/ipc'
import type { HistoryPoint } from '../../shared/domain'

export class SaveStore extends EventEmitter<{ change: [SyncState] }> {
  private current: SyncState = {
    status: 'idle',
    worldPath: null,
    worlds: [],
    snapshot: null,
    stats: null,
    error: null,
    syncing: false,
    lastSyncedAt: null,
    // The desktop shell decides its world from disk during `initialise`, so it
    // is never waiting on a remembered one.
    restoring: false,
  }

  private readonly watcher = new SaveWatcher()
  private readonly history = new HistoryStore()
  private revision = 0
  private loading = false
  /** Set when a save write arrives mid-parse; triggers exactly one re-run. */
  private reloadQueued = false
  /** Incremented per world selection, so a late one cannot overwrite a newer. */
  private selection = 0

  constructor() {
    super()
    this.watcher.on('change', () => {
      // Errors are already folded into state by reload(); nothing to add here.
      void this.reload()
    })
    this.watcher.on('error', (err) => {
      this.patch({ error: `watcher: ${err.message}` })
    })
  }

  get state(): SyncState {
    return this.current
  }

  private patch(partial: Partial<SyncState>): void {
    this.current = { ...this.current, ...partial }
    this.emit('change', this.current)
  }

  /**
   * Scans disk for worlds, then adopts the world the user had open last —
   * falling back to the most recently played.
   */
  async initialise(): Promise<SyncState> {
    const worlds = await this.scanWorlds()
    this.patch({ worlds })
    const remembered = loadPrefs().lastWorldPath
    const target =
      (remembered && worlds.find((w) => w.path === remembered)?.path) ??
      remembered ??
      worlds[0]?.path
    if (target) await this.selectWorld(target)
    return this.current
  }

  /** Disk scan that reports failure as state rather than as a rejection. */
  private async scanWorlds(): Promise<WorldCandidate[]> {
    try {
      return await discoverWorlds()
    } catch (err) {
      this.patch({ error: `could not scan for save folders: ${asError(err).message}` })
      return this.current.worlds
    }
  }

  /** History points recorded for the currently open world. */
  async getHistory(): Promise<HistoryPoint[]> {
    const worldId = this.current.snapshot?.world.worldId
    return worldId ? this.history.load(worldId) : []
  }

  async refreshWorldList(): Promise<SyncState> {
    this.patch({ worlds: await this.scanWorlds() })
    return this.current
  }

  /**
   * Switches to a world folder and begins watching it.
   * Accepts a world folder or its parent; see {@link resolveWorldFolder}.
   *
   * Concurrent calls are resolved last-one-wins: each selection takes a token,
   * and an older selection that finishes late abandons its result rather than
   * dragging the UI back to a world the user already navigated away from.
   */
  async selectWorld(path: string): Promise<SyncState> {
    const token = ++this.selection
    const resolved = await resolveWorldFolder(path)
    if (token !== this.selection) return this.current

    if (!resolved) {
      this.patch({
        status: 'error',
        error: `No Level.sav found in ${path}. Pick the folder that contains Level.sav.`,
      })
      return this.current
    }

    this.patch({ worldPath: resolved.path, status: 'loading', error: null })
    savePrefs({ lastWorldPath: resolved.path })

    try {
      await this.watcher.start(resolved.path)
    } catch (err) {
      // Losing the watcher costs live updates, not the world itself: parse it
      // anyway and let the user reload by hand.
      this.patch({ error: `watcher: ${asError(err).message}` })
    }
    if (token !== this.selection) return this.current

    await this.reload()
    return this.current
  }

  /**
   * Re-parses the current world. Safe to call concurrently: a call arriving
   * while a parse is in flight schedules exactly one re-run rather than queueing
   * a parse per save write.
   */
  async reload(): Promise<SyncState> {
    if (!this.current.worldPath) return this.current

    if (this.loading) {
      this.reloadQueued = true
      return this.current
    }

    this.loading = true
    this.patch({ syncing: true })

    try {
      do {
        this.reloadQueued = false
        const worldPath: string | null = this.current.worldPath
        if (!worldPath) break

        try {
          const snapshot = await loadWorld(fsWorldSource(worldPath))

          // The world changed while we parsed: this snapshot describes a save
          // the user is no longer looking at, so drop it and parse the new one.
          if (this.current.worldPath !== worldPath) {
            this.reloadQueued = true
            continue
          }

          snapshot.revision = ++this.revision
          this.patch({
            status: 'ready',
            snapshot,
            stats: computeStats(snapshot),
            error: null,
            lastSyncedAt: Date.now(),
          })
          // Record the time-series point after the UI has the fresh state.
          await this.history.append(snapshot).catch(() => {})
        } catch (err) {
          // Kept inside the loop: a read that lost a race with the game's own
          // write must not cancel the reload the next change event queued.
          if (this.current.worldPath === worldPath) {
            this.patch({ status: 'error', error: asError(err).message })
          }
        }
      } while (this.reloadQueued)
    } finally {
      this.loading = false
      this.patch({ syncing: false })
    }

    return this.current
  }

  async dispose(): Promise<void> {
    // Bump the token so any parse still in flight discards its result.
    this.selection++
    this.watcher.removeAllListeners()
    await this.watcher.stop()
    this.removeAllListeners()
  }
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))
