import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Web build — the hosted, browser-only PalBoard.
 *
 * The save is parsed entirely in the page: `core/` has no filesystem
 * dependency, `fflate` replaces `node:zlib`, and Oodle is a WebAssembly module.
 * Nothing is uploaded, so this config produces a plain static site that any
 * host can serve from disk.
 *
 * (`electron.vite.config.ts` still drives the desktop build; this file is also
 * what gives `vite-node tools/*.ts` its path aliases.)
 */
export default defineConfig({
  // Relative asset URLs, so the same `dist/` works whether it is served from a
  // domain root or a subpath like GitHub Pages' /<repo>/. Routing is hash-based
  // for the same reason: no host-specific rewrite rules to get wrong.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@shared': resolve('shared'),
      '@core': resolve('core'),
      // The GVAS reader is written against Buffer's typed accessors. The
      // userland polyfill is a Uint8Array subclass, so it costs a shim rather
      // than a rewrite of the parser.
      buffer: 'buffer/',
    },
  },
  // `ooz-wasm` ships a top-level-await ESM module; the worker that loads it
  // needs a target where that is legal.
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  worker: { format: 'es' },
  optimizeDeps: { include: ['buffer'] },
})
