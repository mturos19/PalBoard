import { describe, expect, it } from 'vitest'
import { decodeItemSlot } from '../core/palworld/inventory'
import { buildAlerts } from '../core/palworld/alerts'
import { categorise, itemName } from '../shared/gamedata/items'
import { isHumanCharacter, speciesInfo } from '../shared/gamedata/species'
import type { Pal, StorageSummary } from '../shared/domain'

// --- item slot decoding -------------------------------------------------------

/** Builds a slot buffer in the layout observed in real 1.0 saves. */
function slotBuffer(index: number, count: number, id: string, localIdByte = 0): Buffer {
  const idBytes = Buffer.from(id + '\0', 'latin1')
  const buf = Buffer.alloc(4 + 4 + 4 + idBytes.length + 32 + 20)
  buf.writeUInt32LE(index, 0)
  buf.writeUInt32LE(count, 4)
  buf.writeInt32LE(idBytes.length, 8)
  idBytes.copy(buf, 12)
  // created-world guid (zero) + local guid
  buf[12 + idBytes.length + 16] = localIdByte
  return buf
}

describe('decodeItemSlot', () => {
  it('decodes index, count and item id', () => {
    const slot = decodeItemSlot(slotBuffer(2, 929, 'Money'))
    expect(slot).toEqual({ slotIndex: 2, count: 929, itemId: 'Money', dynamicLocalId: null })
  })

  it('captures a non-zero dynamic id (durability-bearing items)', () => {
    const slot = decodeItemSlot(slotBuffer(0, 1, 'AssaultRifle_Default2', 0xab))
    expect(slot?.dynamicLocalId).not.toBeNull()
  })

  it('returns null for empty or truncated buffers', () => {
    expect(decodeItemSlot(Buffer.alloc(0))).toBeNull()
    expect(decodeItemSlot(Buffer.alloc(8))).toBeNull()
  })
})

// --- item presentation --------------------------------------------------------

describe('item categorisation', () => {
  it('assigns categories from real save vocabulary', () => {
    expect(categorise('Money')).toBe('currency')
    expect(categorise('PalSphere_Mega')).toBe('spheres')
    expect(categorise('AssaultRifleBullet')).toBe('ammo')
    expect(categorise('PalEgg_Fire_05')).toBe('eggs')
    expect(categorise('Blueprint_IronArmor_3')).toBe('schematics')
    expect(categorise('SkillCard_DragonMeteor')).toBe('pal-items')
    expect(categorise('Potion_High')).toBe('medicine')
    expect(categorise('Carbonara')).toBe('food')
    expect(categorise('TomatoSeeds')).toBe('food')
    expect(categorise('IronIngot')).toBe('materials')
    expect(categorise('TreasureBoxKey03')).toBe('keys')
    expect(categorise('IronArmor_4')).toBe('equipment')
  })

  it('names items from the game data tables', () => {
    expect(itemName('Money')).toBe('Gold Coin')
    expect(itemName('Pal_crystal_S')).toBe('Paldium Fragment')
    // The game's own names, not humanised ids: it really is "Ammo", and the
    // mined item is displayed simply as "Ore" in-game.
    expect(itemName('AssaultRifleBullet')).toBe('Assault Rifle Ammo')
    expect(itemName('CopperOre')).toBe('Ore')
  })
})

// --- species table ------------------------------------------------------------

describe('species table', () => {
  it('resolves ids case- and underscore-insensitively', () => {
    expect(speciesInfo('SheepBall')?.name).toBe('Lamball')
    expect(speciesInfo('sheepball')?.name).toBe('Lamball')
    expect(speciesInfo('Manticore_Dark')?.name).toBe('Blazehowl Noct')
    expect(speciesInfo('ManticoreDark')?.name).toBe('Blazehowl Noct')
  })

  it('resolves post-1.0 species from the extracted game names', () => {
    // Previously null (no curated entry); the game data supplies the name.
    expect(speciesInfo('MonochromeQueen')?.name).toBe('Solenne')
    // Truly unknown ids still return null rather than a guess.
    expect(speciesInfo('NotARealPalId')).toBeNull()
  })

  it('flags captured humans', () => {
    expect(isHumanCharacter('Hunter_Handgun')).toBe(true)
    expect(isHumanCharacter('Police_Rifle')).toBe(true)
    expect(isHumanCharacter('SheepBall')).toBe(false)
  })
})

// --- alerts -------------------------------------------------------------------

function makePal(overrides: Partial<Pal>): Pal {
  return {
    instanceId: Math.random().toString(36).slice(2),
    characterId: 'Sheepball', speciesId: 'Sheepball', speciesName: 'Lamball',
    elements: ['neutral'], isHuman: false, nickname: null, gender: 'female',
    level: 10, exp: 0, isAlpha: false, isLucky: false, isTowerBoss: false,
    hp: 1000, ivHp: 50, ivAttack: 50, ivDefense: 50, rank: 1,
    soulHp: 0, soulAttack: 0, soulDefense: 0, soulWorkSpeed: 0,
    passiveSkills: [], equippedSkills: [], masteredSkills: [],
    stomach: 100, hungerState: null, isHungry: false, sanity: 100, sickness: null,
    isFainted: false, friendshipPoints: 0, ownerPlayerUid: null,
    containerId: 'c', slotIndex: 0, location: 'palbox', baseId: null,
    workSuitabilities: {}, disabledWorkSuitabilities: [], currentWork: null,
    ...overrides,
  }
}

const emptyStorage: StorageSummary = {
  items: [], containerCount: 0, totalSlots: 0, usedSlots: 0, nearFullContainers: 0,
}

describe('buildAlerts', () => {
  it('aggregates starving pals into one critical alert with samples', () => {
    const alerts = buildAlerts({
      pals: [
        makePal({ isHungry: true, nickname: 'Remy' }),
        makePal({ isHungry: true }),
        makePal({}),
      ],
      bases: [],
      storage: emptyStorage,
      palbox: null,
    })
    const starving = alerts.find((a) => a.id === 'starving')
    expect(starving?.severity).toBe('critical')
    expect(starving?.title).toContain('2 pals')
    expect(starving?.detail).toContain('Remy')
  })

  it('ignores tower bosses and humans', () => {
    const alerts = buildAlerts({
      pals: [
        makePal({ isHungry: true, isTowerBoss: true }),
        makePal({ isHungry: true, isHuman: true }),
      ],
      bases: [],
      storage: emptyStorage,
      palbox: null,
    })
    expect(alerts.find((a) => a.id === 'starving')).toBeUndefined()
  })

  it('warns about a near-capacity palbox and escalates at 98%', () => {
    const warn = buildAlerts({ pals: [], bases: [], storage: emptyStorage, palbox: { used: 900, capacity: 960 } })
    expect(warn.find((a) => a.id === 'palbox-full')?.severity).toBe('warning')
    const crit = buildAlerts({ pals: [], bases: [], storage: emptyStorage, palbox: { used: 950, capacity: 960 } })
    expect(crit.find((a) => a.id === 'palbox-full')?.severity).toBe('critical')
  })

  it('flags a built-up base with no workers', () => {
    const alerts = buildAlerts({
      pals: [],
      bases: [{
        id: 'b1', name: 'Base 1', guildId: 'g', position: { x: 0, y: 0, z: 0 },
        coord: { x: 0, y: 0 }, areaRange: 3500, state: 1, workerCount: 0, buildingCount: 40,
      }],
      storage: emptyStorage,
      palbox: null,
    })
    expect(alerts.some((a) => a.id === 'base-idle-b1')).toBe(true)
  })

  it('sorts critical before warning before info', () => {
    const alerts = buildAlerts({
      pals: [makePal({ isHungry: true }), makePal({ sanity: 20 })],
      bases: [{
        id: 'b1', name: 'Base 1', guildId: 'g', position: { x: 0, y: 0, z: 0 },
        coord: { x: 0, y: 0 }, areaRange: 3500, state: 1, workerCount: 0, buildingCount: 40,
      }],
      storage: { ...emptyStorage, nearFullContainers: 3 },
      palbox: null,
    })
    const severities = alerts.map((a) => a.severity)
    expect(severities).toEqual([...severities].sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 }
      return order[a as 'critical'] - order[b as 'critical']
    }))
  })
})
