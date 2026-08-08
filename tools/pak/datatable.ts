/**
 * Text-DataTable row extraction without a full unversioned-property parser.
 *
 * Rows in DT_*Text_Common tables are `FName rowKey -> struct { FText }`. The
 * row keys are FName references — [u32 nameIndex][u32 number] pairs into the
 * package name map — and the FText payload carries namespace, key-hash and
 * the source string as plain FStrings. We locate rows by scanning for name-map
 * references matching the table's key prefix, then pull the display string out
 * of each row's span. Every extraction is validated by the caller against
 * known pairs before being trusted.
 */
import { FArchiveReader } from '../../core/gvas/reader'

/** Plausible FString at `at`: length-prefixed, printable, null-terminated. */
function tryString(buf: Buffer, at: number): { value: string; end: number } | null {
  if (at + 4 > buf.length) return null
  const len = buf.readInt32LE(at)
  if (len > 0) {
    if (len > 512 || at + 4 + len > buf.length) return null
    if (buf[at + 4 + len - 1] !== 0) return null
    const bytes = buf.subarray(at + 4, at + 4 + len - 1)
    for (const b of bytes) if (b < 0x20 || b > 0x7e) return null
    return { value: bytes.toString('latin1'), end: at + 4 + len }
  }
  if (len < 0) {
    const chars = -len
    if (chars > 512 || at + 4 + chars * 2 > buf.length) return null
    const end = at + 4 + chars * 2
    if (buf.readUInt16LE(end - 2) !== 0) return null
    return { value: buf.toString('utf16le', at + 4, end - 2), end }
  }
  return null
}

const HEX_KEY = /^[0-9A-F]{32}$/i

export interface TextRow {
  key: string
  text: string
}

/**
 * Single-FText-property row: unversioned header fragment observed as `0x0300`
 * in every Palworld text table (and on the UDataTable object itself), followed
 * by the FText payload.
 */
const TEXT_ROW_HEADER = 0x0300

/**
 * Extracts `rowKey -> displayText` by walking the table structurally.
 *
 * Text-table rows serialize back to back as
 *   [FName key][u16 unversioned header][FText]
 * preceded by an i32 row count, so once the first row is located the whole
 * table can be walked exactly — no heuristics, and the walk is validated
 * against the declared row count (a mismatch throws rather than returning
 * silently wrong names).
 */
export function extractTextRows(uexp: Buffer, names: string[], prefixes: string[]): TextRow[] {
  const isRowKey = (idx: number) =>
    idx < names.length && prefixes.some((p) => names[idx].startsWith(p))

  // Locate the first row: [i32 rowCount>0][FName prefixed][header]. The FName
  // number is not constrained — keys with canonical numeric suffixes serialize
  // with number = suffix + 1.
  let firstRow = -1
  let rowCount = 0
  for (let at = 4; at + 10 <= uexp.length; at++) {
    if (!isRowKey(uexp.readUInt32LE(at))) continue
    if (uexp.readUInt32LE(at + 4) > 1_000_000) continue
    if (uexp.readUInt16LE(at + 8) !== TEXT_ROW_HEADER) continue
    const count = uexp.readInt32LE(at - 4)
    if (count <= 0 || count > 1_000_000) continue
    firstRow = at
    rowCount = count
    break
  }
  if (firstRow === -1) throw new Error('no text-table rows found')

  const r = new FArchiveReader(uexp, firstRow)
  const rows: TextRow[] = []
  for (let i = 0; i < rowCount; i++) {
    const nameIndex = r.u32()
    const nameNumber = r.u32()
    if (nameIndex >= names.length) {
      throw new Error(`row ${i}: bad FName reference at ${r.offset - 8}`)
    }
    // FNames with a canonical numeric suffix are stored split: "NAME_POLICE_1"
    // is base "NAME_POLICE" with number 2 (suffix + 1).
    const key = nameNumber === 0 ? names[nameIndex] : `${names[nameIndex]}_${nameNumber - 1}`
    const header = r.u16()
    if (header !== TEXT_ROW_HEADER) {
      throw new Error(`row ${i} (${key}): unexpected unversioned header 0x${header.toString(16)}`)
    }

    // FText: flags, history type, then history-specific payload.
    r.u32() // flags
    const history = r.u8()
    let text = ''
    if (history === 0) {
      r.fstring() // namespace
      r.fstring() // localisation key (32-hex)
      text = r.fstring()
    } else if (history === 0xff) {
      // No history: optionally a culture-invariant string.
      const hasInvariant = r.u32()
      if (hasInvariant === 1) text = r.fstring()
      else if (hasInvariant !== 0) throw new Error(`row ${i} (${key}): bad invariant flag`)
    } else {
      throw new Error(`row ${i} (${key}): unsupported FText history ${history}`)
    }

    if (text.length > 0) rows.push({ key, text })
  }
  return rows
}

/** Lists the distinct `PREFIX_` shapes present among a table's name map. */
export function keyPrefixes(names: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const n of names) {
    const m = /^([A-Z][A-Z0-9]*(?:_[A-Z]+)*?_)(?=[A-Z][a-z]|[0-9])/.exec(n)
    if (m) out.set(m[1], (out.get(m[1]) ?? 0) + 1)
  }
  return out
}

export { FArchiveReader }
