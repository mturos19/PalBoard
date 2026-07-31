import { describe, expect, it } from 'vitest'
import { computeStats, humaniseSpecies, worldToMap } from '../electron/parser/palworld/model'
import { uidFromFileName } from '../electron/parser/loader'
import type { Pal, SaveSnapshot } from '../shared/domain'

function makePal(overrides: Partial<Pal> = {}): Pal {
  return {
    instanceId: Math.random().toString(36).slice(2),
    characterId: 'Sheepball',
    speciesId: 'Sheepball',
    speciesName: 'Sheepball',
    elements: [],
    isHuman: false,
    nickname: null,
    gender: 'female',
    level: 10,
    exp: 0,
    isAlpha: false,
    isLucky: false,
    isTowerBoss: false,
    hp: 1000,
    ivHp: 50,
    ivAttack: 50,
    ivDefense: 50,
    rank: 1,
    soulHp: 0,
    soulAttack: 0,
    soulDefense: 0,
    soulWorkSpeed: 0,
    passiveSkills: [],
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

function makeSnapshot(pals: Pal[]): SaveSnapshot {
  return {
    revision: 1,
    loadedAt: 0,
    savePath: '',
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
    inventories: [],
    storage: { items: [], containerCount: 0, totalSlots: 0, usedSlots: 0, nearFullContainers: 0 },
    resources: {},
    records: [],
    alerts: [],
    bases: [
      {
        id: 'b1',
        name: 'Base 1',
        guildId: 'g',
        position: { x: 0, y: 0, z: 0 },
        coord: { x: 0, y: 0 },
        areaRange: 3500,
        state: 1,
        workerCount: 0,
        buildingCount: 87,
      },
    ],
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

describe('worldToMap', () => {
  it('converts world-space translation to in-game map coordinates', () => {
    // Base 1 from a real save sits at map (244, -55).
    expect(worldToMap({ x: -96272, y: 40002, z: 683 })).toEqual({ x: 244, y: -55 })
  })

  it('maps the world origin near the centre of the map', () => {
    expect(worldToMap({ x: 0, y: 0, z: 0 })).toEqual({ x: 157, y: 155 })
  })
})

describe('humaniseSpecies', () => {
  it('splits developer camel-case ids into words', () => {
    expect(humaniseSpecies('StuffedShark')).toBe('Stuffed Shark')
    expect(humaniseSpecies('Manticore_Dark')).toBe('Manticore Dark')
    expect(humaniseSpecies('ElecPanda')).toBe('Elec Panda')
  })

  it('leaves single-word ids alone', () => {
    expect(humaniseSpecies('Kelpie')).toBe('Kelpie')
  })
})

describe('uidFromFileName', () => {
  it('expands a player save file name into a GUID', () => {
    expect(uidFromFileName('9A699B5E000000000000000000000000.sav')).toBe(
      '9a699b5e-0000-0000-0000-000000000000',
    )
  })

  it('rejects names that are not 32 hex characters', () => {
    expect(uidFromFileName('notaguid.sav')).toBeNull()
    expect(uidFromFileName('00000000000000000000000000000001_dps.sav')).toBeNull()
  })
})

describe('computeStats', () => {
  it('counts pals, species, and variants', () => {
    const stats = computeStats(
      makeSnapshot([
        makePal({ speciesId: 'Sheepball' }),
        makePal({ speciesId: 'Sheepball' }),
        makePal({ speciesId: 'Kelpie', isAlpha: true }),
        makePal({ speciesId: 'Kirin', isLucky: true }),
      ]),
    )
    expect(stats.palCount).toBe(4)
    expect(stats.uniqueSpeciesCount).toBe(3)
    expect(stats.alphaCount).toBe(1)
    expect(stats.luckyCount).toBe(1)
  })

  it('excludes tower bosses, which are not owned pals', () => {
    const stats = computeStats(
      makeSnapshot([makePal(), makePal({ isTowerBoss: true, speciesId: 'GrassMammoth' })]),
    )
    expect(stats.palCount).toBe(1)
    expect(stats.uniqueSpeciesCount).toBe(1)
  })

  it('uses the game hunger flag rather than a raw stomach threshold', () => {
    // Stomach maxima vary by species, so a low absolute value is not hunger.
    const stats = computeStats(
      makeSnapshot([
        makePal({ stomach: 40, isHungry: false }),
        makePal({ stomach: 300, isHungry: true, hungerState: 'Hunger' }),
      ]),
    )
    expect(stats.starvingCount).toBe(1)
  })

  it('flags low sanity and sickness', () => {
    const stats = computeStats(
      makeSnapshot([
        makePal({ sanity: 20 }),
        makePal({ sanity: 100, sickness: 'DepressionSprain' }),
        makePal(),
      ]),
    )
    expect(stats.depressedCount).toBe(1)
    expect(stats.sickCount).toBe(1)
  })

  it('counts base workers and rolls up buildings', () => {
    const stats = computeStats(
      makeSnapshot([
        makePal({ location: 'base', baseId: 'b1' }),
        makePal({ location: 'party' }),
        makePal({ location: 'palbox' }),
      ]),
    )
    expect(stats.workerCount).toBe(1)
    expect(stats.baseCount).toBe(1)
    expect(stats.buildingCount).toBe(87)
  })
})
