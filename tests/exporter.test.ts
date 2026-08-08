import { describe, expect, it } from 'vitest'
import { buildItemsCsv, buildPalsCsv, buildPalsJson } from '../core/exporter'
import type { Pal, SaveSnapshot } from '../shared/domain'

function makePal(overrides: Partial<Pal> = {}): Pal {
  return {
    instanceId: 'i1',
    characterId: 'Sheepball',
    speciesId: 'Sheepball',
    speciesName: 'Lamball',
    elements: ['neutral'],
    isHuman: false,
    nickname: null,
    gender: 'female',
    level: 12,
    exp: 0,
    isAlpha: false,
    isLucky: false,
    isTowerBoss: false,
    hp: 1000,
    ivHp: 50,
    ivAttack: 60,
    ivDefense: 70,
    rank: 1,
    soulHp: 0,
    soulAttack: 0,
    soulDefense: 0,
    soulWorkSpeed: 0,
    passiveSkills: ['Runner'],
    equippedSkills: [],
    masteredSkills: [],
    stomach: 100,
    hungerState: null,
    isHungry: false,
    sanity: 100,
    sickness: null,
    isFainted: false,
    friendshipPoints: 0,
    ownerPlayerUid: null,
    containerId: 'c1',
    slotIndex: 0,
    location: 'palbox',
    baseId: null,
    workSuitabilities: {},
    disabledWorkSuitabilities: [],
    currentWork: null,
    ...overrides,
  }
}

function makeSnapshot(pals: Pal[], items: Array<{ id: string; count: number }> = []): SaveSnapshot {
  return {
    revision: 1,
    loadedAt: 0,
    world: {
      worldId: 'w',
      name: 'Test',
      day: 1,
      savedAt: 0,
      difficulty: null,
      playTimeSeconds: null,
      engineVersion: '5.1.1',
    },
    guilds: [],
    players: [],
    pals,
    bases: [],
    inventories: [],
    storage: { items, containerCount: 0, totalSlots: 0, usedSlots: 0, nearFullContainers: 0 },
    resources: {},
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

describe('buildPalsCsv', () => {
  it('writes a header and one CRLF-terminated row per pal', () => {
    const csv = buildPalsCsv(makeSnapshot([makePal({ nickname: 'Fluffy' })]))
    const lines = csv.split('\r\n')
    expect(lines[0].startsWith('nickname,species,speciesId,level')).toBe(true)
    expect(lines[1].startsWith('Fluffy,Lamball,Sheepball,12')).toBe(true)
    // RFC 4180: the final record carries a terminator too.
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('quotes and doubles embedded quotes, commas and newlines', () => {
    const csv = buildPalsCsv(makeSnapshot([makePal({ nickname: 'a,b"c\nd' })]))
    expect(csv).toContain('"a,b""c\nd"')
  })

  it('defuses a nickname a spreadsheet would run as a formula', () => {
    // Nicknames are free text typed by a player; Excel executes a leading `=`.
    const csv = buildPalsCsv(makeSnapshot([makePal({ nickname: '=HYPERLINK("http://x","go")' })]))
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
    expect(csv).toContain('\t=HYPERLINK')
  })

  it('leaves negative numbers alone — the minus sign is ours, not the player\'s', () => {
    const csv = buildPalsCsv(makeSnapshot([makePal({ slotIndex: -1, level: 3 })]))
    expect(csv).not.toContain('\t-')
  })

  it('excludes tower bosses, which are not owned pals', () => {
    const csv = buildPalsCsv(
      makeSnapshot([makePal({ nickname: 'Mine' }), makePal({ isTowerBoss: true, nickname: 'Gym' })]),
    )
    expect(csv).toContain('Mine')
    expect(csv).not.toContain('Gym')
  })
})

describe('buildItemsCsv', () => {
  it('resolves display names and categories from the item id', () => {
    const csv = buildItemsCsv(makeSnapshot([], [{ id: 'Wood', count: 4321 }]))
    expect(csv.split('\r\n')[1]).toMatch(/^Wood,Wood,materials,4321$/)
  })
})

describe('buildPalsJson', () => {
  it('emits parseable JSON without tower bosses', () => {
    const json = buildPalsJson(makeSnapshot([makePal(), makePal({ isTowerBoss: true })]))
    const parsed = JSON.parse(json) as Pal[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].speciesName).toBe('Lamball')
  })
})
