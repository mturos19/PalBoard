/**
 * Small persisted preferences: window bounds and the last opened world.
 * A single JSON file in userData — no library, no schema migration ceremony.
 */
import { readFileSync, writeFileSync } from 'node:fs'
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

export function loadPrefs(): Prefs {
  try {
    return JSON.parse(readFileSync(prefsPath(), 'utf8')) as Prefs
  } catch {
    return {}
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    writeFileSync(prefsPath(), JSON.stringify({ ...loadPrefs(), ...patch }, null, 2), 'utf8')
  } catch {
    // Preferences are a convenience; losing them must never break the app.
  }
}
