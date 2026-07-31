/**
 * Minimal GVAS writer used to build test fixtures.
 *
 * Writing bytes by hand in each test would obscure what is being asserted, and
 * a builder lets tests construct exactly the edge cases (unknown property types,
 * oversized declared sizes) that real saves are hard to produce on demand.
 */
export class GvasBuilder {
  private chunks: Buffer[] = []

  private push(b: Buffer): this {
    this.chunks.push(b)
    return this
  }

  u8(v: number): this {
    return this.push(Buffer.from([v]))
  }

  u16(v: number): this {
    const b = Buffer.alloc(2)
    b.writeUInt16LE(v)
    return this.push(b)
  }

  u32(v: number): this {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(v)
    return this.push(b)
  }

  i32(v: number): this {
    const b = Buffer.alloc(4)
    b.writeInt32LE(v)
    return this.push(b)
  }

  u64(v: number | bigint): this {
    const b = Buffer.alloc(8)
    b.writeBigUInt64LE(BigInt(v))
    return this.push(b)
  }

  f32(v: number): this {
    const b = Buffer.alloc(4)
    b.writeFloatLE(v)
    return this.push(b)
  }

  f64(v: number): this {
    const b = Buffer.alloc(8)
    b.writeDoubleLE(v)
    return this.push(b)
  }

  /** ASCII FString: length includes the null terminator. */
  str(s: string): this {
    this.i32(s.length + 1)
    return this.push(Buffer.from(s + '\0', 'latin1'))
  }

  /** UTF-16 FString: negative length counts characters, not bytes. */
  strUtf16(s: string): this {
    this.i32(-(s.length + 1))
    return this.push(Buffer.from(s + '\0', 'utf16le'))
  }

  guid(bytes: number[] = new Array(16).fill(0)): this {
    return this.push(Buffer.from(bytes))
  }

  /** The absent-optional-GUID marker UE writes before most property values. */
  noGuid(): this {
    return this.u8(0)
  }

  raw(b: Buffer): this {
    return this.push(b)
  }

  /**
   * Writes a `Name/Type/Size` header plus value, computing `size` from the
   * bytes `writeValue` produces so fixtures cannot drift out of sync.
   */
  property(name: string, type: string, writeHeader: (b: GvasBuilder) => void, writeValue: (b: GvasBuilder) => void): this {
    const value = new GvasBuilder()
    writeValue(value)
    const valueBytes = value.build()

    this.str(name)
    this.str(type)
    this.u64(valueBytes.length)
    writeHeader(this)
    return this.push(valueBytes)
  }

  /** Convenience: a scalar property whose header is just the absent GUID. */
  simple(name: string, type: string, writeValue: (b: GvasBuilder) => void): this {
    return this.property(name, type, (b) => b.noGuid(), writeValue)
  }

  /** Terminates a property set. */
  none(): this {
    return this.str('None')
  }

  build(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

/**
 * Wraps a property body in a valid GVAS header matching what Palworld writes
 * (save version 3, UE 5.1.1), with an empty custom-version table.
 */
export function withGvasHeader(body: Buffer, saveClass = '/Script/Pal.PalWorldSaveGame'): Buffer {
  const b = new GvasBuilder()
  b.raw(Buffer.from('GVAS', 'latin1'))
  b.u32(3) // save game version
  b.u32(522) // package file version UE4
  b.u32(1008) // package file version UE5
  b.u16(5).u16(1).u16(1) // engine major / minor / patch
  b.u32(0) // engine changelist
  b.str('++UE5+Release-5.1') // engine branch
  b.u32(3) // custom version format
  b.u32(0) // custom version count
  b.str(saveClass)
  return Buffer.concat([b.build(), body])
}
