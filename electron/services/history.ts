/**
 * PalBoard's own time-series. The save keeps no history, so charts over time
 * are only possible if we record them: one JSONL line per distinct save write,
 * per world, in the app's user-data folder. Deduped on the save's own
 * timestamp so re-parses and app restarts never double-count.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { HistoryPoint, SaveSnapshot } from '../../shared/domain'

const MAX_POINTS_RETURNED = 2000

function historyDir(): string {
  return join(app.getPath('userData'), 'history')
}

function fileFor(worldId: string): string {
  // World ids are hex GUIDs; sanitise anyway since this builds a path.
  return join(historyDir(), `${worldId.replace(/[^0-9a-z]/gi, '')}.jsonl`)
}

export class HistoryStore {
  /** Last appended save timestamp per world, to avoid re-reading the file. */
  private lastT = new Map<string, number>()

  async append(snapshot: SaveSnapshot): Promise<void> {
    const worldId = snapshot.world.worldId
    const t = snapshot.world.savedAt
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
  }

  async load(worldId: string): Promise<HistoryPoint[]> {
    try {
      const text = await readFile(fileFor(worldId), 'utf8')
      const points: HistoryPoint[] = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          points.push(JSON.parse(line) as HistoryPoint)
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
}
