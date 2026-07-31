/**
 * Item container decoding.
 *
 * Since v0.3.7 Palworld encodes each item slot as a custom binary blob rather
 * than UE properties. Layout, verified against 10,907 slots of a 1.0 save with
 * zero decode failures:
 *
 *   u32      slot index
 *   u32      count
 *   fstring  static item id
 *   guid     created-world id   (dynamic items only, else zero)
 *   guid     local id           (links into DynamicItemSaveData)
 *   ~20 B    reserved/unknown — tolerated, not read
 */
import { FArchiveReader } from '../gvas/reader'
import type { GvasFile, MapEntry, PropStruct, PropValue } from '../gvas/types'
import { RESOURCE_GROUPS } from '../../../shared/gamedata/items'
import type {
  ItemStack,
  PlayerInventory,
  ResourceTotals,
  StorageSummary,
} from '../../../shared/domain'

export interface DecodedSlot {
  slotIndex: number
  count: number
  itemId: string
  /** Non-zero when the item has dynamic state (durability, ammo). */
  dynamicLocalId: string | null
}

const ZERO_GUID = '00000000-0000-0000-0000-000000000000'

export function decodeItemSlot(buf: Buffer): DecodedSlot | null {
  if (buf.length < 12) return null
  const r = new FArchiveReader(buf)
  const slotIndex = r.u32()
  const count = r.u32()
  const itemId = r.fstring()
  if (!itemId) return null
  let dynamicLocalId: string | null = null
  // Dynamic-id pair is absent on some truncated legacy slots; tolerate.
  if (r.remaining >= 32) {
    r.skip(16) // created-world id
    const localId = r.guid()
    if (localId !== ZERO_GUID) dynamicLocalId = localId
  }
  return { slotIndex, count, itemId, dynamicLocalId }
}

const asStruct = (v: PropValue | undefined): PropStruct | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v)
    ? (v as PropStruct)
    : undefined

const wrappedId = (v: PropValue | undefined): string | null => {
  const s = asStruct(v)
  return typeof s?.ID === 'string' ? s.ID : null
}

interface DecodedContainer {
  id: string
  slotNum: number
  slots: DecodedSlot[]
}

/** Decodes every item container in worldSaveData, keyed by container id. */
export function decodeContainers(wsd: PropStruct, warnings: string[]): Map<string, DecodedContainer> {
  const out = new Map<string, DecodedContainer>()
  let failures = 0

  for (const entry of (wsd.ItemContainerSaveData as MapEntry[] | undefined) ?? []) {
    const key = asStruct(entry.key)
    const value = asStruct(entry.value)
    const id = wrappedId(key?.ID) ?? (typeof key?.ID === 'string' ? key.ID : null)
    if (!id || !value) continue

    const slotNum = typeof value.SlotNum === 'number' ? value.SlotNum : 0
    const slots: DecodedSlot[] = []
    for (const slot of (value.Slots as PropStruct[] | undefined) ?? []) {
      const raw = (slot as PropStruct).RawData
      if (!Buffer.isBuffer(raw)) continue
      try {
        const decoded = decodeItemSlot(raw)
        if (decoded && decoded.count > 0) slots.push(decoded)
      } catch {
        failures++
      }
    }
    out.set(id, { id, slotNum, slots })
  }

  if (failures > 0) warnings.push(`${failures} item slots failed to decode — slot layout may have drifted`)
  return out
}

/** Sums stacks by item id and sorts by descending count. */
function aggregate(slots: Iterable<DecodedSlot>): ItemStack[] {
  const totals = new Map<string, number>()
  for (const s of slots) totals.set(s.itemId, (totals.get(s.itemId) ?? 0) + s.count)
  return [...totals]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
}

export interface InventoryBuild {
  inventories: PlayerInventory[]
  storage: StorageSummary
  resources: ResourceTotals
}

/**
 * Splits containers into player pouches (identified via each player save's
 * InventoryInfo) and world storage, then aggregates both.
 */
export function buildInventories(
  wsd: PropStruct,
  playerSaves: Map<string, GvasFile>,
  playerNames: Map<string, string>,
  warnings: string[],
): InventoryBuild {
  const containers = decodeContainers(wsd, warnings)
  const claimed = new Set<string>()
  const inventories: PlayerInventory[] = []

  for (const [uid, save] of playerSaves) {
    const info = asStruct(asStruct(save.properties.SaveData)?.InventoryInfo)
    if (!info) continue
    const take = (key: string): ItemStack[] => {
      const id = wrappedId(info[key])
      if (!id) return []
      claimed.add(id)
      const c = containers.get(id)
      return c ? aggregate(c.slots) : []
    }
    // DropSlot is claimed (not storage) but not shown — it is transient.
    const dropped = wrappedId(info.DropSlotContainerId)
    if (dropped) claimed.add(dropped)

    inventories.push({
      uid,
      name: playerNames.get(uid) ?? uid.slice(0, 8),
      common: take('CommonContainerId'),
      essential: take('EssentialContainerId'),
      weapons: take('WeaponLoadOutContainerId'),
      armor: take('PlayerEquipArmorContainerId'),
      food: take('FoodEquipContainerId'),
    })
  }

  // Everything unclaimed is world storage: base chests, feed boxes, wooden
  // chests in the wild, dropped bags.
  const storageSlots: DecodedSlot[] = []
  let totalSlots = 0
  let usedSlots = 0
  let nearFull = 0
  let containerCount = 0
  for (const c of containers.values()) {
    if (claimed.has(c.id)) continue
    containerCount++
    totalSlots += c.slotNum
    usedSlots += c.slots.length
    if (c.slotNum >= 5 && c.slots.length / c.slotNum >= 0.95) nearFull++
    storageSlots.push(...c.slots)
  }

  const items = aggregate(storageSlots)

  // Resource totals span storage AND pouches — the player carrying 4k ingots
  // still owns them. Sum per group over exact-id lists.
  const everySlot: DecodedSlot[] = [...storageSlots]
  for (const c of containers.values()) if (claimed.has(c.id)) everySlot.push(...c.slots)
  const totalsById = new Map<string, number>()
  for (const s of everySlot) totalsById.set(s.itemId, (totalsById.get(s.itemId) ?? 0) + s.count)

  const resources: ResourceTotals = {}
  for (const group of RESOURCE_GROUPS) {
    let sum = 0
    for (const id of group.ids) sum += totalsById.get(id) ?? 0
    resources[group.key] = sum
  }

  return {
    inventories,
    storage: { items, containerCount, totalSlots, usedSlots, nearFullContainers: nearFull },
    resources,
  }
}
