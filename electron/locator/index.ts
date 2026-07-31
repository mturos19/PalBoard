/**
 * Locates Palworld save data on disk.
 *
 * Palworld (Steam) stores saves at:
 *   %LOCALAPPDATA%\Pal\Saved\SaveGames\<steamId>\<worldGuid>\Level.sav
 *
 * Xbox Game Pass uses a different container layout that PalBoard does not read
 * yet, and dedicated servers keep saves next to the server binary. Users can
 * always point PalBoard at a folder manually, so detection is best-effort.
 */
import { readdir, stat } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { basename, join } from 'node:path'

export interface WorldCandidate {
  /** Absolute path to the folder containing Level.sav. */
  path: string
  /** World folder GUID. */
  worldId: string
  /** Steam (or account) id folder this world lives under, when applicable. */
  accountId: string | null
  /** Last modification time of Level.sav, for "most recent world" ordering. */
  modifiedAt: number
  /** Size of Level.sav in bytes. */
  sizeBytes: number
}

/** Root folders that may contain `<accountId>/<worldId>/Level.sav`. */
export function defaultSaveRoots(): string[] {
  const roots: string[] = []
  const home = homedir()

  if (platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    roots.push(join(localAppData, 'Pal', 'Saved', 'SaveGames'))
  } else {
    // Proton/Wine keeps the same tree inside the Steam compatdata prefix.
    roots.push(
      join(
        home,
        '.steam',
        'steam',
        'steamapps',
        'compatdata',
        '1623730',
        'pfx',
        'drive_c',
        'users',
        'steamuser',
        'AppData',
        'Local',
        'Pal',
        'Saved',
        'SaveGames',
      ),
    )
  }
  return roots
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function levelSavInfo(dir: string): Promise<{ modifiedAt: number; sizeBytes: number } | null> {
  try {
    const s = await stat(join(dir, 'Level.sav'))
    return s.isFile() ? { modifiedAt: s.mtimeMs, sizeBytes: s.size } : null
  } catch {
    return null
  }
}

/**
 * Scans the standard install locations for worlds.
 * Returns newest-first so the caller can default to the most recently played.
 */
export async function discoverWorlds(roots = defaultSaveRoots()): Promise<WorldCandidate[]> {
  const found: WorldCandidate[] = []

  for (const root of roots) {
    if (!(await isDirectory(root))) continue
    let accountDirs: string[]
    try {
      accountDirs = await readdir(root)
    } catch {
      continue
    }

    for (const accountId of accountDirs) {
      const accountPath = join(root, accountId)
      if (!(await isDirectory(accountPath))) continue

      let worldDirs: string[]
      try {
        worldDirs = await readdir(accountPath)
      } catch {
        continue
      }

      for (const worldId of worldDirs) {
        const worldPath = join(accountPath, worldId)
        if (!(await isDirectory(worldPath))) continue
        const info = await levelSavInfo(worldPath)
        if (info) found.push({ path: worldPath, worldId, accountId, ...info })
      }
    }
  }

  return found.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

/**
 * Validates a user-chosen folder.
 *
 * Accepts either the world folder itself or a parent one level up, since the
 * folder picker makes it easy to select the account folder by mistake.
 */
export async function resolveWorldFolder(chosen: string): Promise<WorldCandidate | null> {
  const direct = await levelSavInfo(chosen)
  if (direct) {
    return { path: chosen, worldId: basename(chosen), accountId: null, ...direct }
  }

  // Look one level down for a world folder.
  try {
    const children = await readdir(chosen)
    const candidates: WorldCandidate[] = []
    for (const child of children) {
      const path = join(chosen, child)
      if (!(await isDirectory(path))) continue
      const info = await levelSavInfo(path)
      if (info) candidates.push({ path, worldId: child, accountId: basename(chosen), ...info })
    }
    candidates.sort((a, b) => b.modifiedAt - a.modifiedAt)
    return candidates[0] ?? null
  } catch {
    return null
  }
}
