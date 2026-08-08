/**
 * Dev utility: works out the post-0.3.7 ItemContainer slot RawData layout,
 * which encodes the whole slot (item id, count, dynamic id) as custom binary.
 * Run with `npx vite-node tools/probe-slots.ts <world save dir>`.
 */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../core/compression'
import { parseGvas } from '../core/gvas/parser'
import { levelParsePlan } from '../core/palworld/hints'
import type { MapEntry, PropStruct } from '../core/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const wsd = parseGvas(gvas, levelParsePlan()).properties.worldSaveData as PropStruct
const containers = (wsd.ItemContainerSaveData as MapEntry[]) ?? []
console.log(`${containers.length} containers`)

const hex = (b: Buffer) =>
  b.toString('hex').replace(/(..)/g, '$1 ').trim()
const ascii = (b: Buffer) =>
  [...b].map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '·')).join('')

// Dump a spread of slot buffers: small, large, from different containers.
let dumped = 0
const seenSizes = new Set<number>()
for (const e of containers) {
  const v = e.value as PropStruct
  const slots = v.Slots as PropStruct[] | undefined
  if (!slots?.length) continue
  for (const slot of slots) {
    const raw = slot.RawData
    if (!Buffer.isBuffer(raw) || raw.length === 0) continue
    if (seenSizes.has(raw.length) && dumped > 6) continue
    seenSizes.add(raw.length)
    console.log(`\n--- slot buffer ${raw.length} bytes (container SlotNum=${v.SlotNum}) ---`)
    for (let i = 0; i < Math.min(raw.length, 160); i += 16) {
      const row = raw.subarray(i, i + 16)
      console.log(`  ${String(i).padStart(4)}  ${hex(row).padEnd(48)}  ${ascii(row)}`)
    }
    dumped++
    if (dumped >= 14) break
  }
  if (dumped >= 14) break
}
