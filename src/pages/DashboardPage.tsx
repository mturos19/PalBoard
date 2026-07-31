import { useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, Boxes, Brain, Cat, FlaskConical, Gauge, HeartPulse,
  Home, Info, Layers, Map as MapIcon, ShieldAlert, Sparkles, Star, Swords,
  Users, UtensilsCrossed, BookOpen,
} from 'lucide-react'
import { RESOURCE_GROUPS } from '@shared/gamedata/items'
import { Card, CardTitle, EmptyState } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

const ALERT_ICONS = { critical: ShieldAlert, warning: AlertTriangle, info: Info } as const
const ALERT_TONES = { critical: 'text-rose', warning: 'text-amber', info: 'text-accent' } as const

/** Resource keys shown on the strip, in display order. */
const STRIP_KEYS = ['gold', 'wood', 'stone', 'ore', 'coal', 'sulfur', 'quartz', 'oil', 'ingots', 'paldium'] as const

export function DashboardPage() {
  const snapshot = useSyncStore((s) => s.snapshot)
  const stats = useSyncStore((s) => s.stats)
  const navigate = useNavigate()

  if (!snapshot || !stats) {
    return <EmptyState title="Reading your save…" hint="Decompressing and parsing Level.sav." />
  }

  const { world, players, guilds, bases, records, resources, alerts, diagnostics } = snapshot
  const guild = guilds[0]
  const bestRecords = records[0]

  return (
    <div className="space-y-4 p-5">
      {/* Hero */}
      <section className="animate-rise relative overflow-hidden rounded-card border border-line-soft bg-surface p-5 card-shadow">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {world.difficulty ? `${world.difficulty} difficulty` : 'World'} · saved {formatDateTime(world.savedAt)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{world.name ?? 'Palworld'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Day <span className="font-semibold tabular-nums text-ink">{formatNumber(world.day)}</span>
              {guild ? (
                <>
                  {' '}· <span className="text-ink">{guild.name}</span>{' '}
                  <span className="text-ink-faint">({guild.players.map((p) => p.name).join(', ')})</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <Hero label="Pals" value={stats.palCount} onClick={() => navigate('/pals')} />
            <Hero label="Species caught" value={bestRecords?.paldeckCount ?? stats.uniqueSpeciesCount} onClick={() => navigate('/statistics')} />
            <Hero label="Bases" value={stats.baseCount} onClick={() => navigate('/bases')} />
          </div>
        </div>
      </section>

      {/* Resource strip */}
      <section className="animate-rise grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10" style={{ animationDelay: '40ms' }}>
        {STRIP_KEYS.map((key) => {
          const group = RESOURCE_GROUPS.find((g) => g.key === key)
          return (
            <button
              key={key}
              onClick={() => navigate('/inventory')}
              className="rounded-lg border border-line-soft bg-surface px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-surface-2"
              title={`${group?.label} in storage and pouches`}
            >
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-faint">{group?.label}</p>
              <p className="truncate text-sm font-semibold tabular-nums">{formatNumber(resources[key] ?? 0)}</p>
            </button>
          )
        })}
      </section>

      {/* Stat row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard index={1} label="Workers" value={formatNumber(stats.workerCount)} detail="assigned to bases" icon={Boxes} />
        <StatCard index={2} label="Alphas" value={formatNumber(stats.alphaCount)} detail={`${stats.luckyCount} lucky`} icon={Star} tone="amber" onClick={() => navigate('/pals?filter=alpha')} />
        <StatCard index={3} label="Structures" value={formatNumber(stats.buildingCount)} detail="across all bases" icon={Layers} tone="violet" onClick={() => navigate('/bases')} />
        <StatCard index={4} label="Towers cleared" value={formatNumber(bestRecords?.towersCleared ?? 0)} icon={Swords} tone="mint" />
        <StatCard index={5} label="Fast travels" value={formatNumber(bestRecords?.fastTravelsUnlocked ?? 0)} detail="unlocked" icon={MapIcon} onClick={() => navigate('/map')} />
        <StatCard index={6} label="Total captures" value={formatNumber(bestRecords?.totalCaptures ?? 0)} icon={BookOpen} />
      </section>

      {/* Alerts + attention + players */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card index={7}>
          <CardTitle>Alerts</CardTitle>
          {alerts.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-faint">All clear.</p>
          ) : (
            <ul className="space-y-1">
              {alerts.slice(0, 5).map((alert) => {
                const Icon = ALERT_ICONS[alert.severity]
                return (
                  <li key={alert.id}>
                    <button
                      onClick={() => alert.link && navigate(alert.link)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <Icon size={14} className={`mt-0.5 shrink-0 ${ALERT_TONES[alert.severity]}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{alert.title}</span>
                        <span className="block truncate text-[11px] text-ink-faint">{alert.detail}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card index={8}>
          <CardTitle>Pals needing attention</CardTitle>
          <div className="space-y-2">
            <Attention icon={UtensilsCrossed} label="Hungry" count={stats.starvingCount} onClick={() => navigate('/pals?filter=hungry')} />
            <Attention icon={Brain} label="Low sanity" count={stats.depressedCount} onClick={() => navigate('/pals?filter=depressed')} />
            <Attention icon={HeartPulse} label="Sick or injured" count={stats.sickCount} onClick={() => navigate('/pals?filter=sick')} />
          </div>
        </Card>

        <Card index={9}>
          <CardTitle>Players</CardTitle>
          <ul className="space-y-2.5">
            {players.map((player) => {
              const rec = records.find((r) => r.uid.toLowerCase() === player.uid.toLowerCase())
              return (
                <li key={player.uid} className="flex items-center gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-gradient text-[11px] font-bold text-canvas">
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {player.name} <span className="text-xs text-ink-faint">Lv {player.level}</span>
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-ink-faint">
                      <span className="flex items-center gap-0.5"><FlaskConical size={10} /> {formatNumber(player.technologyPoints)}</span>
                      <span className="flex items-center gap-0.5"><Sparkles size={10} /> {formatNumber(player.ancientTechnologyPoints)}</span>
                      {rec ? <span className="flex items-center gap-0.5"><Cat size={10} /> {rec.paldeckCount} deck</span> : null}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </section>

      {/* Bases */}
      <section>
        <Card index={10}>
          <CardTitle action={<button onClick={() => navigate('/bases')} className="text-xs text-accent hover:underline">View all</button>}>
            Bases
          </CardTitle>
          {bases.length === 0 ? (
            <EmptyState title="No bases yet" hint="Place a Palbox to found your first base." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {bases.map((base) => (
                <li key={base.id}>
                  <button
                    onClick={() => navigate('/bases')}
                    className="w-full rounded-lg border border-line-soft bg-surface-2 p-3 text-left transition-colors hover:border-line"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Home size={13} className="text-accent" />
                        {base.name}
                      </p>
                      <span className="font-mono text-[11px] text-ink-faint">{base.coord.x}, {base.coord.y}</span>
                    </div>
                    <div className="mt-2 flex gap-4 text-[11px] text-ink-muted">
                      <span className="flex items-center gap-1"><Users size={11} /> {base.workerCount} pals</span>
                      <span className="flex items-center gap-1"><Layers size={11} /> {formatNumber(base.buildingCount)} built</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Save diagnostics */}
      <section>
        <Card index={11}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-ink-faint">
            <span className="flex items-center gap-1.5"><Activity size={12} /> {diagnostics.format}</span>
            <span>{formatBytes(diagnostics.compressedBytes)} → {formatBytes(diagnostics.decompressedBytes)}</span>
            <span className="flex items-center gap-1.5">
              <Gauge size={12} />
              parsed in {formatDuration(diagnostics.decompressMs + diagnostics.parseMs + diagnostics.buildMs)}
            </span>
            <span>{formatNumber(snapshot.storage.usedSlots)} storage slots read</span>
            {diagnostics.warnings.length > 0 ? (
              <span className="text-amber">{diagnostics.warnings.length} parser warnings — see Settings</span>
            ) : (
              <span className="text-mint">no parser warnings</span>
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}

function Hero({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-right">
      <p className="text-3xl font-bold tabular-nums tracking-tight text-accent-gradient">{formatNumber(value)}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint group-hover:text-ink-muted">{label}</p>
    </button>
  )
}

function Attention({ icon: Icon, label, count, onClick }: { icon: typeof Brain; label: string; count: number; onClick: () => void }) {
  const ok = count === 0
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-line-soft bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-line"
    >
      <Icon size={15} className={ok ? 'text-ink-faint' : 'text-amber'} />
      <span className="flex-1 text-sm">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${ok ? 'text-ink-faint' : 'text-amber'}`}>{count}</span>
    </button>
  )
}
