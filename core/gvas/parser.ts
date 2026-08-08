/**
 * Generic GVAS (Unreal Engine SaveGame) property parser.
 *
 * Deliberately knows nothing about Palworld: it decodes UE property types and
 * leaves game-specific `RawData` blobs as `Buffer`s for the domain layer. The
 * only Palworld-shaped concession is the {@link ParsePlan}, which supplies map
 * key/value struct types the format itself does not record.
 *
 * Resilience: property sizes are authoritative, so an unrecognised struct type
 * degrades to a nested property walk rather than a hard failure, and unknown
 * property types are skipped by their declared size instead of desynchronising
 * the whole stream. That keeps parsing working across Palworld updates.
 */
import { FArchiveReader } from './reader'
import type { GvasFile, GvasHeader, MapEntry, ParsePlan, PropStruct, PropValue } from './types'

const GVAS_MAGIC = 0x53415647 // 'GVAS' little-endian

export class GvasParseError extends Error {
  constructor(
    message: string,
    readonly path?: string,
  ) {
    super(path ? `${message} (at ${path})` : message)
    this.name = 'GvasParseError'
  }
}

export function parseGvasHeader(r: FArchiveReader): GvasHeader {
  const magic = r.u32()
  if (magic !== GVAS_MAGIC) {
    throw new GvasParseError(
      `not a GVAS payload: magic was 0x${magic.toString(16)}, expected 0x${GVAS_MAGIC.toString(16)}`,
    )
  }

  const saveGameVersion = r.u32()
  const packageFileVersionUE4 = r.u32()
  const packageFileVersionUE5 = r.u32()
  const engineVersionMajor = r.u16()
  const engineVersionMinor = r.u16()
  const engineVersionPatch = r.u16()
  const engineVersionChangelist = r.u32()
  const engineVersionBranch = r.fstring()
  const customVersionFormat = r.u32()

  // 16-byte GUID + int32 per entry; bounded so a corrupt count cannot allocate.
  const customVersions = r.tarray((rr) => ({ guid: rr.guid(), version: rr.i32() }), 20)

  const saveGameClassName = r.fstring()

  return {
    saveGameVersion,
    packageFileVersionUE4,
    packageFileVersionUE5,
    engineVersionMajor,
    engineVersionMinor,
    engineVersionPatch,
    engineVersionChangelist,
    engineVersionBranch,
    customVersionFormat,
    customVersions,
    saveGameClassName,
    bodyOffset: r.offset,
  }
}

/** Parses a full GVAS payload: header followed by the root property set. */
export function parseGvas(gvas: Buffer, plan: ParsePlan = {}): GvasFile {
  const r = new FArchiveReader(gvas)
  const header = parseGvasHeader(r)
  const properties = new GvasReader(r, plan).propertiesUntilNone('')
  return { header, properties }
}

/**
 * Parses a headerless property stream from an existing cursor.
 *
 * Palworld stores several structures as opaque `RawData` byte blobs whose
 * payload is itself a UE property set; this is the entry point for decoding
 * them. The reader is advanced past the `None` terminator.
 */
export function parseProperties(r: FArchiveReader, plan: ParsePlan = {}, path = ''): PropStruct {
  return new GvasReader(r, plan).propertiesUntilNone(path)
}

class GvasReader {
  private readonly skip: ReadonlySet<string>
  private readonly hints: ReadonlyMap<string, string>

  constructor(
    private readonly r: FArchiveReader,
    private readonly plan: ParsePlan,
  ) {
    this.skip = plan.skip ?? EMPTY_SET
    this.hints = plan.typeHints ?? EMPTY_MAP
  }

  /** Reads `Name/Type/Size` triples until the `None` terminator. */
  propertiesUntilNone(path: string): PropStruct {
    const out: PropStruct = {}
    for (;;) {
      const name = this.r.fstring()
      if (name === 'None' || name === '') break
      const typeName = this.r.fstring()
      const size = this.r.u64AsNumber()
      out[name] = this.property(typeName, size, `${path}.${name}`)
    }
    return out
  }

  /**
   * Decodes one property value.
   *
   * `size` is the byte count from immediately after the optional property GUID
   * to the end of the value — uniform across UE property types, which is what
   * makes both skipping and error recovery possible.
   */
  property(typeName: string, size: number, path: string): PropValue {
    const r = this.r
    switch (typeName) {
      case 'IntProperty':
        r.optionalGuid()
        return r.i32()
      case 'Int8Property':
        r.optionalGuid()
        return r.u8() << 24 >> 24
      case 'Int16Property':
        r.optionalGuid()
        return r.i16()
      case 'UInt16Property':
        r.optionalGuid()
        return r.u16()
      case 'UInt32Property':
        r.optionalGuid()
        return r.u32()
      case 'Int64Property':
        r.optionalGuid()
        return r.i64()
      case 'UInt64Property':
        r.optionalGuid()
        return r.u64()
      case 'FixedPoint64Property':
        r.optionalGuid()
        return r.i32()
      case 'FloatProperty':
        r.optionalGuid()
        return r.f32()
      case 'DoubleProperty':
        r.optionalGuid()
        return r.f64()
      case 'StrProperty':
      case 'NameProperty':
      case 'SoftObjectProperty':
      case 'ObjectProperty':
        r.optionalGuid()
        return r.fstring()
      case 'BoolProperty': {
        // The value byte precedes the optional GUID and is not counted in size.
        const v = r.bool()
        r.optionalGuid()
        return v
      }
      case 'EnumProperty': {
        r.fstring() // enum type name — recoverable from the value itself
        r.optionalGuid()
        return r.fstring()
      }
      case 'ByteProperty': {
        const enumType = r.fstring()
        r.optionalGuid()
        return enumType === 'None' ? r.u8() : r.fstring()
      }
      case 'StructProperty': {
        const structType = r.fstring()
        r.skip(16) // struct id — unused when reading
        r.optionalGuid()
        return this.maybeSkip(size, path, () => this.structValue(structType, path))
      }
      case 'ArrayProperty': {
        const arrayType = r.fstring()
        r.optionalGuid()
        return this.maybeSkip(size, path, () => this.arrayProperty(arrayType, size - 4, path))
      }
      case 'SetProperty': {
        const elemType = r.fstring()
        r.optionalGuid()
        return this.maybeSkip(size, path, () => {
          r.u32() // count of removed elements — always 0 in save data
          const count = r.count()
          const structType = elemType === 'StructProperty' ? this.hintFor(path, 'Guid') : ''
          const out: PropValue[] = new Array(count)
          for (let i = 0; i < count; i++) {
            out[i] = structType ? this.structValue(structType, path) : this.arrayElement(elemType, path)
          }
          return out
        })
      }
      case 'MapProperty': {
        const keyType = r.fstring()
        const valueType = r.fstring()
        r.optionalGuid()
        return this.maybeSkip(size, path, () => this.mapProperty(keyType, valueType, path))
      }
      default:
        // Unknown property type: trust the declared size and skip it rather than
        // corrupting the read position for every property that follows.
        this.plan.onUnknownType?.(path, `unknown:${typeName}`)
        r.seek(this.endOf(size, path))
        return null
    }
  }

  /**
   * Resolves a property's declared end offset, rejecting sizes that run past the
   * buffer.
   *
   * `size` is eight bytes of untrusted data. Every recovery path here works by
   * seeking to `offset + size`, so a nonsensical value would turn the parser's
   * safety net into the thing that throws — and it would throw a bare
   * `RangeError` from inside a `catch`, escaping the recovery entirely. Checking
   * up front keeps the failure a typed, path-tagged parse error.
   */
  private endOf(size: number, path: string): number {
    const end = this.r.offset + size
    if (!Number.isSafeInteger(size) || size < 0 || end > this.r.buf.length) {
      throw new GvasParseError(
        `declared property size ${size} at offset ${this.r.offset} runs past the ${this.r.buf.length}-byte buffer`,
        path,
      )
    }
    return end
  }

  /**
   * Runs `parse`, or seeks past `size` bytes when the plan excludes this path.
   *
   * This is the parser's resilience boundary. Because every container property
   * declares its own byte length, we can always restore the cursor to the
   * property's true end — whether the inner parse under-read, over-read, or
   * threw outright. A subtree Palworld reshaped in a patch therefore costs us
   * that one subtree, not the entire save.
   */
  private maybeSkip(size: number, path: string, parse: () => PropValue): PropValue {
    const end = this.endOf(size, path)

    if (this.skip.has(path)) {
      this.r.seek(end)
      return null
    }

    try {
      const value = parse()
      if (this.r.offset !== end) this.r.seek(end)
      return value
    } catch (err) {
      this.plan.onError?.(path, err instanceof Error ? err : new Error(String(err)))
      this.r.seek(end)
      return null
    }
  }

  private structValue(structType: string, path: string): PropValue {
    const r = this.r
    switch (structType) {
      case 'Vector':
        return r.vector()
      case 'Quat':
        return r.quat()
      case 'Rotator':
        return r.vector()
      case 'DateTime':
        return r.u64()
      case 'Guid':
        return r.guid()
      case 'LinearColor':
        return { r: r.f32(), g: r.f32(), b: r.f32(), a: r.f32() }
      default:
        // Everything else is a nested property set. This is the resilient path:
        // struct types added by a future patch parse correctly without changes.
        return this.propertiesUntilNone(path)
    }
  }

  private arrayProperty(arrayType: string, payloadSize: number, path: string): PropValue {
    const r = this.r
    const count = r.count()

    if (arrayType === 'StructProperty') {
      // Struct arrays repeat a full property header once, then pack the values.
      const propName = r.fstring()
      r.fstring() // property type — always StructProperty here
      r.u64AsNumber() // total payload size — the outer size already bounds us
      const structType = r.fstring()
      r.skip(16) // struct id
      r.skip(1) // terminator
      const itemPath = `${path}.${propName}`
      const out: PropValue[] = new Array(count)
      for (let i = 0; i < count; i++) out[i] = this.structValue(structType, itemPath)
      return out
    }

    if (arrayType === 'ByteProperty') {
      // A byte array whose payload exactly matches its count is plain bytes —
      // this is how Palworld stores every RawData blob.
      if (payloadSize === count) return Buffer.from(r.bytes(count))
      throw new GvasParseError('labelled ByteProperty arrays are not supported', path)
    }

    const out: PropValue[] = new Array(count)
    for (let i = 0; i < count; i++) out[i] = this.arrayElement(arrayType, path)
    return out
  }

  private arrayElement(arrayType: string, path: string): PropValue {
    const r = this.r
    switch (arrayType) {
      case 'EnumProperty':
      case 'NameProperty':
      case 'StrProperty':
        return r.fstring()
      case 'Guid':
        return r.guid()
      case 'IntProperty':
        return r.i32()
      case 'Int64Property':
        return r.i64()
      case 'FloatProperty':
        return r.f32()
      case 'DoubleProperty':
        return r.f64()
      case 'BoolProperty':
        return r.bool()
      default:
        throw new GvasParseError(`unsupported array element type ${arrayType}`, path)
    }
  }

  private mapProperty(keyType: string, valueType: string, path: string): PropValue {
    const r = this.r
    r.u32() // unknown/reserved, always 0
    // A key and a value cannot both fit in fewer than two bytes.
    const count = r.count(2)

    const keyPath = `${path}.Key`
    const valuePath = `${path}.Value`
    // The format does not record the struct type of map keys/values, so it comes
    // from the parse plan. Guid keys and nested-property values are the norm.
    const keyStructType = keyType === 'StructProperty' ? this.hintFor(keyPath, 'Guid') : ''
    const valueStructType =
      valueType === 'StructProperty' ? this.hintFor(valuePath, 'StructProperty') : ''

    const out: MapEntry[] = new Array(count)
    for (let i = 0; i < count; i++) {
      const key = this.mapValue(keyType, keyStructType, keyPath)
      const value = this.mapValue(valueType, valueStructType, valuePath)
      out[i] = { key, value }
    }
    return out
  }

  private hintFor(path: string, fallback: string): string {
    const hint = this.hints.get(path)
    if (hint !== undefined) return hint
    this.plan.onUnknownType?.(path, fallback)
    return fallback
  }

  private mapValue(typeName: string, structType: string, path: string): PropValue {
    const r = this.r
    switch (typeName) {
      case 'StructProperty':
        // 'StructProperty' as a struct type means "a nested property set".
        return structType === 'StructProperty'
          ? this.propertiesUntilNone(path)
          : this.structValue(structType, path)
      case 'EnumProperty':
      case 'NameProperty':
      case 'StrProperty':
        return r.fstring()
      case 'IntProperty':
        return r.i32()
      case 'Int64Property':
        return r.i64()
      case 'FloatProperty':
        return r.f32()
      case 'BoolProperty':
        return r.bool()
      case 'ByteProperty':
        return r.u8()
      default:
        throw new GvasParseError(`unsupported map value type ${typeName}`, path)
    }
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const EMPTY_MAP: ReadonlyMap<string, string> = new Map()
