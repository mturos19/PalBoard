/**
 * Mirrors the main process's {@link SyncState} into the renderer.
 *
 * The main process is authoritative: this store never mutates domain data, it
 * only caches the last pushed state and exposes the commands that ask main to
 * change something. That keeps a single source of truth across two processes.
 */
import { create } from 'zustand'
import type { SyncState } from '@shared/ipc'

interface SyncStore extends SyncState {
  /** False until the first state has arrived from main. */
  hydrated: boolean
  setState(state: SyncState): void
  selectWorld(path: string): Promise<void>
  browseForWorld(): Promise<void>
  reload(): Promise<void>
  revealSaveFolder(): Promise<void>
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

export const useSyncStore = create<SyncStore>((set) => ({
  ...initial,
  hydrated: false,

  setState: (state) => set({ ...state, hydrated: true }),

  selectWorld: async (path) => set({ ...(await window.palboard.selectWorld(path)), hydrated: true }),
  browseForWorld: async () => set({ ...(await window.palboard.browseForWorld()), hydrated: true }),
  reload: async () => set({ ...(await window.palboard.reload()), hydrated: true }),
  revealSaveFolder: () => window.palboard.revealSaveFolder(),
}))

/**
 * Subscribes the store to main-process pushes. Called once at app start.
 * Returns the unsubscribe function.
 */
export function connectSync(): () => void {
  const { setState } = useSyncStore.getState()
  void window.palboard.getState().then(setState)
  return window.palboard.onStateChanged(setState)
}

// --- selectors ----------------------------------------------------------------
// Kept as standalone functions so components subscribe to the narrowest slice
// possible and re-render only when that slice changes.

export const selectSnapshot = (s: SyncStore) => s.snapshot
export const selectStats = (s: SyncStore) => s.stats
export const selectPals = (s: SyncStore) => s.snapshot?.pals
export const selectBases = (s: SyncStore) => s.snapshot?.bases
export const selectWorld = (s: SyncStore) => s.snapshot?.world
