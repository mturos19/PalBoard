import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Boxes, Cat, LayoutDashboard, Settings } from 'lucide-react'
import { cx } from '@/lib/format'
import { SyncIndicator } from './SyncIndicator'
import { useSyncStore } from '@/stores/syncStore'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pals', label: 'Pals', icon: Cat, end: false },
  { to: '/bases', label: 'Bases', icon: Boxes, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const world = useSyncStore((s) => s.snapshot?.world)
  const palCount = useSyncStore((s) => s.stats?.palCount)
  const baseCount = useSyncStore((s) => s.stats?.baseCount)

  return (
    <div className="flex h-full bg-canvas">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line-soft bg-surface">
        <div className="app-drag flex h-14 items-center gap-2.5 px-4">
          <div className="grid size-7 place-items-center rounded-md bg-accent/15 text-accent">
            <LayoutDashboard size={15} strokeWidth={2.4} />
          </div>
          <span className="text-sm font-semibold tracking-tight">PalBoard</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-surface-3 font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon size={16} strokeWidth={2} />
              <span className="flex-1">{label}</span>
              {label === 'Pals' && palCount !== undefined ? <Count n={palCount} /> : null}
              {label === 'Bases' && baseCount !== undefined ? <Count n={baseCount} /> : null}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line-soft p-3">
          <p className="truncate text-xs font-medium text-ink-muted" title={world?.name ?? undefined}>
            {world?.name ?? 'No world loaded'}
          </p>
          {world?.day !== null && world?.day !== undefined ? (
            <p className="text-[11px] text-ink-faint">Day {world.day}</p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-drag flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-soft bg-surface/60 px-5">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {world?.name ?? 'PalBoard'}
            </h1>
            {world?.difficulty ? (
              <p className="text-[11px] text-ink-faint">{world.difficulty} difficulty</p>
            ) : null}
          </div>
          <div className="app-no-drag">
            <SyncIndicator />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink-faint">
      {n}
    </span>
  )
}
