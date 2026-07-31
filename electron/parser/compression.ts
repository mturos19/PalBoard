/**
 * Palworld .sav container format.
 *
 * A .sav is a 12-byte header followed by a compressed GVAS payload. Three
 * container variants exist in the wild:
 *
 *   PlZ  (0x31 / 0x32)  zlib, single or double pass   — Palworld < 0.6
 *   PlM  (0x31)         Oodle (Kraken/Mermaid family) — Palworld >= 0.6, incl. 1.0
 *   CNK  (0x30)         Xbox/Game Pass wrapper; a second header follows at +12
 *
 * Header layout (little-endian):
 *   0..3   uncompressed length
 *   4..7   compressed length
 *   8..10  magic ("PlZ" | "PlM" | "CNK")
 *   11     save type byte
 *   12..   compressed payload
 *
 * Oodle is a proprietary codec, so we decode with `ooz-wasm` — a WebAssembly
 * build of the open-source `ooz` reimplementation. It is decode-only, which is
 * all a read-only dashboard needs.
 */
import { inflateSync } from 'node:zlib'

type OozDecompress = (data: Uint8Array, rawSize: number) => Uint8Array

/**
 * `ooz-wasm` is an ES module with a top-level await (it instantiates the WASM
 * binary on load), which CommonJS `require()` cannot pull in. The main process
 * is built as CommonJS — Electron's ESM loader cannot resolve named exports
 * from the `electron` shim — so we reach it through a genuine dynamic import.
 *
 * The indirection through `Function` keeps the bundler from rewriting `import()`
 * into a `require()` call, which would reintroduce the same failure.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ decompress: OozDecompress }>

let oozPromise: Promise<OozDecompress> | null = null

function loadOodle(): Promise<OozDecompress> {
  oozPromise ??= dynamicImport('ooz-wasm').then((m) => m.decompress)
  return oozPromise
}

/** Warms the Oodle decoder so the first save load does not pay for it. */
export function preloadOodle(): Promise<unknown> {
  return loadOodle()
}

export type SaveMagic = 'PlZ' | 'PlM' | 'CNK'

export interface SaveContainer {
  /** Container magic, after unwrapping an Xbox CNK envelope. */
  magic: SaveMagic
  /** Raw save-type byte from the header. */
  saveType: number
  /** Which codec actually decoded the payload. */
  codec: 'zlib' | 'zlib-double' | 'oodle'
  /** Decompressed GVAS bytes. */
  gvas: Buffer
}

const MAGIC_PLZ = 'PlZ'
const MAGIC_PLM = 'PlM'
const MAGIC_CNK = 'CNK'

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveFormatError'
  }
}

interface ContainerHeader {
  uncompressedLen: number
  compressedLen: number
  magic: string
  saveType: number
  dataOffset: number
}

function readHeader(data: Buffer): ContainerHeader {
  if (data.length < 12) {
    throw new SaveFormatError(`file is too small to be a Palworld save (${data.length} bytes)`)
  }

  let uncompressedLen = data.readUInt32LE(0)
  let compressedLen = data.readUInt32LE(4)
  let magic = data.toString('latin1', 8, 11)
  let saveType = data[11]
  let dataOffset = 12

  // Xbox Game Pass saves wrap the real header in a CNK envelope; the actual
  // header is repeated 12 bytes further in.
  if (magic === MAGIC_CNK) {
    if (data.length < 24) {
      throw new SaveFormatError('CNK save truncated before inner header')
    }
    uncompressedLen = data.readUInt32LE(12)
    compressedLen = data.readUInt32LE(16)
    magic = data.toString('latin1', 20, 23)
    saveType = data[23]
    dataOffset = 24
  }

  return { uncompressedLen, compressedLen, magic, saveType, dataOffset }
}

/**
 * Decompresses a .sav container into its GVAS payload.
 *
 * Throws {@link SaveFormatError} for anything that is not a recognised Palworld
 * container so callers can distinguish "wrong file" from "corrupt file".
 */
export async function decompressSave(data: Buffer): Promise<SaveContainer> {
  const { uncompressedLen, compressedLen, magic, saveType, dataOffset } = readHeader(data)

  if (magic !== MAGIC_PLZ && magic !== MAGIC_PLM) {
    if (magic === '\0\0\0' && uncompressedLen === 0 && compressedLen === 0) {
      throw new SaveFormatError('save is all null bytes — the file is likely corrupt')
    }
    throw new SaveFormatError(
      `not a Palworld save: expected magic PlZ/PlM/CNK, found ${JSON.stringify(magic)}`,
    )
  }

  const rest = data.subarray(dataOffset)

  /**
   * `compressedLen` means different things per save type. For single-pass
   * containers it is the number of bytes on disk, but for double-zlib it is the
   * size of the *intermediate* stream the first pass produces — so the on-disk
   * payload is smaller than the header's number, and slicing to it truncates.
   */
  const onDiskPayload = (): Buffer => {
    if (rest.length < compressedLen) {
      throw new SaveFormatError(
        `save truncated: header declares ${compressedLen} compressed bytes, found ${rest.length}`,
      )
    }
    return rest.subarray(0, compressedLen)
  }

  let gvas: Buffer
  let codec: SaveContainer['codec']

  if (magic === MAGIC_PLM) {
    // Oodle. The codec needs the exact decompressed size up front.
    const oozDecompress = await loadOodle()
    const out = oozDecompress(new Uint8Array(onDiskPayload()), uncompressedLen)
    gvas = Buffer.from(out.buffer, out.byteOffset, out.length)
    codec = 'oodle'
  } else if (saveType === 0x32) {
    const once = inflateSync(rest)
    if (once.length !== compressedLen) {
      throw new SaveFormatError(
        `double-zlib inner length mismatch: expected ${compressedLen}, got ${once.length}`,
      )
    }
    gvas = inflateSync(once)
    codec = 'zlib-double'
  } else if (saveType === 0x31 || saveType === 0x30) {
    gvas = inflateSync(onDiskPayload())
    codec = 'zlib'
  } else {
    throw new SaveFormatError(`unknown save type byte 0x${saveType.toString(16)}`)
  }

  if (gvas.length !== uncompressedLen) {
    throw new SaveFormatError(
      `decompressed length mismatch: header declares ${uncompressedLen}, got ${gvas.length}`,
    )
  }

  // ooz-wasm returns a view into WASM memory that is invalidated by the next
  // call. Copy it out so callers can hold the buffer safely.
  if (codec === 'oodle') gvas = Buffer.from(gvas)

  return { magic: magic as SaveMagic, saveType, codec, gvas }
}
