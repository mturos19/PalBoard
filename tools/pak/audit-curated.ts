/** Compares every curated species entry against the game's own name table. */
import generated from '../../shared/gamedata/generated/names.json'

// Import the raw curated table by re-reading the module source is overkill —
// use the public API against every generated id instead.
import { speciesInfo } from '../../shared/gamedata/species'

const pals = generated.pals as Record<string, string>
let mismatches = 0
for (const [id, trueName] of Object.entries(pals)) {
  const curated = speciesInfo(id)
  if (curated && curated.name !== trueName) {
    console.log(`MISMATCH ${id.padEnd(26)} curated=${curated.name.padEnd(18)} game=${trueName}`)
    mismatches++
  }
}
console.log(`\n${mismatches} mismatches across ${Object.keys(pals).length} game ids`)
