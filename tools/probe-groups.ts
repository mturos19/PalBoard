/** Dev utility: hexdumps GroupSaveDataMap RawData to work out the 1.0 layout. */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../electron/parser/compression'
import { FArchiveReader } from '../electron/parser/gvas/reader'
import { parseGvas } from '../electron/parser/gvas/parser'
import { levelParsePlan } from '../electron/parser/palworld/hints'
import type { MapEntry, PropStruct } from '../electron/parser/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const wsd = parseGvas(gvas, levelParsePlan()).properties.worldSaveData as PropStruct

for (const e of (wsd.GroupSaveDataMap as MapEntry[]) ?? []) {
  const v = e.value as PropStruct
  const buf = v.RawData as Buffer
  console.log(`\n=== ${v.GroupType} | key=${e.key} | ${buf.length} bytes ===`)
  const r = new FArchiveReader(buf)
  console.log('  groupId  :', r.guid())
  const nameLen = buf.readInt32LE(r.offset)
  console.log(`  nameLen  : ${nameLen} @${r.offset}`)
  console.log('  groupName:', JSON.stringify(r.fstring()), '-> offset', r.offset)
  const count = buf.readInt32LE(r.offset)
  console.log(`  handleCnt: ${count} @${r.offset}  (remaining after count: ${buf.length - r.offset - 4}, /32 = ${(buf.length - r.offset - 4) / 32}, /16 = ${(buf.length - r.offset - 4) / 16})`)
  console.log('  hex from here:', buf.subarray(r.offset).toString('hex').replace(/(.{32})/g, '$1\n                 '))
}
