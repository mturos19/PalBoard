/**
 * Buffer, in the browser.
 *
 * The GVAS reader is written against Buffer's typed accessors (`readUInt32LE`,
 * `toString('latin1')`). The userland polyfill is a Uint8Array subclass, so
 * making it global costs one shim instead of rewriting the parser — and keeps a
 * single parser serving both the desktop app and the web build.
 *
 * Imported for its side effect, before anything that touches `core/`.
 */
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer
}
