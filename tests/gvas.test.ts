import { describe, expect, it, vi } from 'vitest'
import { FArchiveReader } from '../core/gvas/reader'
import { GvasParseError, parseGvas, parseProperties } from '../core/gvas/parser'
import { GvasBuilder, withGvasHeader } from './helpers/gvasBuilder'

describe('FArchiveReader', () => {
  it('reads ASCII and UTF-16 FStrings, trimming the null terminator', () => {
    const buf = new GvasBuilder().str('Sheepball').strUtf16('新規生成拠点').build()
    const r = new FArchiveReader(buf)
    expect(r.fstring()).toBe('Sheepball')
    expect(r.fstring()).toBe('新規生成拠点')
    expect(r.eof).toBe(true)
  })

  it('reads an empty FString without consuming payload bytes', () => {
    const buf = new GvasBuilder().i32(0).u32(0xdeadbeef).build()
    const r = new FArchiveReader(buf)
    expect(r.fstring()).toBe('')
    expect(r.u32()).toBe(0xdeadbeef)
  })

  it('formats GUIDs using the byte order the Palworld community tooling uses', () => {
    // Raw bytes for PlayerUId 00000000-0000-0000-0000-000000000001.
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    const r = new FArchiveReader(Buffer.from(bytes))
    expect(r.guid()).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('throws rather than returning garbage when the buffer is short', () => {
    const r = new FArchiveReader(Buffer.alloc(2))
    expect(() => r.u32()).toThrow(/exceeds buffer length/)
  })

  it('refuses an element count larger than the remaining bytes could supply', () => {
    // Four bytes of 0xff is a count of 4.29 billion. Reaching `new Array(n)`
    // with that exhausts memory long before any element read can fail.
    const r = new FArchiveReader(Buffer.from([0xff, 0xff, 0xff, 0xff, 1, 2, 3, 4]))
    expect(() => r.tarray((rr) => rr.u8())).toThrow(/exceeds the .* that fit/)
  })

  it('reads a plausible array normally', () => {
    const buf = new GvasBuilder().u32(3).u8(7).u8(8).u8(9).build()
    expect(new FArchiveReader(buf).tarray((r) => r.u8())).toEqual([7, 8, 9])
  })

  it('accounts for element width when bounding a count', () => {
    // 4 GUIDs claimed, but only 16 bytes follow — enough for one.
    const buf = new GvasBuilder().u32(4).raw(Buffer.alloc(16)).build()
    expect(() => new FArchiveReader(buf).tarray((r) => r.guid(), 16)).toThrow(/exceeds the 1 /)
  })

  it('rejects the FString length that has no positive counterpart', () => {
    // -2^31 negated is still -2^31, so a naive `-len` would read backwards.
    const buf = new GvasBuilder().i32(-0x80000000).build()
    expect(() => new FArchiveReader(buf).fstring()).toThrow(/implausible FString length/)
  })

  it('skips an absent optional GUID as a single byte', () => {
    const buf = new GvasBuilder().noGuid().i32(42).build()
    const r = new FArchiveReader(buf)
    r.optionalGuid()
    expect(r.i32()).toBe(42)
  })

  it('skips a present optional GUID as 17 bytes', () => {
    const buf = new GvasBuilder().u8(1).guid().i32(42).build()
    const r = new FArchiveReader(buf)
    r.optionalGuid()
    expect(r.i32()).toBe(42)
  })
})

describe('property parsing', () => {
  const parse = (build: (b: GvasBuilder) => void) => {
    const body = new GvasBuilder()
    build(body)
    body.none()
    return parseProperties(new FArchiveReader(body.build()))
  }

  it('decodes scalar property types to plain JS values', () => {
    const props = parse((b) => {
      b.simple('Level', 'IntProperty', (v) => v.i32(70))
      b.simple('Exp', 'Int64Property', (v) => v.u64(18761972))
      b.simple('FullStomach', 'FloatProperty', (v) => v.f32(91.5))
      b.simple('NickName', 'StrProperty', (v) => v.str('remedy'))
      b.property('IsPlayer', 'BoolProperty', (h) => h.u8(1).noGuid(), () => {})
      b.property('Gender', 'EnumProperty', (h) => h.str('EPalGenderType').noGuid(), (v) =>
        v.str('EPalGenderType::Female'),
      )
    })

    expect(props.Level).toBe(70)
    expect(props.Exp).toBe(18761972n)
    expect(props.FullStomach).toBeCloseTo(91.5, 3)
    expect(props.NickName).toBe('remedy')
    expect(props.IsPlayer).toBe(true)
    expect(props.Gender).toBe('EPalGenderType::Female')
  })

  it('decodes a ByteProperty array as a Buffer (Palworld RawData)', () => {
    const payload = Buffer.from([1, 2, 3, 4, 5])
    const props = parse((b) => {
      b.property('RawData', 'ArrayProperty', (h) => h.str('ByteProperty').noGuid(), (v) =>
        v.u32(payload.length).raw(payload),
      )
    })
    expect(Buffer.isBuffer(props.RawData)).toBe(true)
    expect(props.RawData).toEqual(payload)
  })

  it('decodes a string array', () => {
    const props = parse((b) => {
      b.property('PassiveSkillList', 'ArrayProperty', (h) => h.str('NameProperty').noGuid(), (v) =>
        v.u32(2).str('PAL_ALLAttack_up1').str('CraftSpeed_up3'),
      )
    })
    expect(props.PassiveSkillList).toEqual(['PAL_ALLAttack_up1', 'CraftSpeed_up3'])
  })

  it('decodes a struct with UE5 double-precision vectors', () => {
    const props = parse((b) => {
      b.property(
        'LastJumpedLocation',
        'StructProperty',
        (h) => h.str('Vector').guid().noGuid(),
        (v) => v.f64(-105429.04).f64(40346.005).f64(772.96),
      )
    })
    expect(props.LastJumpedLocation).toEqual({
      x: expect.closeTo(-105429.04, 2),
      y: expect.closeTo(40346.005, 2),
      z: expect.closeTo(772.96, 2),
    })
  })

  it('decodes a map keyed by Guid using a type hint', () => {
    const props = parseProperties(
      new FArchiveReader(
        new GvasBuilder()
          .property(
            'BaseCampSaveData',
            'MapProperty',
            (h) => h.str('StructProperty').str('StructProperty').noGuid(),
            (v) =>
              v
                .u32(0) // reserved
                .u32(1) // entry count
                .guid([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // key
                .simple('state', 'IntProperty', (x) => x.i32(1))
                .none(),
          )
          .none()
          .build(),
      ),
      {
        typeHints: new Map([
          ['.BaseCampSaveData.Key', 'Guid'],
          ['.BaseCampSaveData.Value', 'StructProperty'],
        ]),
      },
    )

    const entries = props.BaseCampSaveData as Array<{ key: unknown; value: unknown }>
    expect(entries).toHaveLength(1)
    expect(entries[0].key).toBe('00000001-0000-0000-0000-000000000000')
    expect(entries[0].value).toEqual({ state: 1 })
  })

  it('parses a full GVAS payload including its header', () => {
    const body = new GvasBuilder().simple('Version', 'IntProperty', (v) => v.i32(100)).none().build()
    const file = parseGvas(withGvasHeader(body))
    expect(file.header.saveGameVersion).toBe(3)
    expect(file.header.engineVersionMajor).toBe(5)
    expect(file.header.saveGameClassName).toBe('/Script/Pal.PalWorldSaveGame')
    expect(file.properties.Version).toBe(100)
  })
})

describe('resilience to format drift', () => {
  it('skips subtrees named in the parse plan and keeps reading afterwards', () => {
    const body = new GvasBuilder()
      .property('Foliage', 'ArrayProperty', (h) => h.str('NameProperty').noGuid(), (v) =>
        v.u32(2).str('Tree').str('Grass'),
      )
      .simple('Day', 'IntProperty', (v) => v.i32(136))
      .none()
      .build()

    const props = parseProperties(new FArchiveReader(body), { skip: new Set(['.Foliage']) })
    expect(props.Foliage).toBeNull()
    // The property after a skipped subtree must still parse.
    expect(props.Day).toBe(136)
  })

  it('recovers from a subtree that fails to parse, and reports it', () => {
    const onError = vi.fn()
    // An array claiming an element type the parser cannot decode.
    const body = new GvasBuilder()
      .property('Broken', 'ArrayProperty', (h) => h.str('FutureProperty').noGuid(), (v) =>
        v.u32(1).raw(Buffer.alloc(8)),
      )
      .simple('Day', 'IntProperty', (v) => v.i32(136))
      .none()
      .build()

    const props = parseProperties(new FArchiveReader(body), { onError })

    expect(props.Broken).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBe('.Broken')
    // Crucially, the rest of the save still reads correctly.
    expect(props.Day).toBe(136)
  })

  it('skips an entirely unknown property type by its declared size', () => {
    const onUnknownType = vi.fn()
    const body = new GvasBuilder()
      .property('Mystery', 'SomeFutureProperty', () => {}, (v) => v.raw(Buffer.alloc(12, 0xab)))
      .simple('Day', 'IntProperty', (v) => v.i32(136))
      .none()
      .build()

    const props = parseProperties(new FArchiveReader(body), { onUnknownType })
    expect(props.Mystery).toBeNull()
    expect(props.Day).toBe(136)
    expect(onUnknownType).toHaveBeenCalledWith('.Mystery', 'unknown:SomeFutureProperty')
  })

  it('rejects a declared property size that runs past the buffer', () => {
    // The recovery path works by seeking to offset+size, so a size the buffer
    // cannot contain has to fail as a typed parse error rather than as a bare
    // RangeError thrown from inside the recovery itself.
    const body = new GvasBuilder()
      .str('Huge')
      .str('StructProperty')
      .u64(0xffff_ffff)
      .str('SomeStruct')
      .guid()
      .noGuid()
      .build()

    expect(() => parseProperties(new FArchiveReader(body))).toThrow(GvasParseError)
    expect(() => parseProperties(new FArchiveReader(body))).toThrow(/runs past the/)
  })

  it('contains an oversized nested size to its own subtree', () => {
    const onError = vi.fn()
    // An outer struct whose size is honest, wrapping an inner one that lies.
    const inner = new GvasBuilder()
      .str('Inner')
      .str('StructProperty')
      .u64(0xffff_ffff)
      .str('SomeStruct')
      .guid()
      .noGuid()
      .build()

    const body = new GvasBuilder()
      .property('Outer', 'StructProperty', (h) => h.str('SomeStruct').guid().noGuid(), (v) =>
        v.raw(inner),
      )
      .simple('Day', 'IntProperty', (v) => v.i32(136))
      .none()
      .build()

    const props = parseProperties(new FArchiveReader(body), { onError })

    expect(props.Outer).toBeNull()
    expect(onError.mock.calls[0][0]).toBe('.Outer')
    // The bad subtree costs one property, not the rest of the save.
    expect(props.Day).toBe(136)
  })

  it('refuses a map entry count the payload could not hold', () => {
    const body = new GvasBuilder()
      .property('Bomb', 'MapProperty', (h) => h.str('IntProperty').str('IntProperty').noGuid(), (v) =>
        v.u32(0).u32(0xffff_ffff),
      )
      .simple('Day', 'IntProperty', (v) => v.i32(136))
      .none()
      .build()

    const onError = vi.fn()
    const props = parseProperties(new FArchiveReader(body), { onError })
    expect(props.Bomb).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
    expect(props.Day).toBe(136)
  })

  it('reports map key/value types it had to guess', () => {
    const onUnknownType = vi.fn()
    parseProperties(
      new FArchiveReader(
        new GvasBuilder()
          .property(
            'Unhinted',
            'MapProperty',
            (h) => h.str('StructProperty').str('StructProperty').noGuid(),
            (v) => v.u32(0).u32(0),
          )
          .none()
          .build(),
      ),
      { onUnknownType },
    )
    expect(onUnknownType).toHaveBeenCalledWith('.Unhinted.Key', 'Guid')
    expect(onUnknownType).toHaveBeenCalledWith('.Unhinted.Value', 'StructProperty')
  })
})
