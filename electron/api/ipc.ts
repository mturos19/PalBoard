/**
 * Registers the main-process side of the IPC contract.
 *
 * Every handler returns the full {@link SyncState} so the renderer never has to
 * stitch partial updates together, and the same shape is pushed on the
 * `stateChanged` channel when the watcher triggers a reload.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { defaultSaveRoots } from '../locator'
import type { SaveStore } from '../services/saveStore'
import { IPC } from '../../shared/ipc'

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
