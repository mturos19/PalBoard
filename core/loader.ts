/**
 * Loads a Palworld world into a {@link SaveSnapshot}.
 *
 * A world looks like:
 *   Level.sav        the world: characters, bases, containers, buildings
 *   LevelMeta.sav    world name, host, in-game day
 *   WorldOption.sav  difficulty and rate settings
 *   Players/*.sav    per-player tech points and container ids
 *
 * Only Level.sav is required. Everything else degrades gracefully so a partial
 * or in-progress save still renders instead of failing the whole load.
 *
 * Where those bytes come from is the caller's problem: the desktop app reads
 * them off disk, the web app reads them out of files the user dropped on the
 * page. Both satisfy {@link WorldSource}, so this module — and everything below
 * it — has no filesystem dependency.
 */
import { decompressSave } from './compression'
import { parseGvas } from './gvas/parser'
import type { GvasFile } from './gvas/types'
import { fullParsePlan, levelParsePlan } from './palworld/hints'
import { buildSnapshot, type MetaSaves } from './palworld/model'
import type { SaveSnapshot } from '@shared/domain'

/**
 * A world's files, addressed by path relative to the folder holding Level.sav.
 *
 * Implementations are expected to be forgiving about case: Palworld writes
 * `Players/` on Windows, but a folder copied through an archive or a
 * case-sensitive filesystem may arrive as `players/`.
 */
export interface WorldSource {
  /** Identity of the world — the save folder's GUID where one exists. */
  readonly worldId: string
  /** Reads a file, or resolves null when it is not present. */
  read(path: string): Promise<Uint8Array | null>
  /** File names directly inside a subfolder, excluding directories. */
  list(dir: string): Promise<string[]>
  /** Last-modified time in epoch ms, or null when the source cannot say. */
  modifiedAt(path: string): Promise<number | null>
}

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
  /** Last-modified time of the file, in epoch milliseconds. */
  modifiedAt: number
}

async function decodeSave(
  source: WorldSource,
  path: string,
  isLevel: boolean,
  warnings: string[],
): Promise<DecodeResult> {
  const raw = await source.read(path)
  if (!raw) throw new SaveLoadError(`${path} is missing`)

  const t0 = now()
  const container = await decompressSave(raw)
  const decompressMs = now() - t0

  const plan = isLevel
    ? levelParsePlan({
        onUnknownType: (p, assumed) =>
          warnings.push(`${path}: no type hint for ${p}, assumed ${assumed}`),
        onError: (p, err) => warnings.push(`${path}: ${p} failed to parse — ${err.message}`),
      })
    : fullParsePlan({
        onError: (p, err) => warnings.push(`${path}: ${p} failed to parse — ${err.message}`),
      })

  const t1 = now()
  const file = parseGvas(container.gvas, plan)
  const parseMs = now() - t1

  return {
    file,
    compressedBytes: raw.byteLength,
    decompressedBytes: container.gvas.length,
    decompressMs,
    parseMs,
    format: `${container.magic}/${container.codec}`,
    modifiedAt: (await source.modifiedAt(path)) ?? Date.now(),
  }
}

/** Loads an optional save, returning undefined and a warning if it fails. */
async function tryDecode(
  source: WorldSource,
  path: string,
  warnings: string[],
): Promise<GvasFile | undefined> {
  try {
    return (await decodeSave(source, path, false, warnings)).file
  } catch (err) {
    warnings.push(`${path}: ${(err as Error).message}`)
    return undefined
  }
}

/** Reads and parses an entire world. */
export async function loadWorld(source: WorldSource): Promise<SaveSnapshot> {
  const warnings: string[] = []

  let level: DecodeResult
  try {
    level = await decodeSave(source, 'Level.sav', true, warnings)
  } catch (err) {
    throw new SaveLoadError(`could not read Level.sav: ${(err as Error).message}`, err)
  }

  const meta: MetaSaves = {
    levelMeta: await tryDecode(source, 'LevelMeta.sav', warnings),
    worldOption: await tryDecode(source, 'WorldOption.sav', warnings),
  }

  // Player saves are named <PlayerUId-without-dashes>.sav. `_dps` files hold
  // damage statistics and are not player state.
  const playerSaves = new Map<string, GvasFile>()
  const playerFiles = await source.list('Players')
  if (playerFiles.length === 0) {
    warnings.push('no Players directory found — technology points unavailable')
  }
  for (const name of playerFiles) {
    if (!name.toLowerCase().endsWith('.sav') || name.includes('_dps')) continue
    const uid = uidFromFileName(name)
    if (!uid) continue
    const file = await tryDecode(source, `Players/${name}`, warnings)
    if (file) playerSaves.set(uid, file)
  }

  return buildSnapshot(
    {
      worldId: source.worldId,
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

/** `performance` exists in both runtimes, but not on every old WebView. */
const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())
