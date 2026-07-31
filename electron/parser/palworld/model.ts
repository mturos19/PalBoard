/**
 * Maps parsed Palworld save structures onto PalBoard's domain model.
 *
 * This is the only place that knows both the save layout and the UI's shape.
 * Everything above it (IPC, renderer) works purely in `shared/domain` types, so
 * a Palworld format change is absorbed here.
 *
 * Field presence is optional throughout: Palworld omits any value still at its
 * default, so `Level` is missing on a level-1 pal and `SanityValue` is missing
 * on a happy one. Every read therefore goes through a defaulting accessor.
 */
import { FArchiveReader } from '../gvas/reader'
import { parseGvas } from '../gvas/parser'
import type { GvasFile, MapEntry, PropStruct, PropValue } from '../gvas/types'
import { fullParsePlan, levelParsePlan } from './hints'
import { decodeBaseCamp, decodeCharacter, decodeGroup } from './rawdata'
import { buildInventories } from './inventory'
import { buildRecords } from './records'
import { SANITY_CONCERN, buildAlerts } from './alerts'
import { isHumanCharacter, speciesInfo } from '../../../shared/gamedata/species'
import type {
  BaseCamp,
  DashboardStats,
  Gender,
  Guild,
  MapCoord,
  Pal,
  PalElement,
  PalLocation,
  Player,
  SaveSnapshot,
  Vec3,
  WorldSummary,
} from '../../../shared/domain'

// --- small typed accessors ----------------------------------------------------

const asStruct = (v: PropValue | undefined): PropStruct | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v)
    ? (v as PropStruct)
    : undefined

const num = (v: PropValue | undefined, fallback: number): number =>
  typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : fallback

const str = (v: PropValue | undefined): string | null => (typeof v === 'string' ? v : null)

const bool = (v: PropValue | undefined): boolean => v === true

const list = (v: PropValue | undefined): PropValue[] => (Array.isArray(v) ? (v as PropValue[]) : [])

const strList = (v: PropValue | undefined): string[] =>
  list(v).filter((x): x is string => typeof x === 'string')

/** Reads `{ ID: <guid> }` and `{ Value: <n> }` style single-field wrappers. */
const wrappedId = (v: PropValue | undefined): string | null => str(asStruct(v)?.ID)

const wrappedValue = (v: PropValue | undefined, fallback: number): number =>
  num(asStruct(v)?.Value, fallback)

/**
 * Converts UE world-space to the coordinates Palworld shows on the in-game map.
 * The constants are the community-established transform for the Palpagos map.
 */
export function worldToMap(pos: Vec3): MapCoord {
  return {
    x: Math.round(pos.y / 459.42 + 156.5),
    y: Math.round(pos.x / 459.42 + 154.5),
  }
}

/** `EPalGenderType::Female` -> `female`. */
function parseGender(v: PropValue | undefined): Gender {
  const s = str(v)
  if (!s) return 'unknown'
  if (s.endsWith('Female')) return 'female'
  if (s.endsWith('Male')) return 'male'
  return 'unknown'
}

/** Strips a `EPalSomething::` namespace prefix from an enum value. */
function enumTail(v: PropValue | undefined): string | null {
  const s = str(v)
  if (!s) return null
  const i = s.lastIndexOf('::')
  return i === -1 ? s : s.slice(i + 2)
}

/**
 * Turns an internal species id into something readable.
 *
 * Palworld's save stores developer ids (`StuffedShark`, `SheepBall`). The real
 * localised names live in the game's data tables, not the save, so until that
 * table is bundled we humanise the id rather than invent a name.
 */
export function humaniseSpecies(id: string): string {
  return id
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALPHA_PREFIX = /^BOSS_/i
const TOWER_PREFIX = /^GYM_/i

// --- world / meta -------------------------------------------------------------

export interface MetaSaves {
  levelMeta?: GvasFile
  worldOption?: GvasFile
}

function buildWorld(worldId: string, level: GvasFile, meta: MetaSaves): WorldSummary {
  const metaData = asStruct(meta.levelMeta?.properties.SaveData)
  const settings = asStruct(asStruct(meta.worldOption?.properties.OptionWorldData)?.Settings)
  const h = level.header

  return {
    worldId,
    name: str(metaData?.WorldName),
    day: metaData ? num(metaData.InGameDay, 0) : null,
    // UE ticks are 100ns intervals since year 1; convert to a JS epoch.
    savedAt: ticksToEpochMs(level.properties.Timestamp),
    difficulty: enumTail(settings?.Difficulty),
    playTimeSeconds: null, // not recorded in the save; tracked by PalBoard over time
    engineVersion: `${h.engineVersionMajor}.${h.engineVersionMinor}.${h.engineVersionPatch}`,
  }
}

const TICKS_AT_UNIX_EPOCH = 621355968000000000n

function ticksToEpochMs(v: PropValue | undefined): number {
  if (typeof v !== 'bigint') return Date.now()
  return Number((v - TICKS_AT_UNIX_EPOCH) / 10000n)
}

// --- entry point --------------------------------------------------------------

export interface BuildInput {
  worldId: string
  savePath: string
  level: GvasFile
  meta: MetaSaves
  /** Parsed `Players/<uid>.sav` files, keyed by lowercase player UID. */
  playerSaves: Map<string, GvasFile>
  warnings: string[]
}

/**
 * Builds a complete snapshot from parsed saves.
 *
 * Ordering matters: containers are indexed first so pals can be located, then
 * groups so pals can be attributed to a guild, then characters.
 */
export function buildSnapshot(
  input: BuildInput,
  timings: { decompressMs: number; parseMs: number; compressedBytes: number; decompressedBytes: number; format: string },
): SaveSnapshot {
  const t0 = performance.now()
  const { level, warnings } = input
  const wsd = asStruct(level.properties.worldSaveData) ?? {}

  // --- container topology: which container is a party, palbox, or base crew ---
  const partyContainers = new Set<string>()
  const palboxContainers = new Set<string>()
  const playerContainerOwner = new Map<string, string>()
  for (const [uid, save] of input.playerSaves) {
    const sd = asStruct(save.properties.SaveData)
    const otomo = wrappedId(sd?.OtomoCharacterContainerId)
    const storage = wrappedId(sd?.PalStorageContainerId)
    if (otomo) { partyContainers.add(otomo); playerContainerOwner.set(otomo, uid) }
    if (storage) { palboxContainers.add(storage); playerContainerOwner.set(storage, uid) }
  }

  // --- base camps -------------------------------------------------------------
  const baseByWorkerContainer = new Map<string, string>()
  const bases: BaseCamp[] = []
  const baseEntries = (wsd.BaseCampSaveData as MapEntry[] | undefined) ?? []
  let baseIndex = 0
  for (const entry of baseEntries) {
    const value = asStruct(entry.value)
    const raw = value?.RawData
    if (!Buffer.isBuffer(raw)) continue
    let camp
    try {
      camp = decodeBaseCamp(raw)
    } catch (err) {
      warnings.push(`base camp ${String(entry.key)}: ${(err as Error).message}`)
      continue
    }
    const position = camp.transform.translation
    bases.push({
      id: camp.id,
      // Palworld does not expose base naming; the stored name is a dev template.
      name: `Base ${++baseIndex}`,
      guildId: camp.groupIdBelongTo,
      position,
      coord: worldToMap(position),
      areaRange: camp.areaRange,
      state: camp.state,
      workerCount: 0,
      buildingCount: 0,
    })

    // The worker container id lives inside WorkerDirector's RawData.
    const wd = asStruct(value?.WorkerDirector)?.RawData
    if (Buffer.isBuffer(wd)) {
      const id = decodeWorkerDirectorContainerId(wd)
      if (id) baseByWorkerContainer.set(id, camp.id)
    }
  }
  const baseById = new Map(bases.map((b) => [b.id, b]))

  // --- guilds -----------------------------------------------------------------
  const guilds: Guild[] = []
  const guildByCharacterGroup = new Map<string, string>()
  for (const entry of (wsd.GroupSaveDataMap as MapEntry[] | undefined) ?? []) {
    const value = asStruct(entry.value)
    const raw = value?.RawData
    const groupType = str(value?.GroupType) ?? ''
    if (!Buffer.isBuffer(raw) || !/Guild/.test(groupType)) continue
    try {
      const g = decodeGroup(raw, groupType)
      guilds.push({
        id: g.groupId,
        name: g.guildName || g.groupName || 'Guild',
        adminPlayerUid: g.adminPlayerUid ?? '',
        baseIds: g.baseIds ?? [],
        memberCount: g.handles.length,
        players: [],
      })
      guildByCharacterGroup.set(g.groupId, g.groupId)
    } catch (err) {
      warnings.push(`guild ${String(entry.key)}: ${(err as Error).message}`)
    }
  }
  const guildById = new Map(guilds.map((g) => [g.id, g]))

  // --- characters (players + pals) -------------------------------------------
  const players: Player[] = []
  const pals: Pal[] = []
  const plan = levelParsePlan()

  for (const entry of (wsd.CharacterSaveParameterMap as MapEntry[] | undefined) ?? []) {
    const key = asStruct(entry.key)
    const value = asStruct(entry.value)
    const raw = value?.RawData
    if (!Buffer.isBuffer(raw)) continue

    let decoded
    try {
      decoded = decodeCharacter(raw, plan)
    } catch (err) {
      warnings.push(`character ${String(key?.InstanceId)}: ${(err as Error).message}`)
      continue
    }

    const p = decoded.params
    const instanceId = str(key?.InstanceId) ?? ''
    const playerUid = str(key?.PlayerUId) ?? ''

    if (bool(p.IsPlayer)) {
      players.push(buildPlayer(p, playerUid, instanceId, decoded.groupId, input.playerSaves))
      continue
    }
    pals.push(
      buildPal(p, instanceId, { partyContainers, palboxContainers, baseByWorkerContainer }),
    )
  }

  // Attribute players to their guild.
  for (const player of players) {
    const guild = player.guildId ? guildById.get(player.guildId) : undefined
    guild?.players.push({ uid: player.uid, name: player.name, level: player.level })
  }

  // --- buildings per base ------------------------------------------------------
  countBuildings(wsd, baseById, warnings)

  // --- workers per base --------------------------------------------------------
  for (const pal of pals) {
    if (pal.baseId) {
      const base = baseById.get(pal.baseId)
      if (base) base.workerCount++
    }
  }

  // --- inventory, records, alerts ----------------------------------------------
  const playerNames = new Map(players.map((p) => [p.uid.toLowerCase(), p.name]))
  const { inventories, storage, resources } = buildInventories(
    wsd,
    input.playerSaves,
    playerNames,
    warnings,
  )
  const records = buildRecords(input.playerSaves, playerNames)

  // Palbox usage: capacity from the container declarations, usage from where
  // the pals actually live.
  let palboxCapacity = 0
  for (const entry of (wsd.CharacterContainerSaveData as MapEntry[] | undefined) ?? []) {
    const key = asStruct(entry.key)
    const id = str(asStruct(key?.ID)?.ID) ?? str(key?.ID)
    const slotNum = num(asStruct(entry.value)?.SlotNum, 0)
    if (id && palboxContainers.has(id)) palboxCapacity += slotNum
  }
  const palboxUsed = pals.filter((p) => p.location === 'palbox').length
  const alerts = buildAlerts({
    pals,
    bases,
    storage,
    palbox: palboxCapacity > 0 ? { used: palboxUsed, capacity: palboxCapacity } : null,
  })

  const buildMs = performance.now() - t0
  return {
    revision: 0,
    loadedAt: Date.now(),
    savePath: input.savePath,
    world: buildWorld(input.worldId, level, input.meta),
    guilds,
    players,
    pals,
    bases,
    inventories,
    storage,
    resources,
    records,
    alerts,
    diagnostics: {
      format: timings.format,
      compressedBytes: timings.compressedBytes,
      decompressedBytes: timings.decompressedBytes,
      decompressMs: timings.decompressMs,
      parseMs: timings.parseMs,
      buildMs,
      warnings,
    },
  }
}

/**
 * `WorkerDirector` RawData: id, spawn transform, two order bytes, then the
 * character container holding the base's assigned pals.
 */
function decodeWorkerDirectorContainerId(buf: Buffer): string | null {
  try {
    const r = new FArchiveReader(buf)
    r.guid() // director id
    r.transform()
    r.u8() // current order type
    r.u8() // current battle type
    return r.guid()
  } catch {
    return null
  }
}

/**
 * `MapObjectSaveData[].Model.RawData` begins with four GUIDs, the third of which
 * is the owning base camp. Buildings placed outside a base carry a null id.
 */
function countBuildings(
  wsd: PropStruct,
  baseById: Map<string, BaseCamp>,
  warnings: string[],
): void {
  const objects = list(wsd.MapObjectSaveData)
  let unattributed = 0
  for (const obj of objects) {
    const raw = asStruct(asStruct(obj)?.Model)?.RawData
    if (!Buffer.isBuffer(raw) || raw.length < 64) continue
    try {
      const r = new FArchiveReader(raw)
      r.guid() // instance id
      r.guid() // concrete model instance id
      const baseCampId = r.guid()
      const base = baseById.get(baseCampId)
      if (base) base.buildingCount++
      else unattributed++
    } catch {
      unattributed++
    }
  }
  if (objects.length && unattributed === objects.length) {
    warnings.push('no buildings could be attributed to a base — MapObject layout may have changed')
  }
}

function buildPlayer(
  p: PropStruct,
  uid: string,
  instanceId: string,
  groupId: string,
  playerSaves: Map<string, GvasFile>,
): Player {
  const save = playerSaves.get(uid.toLowerCase())
  const sd = asStruct(save?.properties.SaveData)
  const statusPoints: Record<string, number> = {}
  for (const item of list(p.GotStatusPointList)) {
    const s = asStruct(item)
    const name = str(s?.StatusName)
    if (name) statusPoints[name] = num(s?.StatusPoint, 0)
  }

  const location = (asStruct(p.LastJumpedLocation) as unknown as Vec3 | undefined) ?? null
  return {
    uid,
    instanceId,
    name: str(p.NickName) ?? 'Unknown',
    level: num(p.Level, 1),
    exp: num(p.Exp, 0),
    hp: wrappedValue(p.Hp, 0),
    maxHp: null,
    stomach: num(p.FullStomach, 100),
    statusPoints,
    location,
    coord: location ? worldToMap(location) : null,
    guildId: groupId || null,
    technologyPoints: sd ? num(sd.TechnologyPoint, 0) : null,
    ancientTechnologyPoints: sd ? num(sd.bossTechnologyPoint, 0) : null,
    unusedStatusPoints: num(p.UnusedStatusPoint, 0),
  }
}

interface ContainerIndex {
  partyContainers: Set<string>
  palboxContainers: Set<string>
  baseByWorkerContainer: Map<string, string>
}

function buildPal(p: PropStruct, instanceId: string, idx: ContainerIndex): Pal {
  const characterId = str(p.CharacterID) ?? 'Unknown'
  const isAlpha = ALPHA_PREFIX.test(characterId)
  const isTowerBoss = TOWER_PREFIX.test(characterId)
  const speciesId = characterId.replace(ALPHA_PREFIX, '').replace(TOWER_PREFIX, '')
  const info = speciesInfo(speciesId)

  const slot = asStruct(p.SlotId)
  const containerId = wrappedId(slot?.ContainerId) ?? ''
  const slotIndex = num(slot?.SlotIndex, -1)

  let location: PalLocation = 'unknown'
  let baseId: string | null = null
  if (idx.partyContainers.has(containerId)) location = 'party'
  else if (idx.palboxContainers.has(containerId)) location = 'palbox'
  else {
    const base = idx.baseByWorkerContainer.get(containerId)
    if (base) {
      location = 'base'
      baseId = base
    }
  }

  const workSuitabilities: Record<string, number> = {}
  for (const item of list(p.GotWorkSuitabilityAddRankList)) {
    const s = asStruct(item)
    const name = enumTail(s?.WorkSuitability)
    if (name) workSuitabilities[name] = num(s?.Rank, 0)
  }

  const disabled = strList(asStruct(p.WorkSuitabilityOptionInfo)?.OffWorkSuitabilityList)
    .map((s) => {
      const i = s.lastIndexOf('::')
      return i === -1 ? s : s.slice(i + 2)
    })

  return {
    instanceId,
    characterId,
    speciesId,
    speciesName: info?.name ?? humaniseSpecies(speciesId),
    elements: (info?.elements ?? []) as PalElement[],
    isHuman: isHumanCharacter(speciesId),
    nickname: str(p.NickName),
    gender: parseGender(p.Gender),
    level: num(p.Level, 1),
    exp: num(p.Exp, 0),
    isAlpha,
    isLucky: bool(p.IsRarePal),
    isTowerBoss,

    hp: wrappedValue(p.Hp, 0),
    ivHp: num(p.Talent_HP, 0),
    ivAttack: num(p.Talent_Shot, 0),
    ivDefense: num(p.Talent_Defense, 0),

    rank: num(p.Rank, 1),
    soulHp: num(p.Rank_HP, 0),
    soulAttack: num(p.Rank_Attack, 0),
    soulDefense: num(p.Rank_Defence, 0),
    soulWorkSpeed: num(p.Rank_CraftSpeed, 0),

    passiveSkills: strList(p.PassiveSkillList),
    equippedSkills: strList(p.EquipWaza).map((s) => s.replace(/^EPalWazaID::/, '')),
    masteredSkills: strList(p.MasteredWaza).map((s) => s.replace(/^EPalWazaID::/, '')),

    stomach: num(p.FullStomach, 0),
    hungerState: enumTail(p.HungerType),
    isHungry: p.HungerType !== undefined,
    sanity: num(p.SanityValue, 100),
    sickness: enumTail(p.WorkerSick),
    isFainted: bool(p.IsFaintedAtSavedTime),

    friendshipPoints: num(p.FriendshipPoint, 0),
    ownerPlayerUid: str(p.OwnerPlayerUId),
    containerId,
    slotIndex,
    location,
    baseId,
    workSuitabilities,
    disabledWorkSuitabilities: disabled,
    currentWork: enumTail(p.CurrentWorkSuitability),
  }
}

export { SANITY_CONCERN }

export function computeStats(snapshot: SaveSnapshot): DashboardStats {
  const owned = snapshot.pals.filter((p) => !p.isTowerBoss && !p.isHuman)
  const species = new Set<string>()
  let alpha = 0
  let lucky = 0
  let depressed = 0
  let starving = 0
  let sick = 0
  let workers = 0
  for (const p of owned) {
    species.add(p.speciesId)
    if (p.isAlpha) alpha++
    if (p.isLucky) lucky++
    if (p.sanity < SANITY_CONCERN) depressed++
    if (p.isHungry) starving++
    if (p.sickness) sick++
    if (p.location === 'base') workers++
  }
  return {
    palCount: owned.length,
    uniqueSpeciesCount: species.size,
    alphaCount: alpha,
    luckyCount: lucky,
    baseCount: snapshot.bases.length,
    buildingCount: snapshot.bases.reduce((n, b) => n + b.buildingCount, 0),
    depressedCount: depressed,
    starvingCount: starving,
    sickCount: sick,
    workerCount: workers,
  }
}

export { fullParsePlan, levelParsePlan, parseGvas }
