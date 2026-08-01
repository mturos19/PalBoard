/**
 * Small persisted preferences: window bounds and the last opened world.
 * A single JSON file in userData — no library, no schema migration ceremony.
 *
 * The file is user-writable and survives crashes and downgrades, so nothing here
 * trusts its contents: every field is validated on read, and writes go through a
 * temporary file so an interrupted write cannot leave a half-written prefs file
 * behind.
 */
import { renameSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, type Rectangle } from 'electron'

export interface Prefs {
  windowBounds?: Rectangle
  windowMaximised?: boolean
  lastWorldPath?: string
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'prefs.json')
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Accepts a rectangle only if every field is a usable number. */
function asBounds(v: unknown): Rectangle | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const r = v as Record<string, unknown>
  if (!isFiniteNumber(r.x) || !isFiniteNumber(r.y)) return undefined
  if (!isFiniteNumber(r.width) || !isFiniteNumber(r.height)) return undefined
  if (r.width <= 0 || r.height <= 0) return undefined
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Reads preferences, discarding anything that is not the shape we expect.
 *
 * A malformed file must degrade to defaults rather than propagate; window bounds
 * in particular are fed straight to `BrowserWindow`, where a `null` or a string
 * would fail at startup with no window to report it in.
 */
export function loadPrefs(): Prefs {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(prefsPath(), 'utf8'))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const raw = parsed as Record<string, unknown>
  const prefs: Prefs = {}
  const bounds = asBounds(raw.windowBounds)
  if (bounds) prefs.windowBounds = bounds
  if (typeof raw.windowMaximised === 'boolean') prefs.windowMaximised = raw.windowMaximised
  if (typeof raw.lastWorldPath === 'string' && raw.lastWorldPath.length > 0) {
    prefs.lastWorldPath = raw.lastWorldPath
  }
  return prefs
}

/**
 * Merges a patch into the stored preferences.
 *
 * Written to a sibling temp file and renamed into place: `rename` is atomic
 * within a directory, so a crash mid-write leaves the previous file intact
 * instead of a truncated one that reads as "no preferences at all".
 */
export function savePrefs(patch: Partial<Prefs>): void {
  const path = prefsPath()
  const temp = `${path}.tmp`
  try {
    writeFileSync(temp, JSON.stringify({ ...loadPrefs(), ...patch }, null, 2), 'utf8')
    renameSync(temp, path)
  } catch {
    // Preferences are a convenience; losing them must never break the app.
    try {
      unlinkSync(temp)
    } catch {
      // Nothing to clean up, or it is not ours to remove.
    }
  }
}
