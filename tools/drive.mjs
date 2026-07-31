/**
 * Dev utility: launches the built PalBoard app and drives every page.
 * Run with `node tools/drive.mjs` after `npm run build`.
 */
import { mkdirSync } from 'node:fs'
import { _electron as electron } from 'playwright'

const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

// Some shells export ELECTRON_RUN_AS_NODE=1, which makes the Electron binary
// behave as plain Node. Strip it so we launch a real Electron process.
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
console.log('waiting for save to load…')
await win.waitForSelector('text=Species caught', { timeout: 60_000 })
await win.waitForTimeout(700)
console.log('title:', await win.title())

const shot = async (name) => {
  await win.waitForTimeout(450)
  await win.screenshot({ path: `${SHOTS}/${name}.png` })
  console.log('shot:', name)
}

// --- Dashboard ---------------------------------------------------------------
await shot('01-dashboard')

// --- Pals + drawer -----------------------------------------------------------
await win.click('a[href="#/pals"]')
await win.waitForSelector('input[placeholder*="Search"]')
await shot('02-pals')
// Open the first row's drawer.
await win.locator('.absolute.inset-x-0').first().click()
await win.waitForSelector('text=Individual values')
await shot('03-pal-drawer')
await win.keyboard.press('Escape')

// --- Inventory ---------------------------------------------------------------
await win.click('a[href="#/inventory"]')
await win.waitForSelector('text=World storage')
await shot('04-inventory')
await win.fill('input[placeholder*="Search items"]', 'sphere')
await shot('05-inventory-search')
await win.fill('input[placeholder*="Search items"]', '')

// --- Map ---------------------------------------------------------------------
await win.click('a[href="#/map"]')
await win.waitForSelector('text=bases')
await shot('06-map')

// --- Statistics --------------------------------------------------------------
await win.click('a[href="#/statistics"]')
await win.waitForSelector('text=Level distribution')
await win.waitForTimeout(900) // recharts animation
await shot('07-statistics')

// --- Command palette ---------------------------------------------------------
await win.keyboard.press('Control+k')
await win.waitForSelector('input[placeholder*="Search pals"]')
await win.fill('input[placeholder*="Search pals"]', 'blaze')
await shot('08-palette')
await win.keyboard.press('Escape')

// --- Alerts bell -------------------------------------------------------------
await win.click('button[title="Alerts"]')
await shot('09-alerts')
await win.keyboard.press('Escape')

// --- Settings ----------------------------------------------------------------
await win.click('a[href="#/settings"]')
await win.waitForSelector('text=Appearance')
await shot('10-settings')

console.log('\nconsole errors:', errors.length ? errors : 'none')
await app.close()
console.log('done —', SHOTS)
