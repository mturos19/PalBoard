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
import { loadWorld } from '../parser/loader'
import { computeStats } from '../parser/palworld/model'
import { SaveWatcher } from '../watcher'
import type { SyncState } from '../../shared/ipc'

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
  }

  private readonly watcher = new SaveWatcher()
  private revision = 0
  private loading = false
  /** Set when a save write arrives mid-parse; triggers exactly one re-run. */
  private reloadQueued = false

  constructor() {
    super()
    this.watcher.on('change', () => {
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

  /** Scans disk for worlds and adopts the most recently played one. */
  async initialise(): Promise<SyncState> {
    const worlds = await discoverWorlds()
    this.patch({ worlds })
    if (worlds.length > 0) await this.selectWorld(worlds[0].path)
    return this.current
  }

  async refreshWorldList(): Promise<SyncState> {
    this.patch({ worlds: await discoverWorlds() })
    return this.current
  }

  /**
   * Switches to a world folder and begins watching it.
   * Accepts a world folder or its parent; see {@link resolveWorldFolder}.
   */
  async selectWorld(path: string): Promise<SyncState> {
    const resolved = await resolveWorldFolder(path)
    if (!resolved) {
      this.patch({
        status: 'error',
        error: `No Level.sav found in ${path}. Pick the folder that contains Level.sav.`,
      })
      return this.current
    }

    this.patch({ worldPath: resolved.path, status: 'loading', error: null })
    await this.watcher.start(resolved.path)
    await this.reload()
    return this.current
  }

  /** Re-parses the current world. Safe to call concurrently. */
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
        const snapshot = await loadWorld(this.current.worldPath)
        snapshot.revision = ++this.revision
        this.patch({
          status: 'ready',
          snapshot,
          stats: computeStats(snapshot),
          error: null,
          lastSyncedAt: Date.now(),
        })
      } while (this.reloadQueued)
    } catch (err) {
      this.patch({ status: 'error', error: (err as Error).message })
    } finally {
      this.loading = false
      this.patch({ syncing: false })
    }

    return this.current
  }

  async dispose(): Promise<void> {
    await this.watcher.stop()
    this.removeAllListeners()
  }
}
