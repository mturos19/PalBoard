/**
 * PalBoard's own time-series, browser edition.
 *
 * The save records no history, so the "over time" charts only exist if we keep
 * them. On the web that means the visitor's own `localStorage` and nowhere
 * else: a handful of counts per save write, never the save itself, never a
 * server. `clearAll` backs the "forget this world" control so it is genuinely
 * removable.
 */
import type { HistoryPoint, SaveSnapshot } from '@shared/domain'

const PREFIX = 'palboard.history.'
const MAX_POINTS = 2000

const keyFor = (worldId: string): string => `${PREFIX}${worldId.replace(/[^0-9a-z]/gi, '') || 'unknown'}`

export function loadHistory(worldId: string): HistoryPoint[] {
  try {
    const raw = localStorage.getItem(keyFor(worldId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as HistoryPoint[])
      .filter((p) => typeof p?.t === 'number')
      .sort((a, b) => a.t - b.t)
      .slice(-MAX_POINTS)
  } catch {
    // Corrupt or unreadable storage costs the charts, not the app.
    return []
  }
}

/**
 * Appends one point per distinct save write.
 *
 * Deduplicated on the save's own timestamp, so re-parsing the same file — which
 * happens on every manual reload and every live poll that finds no change —
 * never adds a second point for it.
 */
export function appendHistory(snapshot: SaveSnapshot): void {
  const t = snapshot.world.savedAt
  if (!Number.isFinite(t)) return

  const worldId = snapshot.world.worldId
  const points = loadHistory(worldId)
  if (points.some((p) => p.t === t)) return

  points.push({
    t,
    day: snapshot.world.day,
    pals: snapshot.pals.filter((p) => !p.isTowerBoss && !p.isHuman).length,
    workers: snapshot.pals.filter((p) => p.location === 'base').length,
    resources: snapshot.resources,
  })

  try {
    localStorage.setItem(keyFor(worldId), JSON.stringify(points.slice(-MAX_POINTS)))
  } catch {
    // Quota exceeded or storage disabled (private mode, blocked cookies).
    // History is a nicety; losing it must not fail the reload that wrote it.
  }
}

/** Everything PalBoard has stored in this browser, for the reset control. */
export function storedWorldIds(): string[] {
  const ids: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) ids.push(key.slice(PREFIX.length))
    }
  } catch {
    return []
  }
  return ids
}

export function clearAll(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
