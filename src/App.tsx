import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { BasesPage } from './pages/BasesPage'
import { DashboardPage } from './pages/DashboardPage'
import { PalsPage } from './pages/PalsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WelcomePage } from './pages/WelcomePage'
import { connectSync, useSyncStore } from './stores/syncStore'

export function App() {
  const hydrated = useSyncStore((s) => s.hydrated)
  const worldPath = useSyncStore((s) => s.worldPath)
  const status = useSyncStore((s) => s.status)

  // Subscribe to main-process state for the lifetime of the app.
  useEffect(() => connectSync(), [])

  if (!hydrated) return <BootScreen />

  // No world selected yet: onboarding takes over the whole window.
  if (!worldPath && status !== 'loading') return <WelcomePage />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pals" element={<PalsPage />} />
        <Route path="/bases" element={<BasesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
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
