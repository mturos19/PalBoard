import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveSnapshot } from '../shared/domain'

let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

const { HistoryStore } = await import('../electron/services/history')

const WORLD_ID = 'ABCDEF0123456789'

function snapshot(savedAt: number, pals = 3): SaveSnapshot {
  return {
    revision: 1,
    loadedAt: 0,
    savePath: '',
    world: {
      worldId: WORLD_ID,
      name: 'Test',
      day: 12,
      savedAt,
      difficulty: null,
      playTimeSeconds: null,
      engineVersion: '5.1.1',
    },
    guilds: [],
    players: [],
    pals: Array.from({ length: pals }, (_, i) => ({
      instanceId: `p${i}`,
      location: i === 0 ? 'base' : 'palbox',
      isTowerBoss: false,
      isHuman: false,
    })) as unknown as SaveSnapshot['pals'],
    bases: [],
    inventories: [],
    storage: { items: [], containerCount: 0, totalSlots: 0, usedSlots: 0, nearFullContainers: 0 },
    resources: { wood: 100 },
    records: [],
    alerts: [],
    diagnostics: {
      format: 'PlM/oodle',
      compressedBytes: 0,
      decompressedBytes: 0,
      decompressMs: 0,
      parseMs: 0,
      buildMs: 0,
      warnings: [],
    },
  }
}

const logPath = () => join(userData, 'history', `${WORLD_ID}.jsonl`)

describe('HistoryStore', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'palboard-history-'))
  })

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
  })

  it('records one point per distinct save write', async () => {
    const store = new HistoryStore()
    await store.append(snapshot(1000))
    await store.append(snapshot(2000))

    const points = await store.load(WORLD_ID)
    expect(points.map((p) => p.t)).toEqual([1000, 2000])
    expect(points[0]).toMatchObject({ day: 12, pals: 3, workers: 1, resources: { wood: 100 } })
  })

  it('does not double-count a re-parse of the same save', async () => {
    const store = new HistoryStore()
    await store.append(snapshot(1000))
    await store.append(snapshot(1000))
    expect(await store.load(WORLD_ID)).toHaveLength(1)
  })

  it('does not double-count across a restart, when the cache is cold', async () => {
    await new HistoryStore().append(snapshot(1000))
    // A fresh instance has to consult the file rather than trust its own memory.
    await new HistoryStore().append(snapshot(1000))
    expect(await new HistoryStore().load(WORLD_ID)).toHaveLength(1)
  })

  it('refuses a snapshot whose timestamp is unusable', async () => {
    // Without a stable dedupe key every reload would append another point.
    const store = new HistoryStore()
    await store.append(snapshot(Number.NaN))
    expect(await store.load(WORLD_ID)).toHaveLength(0)
  })

  it('survives a line torn by a crash mid-append', async () => {
    mkdirSync(join(userData, 'history'), { recursive: true })
    writeFileSync(
      logPath(),
      '{"t":1,"pals":1}\n{"t":2,"pals"\n{"t":3,"pals":3}\n',
      'utf8',
    )
    // One point is lost; the file is not.
    expect((await new HistoryStore().load(WORLD_ID)).map((p) => p.t)).toEqual([1, 3])
  })

  it('drops lines that parse but are not points', async () => {
    mkdirSync(join(userData, 'history'), { recursive: true })
    writeFileSync(logPath(), '{"t":1}\nnull\n"nope"\n{"t":2}\n', 'utf8')
    expect((await new HistoryStore().load(WORLD_ID)).map((p) => p.t)).toEqual([1, 2])
  })

  it('returns points in time order', async () => {
    mkdirSync(join(userData, 'history'), { recursive: true })
    writeFileSync(logPath(), '{"t":30}\n{"t":10}\n{"t":20}\n', 'utf8')
    expect((await new HistoryStore().load(WORLD_ID)).map((p) => p.t)).toEqual([10, 20, 30])
  })

  it('compacts a log that has grown past the cap', async () => {
    // The log gains a line per autosave forever, and is read in full to draw a
    // chart, so it has to be bounded rather than merely trimmed on read.
    mkdirSync(join(userData, 'history'), { recursive: true })
    const filler = { day: 1, pals: 1, workers: 0, resources: {}, pad: 'x'.repeat(2000) }
    const lines: string[] = []
    for (let t = 1; t <= 3000; t++) lines.push(JSON.stringify({ ...filler, t }))
    writeFileSync(logPath(), lines.join('\n') + '\n', 'utf8')
    expect(readFileSync(logPath(), 'utf8').length).toBeGreaterThan(4 * 1024 * 1024)

    await new HistoryStore().append(snapshot(9999))

    const after = await new HistoryStore().load(WORLD_ID)
    expect(readFileSync(logPath(), 'utf8').length).toBeLessThan(4 * 1024 * 1024)
    // The newest point survives compaction, including the one just appended.
    expect(after[after.length - 1].t).toBe(9999)
  })

  it('keeps a world with an unusable id out of the parent directory', async () => {
    const store = new HistoryStore()
    const evil = snapshot(1000)
    evil.world.worldId = '../../escape'
    await store.append(evil)
    expect(await store.load('../../escape')).toHaveLength(1)
    expect(() => readFileSync(join(userData, 'history', 'escape.jsonl'), 'utf8')).not.toThrow()
  })
})
