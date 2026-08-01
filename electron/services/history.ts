/**
 * PalBoard's own time-series. The save keeps no history, so charts over time
 * are only possible if we record them: one JSONL line per distinct save write,
 * per world, in the app's user-data folder. Deduped on the save's own
 * timestamp so re-parses and app restarts never double-count.
 */
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { HistoryPoint, SaveSnapshot } from '../../shared/domain'

const MAX_POINTS_RETURNED = 2000

/**
 * Size at which a world's log is compacted down to {@link MAX_POINTS_RETURNED}
 * points.
 *
 * The file grows by one line per autosave for as long as PalBoard runs, and it
 * is read in full on every visit to the Statistics page. Left alone it would
 * cross into "reads a hundred megabytes to draw a chart" territory after a few
 * hundred hours of play; compaction keeps it bounded without the user ever
 * seeing a gap, because everything beyond the cap is already off the chart.
 */
const COMPACT_ABOVE_BYTES = 4 * 1024 * 1024

function historyDir(): string {
  return join(app.getPath('userData'), 'history')
}

function fileFor(worldId: string): string {
  // World ids are hex GUIDs; sanitise anyway since this builds a path.
  const safe = worldId.replace(/[^0-9a-z]/gi, '')
  return join(historyDir(), `${safe || 'unknown'}.jsonl`)
}

export class HistoryStore {
  /** Last appended save timestamp per world, to avoid re-reading the file. */
  private lastT = new Map<string, number>()

  async append(snapshot: SaveSnapshot): Promise<void> {
    const worldId = snapshot.world.worldId
    const t = snapshot.world.savedAt
    // A save with no usable timestamp cannot be deduplicated, and appending it
    // would add a point on every reload rather than every save.
    if (!Number.isFinite(t)) return
    if (this.lastT.get(worldId) === t) return

    // First append this session: check the tail of the file for the dedupe key.
    if (!this.lastT.has(worldId)) {
      const existing = await this.load(worldId)
      const last = existing[existing.length - 1]
      if (last) this.lastT.set(worldId, last.t)
      if (last?.t === t) return
    }

    const point: HistoryPoint = {
      t,
      day: snapshot.world.day,
      pals: snapshot.pals.filter((p) => !p.isTowerBoss && !p.isHuman).length,
      workers: snapshot.pals.filter((p) => p.location === 'base').length,
      resources: snapshot.resources,
    }

    await mkdir(historyDir(), { recursive: true })
    await appendFile(fileFor(worldId), JSON.stringify(point) + '\n', 'utf8')
    this.lastT.set(worldId, t)

    await this.compactIfLarge(worldId)
  }

  async load(worldId: string): Promise<HistoryPoint[]> {
    try {
      const text = await readFile(fileFor(worldId), 'utf8')
      const points: HistoryPoint[] = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const point = JSON.parse(line) as HistoryPoint
          // A line that parses but is not a point would break every chart that
          // reads it; drop it here rather than downstream.
          if (typeof point?.t === 'number') points.push(point)
        } catch {
          // A torn line (crash mid-append) loses one point, not the file.
        }
      }
      points.sort((a, b) => a.t - b.t)
      return points.slice(-MAX_POINTS_RETURNED)
    } catch {
      return []
    }
  }

  /**
   * Rewrites an oversized log with only the points that are still shown.
   *
   * Written to a temp file and renamed so a crash mid-compaction leaves the
   * original intact rather than a half-written history.
   */
  private async compactIfLarge(worldId: string): Promise<void> {
    const path = fileFor(worldId)
    try {
      if ((await stat(path)).size <= COMPACT_ABOVE_BYTES) return
      const kept = await this.load(worldId)
      const temp = `${path}.tmp`
      await writeFile(temp, kept.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8')
      await rename(temp, path)
    } catch {
      // Compaction is housekeeping; failing it must not fail the append that
      // triggered it, and the next append will try again.
    }
  }
}
