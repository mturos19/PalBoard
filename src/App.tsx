import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CommandPalette } from './components/CommandPalette'
import { PalDrawer } from './components/PalDrawer'
import { BasesPage } from './pages/BasesPage'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { MapPage } from './pages/MapPage'
import { PalsPage } from './pages/PalsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { WelcomePage } from './pages/WelcomePage'
import { connectSync, useSyncStore } from './stores/syncStore'
import { useUiStore } from './stores/uiStore'

export function App() {
  const hydrated = useSyncStore((s) => s.hydrated)
  const worldPath = useSyncStore((s) => s.worldPath)
  const status = useSyncStore((s) => s.status)

  // Subscribe to main-process state for the lifetime of the app.
  useEffect(() => connectSync(), [])
  useGlobalShortcuts()
  useAlertNotifications()

  if (!hydrated) return <BootScreen />

  // No world selected yet: onboarding takes over the whole window.
  if (!worldPath && status !== 'loading') return <WelcomePage />

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pals" element={<PalsPage />} />
          <Route path="/bases" element={<BasesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <CommandPalette />
      <PalDrawer />
    </>
  )
}

function useGlobalShortcuts() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const reload = useSyncStore((s) => s.reload)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        // Reload the save, not the window.
        e.preventDefault()
        void reload()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen, reload])
}

/**
 * Raises OS notifications for critical alerts that appeared since the last
 * snapshot. Diffed by alert id, so a persisting alert fires once, not on
 * every autosave.
 */
function useAlertNotifications() {
  const alerts = useSyncStore((s) => s.snapshot?.alerts)
  const enabled = useUiStore((s) => s.notificationsEnabled)
  const seen = useRef<Set<string>>(new Set())
  const first = useRef(true)

  useEffect(() => {
    if (!alerts) return
    const current = new Set(alerts.map((a) => a.id))
    if (first.current) {
      // Never notify for the state the app opened with.
      first.current = false
      seen.current = current
      return
    }
    if (enabled) {
      for (const alert of alerts) {
        if (alert.severity !== 'critical' || seen.current.has(alert.id)) continue
        try {
          new Notification('PalBoard', { body: `${alert.title} — ${alert.detail}` })
        } catch {
          // Notifications unavailable; alerts remain visible in the bell.
        }
      }
    }
    seen.current = current
  }, [alerts, enabled])
}

function BootScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="size-3 animate-pulse-dot rounded-full bg-accent" />
        <p className="text-sm text-ink-faint">Starting PalBoard…</p>
      </div>
    </div>
  )
}
