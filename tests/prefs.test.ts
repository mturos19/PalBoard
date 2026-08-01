import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The prefs module reads its location from Electron's userData path. Pointing
 * that at a temp directory is the whole mock — nothing else in Electron is used.
 */
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

const { loadPrefs, savePrefs } = await import('../electron/services/prefs')

const prefsFile = () => join(userData, 'prefs.json')
const writeRaw = (contents: string) => writeFileSync(prefsFile(), contents, 'utf8')

describe('prefs', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'palboard-prefs-'))
  })

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
  })

  it('returns empty preferences when no file exists', () => {
    expect(loadPrefs()).toEqual({})
  })

  it('round-trips the values it stores', () => {
    savePrefs({ lastWorldPath: 'C:\\saves\\world', windowMaximised: true })
    savePrefs({ windowBounds: { x: 10, y: 20, width: 1280, height: 800 } })

    expect(loadPrefs()).toEqual({
      lastWorldPath: 'C:\\saves\\world',
      windowMaximised: true,
      windowBounds: { x: 10, y: 20, width: 1280, height: 800 },
    })
  })

  it.each([
    ['null', 'null'],
    ['a number', '42'],
    ['an array', '[1,2,3]'],
    ['truncated JSON', '{"windowBounds":'],
    ['not JSON at all', 'nonsense'],
  ])('degrades to defaults for %s', (_label, contents) => {
    writeRaw(contents)
    expect(loadPrefs()).toEqual({})
  })

  it('discards fields of the wrong type rather than passing them on', () => {
    // These values go straight to BrowserWindow, where a string width fails at
    // startup with no window left to report the failure in.
    writeRaw(
      JSON.stringify({
        windowBounds: { x: '10', y: 20, width: 1280, height: 800 },
        windowMaximised: 'yes',
        lastWorldPath: 17,
      }),
    )
    expect(loadPrefs()).toEqual({})
  })

  it.each([
    ['a zero-size window', { x: 0, y: 0, width: 0, height: 800 }],
    ['a NaN coordinate', { x: Number.NaN, y: 0, width: 1280, height: 800 }],
    ['a missing field', { x: 0, y: 0, width: 1280 }],
  ])('rejects %s', (_label, windowBounds) => {
    writeRaw(JSON.stringify({ windowBounds, lastWorldPath: 'C:\\keep' }))
    // The bad field is dropped; the good one alongside it survives.
    expect(loadPrefs()).toEqual({ lastWorldPath: 'C:\\keep' })
  })

  it('leaves the previous file intact when a write fails', () => {
    savePrefs({ lastWorldPath: 'C:\\first' })
    const before = readFileSync(prefsFile(), 'utf8')

    // Make the temp file unwritable by turning its path into a directory's.
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('disk full')
    })
    savePrefs({ lastWorldPath: 'C:\\second' })
    spy.mockRestore()

    expect(readFileSync(prefsFile(), 'utf8')).toBe(before)
    expect(loadPrefs().lastWorldPath).toBe('C:\\first')
  })

  it('does not leave a temp file behind', () => {
    savePrefs({ lastWorldPath: 'C:\\world' })
    expect(readdirSync(userData)).toEqual(['prefs.json'])
  })
})
