import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('electron'),
        '@shared': resolve('shared'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('index.html') },
      },
    },
  },
})
