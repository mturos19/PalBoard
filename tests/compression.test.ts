import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SaveFormatError, decompressSave } from '../electron/parser/compression'

/** Builds a .sav container around an already-compressed payload. */
function container(opts: {
  uncompressedLen: number
  compressedLen: number
  magic: string
  saveType: number
  payload: Buffer
  cnkWrapper?: boolean
}): Buffer {
  const header = Buffer.alloc(opts.cnkWrapper ? 24 : 12)
  let o = 0
  if (opts.cnkWrapper) {
    // Outer Xbox envelope; the real header repeats at +12.
    header.writeUInt32LE(0, 0)
    header.writeUInt32LE(0, 4)
    header.write('CNK', 8, 'latin1')
    header[11] = 0x30
    o = 12
  }
  header.writeUInt32LE(opts.uncompressedLen, o)
  header.writeUInt32LE(opts.compressedLen, o + 4)
  header.write(opts.magic, o + 8, 'latin1')
  header[o + 11] = opts.saveType
  return Buffer.concat([header, opts.payload])
}

const GVAS_BODY = Buffer.from('GVAS and then some plausible save payload bytes', 'latin1')

describe('decompressSave', () => {
  it('decompresses a single-pass zlib (PlZ) save', async () => {
    const payload = deflateSync(GVAS_BODY)
    const sav = container({
      uncompressedLen: GVAS_BODY.length,
      compressedLen: payload.length,
      magic: 'PlZ',
      saveType: 0x31,
      payload,
    })

    const result = await decompressSave(sav)
    expect(result.magic).toBe('PlZ')
    expect(result.codec).toBe('zlib')
    expect(result.gvas).toEqual(GVAS_BODY)
  })

  it('decompresses a double-pass zlib (PlZ 0x32) save', async () => {
    const inner = deflateSync(GVAS_BODY)
    const outer = deflateSync(inner)
    const sav = container({
      uncompressedLen: GVAS_BODY.length,
      compressedLen: inner.length,
      magic: 'PlZ',
      saveType: 0x32,
      payload: outer,
    })

    const result = await decompressSave(sav)
    expect(result.codec).toBe('zlib-double')
    expect(result.gvas).toEqual(GVAS_BODY)
  })

  it('unwraps an Xbox CNK envelope to find the real header', async () => {
    const payload = deflateSync(GVAS_BODY)
    const sav = container({
      uncompressedLen: GVAS_BODY.length,
      compressedLen: payload.length,
      magic: 'PlZ',
      saveType: 0x31,
      payload,
      cnkWrapper: true,
    })

    const result = await decompressSave(sav)
    expect(result.magic).toBe('PlZ')
    expect(result.gvas).toEqual(GVAS_BODY)
  })

  it('rejects a file that is not a Palworld save', async () => {
    const notASave = Buffer.concat([Buffer.alloc(8), Buffer.from('ZIP\0', 'latin1'), Buffer.alloc(64)])
    await expect(decompressSave(notASave)).rejects.toThrow(SaveFormatError)
    await expect(decompressSave(notASave)).rejects.toThrow(/expected magic/)
  })

  it('gives a specific error for an all-zero (corrupt) save', async () => {
    await expect(decompressSave(Buffer.alloc(128))).rejects.toThrow(/likely corrupt/)
  })

  it('rejects a file too small to hold a header', async () => {
    await expect(decompressSave(Buffer.alloc(4))).rejects.toThrow(/too small/)
  })

  it('detects truncation from the declared compressed length', async () => {
    const payload = deflateSync(GVAS_BODY)
    const sav = container({
      uncompressedLen: GVAS_BODY.length,
      compressedLen: payload.length + 500, // claims more than is present
      magic: 'PlZ',
      saveType: 0x31,
      payload,
    })
    await expect(decompressSave(sav)).rejects.toThrow(/truncated/)
  })

  it('detects a decompressed length that disagrees with the header', async () => {
    const payload = deflateSync(GVAS_BODY)
    const sav = container({
      uncompressedLen: GVAS_BODY.length + 1, // lies about the result size
      compressedLen: payload.length,
      magic: 'PlZ',
      saveType: 0x31,
      payload,
    })
    await expect(decompressSave(sav)).rejects.toThrow(/decompressed length mismatch/)
  })
})
