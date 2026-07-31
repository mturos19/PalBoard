import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Search, Star, Sparkles, X } from 'lucide-react'
import type { Pal } from '@shared/domain'
import { EmptyState } from '@/components/ui/Card'
import { cx, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

type SortKey = 'level' | 'name' | 'species' | 'iv' | 'sanity' | 'stomach'
type QuickFilter = 'alpha' | 'lucky' | 'condensed' | 'hungry' | 'depressed' | 'sick' | 'party' | 'base'

const FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'lucky', label: 'Lucky' },
  { id: 'condensed', label: 'Condensed' },
  { id: 'party', label: 'In party' },
  { id: 'base', label: 'At base' },
  { id: 'hungry', label: 'Hungry' },
  { id: 'depressed', label: 'Depressed' },
  { id: 'sick', label: 'Sick' },
]

const ROW_HEIGHT = 44

/** Average of the three IVs — the number players actually compare pals by. */
const ivAverage = (p: Pal) => (p.ivHp + p.ivAttack + p.ivDefense) / 3

function matchesFilter(pal: Pal, filter: QuickFilter): boolean {
  switch (filter) {
    case 'alpha':
      return pal.isAlpha
    case 'lucky':
      return pal.isLucky
    case 'condensed':
      return pal.rank > 1
    case 'hungry':
      return pal.isHungry
    case 'depressed':
      return pal.sanity < 50
    case 'sick':
      return pal.sickness !== null
    case 'party':
      return pal.location === 'party'
    case 'base':
      return pal.location === 'base'
  }
}

export function PalsPage() {
  const pals = useSyncStore((s) => s.snapshot?.pals)
  const bases = useSyncStore((s) => s.snapshot?.bases)
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sortKey, setSortKey] = useState<SortKey>('level')
  const [sortDesc, setSortDesc] = useState(true)

  // A filter can arrive via the URL (dashboard cards link here).
  const urlFilter = searchParams.get('filter') as QuickFilter | null
  const [extraFilters, setExtraFilters] = useState<Set<QuickFilter>>(new Set())
  const active = useMemo(() => {
    const set = new Set(extraFilters)
    if (urlFilter && FILTERS.some((f) => f.id === urlFilter)) set.add(urlFilter)
    return set
  }, [extraFilters, urlFilter])

  const toggleFilter = (id: QuickFilter) => {
    if (urlFilter === id) {
      searchParams.delete('filter')
      setSearchParams(searchParams, { replace: true })
      return
    }
    setExtraFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const baseNames = useMemo(
    () => new Map((bases ?? []).map((b) => [b.id, b.name])),
    [bases],
  )

  const rows = useMemo(() => {
    if (!pals) return []
    const needle = deferredQuery.trim().toLowerCase()

    const filtered = pals.filter((pal) => {
      // Tower bosses live in the save but are not owned pals.
      if (pal.isTowerBoss) return false
      for (const f of active) if (!matchesFilter(pal, f)) return false
      if (!needle) return true
      return (
        pal.speciesName.toLowerCase().includes(needle) ||
        pal.speciesId.toLowerCase().includes(needle) ||
        (pal.nickname?.toLowerCase().includes(needle) ?? false) ||
        pal.passiveSkills.some((s) => s.toLowerCase().includes(needle))
      )
    })

    const dir = sortDesc ? -1 : 1
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'level':
          return (a.level - b.level) * dir
        case 'iv':
          return (ivAverage(a) - ivAverage(b)) * dir
        case 'sanity':
          return (a.sanity - b.sanity) * dir
        case 'stomach':
          return (a.stomach - b.stomach) * dir || Number(a.isHungry) - Number(b.isHungry)
        case 'name':
          return (a.nickname ?? a.speciesName).localeCompare(b.nickname ?? b.speciesName) * dir
        case 'species':
          return a.speciesName.localeCompare(b.speciesName) * dir
      }
    })
  }, [pals, deferredQuery, active, sortKey, sortDesc])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  if (!pals) return <EmptyState title="Reading your save…" />

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(key !== 'name' && key !== 'species')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="shrink-0 space-y-3 border-b border-line-soft bg-surface/40 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by species, nickname or passive skill…"
              className="w-full rounded-lg border border-line-soft bg-surface py-2 pl-9 pr-8 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {formatNumber(rows.length)} of {formatNumber(pals.filter((p) => !p.isTowerBoss).length)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                active.has(f.id)
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-line-soft bg-surface text-ink-muted hover:border-line hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        <SortHeader className="flex-1" label="Pal" active={sortKey === 'name'} desc={sortDesc} onClick={() => sortBy('name')} />
        <SortHeader className="w-32" label="Species" active={sortKey === 'species'} desc={sortDesc} onClick={() => sortBy('species')} />
        <SortHeader className="w-14 justify-end" label="Lvl" active={sortKey === 'level'} desc={sortDesc} onClick={() => sortBy('level')} />
        <SortHeader className="w-28 justify-end" label="IVs" active={sortKey === 'iv'} desc={sortDesc} onClick={() => sortBy('iv')} />
        <SortHeader className="w-16 justify-end" label="Food" active={sortKey === 'stomach'} desc={sortDesc} onClick={() => sortBy('stomach')} />
        <SortHeader className="w-16 justify-end" label="SAN" active={sortKey === 'sanity'} desc={sortDesc} onClick={() => sortBy('sanity')} />
        <span className="w-28">Location</span>
        <span className="w-48">Passives</span>
      </div>

      {/* Virtualized rows */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState title="No pals match" hint="Try clearing a filter or the search box." />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const pal = rows[item.index]
              return (
                <div
                  key={pal.instanceId}
                  className="absolute inset-x-0 flex items-center gap-3 border-b border-line-soft/50 px-4 text-sm hover:bg-surface-2"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {pal.isAlpha ? <Star size={12} className="shrink-0 text-amber" /> : null}
                    {pal.isLucky ? <Sparkles size={12} className="shrink-0 text-violet" /> : null}
                    <span className="truncate">{pal.nickname ?? pal.speciesName}</span>
                    {pal.rank > 1 ? (
                      <span className="shrink-0 rounded bg-surface-3 px-1 text-[10px] text-ink-faint">
                        ★{pal.rank - 1}
                      </span>
                    ) : null}
                    <GenderMark gender={pal.gender} />
                  </div>
                  <span className="w-32 truncate text-xs text-ink-muted">{pal.speciesName}</span>
                  <span className="w-14 text-right tabular-nums">{pal.level}</span>
                  <span className="w-28 text-right font-mono text-[11px] text-ink-muted">
                    {pal.ivHp}/{pal.ivAttack}/{pal.ivDefense}
                  </span>
                  <span
                    className={cx(
                      'w-16 text-right text-[11px] tabular-nums',
                      pal.isHungry ? 'text-amber' : 'text-ink-muted',
                    )}
                    title={pal.isHungry ? `Hungry (${pal.hungerState})` : 'Fed'}
                  >
                    {Math.round(pal.stomach)}
                    {pal.isHungry ? ' ▾' : ''}
                  </span>
                  <Meter className="w-16" value={pal.sanity} warn={50} />
                  <span className="w-28 truncate text-xs text-ink-muted">
                    {pal.location === 'base' && pal.baseId
                      ? (baseNames.get(pal.baseId) ?? 'Base')
                      : pal.location}
                  </span>
                  <span className="w-48 truncate text-[11px] text-ink-faint" title={pal.passiveSkills.join(', ')}>
                    {pal.passiveSkills.join(', ') || '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SortHeader({
  label,
  active,
  desc,
  onClick,
  className,
}: {
  label: string
  active: boolean
  desc: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cx('flex items-center gap-1 transition-colors hover:text-ink', active && 'text-accent', className)}
    >
      {label}
      {active ? desc ? <ArrowDown size={10} /> : <ArrowUp size={10} /> : null}
    </button>
  )
}

function GenderMark({ gender }: { gender: Pal['gender'] }) {
  if (gender === 'unknown') return null
  return (
    <span className={cx('shrink-0 text-[11px]', gender === 'male' ? 'text-accent' : 'text-rose')}>
      {gender === 'male' ? '♂' : '♀'}
    </span>
  )
}

/** Compact bar + value; turns amber below the warning threshold. */
function Meter({ value, warn, className }: { value: number; warn: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const low = value < warn
  return (
    <div className={cx('text-right', className)}>
      <span className={cx('text-[11px] tabular-nums', low ? 'text-amber' : 'text-ink-muted')}>
        {Math.round(pct)}%
      </span>
      <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cx('h-full rounded-full', low ? 'bg-amber' : 'bg-mint')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
