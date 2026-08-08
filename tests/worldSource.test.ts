/**
 * Browser world sources.
 *
 * These cover what the headless browser run cannot: the File System Access
 * path needs a native folder picker no automation can drive, and the awkward
 * cases (a user dropping the wrong level of the tree, a folder full of the
 * game's own backups, a case-mangled `players/`) are hard to stage for real.
 */
import { describe, expect, it } from 'vitest'
import {
  indexDirectory,
  indexPickedFiles,
  NoWorldFoundError,
  worldSourceFor,
} from '@/platform/worldSource'

/** A File that remembers where it sat in the picked tree. */
function file(relativePath: string, lastModified = 1000, bytes = [1, 2, 3]): File {
  const f = new File([new Uint8Array(bytes)], relativePath.split('/').pop()!, { lastModified })
  Object.defineProperty(f, 'webkitRelativePath', { value: relativePath })
  return f
}

// --- picked files -------------------------------------------------------------

describe('indexPickedFiles', () => {
  const world = [
    file('WorldA/Level.sav', 5000),
    file('WorldA/LevelMeta.sav'),
    file('WorldA/Players/9A699B5E000000000000000000000000.sav'),
  ]

  it('roots the world at the folder holding Level.sav', () => {
    const picked = indexPickedFiles(world)
    expect(picked.worldId).toBe('WorldA')
    expect([...picked.entries.keys()].sort()).toEqual([
      'level.sav',
      'levelmeta.sav',
      'players/9a699b5e000000000000000000000000.sav',
    ])
  })

  it('finds the world when the user drops the SaveGames folder above it', () => {
    const picked = indexPickedFiles([
      file('SaveGames/76561198/WorldA/Level.sav', 5000),
      file('SaveGames/76561198/WorldA/Players/abc.sav'),
      file('SaveGames/UserOption.sav'),
    ])
    expect(picked.worldId).toBe('WorldA')
    // Files outside the world root are not part of it.
    expect(picked.entries.has('useroption.sav')).toBe(false)
    expect(picked.entries.has('players/abc.sav')).toBe(true)
  })

  it('prefers the most recently written world when several are present', () => {
    const picked = indexPickedFiles([
      file('SaveGames/Old/Level.sav', 1000),
      file('SaveGames/Current/Level.sav', 9000),
    ])
    expect(picked.worldId).toBe('Current')
  })

  it("ignores the game's own backups, even when one is the newest file", () => {
    const picked = indexPickedFiles([
      file('WorldA/Level.sav', 9000),
      file('WorldA/backup/world/2026.08.03-21.26.48/Level.sav', 2000),
      // Restoring or copying a tree can leave a backup with the newer mtime.
      file('WorldA/backup/world/2026.08.04-21.44.12/Level.sav', 99000),
    ])
    expect(picked.worldId).toBe('WorldA')
    expect(picked.entries.get('level.sav')?.lastModified).toBe(9000)
  })

  it('falls back to a backup when that is the only save present', () => {
    const picked = indexPickedFiles([file('WorldA/backup/world/2026.08.03/Level.sav', 2000)])
    expect(picked.worldId).toBe('2026.08.03')
  })

  it('explains itself when the folder holds no save at all', () => {
    expect(() => indexPickedFiles([file('Documents/notes.txt')])).toThrow(NoWorldFoundError)
    expect(() => indexPickedFiles([])).toThrow(/No Level\.sav/)
  })

  it('reads files and lists a subfolder case-insensitively', async () => {
    const source = worldSourceFor(
      indexPickedFiles([file('W/Level.sav', 1, [7, 8]), file('W/Players/abc.sav')]),
    )
    expect(Array.from((await source.read('Level.sav'))!)).toEqual([7, 8])
    expect(await source.list('Players')).toEqual(['abc.sav'])
    // The loader asks with Palworld's own casing whatever the disk used.
    expect(await source.list('players')).toEqual(['abc.sav'])
    expect(await source.read('Nope.sav')).toBeNull()
    expect(await source.modifiedAt('Level.sav')).toBe(1)
  })

  it('does not mistake a nested path for a direct child when listing', async () => {
    const source = worldSourceFor(
      indexPickedFiles([file('W/Level.sav'), file('W/Players/deep/nested.sav')]),
    )
    expect(await source.list('Players')).toEqual([])
  })
})

// --- directory handles --------------------------------------------------------

/**
 * Minimal stand-in for the File System Access API's directory handle. A
 * `number[]` leaf is a file; a nested object is a subfolder.
 */
type FakeTree = { [name: string]: number[] | FakeTree }

function dirHandle(name: string, children: FakeTree): FileSystemDirectoryHandle {
  const entries = Object.entries(children).map(([childName, value]) =>
    Array.isArray(value)
      ? {
          kind: 'file' as const,
          name: childName,
          getFile: async () =>
            new File([new Uint8Array(value)], childName, { lastModified: 42 }),
        }
      : dirHandle(childName, value),
  )
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('indexDirectory', () => {
  const bytes = [9, 9]

  it('accepts the world folder itself', async () => {
    const picked = await indexDirectory(dirHandle('WorldA', { 'Level.sav': bytes }))
    expect(picked.worldId).toBe('WorldA')
  })

  it('descends into SaveGames/<account>/<world>', async () => {
    const picked = await indexDirectory(
      dirHandle('SaveGames', { '76561198': { WorldA: { 'Level.sav': bytes } } }),
    )
    expect(picked.worldId).toBe('WorldA')
  })

  it("does not resolve to the game's backup copies", async () => {
    const picked = await indexDirectory(
      dirHandle('WorldA', {
        'Level.sav': bytes,
        backup: { world: { 'Level.sav': bytes } },
      }),
    )
    expect(picked.worldId).toBe('WorldA')
  })

  it('refuses a folder with no save rather than walking the whole drive', async () => {
    await expect(
      indexDirectory(dirHandle('Documents', { a: { b: { c: { d: { 'Level.sav': bytes } } } } })),
    ).rejects.toThrow(NoWorldFoundError)
  })

  it('reads nested files through the handle, case-insensitively', async () => {
    const source = worldSourceFor(
      await indexDirectory(
        dirHandle('W', { 'Level.sav': bytes, players: { 'abc.sav': [1] } }),
      ),
    )
    expect(Array.from((await source.read('Level.sav'))!)).toEqual([9, 9])
    expect(Array.from((await source.read('Players/abc.sav'))!)).toEqual([1])
    expect(await source.list('Players')).toEqual(['abc.sav'])
    expect(await source.read('Players/missing.sav')).toBeNull()
    expect(await source.modifiedAt('Level.sav')).toBe(42)
  })
})
