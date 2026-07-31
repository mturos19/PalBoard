import { useNavigate } from 'react-router-dom'
import {
  Activity,
  Boxes,
  Brain,
  Cat,
  CalendarDays,
  FlaskConical,
  Gauge,
  HeartPulse,
  Home,
  Layers,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { Card, CardTitle, EmptyState } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

export function DashboardPage() {
  const snapshot = useSyncStore((s) => s.snapshot)
  const stats = useSyncStore((s) => s.stats)
  const navigate = useNavigate()

  if (!snapshot || !stats) {
    return (
      <EmptyState
        title="Reading your save…"
        hint="PalBoard is decompressing and parsing Level.sav."
      />
    )
  }

  const { world, players, guilds, bases, diagnostics } = snapshot
  const guild = guilds[0]
  const hostPlayer = players.find((p) => p.uid === guild?.adminPlayerUid) ?? players[0]

  return (
    <div className="space-y-5 p-5">
      {/* World summary */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          index={0}
          label="Day"
          value={formatNumber(world.day)}
          detail={world.difficulty ? `${world.difficulty} difficulty` : undefined}
          icon={CalendarDays}
          tone="accent"
        />
        <StatCard
          index={1}
          label="Pals"
          value={formatNumber(stats.palCount)}
          detail={`${stats.uniqueSpeciesCount} species`}
          icon={Cat}
          tone="mint"
          onClick={() => navigate('/pals')}
        />
        <StatCard
          index={2}
          label="Bases"
          value={formatNumber(stats.baseCount)}
          detail={`${formatNumber(stats.buildingCount)} structures`}
          icon={Home}
          tone="violet"
          onClick={() => navigate('/bases')}
        />
        <StatCard
          index={3}
          label="Workers"
          value={formatNumber(stats.workerCount)}
          detail="assigned to bases"
          icon={Boxes}
        />
        <StatCard
          index={4}
          label="Alphas"
          value={formatNumber(stats.alphaCount)}
          detail={`${stats.luckyCount} lucky`}
          icon={Star}
          tone="amber"
        />
        <StatCard
          index={5}
          label="Guild"
          value={guild ? formatNumber(guild.players.length) : '—'}
          detail={guild?.name ?? 'No guild'}
          icon={Users}
        />
      </section>

      {/* Attention + player */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card index={6} className="lg:col-span-2">
          <CardTitle>Pals needing attention</CardTitle>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Hungry"
              value={formatNumber(stats.starvingCount)}
              detail="flagged by the game"
              icon={UtensilsCrossed}
              tone={stats.starvingCount > 0 ? 'amber' : 'default'}
              onClick={() => navigate('/pals?filter=hungry')}
            />
            <StatCard
              label="Depressed"
              value={formatNumber(stats.depressedCount)}
              detail="sanity below 50%"
              icon={Brain}
              tone={stats.depressedCount > 0 ? 'rose' : 'default'}
              onClick={() => navigate('/pals?filter=depressed')}
            />
            <StatCard
              label="Sick or injured"
              value={formatNumber(stats.sickCount)}
              detail="needs a Pal Bed"
              icon={HeartPulse}
              tone={stats.sickCount > 0 ? 'rose' : 'default'}
              onClick={() => navigate('/pals?filter=sick')}
            />
          </div>
        </Card>

        <Card index={7}>
          <CardTitle>{hostPlayer?.name ?? 'Player'}</CardTitle>
          {hostPlayer ? (
            <dl className="space-y-2 text-sm">
              <Row label="Level" value={formatNumber(hostPlayer.level)} />
              <Row label="Technology" value={formatNumber(hostPlayer.technologyPoints)} icon={FlaskConical} />
              <Row
                label="Ancient technology"
                value={formatNumber(hostPlayer.ancientTechnologyPoints)}
                icon={Sparkles}
              />
              <Row label="Unspent stat points" value={formatNumber(hostPlayer.unusedStatusPoints)} />
            </dl>
          ) : (
            <p className="text-sm text-ink-faint">No player data found.</p>
          )}
        </Card>
      </section>

      {/* Bases */}
      <section>
        <Card index={8}>
          <CardTitle action={<button onClick={() => navigate('/bases')} className="text-xs text-accent hover:underline">View all</button>}>
            Bases
          </CardTitle>
          {bases.length === 0 ? (
            <EmptyState title="No bases yet" hint="Place a Palbox to found your first base." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {bases.map((base) => (
                <li
                  key={base.id}
                  className="rounded-lg border border-line-soft bg-surface-2 p-3 transition-colors hover:border-line"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{base.name}</p>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {base.coord.x}, {base.coord.y}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {base.workerCount} pals
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={11} /> {formatNumber(base.buildingCount)} built
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Diagnostics */}
      <section>
        <Card index={9}>
          <CardTitle>Save</CardTitle>
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Row label="World saved" value={formatDateTime(world.savedAt)} />
            <Row label="Format" value={diagnostics.format} icon={Activity} />
            <Row
              label="Size"
              value={`${formatBytes(diagnostics.compressedBytes)} → ${formatBytes(diagnostics.decompressedBytes)}`}
            />
            <Row
              label="Parse time"
              value={formatDuration(
                diagnostics.decompressMs + diagnostics.parseMs + diagnostics.buildMs,
              )}
              icon={Gauge}
            />
          </div>
          {diagnostics.warnings.length > 0 ? (
            <details className="mt-3 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-amber">
                {diagnostics.warnings.length} parser warning
                {diagnostics.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink-faint">
                {diagnostics.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      </section>
    </div>
  )
}

/**
 * A label/value pair. Rows sit in multi-column grids, where a bottom border
 * would read as underlined text, so separation comes from spacing alone.
 */
function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Activity
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-faint">
        {Icon ? <Icon size={12} /> : null}
        {label}
      </dt>
      <dd className="truncate text-xs font-medium tabular-nums text-ink">{value}</dd>
    </div>
  )
}
