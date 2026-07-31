/** Renderer-local UI state: selected pal drawer, command palette, prefs. */
import { create } from 'zustand'

export type Accent = 'blue' | 'violet' | 'mint' | 'amber'

interface UiStore {
  /** Instance id of the pal open in the detail drawer. */
  selectedPalId: string | null
  paletteOpen: boolean
  accent: Accent
  notificationsEnabled: boolean
  openPal(instanceId: string): void
  closePal(): void
  setPaletteOpen(open: boolean): void
  setAccent(accent: Accent): void
  setNotificationsEnabled(enabled: boolean): void
}

const readAccent = (): Accent => {
  const v = localStorage.getItem('palboard.accent')
  return v === 'violet' || v === 'mint' || v === 'amber' ? v : 'blue'
}

function applyAccent(accent: Accent): void {
  if (accent === 'blue') document.documentElement.removeAttribute('data-accent')
  else document.documentElement.setAttribute('data-accent', accent)
}

applyAccent(readAccent())

export const useUiStore = create<UiStore>((set) => ({
  selectedPalId: null,
  paletteOpen: false,
  accent: readAccent(),
  notificationsEnabled: localStorage.getItem('palboard.notifications') !== 'off',

  openPal: (instanceId) => set({ selectedPalId: instanceId, paletteOpen: false }),
  closePal: () => set({ selectedPalId: null }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setAccent: (accent) => {
    localStorage.setItem('palboard.accent', accent)
    applyAccent(accent)
    set({ accent })
  },
  setNotificationsEnabled: (enabled) => {
    localStorage.setItem('palboard.notifications', enabled ? 'on' : 'off')
    set({ notificationsEnabled: enabled })
  },
}))
