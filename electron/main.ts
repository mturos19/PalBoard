/**
 * Electron main process entry.
 *
 * Product plumbing lives here: single-instance lock, persisted window bounds,
 * the hidden title bar with native overlay controls, and app lifecycle. Save
 * logic is entirely inside SaveStore.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, nativeImage, screen, shell } from 'electron'
import { registerIpc } from './api/ipc'
import { loadPrefs, savePrefs } from './services/prefs'
import { SaveStore } from './services/saveStore'

const isDev = !app.isPackaged

// A second launch focuses the existing window instead of racing the watcher.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
const store = new SaveStore()

/** Restores saved bounds, clamped to a currently attached display. */
function restoredBounds(): Partial<Electron.Rectangle> {
  const saved = loadPrefs().windowBounds
  if (!saved) return { width: 1440, height: 940 }
  const onScreen = screen
    .getAllDisplays()
    .some((d) => saved.x >= d.bounds.x - 8 && saved.y >= d.bounds.y - 8 &&
      saved.x < d.bounds.x + d.bounds.width && saved.y < d.bounds.y + d.bounds.height)
  return onScreen ? saved : { width: saved.width, height: saved.height }
}

function findIcon(): Electron.NativeImage | undefined {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.cwd(), 'resources/icon.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return undefined
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0c11',
    title: 'PalBoard',
    icon: findIcon(),
    // Hidden title bar with native window controls overlaid top-right; the
    // renderer's own header provides the drag region.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1017',
      symbolColor: '#8b94a7',
      height: 40,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (loadPrefs().windowMaximised) window.maximize()
  window.once('ready-to-show', () => window.show())

  window.on('close', () => {
    savePrefs({
      windowBounds: window.getNormalBounds(),
      windowMaximised: window.isMaximized(),
    })
  })

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
  // No menu bar in production; dev keeps it for devtools shortcuts.
  if (!isDev) Menu.setApplicationMenu(null)

  mainWindow = createWindow()
  registerIpc(store, () => mainWindow)

  // Discover and load once the renderer can receive pushes.
  mainWindow.webContents.once('did-finish-load', () => {
    void store.initialise()
  })

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
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
