/**
 * Inventory: aggregated world storage plus each player's pouches.
 * Search, category chips, and count/name sorting over a virtualized list.
 */
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Download, Package, Search, X } from 'lucide-react'
import type { ItemStack } from '@shared/domain'
import {
  CATEGORY_LABELS,
  categorise,
  itemName,
  type ItemCategory,
} from '@shared/gamedata/items'
import { EmptyState } from '@/components/ui/Card'
import { cx, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'

const ROW_HEIGHT = 40
const CATEGORY_ORDER: ItemCategory[] = [
  'materials', 'food', 'medicine', 'ammo', 'spheres', 'equipment',
  'schematics', 'pal-items', 'eggs', 'keys', 'currency', 'other',
]

type Source = 'storage' | string // player uid

export function InventoryPage() {
  const storage = useSyncStore((s) => s.snapshot?.storage)
  const inventories = useSyncStore((s) => s.snapshot?.inventories)
  const exportData = useSyncStore((s) => s.exportData)
  const [searchParams] = useSearchParams()

  const [source, setSource] = useState<Source>('storage')
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const deferredQuery = useDeferredValue(query)
  const [category, setCategory] = useState<ItemCategory | null>(null)
  const [sortByCount, setSortByCount] = useState(true)
  const [sortDesc, setSortDesc] = useState(true)

  const sourceItems: ItemStack[] = useMemo(() => {
    if (source === 'storage') return storage?.items ?? []
    const inv = inventories?.find((i) => i.uid === source)
    if (!inv) return []
    // A player's pouches merged: common + weapons + armor + food + essential.
    const merged = new Map<string, number>()
    for (const list of [inv.common, inv.essential, inv.weapons, inv.armor, inv.food]) {
      for (const stack of list) merged.set(stack.id, (merged.get(stack.id) ?? 0) + stack.count)
    }
    return [...merged].map(([id, count]) => ({ id, count }))
  }, [source, storage, inventories])

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const filtered = sourceItems.filter((stack) => {
      if (category && categorise(stack.id) !== category) return false
      if (!needle) return true
      return (
        stack.id.toLowerCase().includes(needle) ||
        itemName(stack.id).toLowerCase().includes(needle)
      )
    })
    const dir = sortDesc ? -1 : 1
    return filtered.sort((a, b) =>
      sortByCount ? (a.count - b.count) * dir : itemName(a.id).localeCompare(itemName(b.id)) * dir,
    )
  }, [sourceItems, deferredQuery, category, sortByCount, sortDesc])

  const categoryCounts = useMemo(() => {
    const counts = new Map<ItemCategory, number>()
    for (const stack of sourceItems) {
      const c = categorise(stack.id)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return counts
  }, [sourceItems])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  })

  if (!storage) return <EmptyState title="Reading your save…" />

  const totalShown = rows.reduce((n, r) => n + r.count, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-line-soft bg-surface/40 p-4">
        {/* Source tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceTab active={source === 'storage'} onClick={() => setSource('storage')}>
            World storage
            <span className="ml-1.5 text-[10px] text-ink-faint">
              {formatNumber(storage.usedSlots)}/{formatNumber(storage.totalSlots)} slots
            </span>
          </SourceTab>
          {(inventories ?? []).map((inv) => (
            <SourceTab key={inv.uid} active={source === inv.uid} onClick={() => setSource(inv.uid)}>
              {inv.name}
            </SourceTab>
          ))}
          <button
            onClick={() => void exportData('items-csv')}
            title="Export storage as CSV"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-line-soft bg-surface px-3 text-xs text-ink-muted transition-colors hover:border-line hover:text-ink"
          >
            <Download size={13} />
            CSV
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="w-full rounded-lg border border-line-soft bg-surface py-2 pl-9 pr-8 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            {query ? (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {formatNumber(rows.length)} items · {formatNumber(totalShown)} total
          </span>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.filter((c) => (categoryCounts.get(c) ?? 0) > 0).map((c) => (
            <button
              key={c}
              onClick={() => setCategory((prev) => (prev === c ? null : c))}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                category === c
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-line-soft bg-surface text-ink-muted hover:border-line hover:text-ink',
              )}
            >
              {CATEGORY_LABELS[c]}
              <span className="ml-1 text-[10px] opacity-60">{categoryCounts.get(c)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        <button
          onClick={() => { setSortByCount(false); setSortDesc(sortByCount ? false : !sortDesc) }}
          className={cx('flex flex-1 items-center gap-1 hover:text-ink', !sortByCount && 'text-accent')}
        >
          Item {!sortByCount ? (sortDesc ? <ArrowDown size={10} /> : <ArrowUp size={10} />) : null}
        </button>
        <span className="w-28">Category</span>
        <button
          onClick={() => { setSortByCount(true); setSortDesc(sortByCount ? !sortDesc : true) }}
          className={cx('flex w-28 items-center justify-end gap-1 hover:text-ink', sortByCount && 'text-accent')}
        >
          Count {sortByCount ? (sortDesc ? <ArrowDown size={10} /> : <ArrowUp size={10} />) : null}
        </button>
      </div>

      {/* Rows */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState icon={<Package size={22} />} title="No items match" hint="Try another search or category." />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const stack = rows[item.index]
              const cat = categorise(stack.id)
              return (
                <div
                  key={stack.id}
                  className="absolute inset-x-0 flex items-center gap-3 border-b border-line-soft/50 px-4 text-sm hover:bg-surface-2"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  title={stack.id}
                >
                  <span className="min-w-0 flex-1 truncate">{itemName(stack.id)}</span>
                  <span className="w-28 truncate text-[11px] text-ink-faint">{CATEGORY_LABELS[cat]}</span>
                  <span className="w-28 text-right font-medium tabular-nums">{formatNumber(stack.count)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SourceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-line-soft bg-surface text-ink-muted hover:border-line hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
