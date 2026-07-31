import { describe, expect, it } from 'vitest'
import generated from '../shared/gamedata/generated/names.json'
import {
  itemDisplayName,
  palDisplayName,
  skillDisplayName,
  NAME_COUNTS,
} from '../shared/gamedata/names'
import { curatedEntry, isHumanCharacter, speciesInfo } from '../shared/gamedata/species'
import { itemName } from '../shared/gamedata/items'

describe('extracted game names', () => {
  it('has full-roster coverage', () => {
    expect(NAME_COUNTS.pals).toBeGreaterThan(300)
    expect(NAME_COUNTS.items).toBeGreaterThan(1000)
    expect(NAME_COUNTS.skills).toBeGreaterThan(900)
  })

  it('resolves names the community tables never had', () => {
    expect(palDisplayName('GhostDragon')).toBe('Eidrolon')
    expect(palDisplayName('MonochromeQueen')).toBe('Solenne')
    expect(palDisplayName('BlueThunderHorse')).toBe('Azurmane')
    expect(palDisplayName('WhiteShieldDragon')).toBe('Silvegis')
  })

  it('is case- and underscore-insensitive like save ids', () => {
    expect(palDisplayName('BOSS_GhostDragon'.replace(/^BOSS_/, ''))).toBe('Eidrolon')
    expect(palDisplayName('sheepball')).toBe('Lamball')
    expect(palDisplayName('Manticore_Dark')).toBe('Blazehowl Noct')
  })

  it('names items and skills from the game data', () => {
    expect(itemName('StealIngot')).toBe('Pal Metal Ingot')
    expect(itemName('Cloth2')).toBe('High Quality Cloth')
    expect(itemName('DogCoin')).toBe('Dog Coin')
    expect(itemDisplayName('Money')).toBe('Gold Coin')
    expect(skillDisplayName('AirCanon')).toBe('Air Cannon')
    expect(skillDisplayName('Rare')).toBe('Lucky')
    expect(skillDisplayName('ElementBoost_Fire_1_PAL')).toBe('Pyromaniac')
  })

  it('falls back to a humanised id for unknown items', () => {
    expect(itemName('SomeFuturePatchItem_3')).toBe('Some Future Patch Item 3')
  })
})

describe('curated table consistency', () => {
  it('every curated species name matches the game data exactly', () => {
    // This is the guard that caught RedArmorBird≠Rooby, HawkBird≠Galeclaw and
    // PinkRabbit≠Flopie. A curated entry naming the wrong pal means its
    // elements describe the wrong pal too — so a mismatch is a hard failure.
    const pals = (generated as { pals: Record<string, string> }).pals
    const mismatches: string[] = []
    for (const [id, trueName] of Object.entries(pals)) {
      const curated = curatedEntry(id)
      if (curated && curated.name !== trueName) {
        mismatches.push(`${id}: curated "${curated.name}" vs game "${trueName}"`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('resolution prefers the game name and keeps curated elements', () => {
    const info = speciesInfo('SheepBall')
    expect(info?.name).toBe('Lamball')
    expect(info?.elements).toEqual(['neutral'])
    expect(info?.work?.farming).toBe(1)
  })

  it('derives a partial element from the game’s subspecies suffixes', () => {
    expect(speciesInfo('GhostDragon_Fire')?.elements).toEqual(['fire'])
    expect(speciesInfo('BlackPuppy_Ice')?.elements).toEqual(['ice'])
    // Base forms without curated data stay honestly unknown.
    expect(speciesInfo('GhostDragon')?.elements).toEqual([])
  })

  it('does not mistake pals with human-sounding ids for humans', () => {
    expect(isHumanCharacter('Hunter_Handgun')).toBe(true)
    expect(isHumanCharacter('SheepBall')).toBe(false)
    // "Male..." pal ids would trip the regex; the pal-name check wins.
    expect(isHumanCharacter('GhostDragon')).toBe(false)
  })
})
