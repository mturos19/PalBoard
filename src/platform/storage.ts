/**
 * The remembered save, in IndexedDB.
 *
 * Two things are kept, and they do different jobs:
 *
 *   `files`      a copy of the save bytes (~2-3 MB). This is what makes a
 *                return visit open straight into the dashboard, in every
 *                browser, with no permission prompt.
 *   `directory`  the folder handle, when the browser gave us one. It holds no
 *                data — it is a reference that lets PalBoard re-read the folder
 *                and keep following autosaves.
 *
 * Bytes are copied out of their `File` rather than the File being stored
 * directly: a File handed over by the File System Access API is a view onto the
 * real file, and reading it later throws if the game has written to it since.
 *
 * All of this lives on the visitor's own machine, under this site's origin, and
 * `clearSession` erases it. Nothing here is ever sent anywhere — there is no
 * network code in this app at all.
 */
import type { PickedDirectory, PickedFiles } from './worldSource'

const DB_NAME = 'palboard'
const DB_VERSION = 1
const STORE = 'session'
/** Single slot: PalBoard remembers the last world, not a library of them. */
const KEY = 'last'

interface StoredFile {
  path: string
  name: string
  lastModified: number
  bytes: ArrayBuffer
}

interface StoredSession {
  label: string
  worldId: string
  storedAt: number
  files: StoredFile[]
  /** Structured-clones into IndexedDB; absent for an uploaded world. */
  directory: FileSystemDirectoryHandle | null
}

export interface RestoredSession {
  label: string
  worldId: string
  storedAt: number
  files: PickedFiles
  directory: PickedDirectory | null
  /** Total size of the cached save bytes, for the Settings readout. */
  bytes: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
    // Private-browsing modes can leave the open request hanging rather than
    // failing; without this the boot would wait on it forever.
    request.onblocked = () => reject(new Error('IndexedDB blocked'))
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        tx.oncomplete = () => db.close()
      }),
  )
}

/**
 * Remembers a world.
 *
 * Storage is best-effort throughout: quota limits, private browsing and
 * disabled site data all make this fail, and none of them should break the
 * dashboard the user is already looking at.
 */
export async function saveSession(
  label: string,
  picked: PickedFiles,
  directory: PickedDirectory | null,
): Promise<void> {
  try {
    const files: StoredFile[] = []
    for (const [path, file] of picked.entries) {
      files.push({
        path,
        name: file.name,
        lastModified: file.lastModified,
        bytes: await file.arrayBuffer(),
      })
    }
    const session: StoredSession = {
      label,
      worldId: picked.worldId,
      storedAt: Date.now(),
      files,
      directory: directory?.handle ?? null,
    }
    await run('readwrite', (store) => store.put(session, KEY))
  } catch {
    // No persistence this visit; the app is otherwise unaffected.
  }
}

/** The remembered world, or null if there is none or storage is unavailable. */
export async function loadSession(): Promise<RestoredSession | null> {
  try {
    const stored = await run<StoredSession | undefined>('readonly', (store) => store.get(KEY))
    if (!stored?.files?.length) return null

    const entries = new Map<string, File>()
    let bytes = 0
    for (const f of stored.files) {
      entries.set(f.path, new File([f.bytes], f.name, { lastModified: f.lastModified }))
      bytes += f.bytes.byteLength
    }

    return {
      label: stored.label,
      worldId: stored.worldId,
      storedAt: stored.storedAt,
      files: { kind: 'files', worldId: stored.worldId, entries },
      directory: stored.directory
        ? { kind: 'directory', worldId: stored.worldId, handle: stored.directory }
        : null,
      bytes,
    }
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(KEY))
  } catch {
    // Nothing to clear if storage was never available.
  }
}

/**
 * Asks the browser not to evict this origin's data under storage pressure.
 *
 * Without it a remembered save is discardable, and the visitor's next return
 * silently drops them back on the landing page. Declined is fine — the save is
 * still stored, just evictable.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
