import type { PalBoardApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Injected by the preload bridge; the renderer's only privileged surface. */
    palboard: PalBoardApi
  }
}

export {}
