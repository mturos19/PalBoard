import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SaveWatcher } from '../electron/watcher'

/** Resolves with the files from the next `change`, or null if none arrives. */
function nextChange(watcher: SaveWatcher, withinMs: number): Promise<string[] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      watcher.off('change', onChange)
      resolve(null)
    }, withinMs)
    const onChange = (files: string[]) => {
      clearTimeout(timer)
      resolve(files)
    }
    watcher.once('change', onChange)
  })
}

describe('SaveWatcher', () => {
  let dir: string
  let watcher: SaveWatcher

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'palboard-watch-'))
    // Short timings keep the suite quick; the defaults are tuned for autosaves.
    // The debounce stays well above the stability threshold, matching the real
    // ratio — the point of the debounce is to span the whole burst's settling.
    watcher = new SaveWatcher({ stabilityThresholdMs: 40, pollIntervalMs: 10, debounceMs: 300 })
  })

  afterEach(async () => {
    await watcher.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('coalesces the burst of .sav writes one autosave produces into one event', async () => {
    await watcher.start(dir)
    const change = nextChange(watcher, 3000)

    // Palworld touches Level.sav, LevelMeta.sav and WorldOption.sav in quick
    // succession; a naive watcher reports three saves instead of one.
    await writeFile(join(dir, 'Level.sav'), 'a')
    await writeFile(join(dir, 'LevelMeta.sav'), 'b')
    await writeFile(join(dir, 'WorldOption.sav'), 'c')

    const files = await change
    expect(files).not.toBeNull()
    // One event carrying the whole burst, not one event per file.
    expect(files!.map((f) => basename(f)).sort()).toEqual([
      'Level.sav',
      'LevelMeta.sav',
      'WorldOption.sav',
    ])
    expect(await nextChange(watcher, 600)).toBeNull()
  })

  it('sees player saves one level down', async () => {
    await mkdir(join(dir, 'Players'), { recursive: true })
    await watcher.start(dir)
    const change = nextChange(watcher, 3000)
    await writeFile(join(dir, 'Players', '9A699B5E000000000000000000000000.sav'), 'x')
    expect(await change).not.toBeNull()
  })

  it('ignores the game\'s own backup folder', async () => {
    await mkdir(join(dir, 'backup'), { recursive: true })
    await watcher.start(dir)
    const change = nextChange(watcher, 800)
    await writeFile(join(dir, 'backup', 'Level.sav'), 'x')
    expect(await change).toBeNull()
  })

  it('ignores files that are not saves', async () => {
    await watcher.start(dir)
    const change = nextChange(watcher, 600)
    await writeFile(join(dir, 'notes.txt'), 'x')
    expect(await change).toBeNull()
  })

  it('ignores the damage-statistics files the loader does not read', async () => {
    await mkdir(join(dir, 'Players'), { recursive: true })
    await watcher.start(dir)
    const change = nextChange(watcher, 800)
    await writeFile(join(dir, 'Players', '9A699B5E000000000000000000000000_dps.sav'), 'x')
    // Re-parsing for these would produce a snapshot identical to the last one.
    expect(await change).toBeNull()
  })

  it('resolves start() even for a folder that does not exist', async () => {
    // start() sits in the path of selecting a world. If it can hang, the app
    // hangs on an empty screen with no way back.
    await expect(watcher.start(join(dir, 'no-such-world'))).resolves.toBeUndefined()
    expect(watcher.watching).toBe(true)
  })

  it('replaces the previous watch rather than stacking watchers', async () => {
    const second = await mkdtemp(join(tmpdir(), 'palboard-watch-'))
    try {
      await watcher.start(dir)
      await watcher.start(second)

      // A write to the abandoned folder must no longer be reported.
      const change = nextChange(watcher, 600)
      await writeFile(join(dir, 'Level.sav'), 'a')
      expect(await change).toBeNull()
    } finally {
      await rm(second, { recursive: true, force: true })
    }
  })

  it('is safe to stop when never started, and to stop twice', async () => {
    const idle = new SaveWatcher()
    await expect(idle.stop()).resolves.toBeUndefined()
    await watcher.start(dir)
    await watcher.stop()
    await expect(watcher.stop()).resolves.toBeUndefined()
    expect(watcher.watching).toBe(false)
  })
})
