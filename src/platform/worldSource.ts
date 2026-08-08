/**
 * Browser {@link WorldSource} implementations.
 *
 * A world reaches the page one of two ways, and each has different powers:
 *
 *   `PickedFiles`  a folder chosen through <input webkitdirectory> or dropped
 *                  on the page. Works in every browser. The File objects are a
 *                  snapshot of the moment they were picked, so this source can
 *                  never see a later autosave.
 *
 *   `DirectoryHandle`  a folder opened through the File System Access API
 *                  (Chromium). Re-reads from disk on every call, which is what
 *                  makes live sync possible while the game is running.
 *
 * Both are structured-cloneable, so the whole source is handed to the parsing
 * worker rather than shipping tens of megabytes back and forth.
 */
import type { WorldSource } from '@core/loader'

/** The one file that has to be present for a folder to be a world. */
export const LEVEL_SAV = 'level.sav'

export interface PickedFiles {
  kind: 'files'
  worldId: string
  /** Lower-cased path relative to the world root -> the file itself. */
  entries: Map<string, File>
}

export interface PickedDirectory {
  kind: 'directory'
  worldId: string
  handle: FileSystemDirectoryHandle
}

/** What the UI hands the worker. Both variants survive structured clone. */
export type WorldHandle = PickedFiles | PickedDirectory

export class NoWorldFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoWorldFoundError'
  }
}

/**
 * Locates the world inside whatever the user picked and indexes it.
 *
 * Users drop the wrong level of the tree all the time — the world folder
 * itself, the `SaveGames` folder above it, or their whole `Pal` directory — so
 * rather than demanding an exact choice we find the folder containing Level.sav
 * and treat that as the root. When several exist, the most recently written one
 * wins, which is the world they were last playing.
 */
export function indexPickedFiles(files: File[]): PickedFiles {
  const levels = files.filter((f) => baseName(pathOf(f)).toLowerCase() === LEVEL_SAV)
  if (levels.length === 0) {
    throw new NoWorldFoundError(
      'No Level.sav in that folder. Pick the world folder itself, or the SaveGames folder above it.',
    )
  }

  // The game keeps rolling copies under `backup/`, and a dropped world folder
  // brings them along. They are normally older than the live save, but not
  // always — restoring one, or copying the tree about, can leave a backup with
  // the newer mtime. Prefer a live save outright rather than trusting that.
  const live = levels.filter((f) => !isBackupPath(pathOf(f)))
  const candidates = live.length > 0 ? live : levels

  const newest = candidates.reduce((a, b) => (b.lastModified > a.lastModified ? b : a))
  const root = dirName(pathOf(newest))

  const entries = new Map<string, File>()
  const prefix = root ? `${root}/` : ''
  for (const file of files) {
    const path = pathOf(file)
    if (root && !path.startsWith(prefix)) continue
    entries.set(path.slice(prefix.length).toLowerCase(), file)
  }

  return { kind: 'files', worldId: baseName(root) || 'world', entries }
}

/** Reads the same tree live, so the dashboard can follow the game's autosaves. */
export async function indexDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<PickedDirectory> {
  const found = await findWorldDirectory(handle, 3)
  if (!found) {
    throw new NoWorldFoundError(
      'No Level.sav in that folder. Pick the world folder itself, or the SaveGames folder above it.',
    )
  }
  return { kind: 'directory', worldId: found.name, handle: found }
}

/**
 * Depth-first hunt for the folder holding Level.sav.
 *
 * Bounded depth: the save tree is at most `SaveGames/<account>/<world>`, and an
 * unbounded walk of a folder the user picked by mistake could enumerate their
 * entire drive.
 */
async function findWorldDirectory(
  dir: FileSystemDirectoryHandle,
  depth: number,
): Promise<FileSystemDirectoryHandle | null> {
  const subdirectories: FileSystemDirectoryHandle[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase() === LEVEL_SAV) return dir
    if (entry.kind === 'directory') subdirectories.push(entry)
  }
  if (depth <= 0) return null

  // Newest first, so a tree with several worlds resolves to the active one.
  for (const sub of subdirectories) {
    if (sub.name === 'backup') continue // the game's own rolling copies
    const hit = await findWorldDirectory(sub, depth - 1)
    if (hit) return hit
  }
  return null
}

/** Turns a picked world into the interface `core/loader` consumes. */
export function worldSourceFor(handle: WorldHandle): WorldSource {
  return handle.kind === 'files' ? filesSource(handle) : directorySource(handle)
}

function filesSource(picked: PickedFiles): WorldSource {
  const get = (path: string): File | undefined => picked.entries.get(path.toLowerCase())
  return {
    worldId: picked.worldId,
    async read(path) {
      const file = get(path)
      return file ? new Uint8Array(await file.arrayBuffer()) : null
    },
    async list(dir) {
      const prefix = `${dir.toLowerCase()}/`
      const names: string[] = []
      for (const path of picked.entries.keys()) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        if (!rest.includes('/')) names.push(rest)
      }
      return names
    },
    async modifiedAt(path) {
      return get(path)?.lastModified ?? null
    },
  }
}

function directorySource(picked: PickedDirectory): WorldSource {
  /** Resolves `Players/abc.sav` against the world root, case-insensitively. */
  const resolve = async (path: string): Promise<FileSystemFileHandle | null> => {
    const parts = path.split('/')
    const fileName = parts.pop()!
    let dir = picked.handle
    for (const part of parts) {
      const next = await childDirectory(dir, part)
      if (!next) return null
      dir = next
    }
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return entry
      }
    }
    return null
  }

  return {
    worldId: picked.worldId,
    async read(path) {
      const handle = await resolve(path)
      if (!handle) return null
      return new Uint8Array(await (await handle.getFile()).arrayBuffer())
    },
    async list(dir) {
      const target = await childDirectory(picked.handle, dir)
      if (!target) return []
      const names: string[] = []
      for await (const entry of target.values()) {
        if (entry.kind === 'file') names.push(entry.name)
      }
      return names
    },
    async modifiedAt(path) {
      const handle = await resolve(path)
      return handle ? (await handle.getFile()).lastModified : null
    },
  }
}

async function childDirectory(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory' && entry.name.toLowerCase() === name.toLowerCase()) {
      return entry
    }
  }
  return null
}

// --- path helpers -------------------------------------------------------------
// `webkitRelativePath` is the only place a dropped File records where it sat in
// the tree; plain `name` is the fallback for a single file dropped on its own.

const pathOf = (file: File): string =>
  (file.webkitRelativePath || file.name).replace(/\\/g, '/')

/** True for anything under a `backup/` folder at any depth. */
const isBackupPath = (path: string): boolean =>
  path.toLowerCase().split('/').slice(0, -1).includes('backup')

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const dirName = (path: string): string => {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}
