/**
 * PalBoard domain model — the contract between the parser backend and the UI.
 *
 * These types are deliberately independent of the GVAS wire format: the parser
 * maps Palworld's save structures onto them, and the renderer only ever sees
 * these. When Palworld changes its save layout, the mapping changes and the UI
 * does not.
 */

export interface WorldSummary {
  /** Folder GUID of the world, e.g. `6ACFC9CB48368BCC51B830834489D4BD`. */
  worldId: string
  /** Player-facing world name from LevelMeta.sav, when available. */
  name: string | null
  /** In-game day number. */
  day: number | null
  /** Real-world timestamp the save was written. */
  savedAt: number
  /** Difficulty preset name from WorldOption.sav. */
  difficulty: string | null
  /** Total real seconds played, when the save records it. */
  playTimeSeconds: number | null
  /** GVAS engine version string, useful when diagnosing format drift. */
  engineVersion: string
}

export interface Guild {
  id: string
  name: string
  adminPlayerUid: string
  /** Base camp ids owned by this guild. */
  baseIds: string[]
  /** Number of characters (players + pals) belonging to the guild. */
  memberCount: number
  /** Player members, resolved from character data. */
  players: GuildPlayer[]
}

export interface GuildPlayer {
  uid: string
  name: string
  level: number
}

export interface Player {
  uid: string
  instanceId: string
  name: string
  level: number
  exp: number
  hp: number
  maxHp: number | null
  stomach: number
  /** Allocated status points by stat name. */
  statusPoints: Record<string, number>
  location: Vec3 | null
  /** In-game map coordinates derived from `location`. */
  coord: MapCoord | null
  guildId: string | null
  /** Only available when the matching Players/<uid>.sav could be read. */
  technologyPoints: number | null
  ancientTechnologyPoints: number | null
  unusedStatusPoints: number | null
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** In-game map coordinates, derived from world-space translation. */
export interface MapCoord {
  x: number
  y: number
}

export type Gender = 'male' | 'female' | 'unknown'

export type PalElement =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'ice'
  | 'ground'
  | 'dark'
  | 'dragon'

export interface Pal {
  /** Character instance id — stable across saves, used as the React key. */
  instanceId: string
  /** Raw save id, e.g. `BOSS_Sheepball`. */
  characterId: string
  /** Species id with the alpha/boss prefix stripped. */
  speciesId: string
  /** Display name from the species table, or a humanised id as fallback. */
  speciesName: string
  /** Elements from the species table; empty when the species is unmapped. */
  elements: PalElement[]
  /** True for captured humans (guards, raiders), which are not pals. */
  isHuman: boolean
  nickname: string | null
  gender: Gender
  level: number
  exp: number
  /** Alpha (field boss) variant. */
  isAlpha: boolean
  /** Lucky (shiny) variant. */
  isLucky: boolean
  /** True for tower/gym boss characters, which are not owned pals. */
  isTowerBoss: boolean

  hp: number
  /** Individual values, 0-100. */
  ivHp: number
  ivAttack: number
  ivDefense: number

  /** Condense rank, 1-5. */
  rank: number
  /** Soul upgrade ranks, 0-20 each. */
  soulHp: number
  soulAttack: number
  soulDefense: number
  soulWorkSpeed: number

  passiveSkills: string[]
  equippedSkills: string[]
  masteredSkills: string[]

  /**
   * Raw stomach value. This is NOT a percentage — the maximum varies by species
   * (larger pals hold more) and that maximum lives in the game's data tables,
   * not the save. Use {@link isHungry} to decide whether a pal needs feeding.
   */
  stomach: number
  /** The game's own hunger state, e.g. `Hunger`; null when the pal is fed. */
  hungerState: string | null
  /** True when Palworld itself flags the pal as hungry. */
  isHungry: boolean
  /** 0-100 sanity; low values mean the pal is depressed. */
  sanity: number
  /** Sickness id when the pal is ill, e.g. `DepressionSprain`. */
  sickness: string | null
  /** Set when the pal is currently incapacitated. */
  isFainted: boolean

  friendshipPoints: number
  ownerPlayerUid: string | null
  /** Container this pal lives in, plus its slot. */
  containerId: string
  slotIndex: number
  /** Where the pal is: party, palbox, base, viewing cage, or unknown. */
  location: PalLocation
  /** Base camp id when `location` is `base`. */
  baseId: string | null
  /** Work suitabilities this pal has, with their levels. */
  workSuitabilities: Record<string, number>
  /** Work suitabilities the player disabled for this pal. */
  disabledWorkSuitabilities: string[]
  /** Current job the pal is performing at a base, if any. */
  currentWork: string | null
}

export type PalLocation = 'party' | 'palbox' | 'base' | 'cage' | 'unknown'

/**
 * Sanity below this counts as "low".
 *
 * Palworld applies work penalties well before a pal is formally depressed, so
 * this is an early warning rather than the game's own threshold. It lives in the
 * shared layer because the alert rules, the dashboard roll-up and the tables all
 * have to agree on it — three copies of `50` would drift apart silently.
 */
export const SANITY_CONCERN = 50

export interface BaseCamp {
  id: string
  /** Generated label; Palworld does not let players name bases. */
  name: string
  guildId: string
  /** World-space position. */
  position: Vec3
  /** In-game map coordinates as shown on the compass. */
  coord: MapCoord
  /** Base influence radius. */
  areaRange: number
  state: number
  /** Pals assigned to this base. */
  workerCount: number
  /** Buildings inside this base's radius. */
  buildingCount: number
}

// --- inventory ----------------------------------------------------------------

export interface ItemStack {
  /** Raw static item id from the save, e.g. `PalSphere_Mega`. */
  id: string
  count: number
}

/** One player's equipment/pouch containers, decoded from their player save. */
export interface PlayerInventory {
  uid: string
  name: string
  common: ItemStack[]
  essential: ItemStack[]
  weapons: ItemStack[]
  armor: ItemStack[]
  food: ItemStack[]
}

export interface StorageSummary {
  /** Every item outside player pouches, aggregated by id, sorted by count. */
  items: ItemStack[]
  containerCount: number
  totalSlots: number
  usedSlots: number
  /** Containers at ≥95% capacity (excluding player pouches). */
  nearFullContainers: number
}

/** Sums for the dashboard resource strip, keyed by RESOURCE_GROUPS keys. */
export type ResourceTotals = Record<string, number>

// --- alerts -------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface Alert {
  /** Stable id for diffing between snapshots, e.g. `starving`. */
  id: string
  severity: AlertSeverity
  title: string
  detail: string
  /** Route the alert links to, e.g. `/pals?filter=hungry`. */
  link: string | null
}

// --- player records -----------------------------------------------------------

/** Progression counters from player-save RecordData. */
export interface PlayerRecords {
  uid: string
  name: string
  /** Species registered in the Paldeck — "captured species". */
  paldeckCount: number
  towersCleared: number
  fastTravelsUnlocked: number
  totalCaptures: number
}

// --- history ------------------------------------------------------------------

/** One appended point of PalBoard's own time-series (the save keeps none). */
export interface HistoryPoint {
  /** Save timestamp (ms epoch) — the dedupe key. */
  t: number
  day: number | null
  pals: number
  workers: number
  resources: ResourceTotals
}

export interface SaveDiagnostics {
  /** Container format detected, e.g. `PlM/oodle`. */
  format: string
  /** Bytes of the compressed file and the decompressed GVAS payload. */
  compressedBytes: number
  decompressedBytes: number
  decompressMs: number
  parseMs: number
  buildMs: number
  /** Non-fatal parse problems, surfaced so format drift is visible. */
  warnings: string[]
}

/** The complete snapshot the renderer works from. */
export interface SaveSnapshot {
  /** Monotonic revision, incremented on every successful reload. */
  revision: number
  /** When this snapshot was produced. */
  loadedAt: number
  world: WorldSummary
  guilds: Guild[]
  players: Player[]
  pals: Pal[]
  bases: BaseCamp[]
  inventories: PlayerInventory[]
  storage: StorageSummary
  resources: ResourceTotals
  records: PlayerRecords[]
  alerts: Alert[]
  diagnostics: SaveDiagnostics
}

/** Aggregated counters the dashboard shows without recomputing on the client. */
export interface DashboardStats {
  palCount: number
  uniqueSpeciesCount: number
  alphaCount: number
  luckyCount: number
  baseCount: number
  buildingCount: number
  /** Pals whose sanity is below the concern threshold. */
  depressedCount: number
  /** Pals whose stomach is below the concern threshold. */
  starvingCount: number
  /** Pals that are ill. */
  sickCount: number
  workerCount: number
}
