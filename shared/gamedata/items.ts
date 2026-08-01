/**
 * Item id presentation: display names, categories, and the resource groups the
 * dashboard tracks. Category assignment is rule-based over the id vocabulary
 * observed in real saves; the raw id is always available in the UI, so a
 * miscategorised exotic item is a cosmetic issue, not a data one.
 */
import { itemDisplayName } from './names'

export type ItemCategory =
  | 'currency'
  | 'materials'
  | 'food'
  | 'medicine'
  | 'ammo'
  | 'spheres'
  | 'equipment'
  | 'schematics'
  | 'pal-items'
  | 'eggs'
  | 'keys'
  | 'other'

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  currency: 'Currency',
  materials: 'Materials',
  food: 'Food & Crops',
  medicine: 'Medicine',
  ammo: 'Ammo',
  spheres: 'Spheres',
  equipment: 'Equipment',
  schematics: 'Schematics',
  'pal-items': 'Pal Items',
  eggs: 'Eggs',
  keys: 'Keys & Treasure',
  other: 'Other',
}

const FOOD_EXACT = new Set([
  'Berries', 'Egg', 'Milk', 'Honey', 'Flour', 'Wheat', 'Salad', 'Carbonara', 'Curry',
  'Chowder', 'Minestrone', 'MeatAndPotatoes', 'BaconEggs', 'Sweet', 'Herbs',
  'Onion', 'Carrot', 'Potato', 'Tomato', 'Lettuce', 'Mushroom', 'CaveMushroom',
  'PoisonMushroom', 'Poppy',
])

/** Assigns a category from id patterns established against real save data. */
export function categorise(id: string): ItemCategory {
  const l = id.toLowerCase()

  if (id === 'Money' || id === 'DogCoin' || l.startsWith('bountyproof')) return 'currency'
  if (l.startsWith('blueprint_')) return 'schematics'
  if (l.startsWith('palegg')) return 'eggs'
  if (l.startsWith('palsphere') || l.startsWith('keysphere') || l.startsWith('spheremodule')) return 'spheres'
  // Grenade launchers are weapons; grenades are ammunition.
  if (l.includes('bullet') || l.includes('arrow') || (l.includes('grenade') && !l.includes('launcher'))) {
    return 'ammo'
  }
  if (
    l.startsWith('treasure') || l.startsWith('salvage_') || l.startsWith('key') ||
    l.includes('whalewhistle') || l.startsWith('palsummon')
  ) return 'keys'
  if (
    l.startsWith('skillcard') || l.startsWith('skillunlock') || l.startsWith('palupgradestone') ||
    l.startsWith('expboost') || l.startsWith('fruit_') || l.startsWith('lotus_') ||
    l.startsWith('rankup') || l.startsWith('palgender') || l.startsWith('affectionfruit') ||
    l.startsWith('worksuitability') || l.startsWith('palitem') || l.startsWith('otomo_') ||
    l.startsWith('palpassiveskill')
  ) return 'pal-items'
  if (
    l.startsWith('potion') || l === 'medicines' || l === 'luxurymedicines' ||
    l.startsWith('elixir') || l === 'homeward'
  ) return 'medicine'
  if (FOOD_EXACT.has(id) || l.includes('baked') || l.includes('stewed') || l.startsWith('cake') || l.endsWith('seeds')) return 'food'
  if (
    l.startsWith('accessory') || l.includes('armor') || l.includes('helmet') ||
    l.startsWith('shield') || l.startsWith('glider') || l.includes('fishingrod') ||
    l.includes('rifle') || l.includes('shotgun') || l.includes('handgun') || l.includes('gun') ||
    l.includes('musket') || l.includes('revolver') || l.includes('launcher') || l.includes('bow') ||
    l.includes('katana') || l.includes('sword') || l.includes('blade') || l.includes('bat3') ||
    l === 'pan' || l === 'meatcutterknife' || l.startsWith('fishingbait') ||
    l.startsWith('additionalinventory') || l.startsWith('unlockequipmentslot') ||
    l.startsWith('unlock_') || l.startsWith('automealpouch') || l.startsWith('grapplinggun') ||
    l.startsWith('laserminingtool') || l.includes('technologybook')
  ) return 'equipment'
  return 'materials'
}

/**
 * Display name for an item id: the game's own extracted name table first
 * (authoritative — `StealIngot` is really "Pal Metal Ingot"), humanised id as
 * the fallback for anything a future patch adds before re-extraction.
 */
export function itemName(id: string): string {
  const fromGame = itemDisplayName(id)
  if (fromGame) return fromGame
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resource groups the dashboard strip and history tracking follow.
 * Each group sums the exact ids listed — all verified present in real saves.
 */
export const RESOURCE_GROUPS: ReadonlyArray<{ key: string; label: string; ids: string[] }> = [
  { key: 'gold', label: 'Gold', ids: ['Money'] },
  { key: 'wood', label: 'Wood', ids: ['Wood', 'Wood_Fine', 'Processed_Wood'] },
  { key: 'stone', label: 'Stone', ids: ['Stone'] },
  { key: 'ore', label: 'Ore', ids: ['CopperOre', 'ManganeseOre', 'SkyIslandOre'] },
  { key: 'coal', label: 'Coal', ids: ['Coal', 'Charcoal'] },
  { key: 'sulfur', label: 'Sulfur', ids: ['Sulfur'] },
  { key: 'quartz', label: 'Quartz', ids: ['Quartz'] },
  { key: 'oil', label: 'Crude Oil', ids: ['CrudeOil'] },
  { key: 'ingots', label: 'Ingots', ids: ['IronIngot', 'CopperIngot', 'ManganeseIngot', 'StealIngot', 'StainlessSteel'] },
  { key: 'fiber', label: 'Fiber', ids: ['Fiber'] },
  { key: 'paldium', label: 'Paldium', ids: ['Pal_crystal_S'] },
  { key: 'cement', label: 'Cement', ids: ['Cement'] },
]
