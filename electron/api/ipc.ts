/**
 * Registers the main-process side of the IPC contract.
 *
 * Every handler returns the full {@link SyncState} so the renderer never has to
 * stitch partial updates together, and the same shape is pushed on the
 * `stateChanged` channel when the watcher triggers a reload.
 */
import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { defaultSaveRoots } from '../locator'
import { buildExport, type ExportKind } from '../services/exporter'
import type { SaveStore } from '../services/saveStore'
import { IPC } from '../../shared/ipc'

const EXPORT_KINDS: ReadonlySet<string> = new Set(['pals-csv', 'pals-json', 'items-csv'])

export function registerIpc(store: SaveStore, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.getState, () => store.state)

  ipcMain.handle(IPC.discoverWorlds, async () => (await store.refreshWorldList()).worlds)

  ipcMain.handle(IPC.selectWorld, async (_event, path: unknown) => {
    if (typeof path !== 'string' || path.length === 0) return store.state
    return store.selectWorld(path)
  })

  ipcMain.handle(IPC.browseForWorld, async () => {
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
  })

  ipcMain.handle(IPC.reload, () => store.reload())

  ipcMain.handle(IPC.getHistory, () => store.getHistory())

  ipcMain.handle(IPC.exportData, async (_event, kind: unknown) => {
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
  })

  ipcMain.handle(IPC.revealSaveFolder, async () => {
    const target = store.state.worldPath ?? defaultSaveRoots()[0]
    if (target) await shell.openPath(target)
  })

  // Push state to whichever window is alive.
  store.on('change', (state) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC.stateChanged, state)
    }
  })
}
