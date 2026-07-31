/**
 * The typed contract between the Electron main process and the renderer.
 *
 * Both sides import these types, so a change to a channel's payload is a
 * compile error rather than a runtime surprise.
 */
import type { DashboardStats, HistoryPoint, SaveSnapshot } from './domain'

export type ExportKind = 'pals-csv' | 'pals-json' | 'items-csv'

export interface WorldCandidate {
  path: string
  worldId: string
  accountId: string | null
  modifiedAt: number
  sizeBytes: number
}

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Everything the renderer needs to render the whole app. */
export interface SyncState {
  status: SyncStatus
  /** World folder currently being watched. */
  worldPath: string | null
  /** Worlds found on disk, newest first. */
  worlds: WorldCandidate[]
  snapshot: SaveSnapshot | null
  stats: DashboardStats | null
  error: string | null
  /** True while a reload triggered by a save write is in flight. */
  syncing: boolean
  lastSyncedAt: number | null
}

export const IPC = {
  getState: 'palboard:get-state',
  discoverWorlds: 'palboard:discover-worlds',
  selectWorld: 'palboard:select-world',
  browseForWorld: 'palboard:browse-for-world',
  reload: 'palboard:reload',
  revealSaveFolder: 'palboard:reveal-save-folder',
  getHistory: 'palboard:get-history',
  exportData: 'palboard:export-data',
  /** Main -> renderer push whenever state changes. */
  stateChanged: 'palboard:state-changed',
} as const

/** Shape exposed on `window.palboard` by the preload bridge. */
export interface PalBoardApi {
  getState(): Promise<SyncState>
  discoverWorlds(): Promise<WorldCandidate[]>
  selectWorld(path: string): Promise<SyncState>
  browseForWorld(): Promise<SyncState>
  reload(): Promise<SyncState>
  revealSaveFolder(): Promise<void>
  /** Time-series recorded by PalBoard for the current world. */
  getHistory(): Promise<HistoryPoint[]>
  /** Opens a save dialog and writes the export; resolves to the path or null. */
  exportData(kind: ExportKind): Promise<string | null>
  /** Subscribes to state pushes. Returns an unsubscribe function. */
  onStateChanged(listener: (state: SyncState) => void): () => void
}
