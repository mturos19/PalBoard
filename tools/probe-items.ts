/** Dev utility: aggregates every item id in the save to design category rules. */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../electron/parser/compression'
import { FArchiveReader } from '../electron/parser/gvas/reader'
import { parseGvas } from '../electron/parser/gvas/parser'
import { levelParsePlan } from '../electron/parser/palworld/hints'
import type { MapEntry, PropStruct } from '../electron/parser/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const wsd = parseGvas(gvas, levelParsePlan()).properties.worldSaveData as PropStruct

const totals = new Map<string, number>()
let slotCount = 0, emptyRaw = 0, decodeFail = 0
for (const e of (wsd.ItemContainerSaveData as MapEntry[]) ?? []) {
  const slots = (e.value as PropStruct).Slots as PropStruct[] | undefined
  if (!slots) continue
  for (const s of slots) {
    const raw = s.RawData
    if (!Buffer.isBuffer(raw)) continue
    if (raw.length < 12) { emptyRaw++; continue }
    try {
      const r = new FArchiveReader(raw)
      r.u32()
      const count = r.u32()
      const id = r.fstring()
      if (!id || count === 0) continue
      totals.set(id, (totals.get(id) ?? 0) + count)
      slotCount++
    } catch { decodeFail++ }
  }
}
console.log(`slots=${slotCount} emptyRaw=${emptyRaw} fail=${decodeFail} distinct=${totals.size}`)
const rows = [...totals].sort((a, b) => b[1] - a[1])
for (const [id, n] of rows.slice(0, 70)) console.log(`  ${String(n).padStart(8)}  ${id}`)
console.log('\n-- all distinct ids (alpha) --')
console.log([...totals.keys()].sort().join(', '))
