/**
 * Extracts display-name tables from the installed game's pak into
 * `shared/gamedata/generated/names.json`, which is committed so the app works
 * on machines without Palworld installed. Re-run after a game update:
 *
 *   npm run extract-gamedata [-- <path-to-Pal-Windows.pak>]
 *
 * Everything extracted is validated against known-beyond-doubt pairs before
 * being written; a failed validation aborts rather than committing bad names.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { PakFile } from './pak/reader'
import { parseUAsset } from './pak/uasset'
import { extractTextRows } from './pak/datatable'

const DEFAULT_PAK =
  'C:/Program Files (x86)/Steam/steamapps/common/Palworld/Pal/Content/Paks/Pal-Windows.pak'

const L10N = 'Pal/Content/L10N/en/Pal/DataTable/Text'

interface Table {
  /** Output group name in the generated JSON. */
  group: string
  asset: string
  /** Row-key prefixes to harvest, stripped in the output. */
  prefixes: string[]
}

const TABLES: Table[] = [
  { group: 'pals', asset: `${L10N}/DT_PalNameText_Common`, prefixes: ['PAL_NAME_'] },
  { group: 'humans', asset: `${L10N}/DT_HumanNameText_Common`, prefixes: ['NAME_'] },
  { group: 'items', asset: `${L10N}/DT_ItemNameText_Common`, prefixes: ['ITEM_NAME_'] },
  {
    group: 'skills',
    asset: `${L10N}/DT_SkillNameText_Common`,
    prefixes: ['PASSIVE_', 'ACTION_SKILL_', 'PARTNERSKILL_'],
  },
]

/** Pairs that must extract exactly; guards the scanner against format drift. */
const VALIDATION: Array<[group: string, key: string, expected: string]> = [
  ['pals', 'SheepBall', 'Lamball'],
  ['pals', 'PinkCat', 'Cattiva'],
  ['pals', 'JetDragon', 'Jetragon'],
  ['pals', 'KingBahamut', 'Blazamut'],
  ['items', 'Money', 'Gold Coin'],
  ['items', 'PalSphere', 'Pal Sphere'],
]

const pakPath = process.argv[2] ?? DEFAULT_PAK
if (!existsSync(pakPath)) {
  console.error(`pak not found: ${pakPath}`)
  process.exit(1)
}

console.log('opening', pakPath)
const pak = PakFile.open(pakPath)
console.log(`index: ${pak.entries.size} entries, pak v${pak.version}`)

const out: Record<string, Record<string, string>> = {}
for (const table of TABLES) {
  const ua = pak.entries.get(`${table.asset}.uasset`)
  const ux = pak.entries.get(`${table.asset}.uexp`)
  if (!ua || !ux) {
    console.error(`missing table ${table.asset}`)
    process.exit(1)
  }
  const { names } = parseUAsset(await pak.read(ua))
  const uexp = await pak.read(ux)

  const group: Record<string, string> = {}
  let skipped = 0
  for (const row of extractTextRows(uexp, names, table.prefixes)) {
    const prefix = table.prefixes.find((p) => row.key.startsWith(p))
    if (!prefix) {
      skipped++ // row key outside the id namespaces we map (e.g. dev/dummy rows)
      continue
    }
    group[row.key.slice(prefix.length)] = row.text
  }
  out[table.group] = group
  if (skipped > 0) console.log(`  (${table.group}: skipped ${skipped} rows outside prefixes)`)
  console.log(`${table.group}: ${Object.keys(group).length} names`)
}
pak.close()

let failed = 0
for (const [group, key, expected] of VALIDATION) {
  const got = out[group]?.[key]
  if (got !== expected) {
    console.error(`VALIDATION FAILED: ${group}.${key} = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
    failed++
  }
}
if (failed > 0) process.exit(1)

mkdirSync('shared/gamedata/generated', { recursive: true })
const payload = {
  _source: 'Extracted from Palworld game files by tools/extract-gamedata.ts — do not edit by hand.',
  _extractedAt: new Date().toISOString(),
  ...out,
}
writeFileSync('shared/gamedata/generated/names.json', JSON.stringify(payload, null, 1) + '\n', 'utf8')
console.log('wrote shared/gamedata/generated/names.json — all validations passed')
