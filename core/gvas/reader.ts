/**
 * FArchiveReader — a cursor over an Unreal Engine serialized byte buffer.
 *
 * This is a read-only reader. PalBoard never writes save files, which lets us
 * drop all of the round-tripping metadata (property GUIDs, struct ids, declared
 * type names) that write-capable parsers must retain. The result is a much
 * leaner object graph and a significantly faster parse.
 *
 * All integers are little-endian, matching UE's serialization on desktop.
 */
export class FArchiveReader {
  readonly buf: Buffer
  /** Absolute read cursor, in bytes from the start of `buf`. */
  offset = 0

  constructor(buf: Buffer, offset = 0) {
    this.buf = buf
    this.offset = offset
  }

  /** Bytes remaining after the cursor. */
  get remaining(): number {
    return this.buf.length - this.offset
  }

  get eof(): boolean {
    return this.offset >= this.buf.length
  }

  /**
   * Guards against a malformed/short buffer before a read. Parsers rely on this
   * throwing rather than silently returning zeroes, so a truncated save surfaces
   * as a parse error instead of nonsense data.
   */
  private need(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new RangeError(
        `FArchiveReader: read of ${n} bytes at ${this.offset} exceeds buffer length ${this.buf.length}`,
      )
    }
  }

  skip(n: number): void {
    this.need(n)
    this.offset += n
  }

  seek(absolute: number): void {
    if (absolute < 0 || absolute > this.buf.length) {
      throw new RangeError(`FArchiveReader: seek to ${absolute} out of bounds`)
    }
    this.offset = absolute
  }

  u8(): number {
    this.need(1)
    return this.buf[this.offset++]
  }

  bool(): boolean {
    return this.u8() !== 0
  }

  i16(): number {
    this.need(2)
    const v = this.buf.readInt16LE(this.offset)
    this.offset += 2
    return v
  }

  u16(): number {
    this.need(2)
    const v = this.buf.readUInt16LE(this.offset)
    this.offset += 2
    return v
  }

  i32(): number {
    this.need(4)
    const v = this.buf.readInt32LE(this.offset)
    this.offset += 4
    return v
  }

  u32(): number {
    this.need(4)
    const v = this.buf.readUInt32LE(this.offset)
    this.offset += 4
    return v
  }

  i64(): bigint {
    this.need(8)
    const v = this.buf.readBigInt64LE(this.offset)
    this.offset += 8
    return v
  }

  u64(): bigint {
    this.need(8)
    const v = this.buf.readBigUInt64LE(this.offset)
    this.offset += 8
    return v
  }

  /**
   * Reads a u64 as a JS number. Safe for sizes and counts, which never approach
   * 2^53 in practice; used to keep hot paths off BigInt arithmetic.
   */
  u64AsNumber(): number {
    this.need(8)
    const lo = this.buf.readUInt32LE(this.offset)
    const hi = this.buf.readUInt32LE(this.offset + 4)
    this.offset += 8
    return hi * 0x1_0000_0000 + lo
  }

  f32(): number {
    this.need(4)
    const v = this.buf.readFloatLE(this.offset)
    this.offset += 4
    return v
  }

  f64(): number {
    this.need(8)
    const v = this.buf.readDoubleLE(this.offset)
    this.offset += 8
    return v
  }

  bytes(n: number): Buffer {
    this.need(n)
    const v = this.buf.subarray(this.offset, this.offset + n)
    this.offset += n
    return v
  }

  restBytes(): Buffer {
    const v = this.buf.subarray(this.offset)
    this.offset = this.buf.length
    return v
  }

  /**
   * FString: an i32 length followed by a null-terminated payload.
   * Positive length means single-byte (ASCII/latin1); negative means UTF-16LE
   * and the magnitude counts *characters*, not bytes.
   */
  fstring(): string {
    const len = this.i32()
    if (len === 0) return ''
    if (len < 0) {
      // -2^31 has no positive counterpart; reject before it wraps negative.
      if (len === -0x8000_0000) {
        throw new RangeError(`FArchiveReader: implausible FString length ${len} at ${this.offset - 4}`)
      }
      const byteLen = -len * 2
      this.need(byteLen)
      // Trim the 2-byte null terminator.
      const s = this.buf.toString('utf16le', this.offset, this.offset + byteLen - 2)
      this.offset += byteLen
      return s
    }
    this.need(len)
    // Trim the 1-byte null terminator.
    const s = this.buf.toString('latin1', this.offset, this.offset + len - 1)
    this.offset += len
    return s
  }

  /**
   * Formats UE's 16-byte FGuid the same way the Palworld community tooling does,
   * so ids printed by PalBoard can be cross-referenced against other save editors.
   */
  guid(): string {
    this.need(16)
    const b = this.buf
    const o = this.offset
    this.offset += 16
    const h8 = (n: number) => n.toString(16).padStart(8, '0')
    const h4 = (n: number) => n.toString(16).padStart(4, '0')
    return (
      h8((((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0)) +
      '-' +
      h4((b[o + 7] << 8) | b[o + 6]) +
      '-' +
      h4((b[o + 5] << 8) | b[o + 4]) +
      '-' +
      h4((b[o + 11] << 8) | b[o + 10]) +
      '-' +
      h4((b[o + 9] << 8) | b[o + 8]) +
      h8((((b[o + 15] << 24) | (b[o + 14] << 16) | (b[o + 13] << 8) | b[o + 12]) >>> 0))
    )
  }

  /**
   * UE writes an optional property GUID as a presence byte followed by 16 bytes.
   * Palworld never populates it, so we discard the value and only advance.
   */
  optionalGuid(): void {
    if (this.u8() !== 0) this.skip(16)
  }

  /** UE 5 large-world coordinates: FVector is three doubles. */
  vector(): Vector {
    return { x: this.f64(), y: this.f64(), z: this.f64() }
  }

  quat(): Quat {
    return { x: this.f64(), y: this.f64(), z: this.f64(), w: this.f64() }
  }

  transform(): Transform {
    return { rotation: this.quat(), translation: this.vector(), scale3d: this.vector() }
  }

  /**
   * Reads a u32 element count, rejecting any value the remaining bytes could not
   * possibly supply.
   *
   * This guard matters more than it looks. A count is four bytes of untrusted
   * data, and every container here follows it with `new Array(count)`; a corrupt
   * or truncated save reaching that line with a count near 2^32 exhausts memory
   * before the first element read can fail. Bounding it turns an OOM crash into
   * a recoverable parse error the plan can skip past.
   *
   * @param minBytesPerElement smallest on-disk size of one element
   */
  count(minBytesPerElement = 1): number {
    const at = this.offset
    const n = this.u32()
    const max = Math.floor(this.remaining / Math.max(1, minBytesPerElement))
    if (n > max) {
      throw new RangeError(
        `FArchiveReader: element count ${n} at ${at} exceeds the ${max} that fit in ${this.remaining} remaining bytes`,
      )
    }
    return n
  }

  /** TArray<T>: a bounded u32 count followed by `count` elements. */
  tarray<T>(read: (r: FArchiveReader) => T, minBytesPerElement = 1): T[] {
    const count = this.count(minBytesPerElement)
    const out: T[] = new Array(count)
    for (let i = 0; i < count; i++) out[i] = read(this)
    return out
  }
}

export interface Vector {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export interface Transform {
  rotation: Quat
  translation: Vector
  scale3d: Vector
}
