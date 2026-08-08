/**
 * Dev utility: decodes Palworld RawData blobs so we can see their real shape.
 * Run with `npx vite-node tools/probe-raw.ts <world save dir>`.
 */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../core/compression'
import { FArchiveReader } from '../core/gvas/reader'
import { parseGvas, parseProperties } from '../core/gvas/parser'
import { levelParsePlan } from '../core/palworld/hints'
import type { MapEntry, PropStruct, PropValue } from '../core/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const file = parseGvas(gvas, levelParsePlan())
const wsd = file.properties.worldSaveData as PropStruct
const entries = (k: string) => (wsd[k] as MapEntry[] | undefined) ?? []

/** Character RawData = nested property set + 4 unknown bytes + group id. */
function decodeCharacter(buf: Buffer) {
  const r = new FArchiveReader(buf)
  const obj = parseNested(r)
  const unknown = r.bytes(4)
  const groupId = r.guid()
  return { obj, unknown: [...unknown], groupId, trailing: [...r.restBytes()] }
}

function parseNested(r: FArchiveReader): PropStruct {
  return parseProperties(r, levelParsePlan(), '')
}

const chars = entries('CharacterSaveParameterMap')
console.log(`${chars.length} characters\n`)

// Find a player and a pal to compare.
let shownPlayer = false
let shownPal = false
for (const e of chars) {
  const v = e.value as PropStruct
  const buf = v.RawData as Buffer
  if (!Buffer.isBuffer(buf)) continue
  let d
  try { d = decodeCharacter(buf) } catch (err) { console.log('decode failed:', (err as Error).message); continue }
  // Real fields live under SaveParameter; the outer object is just a wrapper.
  const sp = (d.obj.SaveParameter ?? d.obj) as PropStruct
  const isPlayer = sp.IsPlayer === true
  if (isPlayer && shownPlayer) continue
  if (!isPlayer && shownPal) continue
  if (isPlayer) shownPlayer = true; else shownPal = true
  console.log(`===== ${isPlayer ? 'PLAYER' : 'PAL'} (RawData ${buf.length}b) =====`)
  console.log('outer keys:', Object.keys(d.obj), '| unknown4:', d.unknown, '| trailing:', d.trailing)
  console.log('groupId:', d.groupId)
  for (const [k, val] of Object.entries(sp)) {
    let repr: string
    if (Buffer.isBuffer(val)) repr = `<Buffer ${val.length}>`
    else if (Array.isArray(val)) repr = `[${val.length}] ${JSON.stringify(val.slice(0, 4))}`.slice(0, 160)
    else repr = JSON.stringify(val, (_, x) => (typeof x === 'bigint' ? `${x}n` : x))?.slice(0, 160) ?? String(val)
    console.log(`  ${k.padEnd(34)} ${repr}`)
  }
  console.log()
  if (shownPlayer && shownPal) break
}
