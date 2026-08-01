import type { Quat, Transform, Vector } from './reader'

/**
 * A parsed GVAS value.
 *
 * Because PalBoard is read-only we discard UE's round-tripping metadata and
 * decode straight to idiomatic JS values: an IntProperty is a `number`, a
 * StrProperty is a `string`, a struct is a plain object. Palworld's opaque
 * `RawData` byte blobs stay as `Buffer` and are decoded by the domain layer.
 */
export type PropValue =
  | number
  | string
  | boolean
  | bigint
  | null
  | Buffer
  | Vector
  | Quat
  | Transform
  | LinearColor
  | PropStruct
  | PropValue[]
  | MapEntry[]

export interface PropStruct {
  [key: string]: PropValue
}

export interface MapEntry {
  key: PropValue
  value: PropValue
}

export interface LinearColor {
  r: number
  g: number
  b: number
  a: number
}

export interface GvasCustomVersion {
  guid: string
  version: number
}

export interface GvasHeader {
  saveGameVersion: number
  packageFileVersionUE4: number
  packageFileVersionUE5: number
  engineVersionMajor: number
  engineVersionMinor: number
  engineVersionPatch: number
  engineVersionChangelist: number
  engineVersionBranch: string
  customVersionFormat: number
  customVersions: GvasCustomVersion[]
  saveGameClassName: string
  /** Byte offset at which the property body begins. */
  bodyOffset: number
}

export interface GvasFile {
  header: GvasHeader
  properties: PropStruct
}

/**
 * Controls how much of the tree the parser materialises.
 *
 * Level.sav decompresses to ~26 MB, most of which is world foliage and dungeon
 * spawner state that a dashboard never shows. Every property carries its own
 * byte size, so listing those paths in `skip` lets the parser seek straight past
 * them instead of allocating millions of objects.
 */
export interface ParsePlan {
  /** Exact property paths to seek past, e.g. `.worldSaveData.FoliageGridSaveDataMap`. */
  skip?: ReadonlySet<string>
  /** Struct type names for map keys/values, keyed by `<path>.Key` / `<path>.Value`. */
  typeHints?: ReadonlyMap<string, string>
  /** Collects paths the parser had to guess a type for. Useful for version drift. */
  onUnknownType?: (path: string, assumed: string) => void
  /**
   * Called when a subtree failed to parse. The parser recovers by seeking to the
   * subtree's declared end, so this is a warning channel, not a fatal error.
   */
  onError?: (path: string, error: Error) => void
}
