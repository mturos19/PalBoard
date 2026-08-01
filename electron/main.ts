/**
 * Electron main process entry.
 *
 * Product plumbing lives here: single-instance lock, persisted window bounds,
 * the hidden title bar with native overlay controls, and app lifecycle. Save
 * logic is entirely inside SaveStore.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Menu, app, nativeImage, screen, session, shell } from 'electron'
import { registerIpc } from './api/ipc'
import { preloadOodle } from './parser/compression'
import { loadPrefs, savePrefs } from './services/prefs'
import { SaveStore } from './services/saveStore'

const isDev = !app.isPackaged

const DEFAULT_BOUNDS = { width: 1440, height: 940 }
const MIN_WIDTH = 1024
const MIN_HEIGHT = 700

let mainWindow: BrowserWindow | null = null

/**
 * Restores saved bounds, clamped to a currently attached display.
 *
 * Monitors come and go. Restoring a window onto coordinates that belong to a
 * display that is no longer connected puts it somewhere the user cannot reach,
 * so an off-screen position falls back to a centred window at the saved size.
 */
function restoredBounds(): Partial<Electron.Rectangle> {
  const saved = loadPrefs().windowBounds
  if (!saved) return DEFAULT_BOUNDS

  const size = {
    width: Math.max(MIN_WIDTH, Math.round(saved.width)),
    height: Math.max(MIN_HEIGHT, Math.round(saved.height)),
  }
  const onScreen = screen.getAllDisplays().some((d) => {
    const b = d.bounds
    return (
      saved.x >= b.x - 8 &&
      saved.y >= b.y - 8 &&
      saved.x < b.x + b.width &&
      saved.y < b.y + b.height
    )
  })
  return onScreen ? { ...size, x: Math.round(saved.x), y: Math.round(saved.y) } : size
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

/**
 * Locks the window down to the one thing it is for: rendering PalBoard's own
 * bundle.
 *
 * The renderer parses save files written by another program, so it is treated as
 * the untrusted half of the app. It has no business navigating anywhere, opening
 * child windows, or holding OS permissions, and each of those is a separate
 * opt-out in Electron rather than a default.
 */
function hardenWebContents(contents: Electron.WebContents, appOrigin: string): void {
  // Only http(s) links reach the OS handler — never file:, and never in-app.
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) {
      event.preventDefault()
      if (isExternalUrl(url)) void shell.openExternal(url)
    }
  })

  // No <webview> is used; refuse to attach one rather than configure it.
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

function isExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const devServerUrl = isDev ? process.env.ELECTRON_RENDERER_URL : undefined
  const indexPath = join(__dirname, '../renderer/index.html')
  // The exact document the window is allowed to be on. HashRouter keeps all
  // in-app routing inside this one URL, so nothing legitimate navigates away.
  const appUrl = devServerUrl ?? pathToFileURL(indexPath).href

  const window = new BrowserWindow({
    ...restoredBounds(),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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
      // The preload only uses contextBridge and ipcRenderer, both of which are
      // available inside the sandbox, so there is nothing to gain by leaving it
      // off — and a sandboxed renderer is one OS-level barrier further from the
      // save files it parses.
      sandbox: true,
    },
  })

  hardenWebContents(window.webContents, appUrl)

  if (loadPrefs().windowMaximised) window.maximize()
  window.once('ready-to-show', () => window.show())

  // 'close' fires before teardown, while the geometry is still readable.
  window.on('close', () => {
    savePrefs({
      windowBounds: window.getNormalBounds(),
      windowMaximised: window.isMaximized(),
    })
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(indexPath)
  }

  return window
}

/** Creates the window and kicks off save discovery once it can receive pushes. */
function launch(store: SaveStore): BrowserWindow {
  const window = createWindow()
  window.webContents.once('did-finish-load', () => {
    // Failures land in SyncState; there is no second channel to report them on.
    void store.initialise()
  })
  return window
}

/**
 * A second launch focuses the existing window instead of racing the watcher.
 *
 * The lock has to be taken before anything else, and the losing instance must
 * not continue: `app.quit()` only schedules the exit, so without this guard the
 * duplicate would go on to build a window and start a second file watcher over
 * the same save before the quit takes effect.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const store = new SaveStore()

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    // No menu bar in production; dev keeps it for devtools shortcuts.
    if (!isDev) Menu.setApplicationMenu(null)

    // Electron grants every web permission by default. PalBoard reads local
    // files and raises alert toasts; it has no use for a camera, a microphone,
    // or a location, so notifications are the only thing on the list.
    const allowed = (permission: string) => permission === 'notifications'
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(allowed(permission))
    })
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed(permission))

    mainWindow = launch(store)
    registerIpc(store, () => mainWindow)

    // Instantiating the Oodle WASM module takes long enough to be visible on the
    // first parse; start it now, while the window is still painting.
    void preloadOodle().catch(() => {
      // Reported properly by the first decode that needs it.
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = launch(store)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    void store.dispose()
  })
}
