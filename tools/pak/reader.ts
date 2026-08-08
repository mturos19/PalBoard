/**
 * Minimal Unreal Engine legacy .pak reader — just enough to locate and extract
 * individual files from Palworld's Pal-Windows.pak. Read-only, index-driven:
 * only the footer, the index, and the requested file's bytes are ever read,
 * so the 40 GB pak is never loaded into memory.
 *
 * Supports pak index version 11 (UE 5.x) with an unencrypted index, zlib or
 * Oodle compression. Oodle blocks are decoded with the same ooz-wasm module
 * the save parser uses.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { FArchiveReader } from '../../core/gvas/reader'

const PAK_MAGIC = 0x5a6f12e1

export interface PakEntry {
  path: string
  offset: number
  size: number
  uncompressedSize: number
  /** Index into {@link PakFile.compressionMethods}; 0 = uncompressed. */
  compressionMethodIndex: number
  encrypted: boolean
}

interface Footer {
  encryptedIndex: boolean
  version: number
  indexOffset: number
  indexSize: number
  compressionMethods: string[]
}

type OozDecompress = (data: Uint8Array, rawSize: number) => Uint8Array
let ooz: OozDecompress | null = null
async function oodle(): Promise<OozDecompress> {
  ooz ??= (await import('ooz-wasm')).decompress
  return ooz
}

export class PakFile {
  private constructor(
    private readonly fd: number,
    readonly version: number,
    readonly mountPoint: string,
    readonly compressionMethods: string[],
    readonly entries: Map<string, PakEntry>,
  ) {}

  static open(pakPath: string): PakFile {
    const fd = openSync(pakPath, 'r')
    const fileSize = fstatSync(fd).size

    const footer = readFooter(fd, fileSize)
    if (footer.encryptedIndex) {
      closeSync(fd)
      throw new Error('pak index is encrypted — cannot read without the AES key')
    }

    const indexBuf = readAt(fd, footer.indexOffset, footer.indexSize)
    const r = new FArchiveReader(indexBuf)

    const mountPoint = r.fstring()
    const entryCount = r.i32()
    r.u64() // path hash seed
    const hasPathHashIndex = r.u32() !== 0
    if (hasPathHashIndex) r.skip(8 + 8 + 20) // offset, size, hash
    const hasFullDirectoryIndex = r.u32() !== 0
    if (!hasFullDirectoryIndex) {
      closeSync(fd)
      throw new Error('pak has no full directory index')
    }
    const dirIndexOffset = Number(r.i64())
    const dirIndexSize = Number(r.i64())
    r.skip(20) // directory index hash
    const encodedEntriesSize = r.i32()
    const encodedEntries = r.bytes(encodedEntriesSize)

    // Full directory index: dir name -> (file name -> byte offset into the
    // encoded-entries blob).
    const dirBuf = readAt(fd, dirIndexOffset, dirIndexSize)
    const d = new FArchiveReader(dirBuf)
    const entries = new Map<string, PakEntry>()
    const dirCount = d.i32()
    for (let i = 0; i < dirCount; i++) {
      const dirName = d.fstring()
      const fileCount = d.i32()
      for (let j = 0; j < fileCount; j++) {
        const fileName = d.fstring()
        const location = d.i32()
        if (location < 0) continue // non-encoded entry; none observed in Palworld
        const entry = decodeEntry(encodedEntries, location)
        const path = normalisePath(mountPoint, dirName, fileName)
        entries.set(path, { ...entry, path })
      }
    }

    if (entries.size === 0 && entryCount > 0) {
      closeSync(fd)
      throw new Error('directory index parsed to zero entries — format mismatch')
    }

    return new PakFile(fd, footer.version, mountPoint, footer.compressionMethods, entries)
  }

  close(): void {
    closeSync(this.fd)
  }

  find(pattern: RegExp): PakEntry[] {
    const out: PakEntry[] = []
    for (const [path, entry] of this.entries) if (pattern.test(path)) out.push(entry)
    return out
  }

  /** Extracts and decompresses one file. */
  async read(entry: PakEntry): Promise<Buffer> {
    // The on-disk record begins with a duplicate FPakEntry header carrying the
    // authoritative compression-block table; parse it rather than trusting the
    // encoded index's compact form.
    const header = readAt(this.fd, entry.offset, 4096)
    const h = new FArchiveReader(header)
    h.skip(8 + 8 + 8) // offset, size, uncompressed size
    const methodIndex = h.u32()
    h.skip(20) // hash
    const blocks: Array<{ start: number; end: number }> = []
    let blockSize = 0
    if (methodIndex !== 0) {
      const blockCount = h.i32()
      for (let i = 0; i < blockCount; i++) {
        blocks.push({ start: Number(h.i64()), end: Number(h.i64()) })
      }
    }
    h.skip(1) // encrypted flag
    blockSize = h.u32()
    const dataStart = h.offset

    if (entry.encrypted) throw new Error(`${entry.path}: encrypted entries unsupported`)

    const method = (this.compressionMethods[methodIndex] ?? 'None').toLowerCase()
    if (methodIndex === 0 || method === 'none') {
      return readAt(this.fd, entry.offset + dataStart, entry.uncompressedSize)
    }

    const out = Buffer.alloc(entry.uncompressedSize)
    let written = 0
    for (const block of blocks) {
      // Block offsets are relative to the entry record for index v>=5; treat
      // values smaller than the entry offset as relative, absolute otherwise.
      const abs = block.start < entry.offset ? entry.offset + block.start : block.start
      const compressed = readAt(this.fd, abs, block.end - block.start)
      const want = Math.min(blockSize, entry.uncompressedSize - written)
      let raw: Buffer
      if (method.includes('oodle')) {
        const dec = await oodle()
        const res = dec(new Uint8Array(compressed), want)
        raw = Buffer.from(res.buffer, res.byteOffset, res.length)
      } else if (method.includes('zlib')) {
        raw = inflateSync(compressed)
      } else {
        throw new Error(`${entry.path}: unsupported compression '${method}'`)
      }
      raw.copy(out, written)
      written += raw.length
    }
    if (written !== entry.uncompressedSize) {
      throw new Error(`${entry.path}: expected ${entry.uncompressedSize} bytes, got ${written}`)
    }
    return out
  }
}

function readAt(fd: number, offset: number, size: number): Buffer {
  const buf = Buffer.alloc(size)
  let done = 0
  while (done < size) {
    const n = readSync(fd, buf, done, size - done, offset + done)
    if (n <= 0) throw new Error(`short read at ${offset + done}`)
    done += n
  }
  return buf
}

/** Scans the tail of the file for the pak magic and parses the footer. */
function readFooter(fd: number, fileSize: number): Footer {
  const tailSize = Math.min(4096, fileSize)
  const tail = readAt(fd, fileSize - tailSize, tailSize)
  let magicAt = -1
  for (let i = tail.length - 4; i >= 0; i--) {
    if (tail.readUInt32LE(i) === PAK_MAGIC) {
      magicAt = i
      break
    }
  }
  if (magicAt === -1) throw new Error('pak magic not found — not a legacy .pak?')

  // Footer layout from the magic onwards: magic, version, indexOffset,
  // indexSize, indexHash(20), compression method names (5 × 32 bytes ansi).
  const r = new FArchiveReader(tail, magicAt + 4)
  const version = r.i32()
  const indexOffset = Number(r.i64())
  const indexSize = Number(r.i64())
  r.skip(20)
  const compressionMethods = ['None']
  while (r.remaining >= 32) {
    const name = r.bytes(32).toString('latin1').replace(/\0.*$/, '')
    if (name) compressionMethods.push(name)
  }
  // bEncryptedIndex sits immediately before the magic (preceded by key guid).
  const encryptedIndex = magicAt >= 1 ? tail[magicAt - 1] !== 0 : false
  return { encryptedIndex, version, indexOffset, indexSize, compressionMethods }
}

/** FPakEntry compact "encoded" form used by the v10+ index. */
function decodeEntry(
  buf: Buffer,
  at: number,
): Omit<PakEntry, 'path'> {
  const r = new FArchiveReader(buf, at)
  const value = r.u32()
  const compressionMethodIndex = (value >> 23) & 0x3f
  const encrypted = ((value >> 22) & 1) === 1
  const blockCount = (value >> 6) & 0xffff

  const offset = value & 0x80000000 ? r.u32() : Number(r.u64())
  const uncompressedSize = value & 0x40000000 ? r.u32() : Number(r.u64())
  let size = uncompressedSize
  if (compressionMethodIndex !== 0) {
    size = value & 0x20000000 ? r.u32() : Number(r.u64())
  }
  void blockCount // block table re-read from the on-disk record instead

  return { offset, size, uncompressedSize, compressionMethodIndex, encrypted }
}

function normalisePath(mountPoint: string, dirName: string, fileName: string): string {
  const joined = (mountPoint + dirName + fileName).replace(/\\/g, '/')
  // Mount points are typically "../../../"; strip leading traversal.
  return joined.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')
}
