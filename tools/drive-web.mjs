/**
 * Drives the built web app in a real browser and screenshots every page.
 *
 * This is the only check that exercises the whole browser path at once — the
 * Buffer polyfill, fflate, the Oodle WebAssembly module inside a module worker,
 * the directory-upload source and the React app. A unit test cannot see any of
 * those interact.
 *
 *   node tools/drive-web.mjs <worldDir> [--headed]
 *
 * Run `npm run build:web` first. Screenshots land in shots/ (gitignored).
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const worldDir = process.argv[2]
if (!worldDir) {
  console.error('usage: node tools/drive-web.mjs <worldDir> [--headed]')
  process.exit(1)
}
const headed = process.argv.includes('--headed')
const PORT = 4319
const SHOTS = resolve('shots')

// `shell: true` because on Windows the launcher is a .cmd, which spawn refuses
// to exec directly (EINVAL) since Node 18's command-injection hardening.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
})
// Killing the shell leaves the vite process it spawned holding the port, so on
// Windows the whole tree has to go.
const stop = () => {
  if (server.killed) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}
process.on('exit', stop)
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('preview server did not start')), 30_000)
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('localhost')) {
      clearTimeout(timer)
      res()
    }
  })
  server.stderr.on('data', (chunk) => process.stderr.write(chunk))
})

await mkdir(SHOTS, { recursive: true })
const browser = await chromium.launch({ headless: !headed })
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })

const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: join(SHOTS, 'web-00-landing.png') })

// Upload the world folder through the hidden directory input — the path a
// visitor on Firefox or Safari takes. Playwright wants the directory itself,
// which also exercises the real case: the folder contains the game's `backup/`
// subtree, so this proves the newest Level.sav is the one picked.
console.log(`uploading directory ${worldDir}`)
await page.setInputFiles('input[type=file]', worldDir)

// The parse runs in a worker; wait for the dashboard rather than a fixed sleep.
await page.waitForSelector('text=Day', { timeout: 120_000 })
await page.waitForTimeout(1200)

const pages = [
  ['dashboard', ''],
  ['pals', '#/pals'],
  ['bases', '#/bases'],
  ['inventory', '#/inventory'],
  ['map', '#/map'],
  ['statistics', '#/statistics'],
  ['settings', '#/settings'],
]
let i = 1
for (const [name, hash] of pages) {
  if (hash) await page.goto(`http://localhost:${PORT}/${hash}`)
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(SHOTS, `web-${String(i++).padStart(2, '0')}-${name}.png`) })
  console.log(`  captured ${name}`)
}

/*
 * Tooltip legibility.
 *
 * Recharts colours each tooltip row from the hovered series and falls back to
 * black when it has none — which is every Pie sector, since the colour lives on
 * the Cell. Black on this palette is invisible, so both chart kinds are hovered
 * and the rendered colour is read back out of the DOM rather than eyeballed.
 */
await page.goto(`http://localhost:${PORT}/#/statistics`)
await page.waitForTimeout(800)

/** Moves the pointer onto the donut's ring — its centre is a hole. */
async function hoverDonut() {
  const box = await page.locator('.recharts-pie').first().boundingBox()
  if (!box) return false
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // Between the 52px inner and 84px outer radius, at 3 o'clock.
  await page.mouse.move(cx + 68, cy)
  return true
}

for (const [name, selector] of [
  ['bar', '.recharts-bar-rectangle'],
  ['pie', null],
]) {
  if (selector) {
    const mark = page.locator(selector).first()
    if (!(await mark.count())) continue
    await mark.hover({ force: true })
  } else if (!(await hoverDonut())) {
    continue
  }
  await page.waitForTimeout(400)

  const rows = await page.locator('.recharts-tooltip-item').evaluateAll((nodes) =>
    nodes.map((n) => getComputedStyle(n).color),
  )
  if (rows.length === 0) problems.push(`${name} tooltip did not appear — check is not proving anything`)
  for (const color of rows) {
    const [r, g, b] = color.match(/\d+/g).map(Number)
    if (r + g + b < 120) problems.push(`${name} tooltip row is near-black (${color})`)
  }
  await page.screenshot({ path: join(SHOTS, `web-08-tooltip-${name}.png`) })
  console.log(`  checked ${name} tooltip (${rows.length} row(s): ${rows.join(', ') || 'none'})`)
}

// The phone layout: the sidebar is replaced by a tab bar below md.
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`http://localhost:${PORT}/#/`)
await page.waitForTimeout(700)
await page.screenshot({ path: join(SHOTS, 'web-09-mobile-dashboard.png') })
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
if (overflow > 2) problems.push(`page scrolls horizontally on a 390px viewport (+${overflow}px)`)
console.log(`  captured mobile (horizontal overflow ${overflow}px)`)

// Back to desktop width for the persistence checks below.
await page.setViewportSize({ width: 1440, height: 940 })

/*
 * Persistence: a reload must land straight back on the dashboard, from the copy
 * in IndexedDB, without the folder being picked again. This is the whole point
 * of the storage layer and nothing short of a real reload proves it.
 */
await page.goto(`http://localhost:${PORT}/#/`)
await page.waitForTimeout(600)
const goldBefore = await page.locator('text=GOLD').locator('..').innerText()

await page.reload({ waitUntil: 'networkidle' })
try {
  await page.waitForSelector('text=Day', { timeout: 60_000 })
} catch {
  problems.push('reload did not restore the save — landed back on the landing page')
}
const goldAfter = await page.locator('text=GOLD').locator('..').innerText().catch(() => '')
if (goldBefore !== goldAfter) {
  problems.push(`restored world differs: "${goldBefore.replace(/\n/g, ' ')}" -> "${goldAfter.replace(/\n/g, ' ')}"`)
}
await page.screenshot({ path: join(SHOTS, 'web-10-after-reload.png') })
console.log(`  reload restored the save (${goldAfter.replace(/\n/g, ' ')})`)

// ...and "forget" must actually erase it, not just close the tab's copy.
await page.goto(`http://localhost:${PORT}/#/settings`)
await page.waitForTimeout(600)
await page.locator('button:has-text("Forget this save")').click()
await page.waitForTimeout(800)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const backToLanding = await page.locator('text=Drop your Palworld save folder here').count()
if (backToLanding === 0) problems.push('forget did not erase the stored save — it came back after reload')
else console.log('  forget erased the stored save')
await page.screenshot({ path: join(SHOTS, 'web-11-after-forget.png') })


await browser.close()
stop()

if (problems.length) {
  console.error(`\n${problems.length} browser problem(s):`)
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\nno console errors; screenshots in shots/')
