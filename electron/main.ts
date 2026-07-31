/**
 * Electron main process entry.
 *
 * Creates the window, wires up the save store and IPC, and starts scanning for
 * worlds as soon as the UI is ready to receive state.
 */
import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerIpc } from './api/ipc'
import { SaveStore } from './services/saveStore'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
const store = new SaveStore()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    title: 'PalBoard',
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // Keep external links out of the app shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  registerIpc(store, () => mainWindow)

  // Discover and load once the renderer can receive pushes.
  mainWindow.webContents.once('did-finish-load', () => {
    void store.initialise()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      mainWindow.webContents.once('did-finish-load', () => {
        void store.initialise()
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void store.dispose()
})
