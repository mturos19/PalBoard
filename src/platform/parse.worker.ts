/**
 * Parsing worker.
 *
 * Decompressing and walking a 32 MB GVAS tree takes a few hundred milliseconds.
 * On the main thread that is a visible freeze on every autosave, so the whole
 * pipeline runs here and only the finished domain snapshot crosses back.
 *
 * The world handle itself is structured-cloneable — File objects and
 * FileSystemDirectoryHandles both survive postMessage — so the bytes are read
 * inside the worker rather than shipped in.
 */
import '../platform/polyfills'
import { loadWorld } from '@core/loader'
import { computeStats } from '@core/palworld/model'
import { preloadOodle } from '@core/compression'
import type { DashboardStats, SaveSnapshot } from '@shared/domain'
import { worldSourceFor, type WorldHandle } from './worldSource'

export interface ParseRequest {
  id: number
  handle: WorldHandle
}

export type ParseResponse =
  | { id: number; ok: true; snapshot: SaveSnapshot; stats: DashboardStats }
  | { id: number; ok: false; error: string }

// Instantiating the Oodle WASM module is a one-off cost; start it as the worker
// boots so the first parse does not wait for it.
void preloadOodle()

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, handle } = event.data
  try {
    const snapshot = await loadWorld(worldSourceFor(handle))
    const response: ParseResponse = { id, ok: true, snapshot, stats: computeStats(snapshot) }
    self.postMessage(response)
  } catch (err) {
    const response: ParseResponse = { id, ok: false, error: (err as Error).message }
    self.postMessage(response)
  }
}
