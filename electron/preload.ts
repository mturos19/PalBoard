/**
 * Preload bridge.
 *
 * Context isolation stays on and the renderer never touches Node or Electron
 * directly — it only sees the narrow, typed {@link PalBoardApi} surface below.
 * PalBoard is read-only by design, so nothing here can write to a save.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PalBoardApi, type SyncState, type WorldCandidate } from '../shared/ipc'

const api: PalBoardApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<SyncState>,
  discoverWorlds: () => ipcRenderer.invoke(IPC.discoverWorlds) as Promise<WorldCandidate[]>,
  selectWorld: (path) => ipcRenderer.invoke(IPC.selectWorld, path) as Promise<SyncState>,
  browseForWorld: () => ipcRenderer.invoke(IPC.browseForWorld) as Promise<SyncState>,
  reload: () => ipcRenderer.invoke(IPC.reload) as Promise<SyncState>,
  revealSaveFolder: () => ipcRenderer.invoke(IPC.revealSaveFolder) as Promise<void>,
  onStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: SyncState) => listener(state)
    ipcRenderer.on(IPC.stateChanged, handler)
    return () => {
      ipcRenderer.off(IPC.stateChanged, handler)
    }
  },
}

contextBridge.exposeInMainWorld('palboard', api)
