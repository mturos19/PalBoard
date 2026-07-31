/**
 * Charts over the current snapshot, plus PalBoard's own recorded time-series.
 * The save has no history, so the over-time charts grow as PalBoard runs.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { HistoryPoint, Pal } from '@shared/domain'
import { RESOURCE_GROUPS } from '@shared/gamedata/items'
import { Card, CardTitle, EmptyState } from '@/components/ui/Card'
import { ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/elements'
import { useSyncStore } from '@/stores/syncStore'

const INK_FAINT = '#667085'
const LINE = '#272d3b'
const ACCENT = 'var(--color-accent)'

const tooltipStyle = {
  contentStyle: {
    background: '#161a23',
    border: '1px solid #272d3b',
    borderRadius: 8,
    fontSize: 12,
    color: '#e9ecf3',
  },
  labelStyle: { color: '#9aa4b8' },
  cursor: { fill: '#1d222e', opacity: 0.5 },
} as const

export function StatisticsPage() {
  const snapshot = useSyncStore((s) => s.snapshot)
  const revision = snapshot?.revision ?? 0

  const history = useQuery({
    queryKey: ['history', snapshot?.world.worldId, revision],
    queryFn: () => window.palboard.getHistory(),
    enabled: !!snapshot,
  })

  const owned = useMemo(
    () => (snapshot?.pals ?? []).filter((p) => !p.isTowerBoss && !p.isHuman),
    [snapshot],
  )

  if (!snapshot) return <EmptyState title="Reading your save…" />

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      <Card index={0}>
        <CardTitle>Level distribution</CardTitle>
        <LevelHistogram pals={owned} />
      </Card>

      <Card index={1}>
        <CardTitle>Elements</CardTitle>
        <ElementDonut pals={owned} />
      </Card>

      <Card index={2}>
        <CardTitle>Top species</CardTitle>
        <TopSpecies pals={owned} />
      </Card>

      <Card index={3}>
        <CardTitle>IV quality</CardTitle>
        <IvHistogram pals={owned} />
      </Card>

      <Card index={4} className="lg:col-span-2">
        <CardTitle>Pals over time</CardTitle>
        <HistoryLines
          points={history.data ?? []}
          series={[
            { key: 'pals', label: 'Owned pals', color: 'var(--color-accent)' },
            { key: 'workers', label: 'Base workers', color: '#3ddc97' },
          ]}
        />
      </Card>

      <Card index={5} className="lg:col-span-2">
        <CardTitle>Resources over time</CardTitle>
        <ResourceHistory points={history.data ?? []} />
      </Card>
    </div>
  )
}

// --- chart components ---------------------------------------------------------

function LevelHistogram({ pals }: { pals: Pal[] }) {
  const data = useMemo(() => {
    const bins = new Map<number, number>()
    for (const p of pals) {
      const bin = Math.floor((p.level - 1) / 5) * 5 + 1
      bins.set(bin, (bins.get(bin) ?? 0) + 1)
    }
    return [...bins]
      .sort((a, b) => a[0] - b[0])
      .map(([bin, count]) => ({ range: `${bin}–${bin + 4}`, count }))
  }, [pals])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
        <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="range" tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={{ stroke: LINE }} tickLine={false} />
        <YAxis tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="count" name="Pals" fill={ACCENT} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ElementDonut({ pals }: { pals: Pal[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of pals) {
      if (p.elements.length === 0) counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
      for (const el of p.elements) counts.set(el, (counts.get(el) ?? 0) + 1)
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([el, value]) => ({
        name: el === 'unknown' ? 'Unmapped' : ELEMENT_LABELS[el as keyof typeof ELEMENT_LABELS],
        value,
        color: el === 'unknown' ? '#39415466' : ELEMENT_COLORS[el as keyof typeof ELEMENT_COLORS],
      }))
  }, [pals])

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={52} outerRadius={84} paddingAngle={2} strokeWidth={0}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1 text-xs">
        {data.slice(0, 8).map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 text-ink-muted">{d.name}</span>
            <span className="tabular-nums text-ink-faint">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopSpecies({ pals }: { pals: Pal[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; alpha: number }>()
    for (const p of pals) {
      const entry = counts.get(p.speciesId) ?? { name: p.speciesName, count: 0, alpha: 0 }
      entry.count++
      if (p.isAlpha) entry.alpha++
      counts.set(p.speciesId, entry)
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  }, [pals])

  const max = data[0]?.count ?? 1
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.name} className="flex items-center gap-2.5 text-xs">
          <span className="w-32 shrink-0 truncate text-ink-muted">{d.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right tabular-nums text-ink-faint">
            {d.count}
            {d.alpha > 0 ? <span className="text-amber"> ★{d.alpha}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function IvHistogram({ pals }: { pals: Pal[] }) {
  const data = useMemo(() => {
    const bins = new Array(10).fill(0)
    for (const p of pals) {
      const avg = (p.ivHp + p.ivAttack + p.ivDefense) / 3
      bins[Math.min(9, Math.floor(avg / 10))]++
    }
    return bins.map((count, i) => ({ range: `${i * 10}`, count }))
  }, [pals])

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id="iv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="range" tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={{ stroke: LINE }} tickLine={false} />
        <YAxis tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Area dataKey="count" name="Pals" stroke="var(--color-accent)" strokeWidth={2} fill="url(#iv-fill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function HistoryLines({
  points,
  series,
}: {
  points: HistoryPoint[]
  series: Array<{ key: 'pals' | 'workers'; label: string; color: string }>
}) {
  if (points.length < 2) return <HistoryPlaceholder count={points.length} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" tickFormatter={dayLabel} tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={{ stroke: LINE }} tickLine={false} />
        <YAxis tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(t) => new Date(Number(t)).toLocaleString()} />
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function ResourceHistory({ points }: { points: Array<{ t: number; resources: Record<string, number> }> }) {
  const keys = ['wood', 'stone', 'ore', 'ingots'] as const
  const colors = ['#d9a05b', '#b9c0cf', '#4b9cff', '#f5b23d']
  const data = useMemo(
    () => points.map((p) => ({ t: p.t, ...Object.fromEntries(keys.map((k) => [k, p.resources?.[k] ?? 0])) })),
    [points],
  )
  if (points.length < 2) return <HistoryPlaceholder count={points.length} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" tickFormatter={dayLabel} tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={{ stroke: LINE }} tickLine={false} />
        <YAxis tick={{ fill: INK_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip {...tooltipStyle} labelFormatter={(t) => new Date(Number(t)).toLocaleString()} />
        {keys.map((k, i) => {
          const group = RESOURCE_GROUPS.find((g) => g.key === k)
          return <Line key={k} dataKey={k} name={group?.label ?? k} stroke={colors[i]} strokeWidth={2} dot={false} />
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}

function HistoryPlaceholder({ count }: { count: number }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-line bg-surface-2/40">
      <div className="text-center">
        <p className="text-sm text-ink-muted">Not enough history yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-faint">
          PalBoard records one point per autosave while it runs ({count} so far — charts appear at 2).
          Keep it open while you play.
        </p>
      </div>
    </div>
  )
}
