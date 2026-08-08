import type { WebApi } from '@/platform/webApi'

declare global {
  interface Window {
    /**
     * The app's only privileged surface.
     *
     * On the web this is `createWebApi()`, installed before React mounts; the
     * desktop build injects the same shape from the preload bridge. Pages talk
     * to this and never to a platform API directly.
     */
    palboard: WebApi
  }
}

export {}
