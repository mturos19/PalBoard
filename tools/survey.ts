/**
 * Dev utility: surveys a Level.sav so we can see what a real world contains and
 * how expensive each subtree is. Run with `npx vite-node tools/survey.ts <dir>`.
 */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../core/compression'
import { FArchiveReader } from '../core/gvas/reader'
import { parseGvas, parseGvasHeader } from '../core/gvas/parser'
import { levelParsePlan } from '../core/palworld/hints'
import type { MapEntry, PropStruct, PropValue } from '../core/gvas/types'

const dir = process.argv[2]
if (!dir) throw new Error('usage: survey.ts <world save dir>')

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + 'MB'

const raw = readFileSync(`${dir}/Level.sav`)
let t = performance.now()
const { gvas, codec, magic } = await decompressSave(raw)
console.log(`decompress: ${magic}/${codec} ${mb(raw.length)} -> ${mb(gvas.length)} in ${(performance.now() - t).toFixed(0)}ms\n`)

// --- Pass 1: header-only walk of worldSaveData, to size each subtree ----------
/** Reads the type-specific prefix then seeks past the declared value bytes. */
function skipValue(r: FArchiveReader, type: string, size: number): void {
  if (type === 'StructProperty') { r.fstring(); r.skip(16) }
  else if (type === 'ArrayProperty') r.fstring()
  else if (type === 'MapProperty') { r.fstring(); r.fstring() }
  else if (type === 'EnumProperty') r.fstring()
  else if (type === 'ByteProperty') r.fstring()
  else if (type === 'BoolProperty') r.skip(1) // value byte precedes the guid
  r.optionalGuid()
  r.skip(size)
}

const r = new FArchiveReader(gvas)
parseGvasHeader(r)
console.log('top-level properties:')
for (;;) {
  const name = r.fstring()
  if (name === 'None' || name === '') break
  const type = r.fstring()
  const size = r.u64AsNumber()
  console.log(`  ${name.padEnd(16)} ${type.padEnd(16)} ${size}`)
  if (name !== 'worldSaveData') {
    skipValue(r, type, size)
    continue
  }
  const structType = r.fstring()
  r.skip(16)
  r.optionalGuid()
  const valueStart = r.offset
  console.log(`\n  worldSaveData (${structType}) value spans ${valueStart}..${valueStart + size}`)
  console.log('  members (declared byte size):')
  const rows: Array<[string, string, number]> = []
  try {
    for (;;) {
      const at = r.offset
      const n2 = r.fstring()
      if (n2 === 'None' || n2 === '') {
        console.log(`  terminator at ${at}, value ends ${valueStart + size}, delta ${valueStart + size - r.offset}`)
        break
      }
      const t2 = r.fstring()
      const s2 = r.u64AsNumber()
      rows.push([n2, t2, s2])
      skipValue(r, t2, s2)
    }
  } catch (e) {
    console.log(`  !! walk derailed at offset ${r.offset} after ${rows.length} members: ${(e as Error).message}`)
    console.log(`     last members:`, rows.slice(-3).map(([n]) => n).join(', '))
  }
  rows.sort((a, b) => b[2] - a[2])
  const total = rows.reduce((acc, [, , s2]) => acc + s2, 0)
  for (const [n2, t2, s2] of rows) {
    const pct = ((s2 / total) * 100).toFixed(1).padStart(5)
    console.log(`    ${pct}%  ${mb(s2).padStart(8)}  ${n2.padEnd(42)} ${t2}`)
  }
  console.log(`    total ${mb(total)}`)
  break
}

// --- Pass 2: real parse with the dashboard's parse plan -----------------------
console.log('\nparsing with dashboard plan...')
const unknown: string[] = []
const errors: string[] = []
t = performance.now()
const before = process.memoryUsage().heapUsed
const file = parseGvas(
  gvas,
  levelParsePlan({
    onUnknownType: (p, a) => unknown.push(`${p} -> ${a}`),
    onError: (p, e) => errors.push(`${p}: ${e.message}`),
  }),
)
const parseMs = performance.now() - t
const heap = process.memoryUsage().heapUsed - before
console.log(`parsed in ${parseMs.toFixed(0)}ms, heap +${mb(heap)}`)
if (unknown.length) console.log('unknown type hints:', [...new Set(unknown)].slice(0, 20))
console.log(errors.length ? `parse errors:\n  ${[...new Set(errors)].slice(0, 10).join('\n  ')}` : 'parse errors: none')

const wsd = file.properties.worldSaveData as PropStruct
const entries = (k: string) => (wsd[k] as MapEntry[] | undefined) ?? []
console.log('\ncounts:')
for (const k of Object.keys(wsd)) {
  const v = wsd[k] as PropValue
  const n = Array.isArray(v) ? v.length : v === null ? '(skipped)' : typeof v
  console.log(`  ${k.padEnd(44)} ${n}`)
}

// --- Shape probes: what does a character / base / group actually look like? ---
const chars = entries('CharacterSaveParameterMap')
console.log(`\nCharacterSaveParameterMap: ${chars.length} entries`)
if (chars.length) {
  const v = chars[0].value as PropStruct
  console.log('  value keys:', Object.keys(v))
  const rawData = v.RawData
  console.log('  RawData is Buffer:', Buffer.isBuffer(rawData), Buffer.isBuffer(rawData) ? `${(rawData as Buffer).length} bytes` : '')
  console.log('  key shape:', JSON.stringify(chars[0].key).slice(0, 200))
}

const groups = entries('GroupSaveDataMap')
console.log(`\nGroupSaveDataMap: ${groups.length} entries`)
if (groups.length) {
  const v = groups[0].value as PropStruct
  console.log('  value keys:', Object.keys(v), 'GroupType=', v.GroupType)
}

const bases = entries('BaseCampSaveData')
console.log(`\nBaseCampSaveData: ${bases.length} entries`)
if (bases.length) console.log('  value keys:', Object.keys(bases[0].value as PropStruct))

const containers = entries('ItemContainerSaveData')
console.log(`\nItemContainerSaveData: ${containers.length} entries`)
if (containers.length) console.log('  value keys:', Object.keys(containers[0].value as PropStruct))

const charContainers = entries('CharacterContainerSaveData')
console.log(`CharacterContainerSaveData: ${charContainers.length} entries`)
if (charContainers.length) console.log('  value keys:', Object.keys(charContainers[0].value as PropStruct))

const dyn = wsd.DynamicItemSaveData
console.log(`\nDynamicItemSaveData:`, Array.isArray(dyn) ? `${dyn.length} entries` : typeof dyn)
if (Array.isArray(dyn) && dyn.length) console.log('  keys:', Object.keys(dyn[0] as PropStruct))
