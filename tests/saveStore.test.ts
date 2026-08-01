import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveSnapshot } from '../shared/domain'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

/** Resolves the next `loadWorld` call by hand, so parses can be interleaved. */
interface PendingLoad {
  worldDir: string
  resolve(snapshot: SaveSnapshot): void
  reject(error: Error): void
}
const pending: PendingLoad[] = []

vi.mock('../electron/parser/loader', () => ({
  loadWorld: (worldDir: string) =>
    new Promise<SaveSnapshot>((resolve, reject) => {
      pending.push({ worldDir, resolve, reject })
    }),
}))

vi.mock('../electron/locator', () => ({
  discoverWorlds: () => Promise.resolve([]),
  resolveWorldFolder: (path: string) =>
    Promise.resolve({ path, worldId: path, accountId: null, modifiedAt: 0, sizeBytes: 0 }),
  defaultSaveRoots: () => [],
}))

// The store's collaborators are exercised by their own suites; here they only
// need to stay out of the way of the reload sequencing under test.
vi.mock('../electron/watcher', () => ({
  SaveWatcher: class {
    on() {
      return this
    }
    removeAllListeners() {
      return this
    }
    start() {
      return Promise.resolve()
    }
    stop() {
      return Promise.resolve()
    }
  },
}))

vi.mock('../electron/services/history', () => ({
  HistoryStore: class {
    append() {
      return Promise.resolve()
    }
    load() {
      return Promise.resolve([])
    }
  },
}))

vi.mock('../electron/services/prefs', () => ({
  loadPrefs: () => ({}),
  savePrefs: () => {},
}))

const { SaveStore } = await import('../electron/services/saveStore')

function snapshotFor(worldPath: string): SaveSnapshot {
  return {
    revision: 0,
    loadedAt: 0,
    savePath: worldPath,
    world: {
      worldId: worldPath,
      name: worldPath,
      day: 1,
      savedAt: 1,
      difficulty: null,
      playTimeSeconds: null,
      engineVersion: '5.1.1',
    },
    guilds: [],
    players: [],
    pals: [],
    bases: [],
    inventories: [],
    storage: { items: [], containerCount: 0, totalSlots: 0, usedSlots: 0, nearFullContainers: 0 },
    resources: {},
    records: [],
    alerts: [],
    diagnostics: {
      format: 'PlM/oodle',
      compressedBytes: 0,
      decompressedBytes: 0,
      decompressMs: 0,
      parseMs: 0,
      buildMs: 0,
      warnings: [],
    },
  }
}

/** Lets queued promise callbacks run without advancing real time. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Completes the oldest outstanding parse. */
async function completeLoad(): Promise<PendingLoad> {
  const load = pending.shift()
  if (!load) throw new Error('expected a parse to be in flight')
  load.resolve(snapshotFor(load.worldDir))
  await settle()
  return load
}

describe('SaveStore', () => {
  beforeEach(() => {
    pending.length = 0
  })

  it('coalesces save writes arriving mid-parse into exactly one re-run', async () => {
    const store = new SaveStore()
    void store.selectWorld('world-a')
    await settle()
    expect(pending).toHaveLength(1)

    // Three autosaves land while the first parse is still running.
    void store.reload()
    void store.reload()
    void store.reload()
    await completeLoad()

    // One re-run, not three.
    expect(pending).toHaveLength(1)
    await completeLoad()
    expect(pending).toHaveLength(0)
  })

  it('discards a parse whose world the user has already navigated away from', async () => {
    const store = new SaveStore()
    void store.selectWorld('world-a')
    await settle()

    void store.selectWorld('world-b')
    await settle()

    // Finish world-a's parse late. Its snapshot describes a save the user is no
    // longer looking at and must not be adopted.
    const stale = pending.shift()!
    expect(stale.worldDir).toBe('world-a')
    stale.resolve(snapshotFor('world-a'))
    await settle()

    expect(store.state.worldPath).toBe('world-b')
    expect(store.state.snapshot?.savePath).not.toBe('world-a')

    // world-b is parsed instead, and that result is kept.
    await completeLoad()
    expect(store.state.snapshot?.savePath).toBe('world-b')
    expect(store.state.status).toBe('ready')
  })

  it('reports a failed parse without cancelling the reload already queued', async () => {
    const store = new SaveStore()
    void store.selectWorld('world-a')
    await settle()

    // A read that lost the race with the game's own write, immediately followed
    // by the change event for the completed write.
    void store.reload()
    pending.shift()!.reject(new Error('unexpected end of file'))
    await settle()

    expect(store.state.status).toBe('error')
    expect(store.state.error).toMatch(/unexpected end of file/)

    // The queued reload still ran, and it recovers the store.
    expect(pending).toHaveLength(1)
    await completeLoad()
    expect(store.state.status).toBe('ready')
    expect(store.state.error).toBeNull()
  })

  it('clears the syncing flag whether the parse succeeds or fails', async () => {
    const store = new SaveStore()
    void store.selectWorld('world-a')
    await settle()
    expect(store.state.syncing).toBe(true)

    pending.shift()!.reject(new Error('boom'))
    await settle()
    expect(store.state.syncing).toBe(false)
  })

  it('numbers snapshots so the renderer can tell one reload from the next', async () => {
    const store = new SaveStore()
    void store.selectWorld('world-a')
    await settle()
    await completeLoad()
    const first = store.state.snapshot!.revision

    void store.reload()
    await completeLoad()
    expect(store.state.snapshot!.revision).toBe(first + 1)
  })

  it('emits a change for every state transition', async () => {
    const store = new SaveStore()
    const seen: string[] = []
    store.on('change', (state) => seen.push(state.status))

    void store.selectWorld('world-a')
    await settle()
    await completeLoad()

    expect(seen).toContain('loading')
    expect(seen[seen.length - 1]).toBe('ready')
  })

  it('does nothing when reloading with no world selected', async () => {
    const store = new SaveStore()
    await store.reload()
    expect(pending).toHaveLength(0)
    expect(store.state.status).toBe('idle')
  })
})
