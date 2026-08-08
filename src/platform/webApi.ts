/**
 * The browser's implementation of {@link PalBoardApi}.
 *
 * The renderer was written against a preload bridge that forwarded to an
 * Electron main process. Nothing about the pages actually needs a second
 * process — they need a thing that owns the current world, parses it, and
 * pushes new state — so the web build satisfies the same contract in-page and
 * every screen works unchanged.
 *
 * Two rules hold throughout. The save never leaves the browser: it is read from
 * a File or a directory handle, parsed in a worker, and discarded when the tab
 * closes. And no method rejects — failures are folded into `SyncState.error`,
 * which the UI already renders.
 */
import type { HistoryPoint } from '@shared/domain'
import type { ExportKind, PalBoardApi, SyncState } from '@shared/ipc'
import { buildExport } from '@core/exporter'
import { appendHistory, clearAll, loadHistory } from './history'
import {
  indexDirectory,
  indexPickedFiles,
  NoWorldFoundError,
  worldSourceFor,
  type WorldHandle,
} from './worldSource'
import type { ParseRequest, ParseResponse } from './parse.worker'

/** How often a live directory is checked for a newer Level.sav. */
const POLL_INTERVAL_MS = 5000

/** Web-only additions the landing page and settings screen use. */
export interface WebApi extends PalBoardApi {
  /** True where the File System Access API can give us a live folder. */
  readonly canOpenDirectory: boolean
  /** Opens a folder that PalBoard can re-read as the game saves. */
  openDirectory(): Promise<SyncState>
  /** Adopts a folder chosen through <input webkitdirectory> or dropped. */
  openFiles(files: File[]): Promise<SyncState>
  /**
   * Whether the world currently open *can* be followed. False for one opened by
   * upload: those Files are a snapshot of the moment they were picked and will
   * never show a later autosave, however often we re-read them.
   */
  canFollow(): boolean
  /** Whether this world is being polled for changes. */
  isLive(): boolean
  setLive(live: boolean): void
  /** Forgets the world and wipes anything kept in this browser. */
  forget(): Promise<SyncState>
}

export function createWebApi(): WebApi {
  let state: SyncState = {
    status: 'idle',
    worldPath: null,
    worlds: [],
    snapshot: null,
    stats: null,
    error: null,
    syncing: false,
    lastSyncedAt: null,
  }

  const listeners = new Set<(state: SyncState) => void>()
  const patch = (partial: Partial<SyncState>): SyncState => {
    state = { ...state, ...partial }
    for (const listener of listeners) listener(state)
    return state
  }

  let handle: WorldHandle | null = null
  let revision = 0
  let loading = false
  let reloadQueued = false
  let pollTimer: number | null = null
  let live = false
  /** Last Level.sav mtime we parsed, so polling can skip unchanged saves. */
  let lastSeenModified: number | null = null

  // --- worker ----------------------------------------------------------------

  let worker: Worker | null = null
  let nextRequestId = 1
  const inFlight = new Map<number, (response: ParseResponse) => void>()

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      inFlight.get(event.data.id)?.(event.data)
      inFlight.delete(event.data.id)
    }
    worker.onerror = () => {
      // A worker that died takes every pending parse with it; fail them rather
      // than leaving the UI on "syncing" forever.
      for (const [id, resolve] of inFlight) {
        resolve({ id, ok: false, error: 'the parser stopped unexpectedly — reload the page' })
      }
      inFlight.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  }

  function parse(target: WorldHandle): Promise<ParseResponse> {
    const id = nextRequestId++
    const request: ParseRequest = { id, handle: target }
    return new Promise<ParseResponse>((resolve) => {
      inFlight.set(id, resolve)
      ensureWorker().postMessage(request)
    })
  }

  // --- loading ---------------------------------------------------------------

  async function reload(): Promise<SyncState> {
    if (!handle) return state
    if (loading) {
      reloadQueued = true
      return state
    }

    loading = true
    patch({ syncing: true })
    try {
      do {
        reloadQueued = false
        const target: WorldHandle | null = handle
        if (!target) break

        const response = await parse(target)
        // The user swapped worlds while this parse ran; its result describes a
        // save they are no longer looking at.
        if (handle !== target) {
          reloadQueued = true
          continue
        }

        if (response.ok) {
          response.snapshot.revision = ++revision
          patch({
            status: 'ready',
            snapshot: response.snapshot,
            stats: response.stats,
            error: null,
            lastSyncedAt: Date.now(),
          })
          appendHistory(response.snapshot)
        } else {
          patch({ status: 'error', error: response.error })
        }
      } while (reloadQueued)
    } finally {
      loading = false
      patch({ syncing: false })
    }
    return state
  }

  /**
   * Takes on a newly picked world.
   *
   * `worldPath` is set only once a parse has succeeded, because it is what the
   * app uses to decide it has left the landing page. Setting it up front would
   * swap in the empty dashboard while the save was still being read, and would
   * strand the user there if the folder turned out not to be a world at all.
   */
  async function adopt(next: WorldHandle, label: string): Promise<SyncState> {
    handle = next
    lastSeenModified = null
    revision = 0
    patch({ status: 'loading', error: null, snapshot: null, stats: null, worldPath: null })

    await reload()

    if (state.status === 'ready') {
      patch({ worldPath: label })
      if (next.kind === 'directory') setLive(true)
    } else if (handle === next) {
      handle = null
    }
    return state
  }

  // --- live polling ----------------------------------------------------------

  /**
   * Polls the folder's Level.sav for a newer timestamp.
   *
   * Only a directory handle can do this: picked Files are a snapshot of the
   * moment they were chosen and never change. Checking the mtime first means a
   * quiet world costs one stat call every few seconds, not a 32 MB reparse.
   */
  async function poll(): Promise<void> {
    if (!handle || handle.kind !== 'directory' || loading) return
    try {
      // Via the world source rather than `getFileHandle`, which matches names
      // exactly — the same case-insensitive lookup the loader itself uses.
      const modified = await worldSourceFor(handle).modifiedAt('Level.sav')
      if (modified === null) throw new Error('Level.sav is gone')
      if (lastSeenModified === null) {
        lastSeenModified = modified
        return
      }
      if (modified === lastSeenModified) return
      lastSeenModified = modified
      await reload()
    } catch {
      // The folder went away, or permission lapsed. Stop pestering it; the
      // manual Reload button still works and will surface the real error.
      setLive(false)
    }
  }

  function setLive(next: boolean): void {
    live = next && handle?.kind === 'directory'
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (live) pollTimer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
  }

  // --- pickers ---------------------------------------------------------------

  const canOpenDirectory = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  async function openDirectory(): Promise<SyncState> {
    try {
      const picked = await window.showDirectoryPicker!({ id: 'palworld-saves', mode: 'read' })
      return await adopt(await indexDirectory(picked), picked.name)
    } catch (err) {
      // The user closing the picker is not an error worth showing.
      if ((err as Error)?.name === 'AbortError') return state
      return patch({ status: 'error', error: describe(err) })
    }
  }

  async function openFiles(files: File[]): Promise<SyncState> {
    try {
      const picked = indexPickedFiles(files)
      return await adopt(picked, picked.worldId)
    } catch (err) {
      return patch({ status: 'error', error: describe(err) })
    }
  }

  // --- the shared contract ---------------------------------------------------

  return {
    canOpenDirectory,
    openDirectory,
    openFiles,
    canFollow: () => handle?.kind === 'directory',
    isLive: () => live,
    setLive,

    getState: () => Promise.resolve(state),

    // Nothing to discover: a page cannot look at the disk uninvited.
    discoverWorlds: () => Promise.resolve([]),

    selectWorld: () => Promise.resolve(state),

    // "Open another save", from Settings or the command palette. Prefers the
    // live-capable picker and falls back to a throwaway directory input, so the
    // action works on browsers without the File System Access API too.
    browseForWorld: async () => {
      if (canOpenDirectory) return openDirectory()
      const files = await pickDirectoryViaInput()
      return files.length > 0 ? openFiles(files) : state
    },

    reload: () => reload(),

    revealSaveFolder: () => Promise.resolve(),

    getHistory: (): Promise<HistoryPoint[]> =>
      Promise.resolve(state.snapshot ? loadHistory(state.snapshot.world.worldId) : []),

    exportData: (kind: ExportKind): Promise<string | null> => {
      if (!state.snapshot) return Promise.resolve(null)
      const { data, defaultName, mimeType } = buildExport(kind, state.snapshot)
      download(data, defaultName, mimeType)
      return Promise.resolve(defaultName)
    },

    forget: () => {
      setLive(false)
      handle = null
      lastSeenModified = null
      clearAll()
      return Promise.resolve(
        patch({
          status: 'idle',
          worldPath: null,
          snapshot: null,
          stats: null,
          error: null,
          lastSyncedAt: null,
        }),
      )
    },

    onStateChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Opens a folder picker without a rendered input.
 *
 * There is no file input on screen once a world is open, and `showDirectoryPicker`
 * is Chromium-only, so this synthesises one for the click. It resolves empty if
 * the dialog is dismissed — which fires no event at all, hence the `focus`
 * fallback rather than waiting on `change` forever.
 */
function pickDirectoryViaInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.style.display = 'none'
    document.body.append(input)

    let settled = false
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }

    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    // Cancelling the dialog returns focus to the page without firing `change`.
    window.addEventListener(
      'focus',
      () => setTimeout(() => finish(Array.from(input.files ?? [])), 400),
      { once: true },
    )
    input.click()
  })
}

/** Hands the browser a file without ever touching a server. */
function download(data: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoking immediately can cancel the download in some browsers; one turn of
  // the event loop is enough for the click to have been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const describe = (err: unknown): string =>
  err instanceof NoWorldFoundError || err instanceof Error
    ? err.message
    : 'that folder could not be read'
