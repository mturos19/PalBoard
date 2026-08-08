/**
 * Mirrors the platform's {@link SyncState} into the UI.
 *
 * `window.palboard` is authoritative: this store never mutates domain data, it
 * only caches the last pushed state and exposes the commands that ask for a
 * change. That keeps a single source of truth whether the save is being read by
 * a worker in this page or by a desktop main process.
 *
 * Every command swallows its own failure. These are called from click handlers,
 * where an unhandled rejection would surface as a console error detached from
 * the button that caused it — and the platform already reports real problems
 * through `SyncState.error`, which the UI renders.
 */
import { create } from 'zustand'
import type { ExportKind, SyncState } from '@shared/ipc'

interface SyncStore extends SyncState {
  /** False until the first state has arrived. */
  hydrated: boolean
  setState(state: SyncState): void
  selectWorld(path: string): Promise<void>
  browseForWorld(): Promise<void>
  reload(): Promise<void>
  revealSaveFolder(): Promise<void>
  rescanWorlds(): Promise<void>
  /** Adopts a folder the user dropped or picked with a file input. */
  openFiles(files: File[]): Promise<void>
  /** Opens a folder PalBoard can re-read as the game saves. */
  openDirectory(): Promise<void>
  /** Drops the world and clears anything stored in this browser. */
  forget(): Promise<void>
  /** Downloads an export; resolves to the file name, or null if unavailable. */
  exportData(kind: ExportKind): Promise<string | null>
}

const initial: SyncState = {
  status: 'idle',
  worldPath: null,
  worlds: [],
  snapshot: null,
  stats: null,
  error: null,
  syncing: false,
  lastSyncedAt: null,
}

export const useSyncStore = create<SyncStore>((set) => {
  /** Applies a command's returned state, or records why it could not run. */
  const apply = async (what: string, command: () => Promise<SyncState>): Promise<void> => {
    try {
      set({ ...(await command()), hydrated: true })
    } catch (err) {
      console.error(`[palboard] ${what} failed:`, err)
      set({ error: `${what} failed: ${(err as Error).message}`, hydrated: true })
    }
  }

  return {
    ...initial,
    hydrated: false,

    setState: (state) => set({ ...state, hydrated: true }),

    selectWorld: (path) => apply('opening the world', () => window.palboard.selectWorld(path)),
    browseForWorld: () => apply('choosing a folder', () => window.palboard.browseForWorld()),
    reload: () => apply('reloading the save', () => window.palboard.reload()),
    openFiles: (files) => apply('reading that folder', () => window.palboard.openFiles(files)),
    openDirectory: () => apply('opening that folder', () => window.palboard.openDirectory()),
    forget: () => apply('clearing the world', () => window.palboard.forget()),
    rescanWorlds: () =>
      apply('scanning for saves', async () => {
        await window.palboard.discoverWorlds()
        // The scan pushes the new world list on the state channel; return the
        // current state so `apply` has something well-formed to merge.
        return window.palboard.getState()
      }),

    revealSaveFolder: async () => {
      try {
        await window.palboard.revealSaveFolder()
      } catch (err) {
        console.error('[palboard] opening the save folder failed:', err)
      }
    },

    exportData: async (kind) => {
      try {
        return await window.palboard.exportData(kind)
      } catch (err) {
        console.error('[palboard] export failed:', err)
        return null
      }
    },
  }
})

/**
 * Subscribes the store to main-process pushes. Called once at app start.
 * Returns the unsubscribe function.
 */
export function connectSync(): () => void {
  const { setState } = useSyncStore.getState()

  // Subscribe first, then ask for the current state: the other order has a
  // window in which a push lands before the subscription exists and is lost.
  let pushed = false
  const unsubscribe = window.palboard.onStateChanged((state) => {
    pushed = true
    setState(state)
  })

  window.palboard
    .getState()
    .then((state) => {
      // A push that arrived while this was in flight is the fresher of the two.
      if (!pushed) setState(state)
    })
    .catch((err: unknown) => {
      console.error('[palboard] could not read the initial state:', err)
    })

  return unsubscribe
}

// --- selectors ----------------------------------------------------------------
// Kept as standalone functions so components subscribe to the narrowest slice
// possible and re-render only when that slice changes.

export const selectSnapshot = (s: SyncStore) => s.snapshot
export const selectStats = (s: SyncStore) => s.stats
export const selectPals = (s: SyncStore) => s.snapshot?.pals
export const selectBases = (s: SyncStore) => s.snapshot?.bases
export const selectWorld = (s: SyncStore) => s.snapshot?.world
