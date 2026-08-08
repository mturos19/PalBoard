/**
 * Container ownership.
 *
 * `ItemContainerSaveData` holds every container on the map, and in a real 1.0
 * world the overwhelming majority — ~4,900 of ~5,000 — are unopened treasure
 * chests and enemy loot carrying a few hundred gold apiece. Counting them
 * reported the whole island's contents as the player's: 6.7M gold against the
 * 1.7M actually held, and 12,696 "storage slots" against a real 429.
 *
 * What separates the two is reachability from a base the player founded. These
 * tests pin that rule down in both directions.
 */
import { describe, expect, it } from 'vitest'
import { buildInventories } from '../core/palworld/inventory'
import type { GvasFile, PropStruct } from '../core/gvas/types'

/** A slot blob in the layout real 1.0 saves use. */
function slot(index: number, count: number, id: string): PropStruct {
  const idBytes = Buffer.from(id + '\0', 'latin1')
  const buf = Buffer.alloc(4 + 4 + 4 + idBytes.length + 32 + 20)
  buf.writeUInt32LE(index, 0)
  buf.writeUInt32LE(count, 4)
  buf.writeInt32LE(idBytes.length, 8)
  idBytes.copy(buf, 12)
  return { RawData: buf }
}

/** One entry of the ItemContainerSaveData map. */
function container(id: string, slotNum: number, stacks: Array<[string, number]>) {
  return {
    key: { ID: id },
    value: {
      SlotNum: slotNum,
      Slots: stacks.map(([itemId, count], i) => slot(i, count, itemId)),
    },
  }
}

const BASE_CHEST = 'aaaaaaaa-0000-0000-0000-000000000001'
const WILD_CHEST_A = 'bbbbbbbb-0000-0000-0000-000000000002'
const WILD_CHEST_B = 'bbbbbbbb-0000-0000-0000-000000000003'
const POUCH = 'cccccccc-0000-0000-0000-000000000004'

function worldSaveData(): PropStruct {
  return {
    ItemContainerSaveData: [
      container(BASE_CHEST, 40, [['Wood', 500], ['Money', 1000]]),
      // The wild loot pattern: a 3-slot drop table with a few hundred gold.
      container(WILD_CHEST_A, 3, [['Money', 929], ['Pan', 3], ['Herbs', 1]]),
      container(WILD_CHEST_B, 3, [['Money', 882], ['Arrow', 8]]),
      container(POUCH, 42, [['Money', 250], ['Stone', 60]]),
    ],
  }
}

/** A player save whose InventoryInfo claims the pouch container. */
function playerSaves(): Map<string, GvasFile> {
  const save = {
    properties: { SaveData: { InventoryInfo: { CommonContainerId: { ID: POUCH } } } },
  } as unknown as GvasFile
  return new Map([['uid-1', save]])
}

const build = (baseContainers: string[]) =>
  buildInventories(
    worldSaveData(),
    playerSaves(),
    new Map([['uid-1', 'Tester']]),
    new Set(baseContainers),
    [],
  )

describe('buildInventories container ownership', () => {
  it('counts gold in base storage and pouches, not in unowned world containers', () => {
    const { resources } = build([BASE_CHEST])
    // 1000 in the base chest + 250 in the pouch. The 1,811 sitting in wild
    // chests belongs to the island, not the player.
    expect(resources.gold).toBe(1250)
  })

  it('excludes unowned containers from storage slots and item totals', () => {
    const { storage } = build([BASE_CHEST])
    expect(storage.containerCount).toBe(1)
    expect(storage.totalSlots).toBe(40)
    expect(storage.usedSlots).toBe(2)
    expect(storage.items.map((i) => i.id).sort()).toEqual(['Money', 'Wood'])
  })

  it('keeps a player pouch out of world storage but inside resource totals', () => {
    const { storage, inventories, resources } = build([BASE_CHEST])
    expect(storage.items.find((i) => i.id === 'Stone')).toBeUndefined()
    expect(resources.stone).toBe(60)
    expect(inventories[0].common).toEqual([
      { id: 'Money', count: 250 },
      { id: 'Stone', count: 60 },
    ])
  })

  it('does not raise a near-full alert for a full three-slot loot drop', () => {
    // Wild drop tables are always 100% "full"; before ownership filtering they
    // produced a standing "45 storage containers nearly full" warning.
    const { storage } = build([BASE_CHEST])
    expect(storage.nearFullContainers).toBe(0)
  })

  it('warns rather than silently reporting nothing when no container is owned', () => {
    const warnings: string[] = []
    const result = buildInventories(
      worldSaveData(),
      playerSaves(),
      new Map(),
      new Set(),
      warnings,
    )
    expect(result.storage.containerCount).toBe(0)
    expect(warnings.join(' ')).toMatch(/no storage containers could be attributed to a base/)
  })

  it('counts each owned container once', () => {
    const { resources } = build([BASE_CHEST, BASE_CHEST])
    expect(resources.gold).toBe(1250)
  })
})
