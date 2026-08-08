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
 *
 * Both codecs here run unchanged in Node and in the browser: `fflate` is a
 * pure-JS zlib and `ooz-wasm` is WebAssembly, so this module has no platform
 * dependency and the same parser serves the desktop app and the web build.
 */
import { unzlibSync } from 'fflate'

type OozDecompress = (data: Uint8Array, rawSize: number) => Uint8Array

/**
 * `ooz-wasm` is an ES module with a top-level await (it instantiates the WASM
 * binary on load), which CommonJS `require()` cannot pull in. The main process
 * is built as CommonJS — Electron's ESM loader cannot resolve named exports
 * from the `electron` shim — so we reach it through a genuine dynamic import.
 *
 * Rollup keeps external dynamic imports as real `import()` in CJS output
 * (`output.dynamicImportInCjs`, on by default), so this survives bundling; and
 * unlike a `Function('import(...)')` indirection it also works under vite-node,
 * which has no dynamic-import callback in eval'd contexts.
 */
let oozPromise: Promise<OozDecompress> | null = null

function loadOodle(): Promise<OozDecompress> {
  oozPromise ??= import('ooz-wasm').then((m) => m.decompress)
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

/**
 * Ceiling on a declared decompressed size, in bytes.
 *
 * Both codecs allocate the output buffer from a 32-bit header field before a
 * single byte is verified, so a corrupt header is an allocation request of up to
 * 4 GiB. A real Level.sav decompresses to tens of megabytes; 1 GiB leaves two
 * orders of magnitude of headroom while keeping a bad header an error rather
 * than an out-of-memory kill.
 */
const MAX_DECOMPRESSED_BYTES = 1024 * 1024 * 1024

export class SaveFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SaveFormatError'
  }
}

/**
 * Runs zlib inflate into a fixed-size buffer, translating any failure into a
 * {@link SaveFormatError}.
 *
 * Left to allocate freely, inflate grows its output to whatever the stream asks
 * for, so a malformed or hostile payload decompresses until the process dies.
 * Pre-allocating the size the header already promised makes a disagreement a
 * clean error instead of unbounded memory growth.
 *
 * The buffer is one byte longer than the declared size so that over-long and
 * exact streams stay distinguishable. `fflate` returns the bytes it actually
 * wrote when the buffer has room and silently truncates when it does not, so a
 * stream longer than declared comes back at `expected + 1` — a mismatch the
 * caller rejects — rather than passing as a correct decode.
 */
function inflate(payload: Uint8Array, expectedLength: number, what: string): Buffer {
  let out: Uint8Array
  try {
    out = unzlibSync(payload, { out: new Uint8Array(expectedLength + 1) })
  } catch (err) {
    throw new SaveFormatError(`${what} failed to decompress: ${(err as Error).message}`, { cause: err })
  }
  if (out.length !== expectedLength) {
    throw new SaveFormatError(
      `${what} length mismatch: header declares ${expectedLength}, stream produced ${
        out.length > expectedLength ? `more than ${expectedLength}` : String(out.length)
      }`,
    )
  }
  return Buffer.from(out.buffer, out.byteOffset, out.length)
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
export async function decompressSave(input: Uint8Array): Promise<SaveContainer> {
  // Browsers hand us a plain Uint8Array off a File; wrap rather than copy so the
  // header reads and payload slices below can use Buffer's typed accessors.
  const data = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const { uncompressedLen, compressedLen, magic, saveType, dataOffset } = readHeader(data)

  if (magic !== MAGIC_PLZ && magic !== MAGIC_PLM) {
    if (magic === '\0\0\0' && uncompressedLen === 0 && compressedLen === 0) {
      throw new SaveFormatError('save is all null bytes — the file is likely corrupt')
    }
    throw new SaveFormatError(
      `not a Palworld save: expected magic PlZ/PlM/CNK, found ${JSON.stringify(magic)}`,
    )
  }

  if (uncompressedLen > MAX_DECOMPRESSED_BYTES || compressedLen > MAX_DECOMPRESSED_BYTES) {
    throw new SaveFormatError(
      `save header declares an implausible size (${compressedLen} compressed, ${uncompressedLen} decompressed); refusing to allocate it`,
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
    let out: Uint8Array
    try {
      out = oozDecompress(new Uint8Array(onDiskPayload()), uncompressedLen)
    } catch (err) {
      throw new SaveFormatError(`Oodle payload failed to decompress: ${(err as Error).message}`, { cause: err })
    }
    gvas = Buffer.from(out.buffer, out.byteOffset, out.length)
    codec = 'oodle'
  } else if (saveType === 0x32) {
    // The outer pass yields the intermediate stream, whose length the header
    // records as `compressedLen` — not the final GVAS size.
    const once = inflate(rest, compressedLen, 'double-zlib outer pass')
    gvas = inflate(once, uncompressedLen, 'double-zlib inner pass')
    codec = 'zlib-double'
  } else if (saveType === 0x31 || saveType === 0x30) {
    gvas = inflate(onDiskPayload(), uncompressedLen, 'zlib payload')
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
