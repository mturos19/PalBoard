import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Boxes, Cat, Command, LayoutDashboard, Map as MapIcon, Package, Settings,
} from 'lucide-react'
import { cx } from '@/lib/format'
import { AlertsBell } from '../AlertsBell'
import { SyncIndicator } from './SyncIndicator'
import { useSyncStore } from '@/stores/syncStore'
import { useUiStore } from '@/stores/uiStore'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pals', label: 'Pals', icon: Cat, end: false },
  { to: '/bases', label: 'Bases', icon: Boxes, end: false },
  { to: '/inventory', label: 'Inventory', icon: Package, end: false },
  { to: '/map', label: 'Map', icon: MapIcon, end: false },
  { to: '/statistics', label: 'Statistics', icon: BarChart3, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pals': 'Pals',
  '/bases': 'Bases',
  '/inventory': 'Inventory',
  '/map': 'Map',
  '/statistics': 'Statistics',
  '/settings': 'Settings',
}

export function AppShell({ children }: { children: ReactNode }) {
  const world = useSyncStore((s) => s.snapshot?.world)
  const palCount = useSyncStore((s) => s.stats?.palCount)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const location = useLocation()

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/*
       * Title bar: the drag region for the frameless window. Native window
       * controls are overlaid top-right by Electron (titleBarOverlay), so the
       * right side keeps clear of them.
       */}
      <header className="app-drag flex h-10 shrink-0 items-center gap-3 border-b border-line-soft bg-[#0d1017] pl-3 pr-[150px]">
        <div className="flex items-center gap-2">
          <div className="grid size-5 place-items-center rounded-md bg-accent-gradient text-[10px] font-black text-canvas">
            P
          </div>
          <span className="text-[13px] font-semibold tracking-tight">PalBoard</span>
        </div>
        <span className="text-ink-faint/60">/</span>
        <span className="min-w-0 truncate text-[13px] text-ink-muted">
          {world?.name ?? 'No world'}
          <span className="text-ink-faint"> · {TITLES[location.pathname] ?? ''}</span>
        </span>

        <div className="app-no-drag ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 items-center gap-2 rounded-lg border border-line-soft bg-surface-2 px-2.5 text-xs text-ink-faint transition-colors hover:border-line hover:text-ink-muted"
            title="Search everything"
          >
            <Command size={12} />
            <span>Search</span>
            <kbd className="rounded border border-line-soft bg-surface px-1 text-[9px]">Ctrl K</kbd>
          </button>
          <AlertsBell />
          <SyncIndicator />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-line-soft bg-surface">
          <nav className="flex flex-1 flex-col gap-0.5 p-2 pt-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150',
                    isActive
                      ? 'bg-surface-3 font-medium text-ink'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cx(
                        'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon size={15} strokeWidth={2} className={isActive ? 'text-accent' : undefined} />
                    <span className="flex-1">{label}</span>
                    {label === 'Pals' && palCount !== undefined ? (
                      <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-faint">
                        {palCount}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-line-soft p-3">
            <p className="truncate text-xs font-medium text-ink-muted" title={world?.name ?? undefined}>
              {world?.name ?? 'No world loaded'}
            </p>
            <p className="text-[11px] text-ink-faint">
              {world?.day != null ? `Day ${world.day}` : ''}
              {world?.difficulty ? ` · ${world.difficulty}` : ''}
            </p>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
