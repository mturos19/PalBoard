/**
 * Minimal legacy .uasset reader: package summary + name map. Enough to
 * interpret FName references inside the companion .uexp export data.
 */
import { FArchiveReader } from '../../core/gvas/reader'

const PACKAGE_TAG = 0x9e2a83c1

export interface UAsset {
  names: string[]
  nameCount: number
  totalHeaderSize: number
}

export function parseUAsset(buf: Buffer): UAsset {
  const r = new FArchiveReader(buf)
  const tag = r.u32()
  if (tag !== PACKAGE_TAG) throw new Error(`bad package tag 0x${tag.toString(16)}`)
  const legacyFileVersion = r.i32()
  r.i32() // legacy UE3 version
  const fileVersionUE4 = r.i32()
  const fileVersionUE5 = legacyFileVersion <= -8 ? r.i32() : 0
  r.i32() // licensee version
  const customVersionCount = r.i32()
  r.skip(customVersionCount * 20)
  const totalHeaderSize = r.i32()
  r.fstring() // folder name
  r.u32() // package flags
  const nameCount = r.i32()
  const nameOffset = r.i32()
  void fileVersionUE4
  void fileVersionUE5

  const n = new FArchiveReader(buf, nameOffset)
  const names: string[] = new Array(nameCount)
  for (let i = 0; i < nameCount; i++) {
    names[i] = n.fstring()
    n.skip(4) // case-preserving + non-case-preserving hashes (u16 each)
  }
  return { names, nameCount, totalHeaderSize }
}
