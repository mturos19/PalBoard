/**
 * Display names extracted from the installed game's own data tables by
 * `tools/extract-gamedata.ts` (pak → DT_*NameText_Common). These are the
 * authoritative names — the curated species table only adds what the text
 * tables cannot: elements and work suitabilities.
 *
 * Lookups are case- and underscore-insensitive because save ids drift in
 * casing (`SheepBall` vs `Sheepball`) while the table keys do not.
 */
import generated from './generated/names.json'

type Group = Record<string, string>

const g = generated as unknown as {
  pals: Group
  humans: Group
  items: Group
  skills: Group
}

function fold(id: string): string {
  return id.toLowerCase().replace(/_/g, '')
}

function buildIndex(group: Group): Map<string, string> {
  const index = new Map<string, string>()
  for (const [key, value] of Object.entries(group)) index.set(fold(key), value)
  return index
}

const palIndex = buildIndex(g.pals)
const humanIndex = buildIndex(g.humans)
const itemIndex = buildIndex(g.items)
const skillIndex = buildIndex(g.skills)

/** Game display name for a species id (alpha/boss prefix already stripped). */
export function palDisplayName(speciesId: string): string | null {
  return palIndex.get(fold(speciesId)) ?? null
}

/** Display name for a human NPC id, when the game defines one. */
export function humanDisplayName(characterId: string): string | null {
  return humanIndex.get(fold(characterId)) ?? null
}

/** Game display name for an item static id. */
export function itemDisplayName(itemId: string): string | null {
  return itemIndex.get(fold(itemId)) ?? null
}

/** Display name for a passive/active/partner skill id. */
export function skillDisplayName(skillId: string): string | null {
  return skillIndex.get(fold(skillId)) ?? null
}

export const NAME_COUNTS = {
  pals: Object.keys(g.pals).length,
  humans: Object.keys(g.humans).length,
  items: Object.keys(g.items).length,
  skills: Object.keys(g.skills).length,
} as const
