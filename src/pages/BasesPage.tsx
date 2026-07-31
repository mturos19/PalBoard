import { useMemo } from 'react'
import { Layers, MapPin, Radius, Users } from 'lucide-react'
import { Card, CardTitle, EmptyState } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

/**
 * Base overview.
 *
 * Buildings and workers come from the parsed save; per-building detail
 * (production lines, ranch output, incubators) lands in Phase 2.
 */
export function BasesPage() {
  const bases = useSyncStore((s) => s.snapshot?.bases)
  const pals = useSyncStore((s) => s.snapshot?.pals)

  const workersByBase = useMemo(() => {
    const map = new Map<string, typeof pals extends undefined ? never : NonNullable<typeof pals>>()
    for (const pal of pals ?? []) {
      if (pal.location !== 'base' || !pal.baseId) continue
      const list = map.get(pal.baseId) ?? []
      list.push(pal)
      map.set(pal.baseId, list)
    }
    return map
  }, [pals])

  if (!bases) return <EmptyState title="Reading your save…" />
  if (bases.length === 0) {
    return <EmptyState title="No bases found" hint="Place a Palbox in game to found a base." />
  }

  return (
    <div className="space-y-4 p-5">
      {bases.map((base, i) => {
        const workers = workersByBase.get(base.id) ?? []
        const hungry = workers.filter((p) => p.isHungry).length
        const depressed = workers.filter((p) => p.sanity < 50).length
        const sick = workers.filter((p) => p.sickness !== null).length

        return (
          <Card key={base.id} index={i}>
            <CardTitle
              action={
                <span className="flex items-center gap-1 font-mono text-[11px] text-ink-faint">
                  <MapPin size={11} />
                  {base.coord.x}, {base.coord.y}
                </span>
              }
            >
              {base.name}
            </CardTitle>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Workers" value={formatNumber(workers.length)} icon={Users} />
              <StatCard label="Structures" value={formatNumber(base.buildingCount)} icon={Layers} />
              <StatCard
                label="Radius"
                value={formatNumber(Math.round(base.areaRange))}
                detail="world units"
                icon={Radius}
              />
              <StatCard
                label="Needs attention"
                value={formatNumber(hungry + depressed + sick)}
                detail={`${hungry} hungry · ${depressed} sad · ${sick} sick`}
                tone={hungry + depressed + sick > 0 ? 'amber' : 'default'}
              />
            </div>

            {workers.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  Assigned pals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {workers.map((pal) => (
                    <span
                      key={pal.instanceId}
                      title={`Lv ${pal.level} · food ${Math.round(pal.stomach)}% · sanity ${Math.round(pal.sanity)}%`}
                      className="rounded-md border border-line-soft bg-surface-2 px-2 py-1 text-[11px] text-ink-muted"
                    >
                      {pal.nickname ?? pal.speciesName}
                      {pal.sickness ? <span className="ml-1 text-rose">●</span> : null}
                      {!pal.sickness && pal.stomach < 50 ? (
                        <span className="ml-1 text-amber">●</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
