/**
 * Loads a Palworld world directory into a {@link SaveSnapshot}.
 *
 * A world directory looks like:
 *   Level.sav        the world: characters, bases, containers, buildings
 *   LevelMeta.sav    world name, host, in-game day
 *   WorldOption.sav  difficulty and rate settings
 *   Players/*.sav    per-player tech points and container ids
 *
 * Only Level.sav is required. Everything else degrades gracefully so a partial
 * or in-progress save still renders instead of failing the whole load.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { decompressSave } from './compression'
import { parseGvas } from './gvas/parser'
import type { GvasFile } from './gvas/types'
import { fullParsePlan, levelParsePlan } from './palworld/hints'
import { buildSnapshot, type MetaSaves } from './palworld/model'
import type { SaveSnapshot } from '../../shared/domain'

export class SaveLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'SaveLoadError'
  }
}

interface DecodeResult {
  file: GvasFile
  compressedBytes: number
  decompressedBytes: number
  decompressMs: number
  parseMs: number
  format: string
  /** Last-modified time of the file on disk, in epoch milliseconds. */
  modifiedAt: number
}

async function decodeSave(path: string, isLevel: boolean, warnings: string[]): Promise<DecodeResult> {
  const [raw, stats] = await Promise.all([readFile(path), stat(path)])

  const t0 = performance.now()
  const container = await decompressSave(raw)
  const decompressMs = performance.now() - t0

  const plan = isLevel
    ? levelParsePlan({
        onUnknownType: (p, assumed) =>
          warnings.push(`${basename(path)}: no type hint for ${p}, assumed ${assumed}`),
        onError: (p, err) => warnings.push(`${basename(path)}: ${p} failed to parse — ${err.message}`),
      })
    : fullParsePlan({
        onError: (p, err) => warnings.push(`${basename(path)}: ${p} failed to parse — ${err.message}`),
      })

  const t1 = performance.now()
  const file = parseGvas(container.gvas, plan)
  const parseMs = performance.now() - t1

  return {
    file,
    compressedBytes: raw.length,
    decompressedBytes: container.gvas.length,
    decompressMs,
    parseMs,
    format: `${container.magic}/${container.codec}`,
    modifiedAt: stats.mtimeMs,
  }
}

/** Loads an optional save, returning undefined and a warning if it fails. */
async function tryDecode(path: string, warnings: string[]): Promise<GvasFile | undefined> {
  try {
    return (await decodeSave(path, false, warnings)).file
  } catch (err) {
    warnings.push(`${basename(path)}: ${(err as Error).message}`)
    return undefined
  }
}

/**
 * Reads and parses an entire world directory.
 *
 * @param worldDir absolute path to the folder containing Level.sav
 */
export async function loadWorld(worldDir: string): Promise<SaveSnapshot> {
  const warnings: string[] = []

  let level: DecodeResult
  try {
    level = await decodeSave(join(worldDir, 'Level.sav'), true, warnings)
  } catch (err) {
    throw new SaveLoadError(`could not read Level.sav in ${worldDir}: ${(err as Error).message}`, err)
  }

  const meta: MetaSaves = {
    levelMeta: await tryDecode(join(worldDir, 'LevelMeta.sav'), warnings),
    worldOption: await tryDecode(join(worldDir, 'WorldOption.sav'), warnings),
  }

  // Player saves are named <PlayerUId-without-dashes>.sav. `_dps` files hold
  // damage statistics and are not player state.
  const playerSaves = new Map<string, GvasFile>()
  try {
    for (const name of await readdir(join(worldDir, 'Players'))) {
      if (!name.toLowerCase().endsWith('.sav') || name.includes('_dps')) continue
      const file = await tryDecode(join(worldDir, 'Players', name), warnings)
      if (!file) continue
      const uid = uidFromFileName(name)
      if (uid) playerSaves.set(uid, file)
    }
  } catch {
    warnings.push('no Players directory found — technology points unavailable')
  }

  return buildSnapshot(
    {
      worldId: basename(worldDir),
      savePath: worldDir,
      level: level.file,
      meta,
      playerSaves,
      warnings,
      levelModifiedAt: level.modifiedAt,
    },
    {
      decompressMs: level.decompressMs,
      parseMs: level.parseMs,
      compressedBytes: level.compressedBytes,
      decompressedBytes: level.decompressedBytes,
      format: level.format,
    },
  )
}

/** `9A699B5E000000000000000000000000.sav` -> `9a699b5e-0000-0000-0000-000000000000`. */
export function uidFromFileName(fileName: string): string | null {
  const hex = fileName.replace(/\.sav$/i, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
