/**
 * Decoders for Palworld's opaque `RawData` byte blobs.
 *
 * Palworld packs several structures into `TArray<uint8>` properties with a
 * hand-rolled binary layout rather than UE properties. Those layouts change
 * between game versions, so every decoder here:
 *
 *   - stops at the last field it is confident about instead of demanding it
 *     consume the buffer exactly, and
 *   - reports leftover bytes rather than throwing.
 *
 * Fields verified against a Palworld 1.0 save are marked; fields inherited from
 * the community's pre-0.6 documentation are marked as legacy so drift is easy to
 * spot later.
 */
import { FArchiveReader } from '../gvas/reader'
import { parseProperties } from '../gvas/parser'
import type { ParsePlan, PropStruct } from '../gvas/types'
import type { Transform } from '../gvas/reader'

/** `CharacterSaveParameterMap` value RawData. */
export interface CharacterRaw {
  /** The character's UE property set; real fields sit under `SaveParameter`. */
  params: PropStruct
  /** Guild/group this character belongs to. */
  groupId: string
  trailingBytes: number
}

export function decodeCharacter(buf: Buffer, plan: ParsePlan = {}): CharacterRaw {
  const r = new FArchiveReader(buf)
  const obj = parseProperties(r, plan)
  const params = (obj.SaveParameter as PropStruct | undefined) ?? obj
  r.skip(4) // unknown; zero in every save observed
  const groupId = r.guid()
  return { params, groupId, trailingBytes: r.remaining }
}

/** `BaseCampSaveData` value RawData. */
export interface BaseCampRaw {
  id: string
  name: string
  state: number
  transform: Transform
  areaRange: number
  groupIdBelongTo: string
  fastTravelLocalTransform: Transform
  ownerMapObjectInstanceId: string
  trailingBytes: number
}

export function decodeBaseCamp(buf: Buffer): BaseCampRaw {
  const r = new FArchiveReader(buf)
  return {
    id: r.guid(),
    name: r.fstring(),
    state: r.u8(),
    transform: r.transform(),
    areaRange: r.f32(),
    groupIdBelongTo: r.guid(),
    fastTravelLocalTransform: r.transform(),
    ownerMapObjectInstanceId: r.guid(),
    // Palworld 1.0 appends 4 bytes here that older tooling does not describe.
    trailingBytes: r.remaining,
  }
}

export interface CharacterHandle {
  guid: string
  instanceId: string
}

/** `GroupSaveDataMap` value RawData. */
export interface GroupRaw {
  groupType: string
  groupId: string
  groupName: string
  /** Every character (player or pal) owned by the group. */
  handles: CharacterHandle[]
  /** Organization/guild only. */
  orgType?: number
  baseIds?: string[]
  baseCampLevel?: number
  campPointIds?: string[]
  /** Guild only. */
  guildName?: string
  adminPlayerUid?: string
  /** Bytes left after the fields we decode; non-zero is expected on 1.0. */
  trailingBytes: number
}

/**
 * Decodes a group.
 *
 * Layout confirmed against Palworld 1.0. Two differences from the pre-0.6
 * community layout, both verified byte-for-byte on a real save:
 *   1. a 4-byte field follows the character handle array, and
 *   2. a second int32 sits between `baseCampLevel` and the camp point array.
 *
 * Decoding stops after `adminPlayerUid`. The guild's embedded player roster is
 * left unparsed because its 1.0 layout gained fields we cannot confidently
 * identify — and the same names are available from the character data anyway.
 */
export function decodeGroup(buf: Buffer, groupType: string): GroupRaw {
  const r = new FArchiveReader(buf)
  const out: GroupRaw = {
    groupType,
    groupId: r.guid(),
    groupName: r.fstring(),
    handles: r.tarray((rr) => ({ guid: rr.guid(), instanceId: rr.guid() })),
    trailingBytes: 0,
  }

  const isOrg = /Guild|Organization/.test(groupType)
  if (isOrg) {
    r.skip(4) // 1.0 addition, always zero
    out.orgType = r.u8()
    out.baseIds = r.tarray((rr) => rr.guid())
  }

  if (/Guild/.test(groupType)) {
    out.baseCampLevel = r.i32()
    r.skip(4) // 1.0 addition; purpose unknown
    out.campPointIds = r.tarray((rr) => rr.guid())
    out.guildName = r.fstring()
    out.adminPlayerUid = r.guid()
  }

  out.trailingBytes = r.remaining
  return out
}

/** `CharacterContainerSaveData` slot RawData — which player owns a palbox slot. */
export interface CharacterContainerSlotRaw {
  playerUid: string
  instanceId: string
  permissionTribeId: number
}

export function decodeCharacterContainerSlot(buf: Buffer): CharacterContainerSlotRaw | null {
  if (buf.length === 0) return null
  const r = new FArchiveReader(buf)
  return { playerUid: r.guid(), instanceId: r.guid(), permissionTribeId: r.u8() }
}

/** `ItemContainerSaveData` value RawData — container access permissions. */
export interface ItemContainerRaw {
  itemStaticIds: string[]
}

export function decodeItemContainer(buf: Buffer): ItemContainerRaw | null {
  if (buf.length === 0) return null
  const r = new FArchiveReader(buf)
  r.tarray((rr) => rr.u8()) // permission type A
  r.tarray((rr) => rr.u8()) // permission type B
  return { itemStaticIds: r.tarray((rr) => rr.fstring()) }
}
