/** Dev utility: nails down the Palworld 1.0 Guild RawData tail layout. */
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
  if (!String(v.GroupType).includes('Guild')) continue
  const buf = v.RawData as Buffer
  const r = new FArchiveReader(buf)
  r.guid()
  r.fstring()
  const handleCount = r.u32()
  r.skip(handleCount * 32)
  console.log(`Guild: ${handleCount} handles, tail starts @${r.offset}, ${buf.length - r.offset} bytes left`)
  console.log('tail hex:', buf.subarray(r.offset, r.offset + 64).toString('hex'))

  const t = new FArchiveReader(buf, r.offset + 4) // 1.0 adds 4 bytes after handles
  const step = (label: string, fn: () => unknown) => {
    const at = t.offset
    try {
      const v = fn()
      console.log(`  @${String(at).padStart(6)} ${label.padEnd(18)} ${JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x))?.slice(0, 130)}`)
      return v
    } catch (err) {
      console.log(`  @${String(at).padStart(6)} ${label.padEnd(18)} FAILED ${(err as Error).message}`)
      throw err
    }
  }
  try {
    step('orgType', () => t.u8())
    step('baseIds', () => t.tarray((rr) => rr.guid()))
    step('baseCampLevel', () => t.i32())
    step('campPoints', () => t.tarray((rr) => rr.guid()))
    step('guildName', () => t.fstring())
    step('adminPlayerUid', () => t.guid())
    const n = step('playerCount', () => t.i32()) as number
    for (let i = 0; i < n; i++) {
      step(`  player[${i}].uid`, () => t.guid())
      step(`  player[${i}].seen`, () => t.i64())
      step(`  player[${i}].name`, () => t.fstring())
    }
    console.log(`  trailing bytes: ${t.remaining} -> ${buf.subarray(t.offset).toString('hex')}`)
  } catch {
    console.log(`  stopped at ${t.offset}/${buf.length}`)
  }
  // Dump the tail with ASCII so string fields are obvious.
  const from = 18700
  const tail = buf.subarray(from)
  for (let i = 0; i < tail.length; i += 16) {
    const row = tail.subarray(i, i + 16)
    const ascii = [...row].map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '.')).join('')
    console.log(`  ${String(from + i).padStart(6)}  ${row.toString('hex').padEnd(32)}  ${ascii}`)
  }
}
