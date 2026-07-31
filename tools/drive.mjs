/**
 * Dev utility: launches the built PalBoard app and drives it like a user.
 * Run with `node tools/drive.mjs` after `npm run build`.
 */
import { mkdirSync } from 'node:fs'
import { _electron as electron } from 'playwright'

const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

// Some shells export ELECTRON_RUN_AS_NODE=1, which makes the Electron binary
// behave as plain Node — `require('electron')` then returns a path string and
// `app` is undefined. Strip it so we launch a real Electron process.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['.'], env })
const win = await app.firstWindow()

const errors = []
win.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await win.waitForLoadState('domcontentloaded')

// The dashboard only appears once main has parsed the save and pushed state.
console.log('waiting for save to load…')
await win.waitForSelector('text=Day', { timeout: 60_000 })
await win.waitForTimeout(600) // let entrance animations settle

const title = await win.title()
console.log('window title:', title)

const readStat = async (label) => {
  const el = win.locator(`p:text-is("${label}")`).first()
  if ((await el.count()) === 0) return null
  return (await el.locator('xpath=following-sibling::p[1]').textContent())?.trim()
}

console.log('\n--- dashboard stat cards ---')
for (const label of ['Day', 'Pals', 'Bases', 'Workers', 'Alphas', 'Guild']) {
  console.log(`  ${label.padEnd(8)} ${await readStat(label)}`)
}

console.log('\nworld heading:', (await win.locator('header h1').textContent())?.trim())
console.log('sync pill    :', (await win.locator('header button').last().textContent())?.trim())
await win.screenshot({ path: `${SHOTS}/01-dashboard.png` })

// --- Pals page: search + virtualization -------------------------------------
await win.click('a[href="#/pals"]')
await win.waitForSelector('input[placeholder*="Search"]')
await win.waitForTimeout(400)
console.log('\npals count label:', (await win.locator('text=/ of /').first().textContent())?.trim())
const rowCount = await win.locator('.absolute.inset-x-0').count()
console.log('rendered rows (virtualized):', rowCount)
await win.screenshot({ path: `${SHOTS}/02-pals.png` })

await win.fill('input[placeholder*="Search"]', 'kelpie')
await win.waitForTimeout(500)
console.log('after search "kelpie":', (await win.locator('text=/ of /').first().textContent())?.trim())
await win.screenshot({ path: `${SHOTS}/03-pals-search.png` })

// Filter chip
await win.fill('input[placeholder*="Search"]', '')
await win.click('button:text-is("Alpha")')
await win.waitForTimeout(400)
console.log('after Alpha filter:', (await win.locator('text=/ of /').first().textContent())?.trim())
await win.screenshot({ path: `${SHOTS}/04-pals-alpha.png` })

// --- Bases page --------------------------------------------------------------
await win.click('a[href="#/bases"]')
await win.waitForTimeout(600)
const baseCards = await win.locator('h2').allTextContents()
console.log('\nbase cards:', baseCards.join(', '))
await win.screenshot({ path: `${SHOTS}/05-bases.png` })

// --- Settings ----------------------------------------------------------------
await win.click('a[href="#/settings"]')
await win.waitForTimeout(600)
await win.screenshot({ path: `${SHOTS}/06-settings.png` })

console.log('\nconsole errors:', errors.length ? errors : 'none')
await app.close()
console.log('screenshots written to', SHOTS)
