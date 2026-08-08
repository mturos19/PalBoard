/**
 * Filesystem-backed {@link WorldSource} — the desktop app's way of feeding the
 * platform-neutral parser in `core/`.
 *
 * The web build supplies the same interface over files the user dropped on the
 * page, which is why nothing below `core/loader.ts` knows what a path is.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { WorldSource } from '@core/loader'

export function fsWorldSource(worldDir: string): WorldSource {
  return {
    worldId: basename(worldDir),

    async read(path) {
      try {
        return await readFile(join(worldDir, path))
      } catch {
        return null
      }
    },

    async list(dir) {
      try {
        const entries = await readdir(join(worldDir, dir), { withFileTypes: true })
        return entries.filter((e) => e.isFile()).map((e) => e.name)
      } catch {
        return []
      }
    },

    async modifiedAt(path) {
      try {
        return (await stat(join(worldDir, path))).mtimeMs
      } catch {
        return null
      }
    },
  }
}
