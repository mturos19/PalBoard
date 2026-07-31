/**
 * Dev utility: runs the full load pipeline and prints the domain model.
 * Run with `npx vite-node tools/verify.ts [world dir]`.
 */
import { discoverWorlds } from '../electron/locator'
import { loadWorld } from '../electron/parser/loader'
import { computeStats } from '../electron/parser/palworld/model'

const explicit = process.argv[2]
const dir = explicit ?? (await discoverWorlds())[0]?.path
if (!dir) throw new Error('no Palworld world found; pass one as an argument')
console.log('world dir:', dir, explicit ? '(explicit)' : '(auto-detected)')

const t0 = performance.now()
const snap = await loadWorld(dir)
const totalMs = performance.now() - t0
const stats = computeStats(snap)

const d = snap.diagnostics
console.log(`\n--- timings (total ${totalMs.toFixed(0)}ms) ---`)
console.log(`  format      ${d.format}  ${(d.compressedBytes / 1e6).toFixed(1)}MB -> ${(d.decompressedBytes / 1e6).toFixed(1)}MB`)
console.log(`  decompress  ${d.decompressMs.toFixed(0)}ms`)
console.log(`  parse       ${d.parseMs.toFixed(0)}ms`)
console.log(`  build model ${d.buildMs.toFixed(0)}ms`)
console.log(`  warnings    ${d.warnings.length}`)
for (const w of d.warnings.slice(0, 10)) console.log(`    - ${w}`)

console.log('\n--- world ---')
console.log(`  ${snap.world.name} · day ${snap.world.day} · ${snap.world.difficulty} · UE ${snap.world.engineVersion}`)
console.log(`  saved ${new Date(snap.world.savedAt).toLocaleString()}`)

console.log('\n--- players ---')
for (const p of snap.players) {
  console.log(`  ${p.name.padEnd(10)} Lv${String(p.level).padStart(3)}  tech=${p.technologyPoints} ancient=${p.ancientTechnologyPoints} unspent=${p.unusedStatusPoints}`)
}

console.log('\n--- guilds ---')
for (const g of snap.guilds) {
  console.log(`  "${g.name}"  members=${g.memberCount} bases=${g.baseIds.length} players=[${g.players.map((p) => p.name).join(', ')}]`)
}

console.log('\n--- bases ---')
for (const b of snap.bases) {
  console.log(`  ${b.name}  map(${b.coord.x}, ${b.coord.y})  workers=${b.workerCount}  buildings=${b.buildingCount}`)
}

console.log('\n--- stats ---')
console.log(' ', JSON.stringify(stats))

console.log('\n--- pal location breakdown ---')
const byLocation = new Map<string, number>()
for (const p of snap.pals) byLocation.set(p.location, (byLocation.get(p.location) ?? 0) + 1)
for (const [k, v] of byLocation) console.log(`  ${k.padEnd(8)} ${v}`)

console.log('\n--- sample pals (highest IV average) ---')
const top = [...snap.pals]
  .filter((p) => !p.isTowerBoss)
  .sort((a, b) => b.ivHp + b.ivAttack + b.ivDefense - (a.ivHp + a.ivAttack + a.ivDefense))
  .slice(0, 8)
for (const p of top) {
  console.log(
    `  ${(p.nickname ?? p.speciesName).padEnd(18)} ${p.speciesName.padEnd(18)} Lv${String(p.level).padStart(3)} ` +
      `IV ${p.ivHp}/${p.ivAttack}/${p.ivDefense} rank${p.rank} ${p.isAlpha ? 'ALPHA ' : ''}${p.isLucky ? 'LUCKY ' : ''}` +
      `${p.location} food=${p.stomach.toFixed(0)} san=${p.sanity.toFixed(0)} [${p.passiveSkills.join(',')}]`,
  )
}

console.log('\n--- inventory ---')
console.log(`  storage: ${snap.storage.items.length} distinct items, ${snap.storage.usedSlots}/${snap.storage.totalSlots} slots across ${snap.storage.containerCount} containers, ${snap.storage.nearFullContainers} near full`)
console.log('  top items:', snap.storage.items.slice(0, 8).map((i) => `${i.id}×${i.count}`).join(', '))
for (const inv of snap.inventories) {
  console.log(`  ${inv.name}: common=${inv.common.length} weapons=${inv.weapons.length} armor=${inv.armor.length} food=${inv.food.length}`)
}
console.log('\n--- resources ---')
console.log(' ', JSON.stringify(snap.resources))
console.log('\n--- records ---')
for (const r of snap.records) console.log(`  ${r.name}: paldeck=${r.paldeckCount} towers=${r.towersCleared} fastTravel=${r.fastTravelsUnlocked} captures=${r.totalCaptures}`)
console.log('\n--- alerts ---')
for (const a of snap.alerts) console.log(`  [${a.severity}] ${a.title} — ${a.detail}`)
console.log('\n--- species data coverage ---')
const { palDisplayName } = await import('../shared/gamedata/names')
const named = snap.pals.filter((p) => !p.isHuman && palDisplayName(p.speciesId) !== null).length
const withElements = snap.pals.filter((p) => p.elements.length > 0).length
const humans = snap.pals.filter((p) => p.isHuman).length
console.log(`  names: ${named}/${snap.pals.length - humans} pals resolved from game data; ${humans} humans detected`)
console.log(`  elements known for ${withElements}`)
const noElement = new Map<string, number>()
for (const p of snap.pals) if (!p.elements.length && !p.isHuman) noElement.set(`${p.speciesId}(${p.speciesName})`, (noElement.get(`${p.speciesId}(${p.speciesName})`) ?? 0) + 1)
console.log('  top without elements:', [...noElement].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join(', '))
