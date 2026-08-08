/**
 * Palworld-specific parse configuration.
 *
 * GVAS does not record the struct type used by map keys and values, so it has to
 * be supplied out of band. These paths are the community-established set,
 * cross-checked against Palworld 1.0 saves.
 */
import type { ParsePlan } from '../gvas/types'

/** Struct type of a map's key/value, keyed by `<property path>.Key|.Value`. */
export const PALWORLD_TYPE_HINTS: ReadonlyMap<string, string> = new Map([
  ['.worldSaveData.CharacterContainerSaveData.Key', 'StructProperty'],
  ['.worldSaveData.CharacterContainerSaveData.Value', 'StructProperty'],
  ['.worldSaveData.CharacterSaveParameterMap.Key', 'StructProperty'],
  ['.worldSaveData.CharacterSaveParameterMap.Value', 'StructProperty'],
  ['.worldSaveData.FoliageGridSaveDataMap.Key', 'StructProperty'],
  ['.worldSaveData.FoliageGridSaveDataMap.Value', 'StructProperty'],
  ['.worldSaveData.FoliageGridSaveDataMap.Value.ModelMap.Value', 'StructProperty'],
  ['.worldSaveData.FoliageGridSaveDataMap.Value.ModelMap.Value.InstanceDataMap.Key', 'StructProperty'],
  ['.worldSaveData.FoliageGridSaveDataMap.Value.ModelMap.Value.InstanceDataMap.Value', 'StructProperty'],
  ['.worldSaveData.ItemContainerSaveData.Key', 'StructProperty'],
  ['.worldSaveData.ItemContainerSaveData.Value', 'StructProperty'],
  ['.worldSaveData.MapObjectSaveData.MapObjectSaveData.ConcreteModel.ModuleMap.Value', 'StructProperty'],
  ['.worldSaveData.MapObjectSaveData.MapObjectSaveData.Model.EffectMap.Value', 'StructProperty'],
  ['.worldSaveData.MapObjectSpawnerInStageSaveData.Key', 'StructProperty'],
  ['.worldSaveData.MapObjectSpawnerInStageSaveData.Value', 'StructProperty'],
  [
    '.worldSaveData.MapObjectSpawnerInStageSaveData.Value.SpawnerDataMapByLevelObjectInstanceId.Key',
    'Guid',
  ],
  [
    '.worldSaveData.MapObjectSpawnerInStageSaveData.Value.SpawnerDataMapByLevelObjectInstanceId.Value',
    'StructProperty',
  ],
  [
    '.worldSaveData.MapObjectSpawnerInStageSaveData.Value.SpawnerDataMapByLevelObjectInstanceId.Value.ItemMap.Value',
    'StructProperty',
  ],
  ['.worldSaveData.WorkSaveData.WorkSaveData.WorkAssignMap.Value', 'StructProperty'],
  ['.worldSaveData.BaseCampSaveData.Key', 'Guid'],
  ['.worldSaveData.BaseCampSaveData.Value', 'StructProperty'],
  ['.worldSaveData.BaseCampSaveData.Value.ModuleMap.Value', 'StructProperty'],
  ['.worldSaveData.GroupSaveDataMap.Key', 'Guid'],
  ['.worldSaveData.GroupSaveDataMap.Value', 'StructProperty'],
  ['.worldSaveData.EnemyCampSaveData.EnemyCampStatusMap.Value', 'StructProperty'],
  [
    '.worldSaveData.DungeonSaveData.DungeonSaveData.MapObjectSaveData.MapObjectSaveData.Model.EffectMap.Value',
    'StructProperty',
  ],
  [
    '.worldSaveData.DungeonSaveData.DungeonSaveData.MapObjectSaveData.MapObjectSaveData.ConcreteModel.ModuleMap.Value',
    'StructProperty',
  ],
  ['.worldSaveData.InvaderSaveData.Key', 'Guid'],
  ['.worldSaveData.InvaderSaveData.Value', 'StructProperty'],
  ['.worldSaveData.OilrigSaveData.OilrigMap.Value', 'StructProperty'],
  ['.worldSaveData.SupplySaveData.SupplyInfos.Key', 'Guid'],
  ['.worldSaveData.SupplySaveData.SupplyInfos.Value', 'StructProperty'],
  // Observed in Palworld 1.0 saves; absent from older community type tables.
  ['.worldSaveData.LockGimmickSaveData.Key', 'Guid'],
  ['.worldSaveData.LockGimmickSaveData.Value', 'StructProperty'],
  ['.worldSaveData.GuildExtraSaveDataMap.Key', 'Guid'],
  ['.worldSaveData.GuildExtraSaveDataMap.Value', 'StructProperty'],
  ['.worldSaveData.InLockerCharacterInstanceIDArray', 'Guid'],
])

/**
 * Subtrees a dashboard never reads.
 *
 * These dominate Level.sav — world foliage alone is typically 60-80% of the
 * payload — and skipping them turns a multi-second, multi-hundred-megabyte parse
 * into a fast one. Every entry is purely presentational data we do not surface.
 */
export const LEVEL_SKIP_PATHS: ReadonlySet<string> = new Set([
  '.worldSaveData.FoliageGridSaveDataMap',
  '.worldSaveData.MapObjectSpawnerInStageSaveData',
  '.worldSaveData.DungeonSaveData',
  '.worldSaveData.DungeonPointMarkerSaveData',
  '.worldSaveData.EnemyCampSaveData',
  '.worldSaveData.SupplySaveData',
  '.worldSaveData.InvaderSaveData',
  '.worldSaveData.OilrigSaveData',
  '.worldSaveData.GameTimeSaveData',
  '.worldSaveData.RandomizerSaveData',
  '.worldSaveData.BossSpawnerSaveData',
  '.worldSaveData.BaseCampModuleGradeSaveData',
])

/** Diagnostic callbacks surfaced to the caller for version-drift monitoring. */
export type ParseDiagnostics = Pick<ParsePlan, 'onUnknownType' | 'onError'>

/** Parse plan for `Level.sav` — skips the subtrees a dashboard never reads. */
export function levelParsePlan(diagnostics: ParseDiagnostics = {}): ParsePlan {
  return { skip: LEVEL_SKIP_PATHS, typeHints: PALWORLD_TYPE_HINTS, ...diagnostics }
}

/** Parse plan for the small metadata and player saves, which we read in full. */
export function fullParsePlan(diagnostics: ParseDiagnostics = {}): ParsePlan {
  return { typeHints: PALWORLD_TYPE_HINTS, ...diagnostics }
}
