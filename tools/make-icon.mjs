/**
 * Generates the PalBoard app icon — a pal-sphere over a dark rounded square —
 * with no image tooling: draws RGBA pixels, encodes PNG by hand (zlib deflate
 * + CRC32), and wraps the 256px PNG in an ICO container (valid for Vista+).
 *
 * Outputs: resources/icon.png (window icon) and build/icon.ico (installer).
 * Run with `node tools/make-icon.mjs`.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

// --- tiny PNG encoder ---------------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  // Raw scanlines with filter byte 0.
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- drawing (supersampled 4x for clean anti-aliasing) ------------------------

const SIZE = 256
const SS = 4
const W = SIZE * SS

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t))

// Palette matches the app theme.
const BG_TOP = [26, 34, 56]
const BG_BOTTOM = [11, 13, 18]
const TOP_A = [75, 156, 255] // accent blue
const TOP_B = [138, 116, 250] // violet
const BOTTOM_A = [236, 239, 246]
const BOTTOM_B = [186, 192, 206]
const BAND = [16, 19, 27]

function drawPixel(x, y) {
  // Coordinates in [0,1] with y down.
  const u = x / W
  const v = y / W

  // Rounded-square background.
  const r = 0.16
  const cx = Math.min(Math.max(u, r), 1 - r)
  const cy = Math.min(Math.max(v, r), 1 - r)
  const dCorner = Math.hypot(u - cx, v - cy)
  if (dCorner > r) return [0, 0, 0, 0]
  let rgb = mix(BG_TOP, BG_BOTTOM, v)

  // Sphere.
  const scx = 0.5
  const scy = 0.5
  const R = 0.335
  const d = Math.hypot(u - scx, v - scy)
  if (d < R) {
    const bandHalf = 0.045
    const dy = v - scy
    if (Math.abs(dy) < bandHalf) {
      rgb = BAND
    } else if (dy < 0) {
      // Top hemisphere: diagonal accent gradient with a soft highlight.
      const t = (u - (scx - R)) / (2 * R)
      rgb = mix(TOP_A, TOP_B, Math.min(Math.max(t, 0), 1))
      const hl = Math.hypot(u - (scx - 0.1), v - (scy - 0.17)) / 0.28
      if (hl < 1) rgb = mix([255, 255, 255], rgb, 0.35 + 0.65 * hl)
    } else {
      const t = (v - scy) / R
      rgb = mix(BOTTOM_A, BOTTOM_B, t)
    }
    // Centre button.
    if (d < 0.088) rgb = BAND
    if (d < 0.062) {
      const t = (v - (scy - 0.06)) / 0.12
      rgb = mix([245, 247, 252], [196, 202, 216], Math.min(Math.max(t, 0), 1))
    }
    // Sphere rim shading.
    if (d > R - 0.012) rgb = mix(rgb, [8, 10, 15], (d - (R - 0.012)) / 0.012 * 0.6)
  }

  return [rgb[0], rgb[1], rgb[2], 255]
}

console.log('rendering 256px icon (4x supersampled)…')
const hi = new Float64Array(W * W * 4)
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = drawPixel(x + 0.5, y + 0.5)
    const i = (y * W + x) * 4
    hi[i] = r; hi[i + 1] = g; hi[i + 2] = b; hi[i + 3] = a
  }
}

// Box-filter downsample.
const rgba = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0, 0]
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + x * SS + sx) * 4
        acc[0] += hi[i]; acc[1] += hi[i + 1]; acc[2] += hi[i + 2]; acc[3] += hi[i + 3]
      }
    }
    const o = (y * SIZE + x) * 4
    const n = SS * SS
    rgba[o] = acc[0] / n; rgba[o + 1] = acc[1] / n; rgba[o + 2] = acc[2] / n; rgba[o + 3] = acc[3] / n
  }
}

const png = encodePng(rgba, SIZE, SIZE)

// --- ICO wrapper (single 256px PNG entry) -------------------------------------
const ico = Buffer.alloc(6 + 16)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // count
ico[6] = 0 // width 256 -> 0
ico[7] = 0 // height 256 -> 0
ico[8] = 0 // palette
ico[9] = 0 // reserved
ico.writeUInt16LE(1, 10) // planes
ico.writeUInt16LE(32, 12) // bpp
ico.writeUInt32LE(png.length, 14) // bytes
ico.writeUInt32LE(22, 18) // offset

mkdirSync('resources', { recursive: true })
mkdirSync('build', { recursive: true })
writeFileSync('resources/icon.png', png)
writeFileSync('build/icon.ico', Buffer.concat([ico, png]))
console.log(`resources/icon.png (${png.length} bytes), build/icon.ico written`)
