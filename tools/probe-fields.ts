/**
 * Dev utility: unions every field seen across all characters / bases / groups so
 * the domain model covers fields Palworld only writes when non-default.
 * Run with `npx vite-node tools/probe-fields.ts <world save dir>`.
 */
import { readFileSync } from 'node:fs'
import { decompressSave } from '../core/compression'
import { FArchiveReader } from '../core/gvas/reader'
import { parseGvas, parseProperties } from '../core/gvas/parser'
import { levelParsePlan } from '../core/palworld/hints'
import type { MapEntry, PropStruct } from '../core/gvas/types'

const dir = process.argv[2]
const { gvas } = await decompressSave(readFileSync(`${dir}/Level.sav`))
const wsd = parseGvas(gvas, levelParsePlan()).properties.worldSaveData as PropStruct
const entries = (k: string) => (wsd[k] as MapEntry[] | undefined) ?? []

const brief = (v: unknown): string => {
  if (Buffer.isBuffer(v)) return `<Buffer ${v.length}>`
  if (typeof v === 'bigint') return `${v}n`
  if (Array.isArray(v)) return `[${v.length}]${v.length ? ' ' + brief(v[0]) : ''}`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).slice(0, 5).join(',')}}`
  return JSON.stringify(v) ?? String(v)
}

function tally(label: string, objects: PropStruct[]) {
  const counts = new Map<string, number>()
  const samples = new Map<string, Set<string>>()
  for (const o of objects) {
    for (const [k, v] of Object.entries(o)) {
      counts.set(k, (counts.get(k) ?? 0) + 1)
      let s = samples.get(k)
      if (!s) samples.set(k, (s = new Set()))
      if (s.size < 4) s.add(brief(v))
    }
  }
  console.log(`\n===== ${label} (${objects.length} objects, ${counts.size} distinct fields) =====`)
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const pct = ((n / objects.length) * 100).toFixed(0).padStart(3)
    console.log(`  ${pct}% ${String(n).padStart(5)}  ${k.padEnd(32)} ${[...(samples.get(k) ?? [])].join(' | ').slice(0, 110)}`)
  }
}

// --- Characters ---------------------------------------------------------------
const players: PropStruct[] = []
const pals: PropStruct[] = []
for (const e of entries('CharacterSaveParameterMap')) {
  const buf = (e.value as PropStruct).RawData
  if (!Buffer.isBuffer(buf)) continue
  const r = new FArchiveReader(buf)
  const obj = parseProperties(r, levelParsePlan())
  const sp = (obj.SaveParameter ?? obj) as PropStruct
  ;(sp.IsPlayer === true ? players : pals).push(sp)
}
tally('PLAYER SaveParameter', players)
tally('PAL SaveParameter', pals)

// Species / alpha distribution
const species = new Map<string, number>()
for (const p of pals) {
  const id = String(p.CharacterID ?? '?')
  species.set(id, (species.get(id) ?? 0) + 1)
}
const bossy = [...species.keys()].filter((s) => /^BOSS_/i.test(s))
console.log(`\ndistinct species: ${species.size}; BOSS_-prefixed: ${bossy.length} e.g. ${bossy.slice(0, 6).join(', ')}`)

// --- Base camps ---------------------------------------------------------------
const bases = entries('BaseCampSaveData')
console.log(`\n===== BaseCampSaveData RawData (${bases.length}) =====`)
for (const e of bases) {
  const v = e.value as PropStruct
  const buf = v.RawData as Buffer
  const r = new FArchiveReader(buf)
  const d = {
    id: r.guid(),
    name: r.fstring(),
    state: r.u8(),
    transform: r.transform(),
    areaRange: r.f32(),
    groupIdBelongTo: r.guid(),
    fastTravelLocal: r.transform(),
    ownerMapObjectInstanceId: r.guid(),
  }
  console.log(`  key=${String(e.key)} name=${JSON.stringify(d.name)} state=${d.state} area=${d.areaRange} trailing=${r.remaining}`)
  console.log(`     pos=(${d.transform.translation.x.toFixed(0)}, ${d.transform.translation.y.toFixed(0)}, ${d.transform.translation.z.toFixed(0)}) group=${d.groupIdBelongTo}`)
  console.log(`     other keys: ${Object.keys(v).join(', ')}`)
  const wd = v.WorkerDirector as PropStruct | undefined
  if (wd) console.log(`     WorkerDirector keys: ${Object.keys(wd).join(', ')}`)
}

// --- Groups -------------------------------------------------------------------
console.log(`\n===== GroupSaveDataMap (${entries('GroupSaveDataMap').length}) =====`)
for (const e of entries('GroupSaveDataMap')) {
  const v = e.value as PropStruct
  const type = String(v.GroupType)
  const r = new FArchiveReader(v.RawData as Buffer)
  const groupId = r.guid()
  const groupName = r.fstring()
  const handles = r.tarray((rr) => ({ guid: rr.guid(), instanceId: rr.guid() }))
  let extra = ''
  if (/Guild|Organization/.test(type)) {
    const orgType = r.u8()
    const baseIds = r.tarray((rr) => rr.guid())
    extra += ` orgType=${orgType} bases=${baseIds.length}`
    if (/Guild/.test(type)) {
      const baseCampLevel = r.i32()
      const points = r.tarray((rr) => rr.guid())
      const guildName = r.fstring()
      extra += ` campLvl=${baseCampLevel} points=${points.length} guild=${JSON.stringify(guildName)}`
      if (type.includes('IndependentGuild')) {
        r.guid(); r.fstring(); r.i64()
        extra += ` player=${JSON.stringify(r.fstring())}`
      } else {
        const admin = r.guid()
        const n = r.i32()
        const names: string[] = []
        for (let i = 0; i < n; i++) { r.guid(); r.i64(); names.push(r.fstring()) }
        extra += ` admin=${admin.slice(0, 8)} players=[${names.join(',')}]`
      }
    }
  }
  console.log(`  ${type.padEnd(38)} members=${handles.length} name=${JSON.stringify(groupName)}${extra} trailing=${r.remaining}`)
}
