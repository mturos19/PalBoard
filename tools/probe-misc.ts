/** Dev utility: shapes of MapObjectSaveData, player saves, and containers. */
import { readFileSync, readdirSync } from 'node:fs'
import { decompressSave } from '../core/compression'
import { FArchiveReader } from '../core/gvas/reader'
import { parseGvas, parseProperties } from '../core/gvas/parser'
import { fullParsePlan, levelParsePlan } from '../core/palworld/hints'
import type { MapEntry, PropStruct } from '../core/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const wsd = parseGvas(gvas, levelParsePlan()).properties.worldSaveData as PropStruct

const brief = (v: unknown): string => {
  if (Buffer.isBuffer(v)) return `<Buffer ${v.length}>`
  if (typeof v === 'bigint') return `${v}n`
  if (Array.isArray(v)) return `[${v.length}]${v.length ? ' ' + brief(v[0]) : ''}`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).join(',')}}`
  return JSON.stringify(v) ?? String(v)
}

// --- MapObjectSaveData --------------------------------------------------------
const objs = wsd.MapObjectSaveData as PropStruct[]
console.log(`=== MapObjectSaveData: ${objs.length} entries ===`)
console.log('  keys:', Object.keys(objs[0]))
for (const [k, v] of Object.entries(objs[0])) console.log(`    ${k.padEnd(28)} ${brief(v)}`)

// Union of field names across a sample.
const fields = new Set<string>()
for (const o of objs.slice(0, 500)) Object.keys(o).forEach((k) => fields.add(k))
console.log('  union(500):', [...fields].join(', '))

// Does an entry name its base camp?
const withBase = objs.filter((o) => Object.keys(o).some((k) => /base/i.test(k)))
console.log(`  entries with a base-ish field: ${withBase.length}`)
if (withBase.length) {
  const k = Object.keys(withBase[0]).find((x) => /base/i.test(x))!
  console.log(`  sample ${k}:`, brief(withBase[0][k]))
}

// --- CharacterContainerSaveData ----------------------------------------------
console.log(`\n=== CharacterContainerSaveData ===`)
for (const e of (wsd.CharacterContainerSaveData as MapEntry[]) ?? []) {
  const v = e.value as PropStruct
  const slots = v.Slots as PropStruct[] | undefined
  console.log(`  id=${brief(e.key)} SlotNum=${v.SlotNum} ref=${v.bReferenceSlot} slots=${slots?.length ?? 0}`)
  if (slots?.length) console.log(`     slot keys: ${Object.keys(slots[0]).join(',')}`)
}

// --- ItemContainerSaveData ----------------------------------------------------
const ics = (wsd.ItemContainerSaveData as MapEntry[]) ?? []
console.log(`\n=== ItemContainerSaveData: ${ics.length} ===`)
if (ics.length) {
  const v = ics[0].value as PropStruct
  for (const [k, x] of Object.entries(v)) console.log(`    ${k.padEnd(22)} ${brief(x)}`)
  const slots = v.Slots as PropStruct[] | undefined
  if (slots?.length) {
    console.log('    slot[0] keys:', Object.keys(slots[0]))
    for (const [k, x] of Object.entries(slots[0])) console.log(`      ${k.padEnd(20)} ${brief(x)}`)
  }
}

// --- Player saves -------------------------------------------------------------
console.log(`\n=== Players/*.sav ===`)
for (const f of readdirSync(`${dir}/Players`)) {
  if (!f.endsWith('.sav') || f.includes('_dps')) continue
  const { gvas: g } = await decompressSave(readFileSync(`${dir}/Players/${f}`))
  const p = parseGvas(g, fullParsePlan())
  console.log(`  --- ${f} (class ${p.header.saveGameClassName}) ---`)
  const sd = (p.properties.SaveData ?? p.properties) as PropStruct
  for (const [k, v] of Object.entries(sd)) console.log(`    ${k.padEnd(32)} ${brief(v)}`)
}

// --- LevelMeta / WorldOption --------------------------------------------------
for (const name of ['LevelMeta.sav', 'WorldOption.sav']) {
  console.log(`\n=== ${name} ===`)
  try {
    const { gvas: g } = await decompressSave(readFileSync(`${dir}/${name}`))
    const p = parseGvas(g, fullParsePlan())
    const walk = (o: PropStruct, indent: string) => {
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v)) {
          console.log(`${indent}${k}:`)
          walk(v as PropStruct, indent + '  ')
        } else console.log(`${indent}${k.padEnd(30)} ${brief(v)}`)
      }
    }
    walk(p.properties, '    ')
  } catch (e) {
    console.log('    failed:', (e as Error).message)
  }
}
