/**
 * Registers the main-process side of the IPC contract.
 *
 * Every handler returns the full {@link SyncState} so the renderer never has to
 * stitch partial updates together, and the same shape is pushed on the
 * `stateChanged` channel when the watcher triggers a reload.
 *
 * Two rules hold for everything here. Arguments arriving over IPC are untrusted
 * and validated before use, even though the only sender today is our own
 * renderer. And handlers do not reject: an `invoke` that rejects surfaces in the
 * renderer as an unhandled promise rejection far from the click that caused it,
 * so operational failures are folded into the returned state instead.
 */
import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { defaultSaveRoots } from '../locator'
import { buildExport, type ExportKind } from '../services/exporter'
import type { SaveStore } from '../services/saveStore'
import { IPC } from '../../shared/ipc'

const EXPORT_KINDS: ReadonlySet<string> = new Set<ExportKind>([
  'pals-csv',
  'pals-json',
  'items-csv',
])

/** Guards against a pathological argument reaching the filesystem layer. */
const MAX_PATH_LENGTH = 4096

export function registerIpc(store: SaveStore, getWindow: () => BrowserWindow | null): void {
  /**
   * Wraps a handler so a thrown error becomes a logged fallback value.
   * `channel` is named in the log because the renderer sees only the fallback.
   */
  const handle = <T>(channel: string, fn: (event: Electron.IpcMainInvokeEvent, arg: unknown) => Promise<T> | T, fallback: () => T): void => {
    ipcMain.handle(channel, async (event, arg: unknown) => {
      try {
        return await fn(event, arg)
      } catch (err) {
        console.error(`[ipc] ${channel} failed:`, err)
        return fallback()
      }
    })
  }

  const state = () => store.state

  handle(IPC.getState, () => store.state, state)

  handle(IPC.discoverWorlds, async () => (await store.refreshWorldList()).worlds, () => store.state.worlds)

  handle(
    IPC.selectWorld,
    (_event, path: unknown) => {
      if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) {
        return store.state
      }
      return store.selectWorld(path)
    },
    state,
  )

  handle(
    IPC.browseForWorld,
    async () => {
      const window = getWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Select your Palworld world folder (the one containing Level.sav)',
        properties: ['openDirectory'],
        defaultPath: defaultSaveRoots()[0],
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) return store.state
      return store.selectWorld(result.filePaths[0])
    },
    state,
  )

  handle(IPC.reload, () => store.reload(), state)

  handle(IPC.getHistory, () => store.getHistory(), () => [])

  handle(
    IPC.exportData,
    async (_event, kind: unknown) => {
      const snapshot = store.state.snapshot
      if (typeof kind !== 'string' || !EXPORT_KINDS.has(kind) || !snapshot) return null

      const { data, defaultName, filter } = buildExport(kind as ExportKind, snapshot)
      const window = getWindow()
      const options: Electron.SaveDialogOptions = { defaultPath: defaultName, filters: [filter] }
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null

      await writeFile(result.filePath, data, 'utf8')
      return result.filePath
    },
    () => null,
  )

  handle(
    IPC.revealSaveFolder,
    async () => {
      const target = store.state.worldPath ?? defaultSaveRoots()[0]
      // openPath resolves with a message string instead of rejecting.
      if (target) {
        const problem = await shell.openPath(target)
        if (problem) console.error(`[ipc] could not open ${target}: ${problem}`)
      }
    },
    () => undefined,
  )

  // Push state to whichever window is alive.
  store.on('change', (next) => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(IPC.stateChanged, next)
    }
  })
}
