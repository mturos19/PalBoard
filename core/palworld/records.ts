/**
 * Progression counters from each player save's RecordData: Paldeck species
 * registered, towers cleared, fast travel points unlocked, total captures.
 * These bool-flag maps are the only place "captured species" exists — the
 * world save does not record it.
 */
import type { GvasFile, MapEntry, PropStruct, PropValue } from '../gvas/types'
import type { PlayerRecords } from '@shared/domain'

const asStruct = (v: PropValue | undefined): PropStruct | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v)
    ? (v as PropStruct)
    : undefined

/** Counts `true` values in a NameProperty→BoolProperty map. */
function countTrue(v: PropValue | undefined): number {
  if (!Array.isArray(v)) return 0
  let n = 0
  for (const entry of v as MapEntry[]) if ((entry as MapEntry).value === true) n++
  return n
}

function sumMapValues(v: PropValue | undefined): number {
  if (typeof v === 'number') return v
  if (!Array.isArray(v)) return 0
  let n = 0
  for (const entry of v as MapEntry[]) {
    const val = (entry as MapEntry).value
    if (typeof val === 'number') n += val
  }
  return n
}

export function buildRecords(
  playerSaves: Map<string, GvasFile>,
  playerNames: Map<string, string>,
): PlayerRecords[] {
  const out: PlayerRecords[] = []
  for (const [uid, save] of playerSaves) {
    const rd = asStruct(asStruct(save.properties.SaveData)?.RecordData)
    if (!rd) continue
    out.push({
      uid,
      name: playerNames.get(uid) ?? uid.slice(0, 8),
      paldeckCount: countTrue(rd.PaldeckUnlockFlag),
      towersCleared: countTrue(rd.TowerBossDefeatFlag),
      fastTravelsUnlocked: countTrue(rd.FastTravelPointUnlockFlag),
      // TribeCaptureCount is per-species on newer saves, a plain int on older.
      totalCaptures: sumMapValues(rd.PalCaptureCount ?? rd.TribeCaptureCount),
    })
  }
  return out.sort((a, b) => b.paldeckCount - a.paldeckCount)
}
