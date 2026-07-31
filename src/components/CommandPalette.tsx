/**
 * Ctrl+K command palette — fuzzy search over pages, actions, pals, bases and
 * stored items. Dependency-free: subsequence scoring with word-boundary and
 * prefix bonuses is plenty at this corpus size (~1,200 entries).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Boxes, Cat, Download, FolderOpen, LayoutDashboard,
  Map as MapIcon, Package, RefreshCw, Search, Settings, BarChart3, Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { itemName } from '@shared/gamedata/items'
import { skillDisplayName } from '@shared/gamedata/names'
import { cx, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'
import { useUiStore } from '@/stores/uiStore'

interface Entry {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  keywords: string
  run(): void
}

function score(query: string, target: string): number {
  // Subsequence match; -1 when the query cannot be threaded through target.
  let s = 0
  let ti = 0
  let streak = 0
  for (const ch of query) {
    let found = -1
    for (let i = ti; i < target.length; i++) {
      if (target[i] === ch) {
        found = i
        break
      }
    }
    if (found === -1) return -1
    streak = found === ti ? streak + 1 : 1
    s += streak * 2 + (found === 0 || target[found - 1] === ' ' ? 4 : 0)
    ti = found + 1
  }
  return s - target.length * 0.01
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const openPal = useUiStore((s) => s.openPal)
  const snapshot = useSyncStore((s) => s.snapshot)
  const reload = useSyncStore((s) => s.reload)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const go = (to: string) => () => {
      navigate(to)
      setOpen(false)
    }
    const list: Entry[] = [
      { id: 'p-dash', label: 'Dashboard', hint: 'Page', icon: LayoutDashboard, keywords: 'home overview', run: go('/') },
      { id: 'p-pals', label: 'Pals', hint: 'Page', icon: Cat, keywords: 'list table', run: go('/pals') },
      { id: 'p-bases', label: 'Bases', hint: 'Page', icon: Boxes, keywords: 'camps', run: go('/bases') },
      { id: 'p-inv', label: 'Inventory', hint: 'Page', icon: Package, keywords: 'items storage chest', run: go('/inventory') },
      { id: 'p-map', label: 'Map', hint: 'Page', icon: MapIcon, keywords: 'world coordinates', run: go('/map') },
      { id: 'p-stats', label: 'Statistics', hint: 'Page', icon: BarChart3, keywords: 'charts graphs history', run: go('/statistics') },
      { id: 'p-settings', label: 'Settings', hint: 'Page', icon: Settings, keywords: 'preferences world', run: go('/settings') },
      { id: 'a-reload', label: 'Reload save now', hint: 'Action', icon: RefreshCw, keywords: 'refresh sync', run: () => { void reload(); setOpen(false) } },
      { id: 'a-folder', label: 'Open save folder', hint: 'Action', icon: FolderOpen, keywords: 'explorer reveal', run: () => { void window.palboard.revealSaveFolder(); setOpen(false) } },
      { id: 'a-export', label: 'Export pals as CSV', hint: 'Action', icon: Download, keywords: 'save file spreadsheet', run: () => { void window.palboard.exportData('pals-csv'); setOpen(false) } },
    ]

    if (snapshot) {
      for (const base of snapshot.bases) {
        list.push({
          id: `b-${base.id}`,
          label: base.name,
          hint: `Base · ${base.coord.x}, ${base.coord.y}`,
          icon: Boxes,
          keywords: 'base camp',
          run: go('/bases'),
        })
      }
      for (const pal of snapshot.pals) {
        if (pal.isTowerBoss) continue
        list.push({
          id: `pal-${pal.instanceId}`,
          label: pal.nickname ?? pal.speciesName,
          hint: `${pal.isAlpha ? 'Alpha ' : ''}${pal.speciesName} · Lv ${pal.level}`,
          icon: pal.isAlpha ? Star : Cat,
          keywords: `${pal.speciesName} ${pal.speciesId} ${pal.passiveSkills
            .map((s) => skillDisplayName(s) ?? s)
            .join(' ')}`,
          run: () => {
            navigate('/pals')
            openPal(pal.instanceId)
          },
        })
      }
      for (const item of snapshot.storage.items.slice(0, 400)) {
        list.push({
          id: `i-${item.id}`,
          label: itemName(item.id),
          hint: `Item · ${formatNumber(item.count)} in storage`,
          icon: Package,
          keywords: item.id,
          run: go(`/inventory?q=${encodeURIComponent(itemName(item.id))}`),
        })
      }
    }
    return list
  }, [snapshot, navigate, setOpen, reload, openPal])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries.slice(0, 12)
    return entries
      .map((e) => ({ e, s: score(q, `${e.label} ${e.keywords}`.toLowerCase()) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.e)
  }, [entries, query])

  useEffect(() => setIndex(0), [results.length, query])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="animate-fade-in absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
      <div className="animate-rise absolute left-1/2 top-24 w-[560px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface card-shadow">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4">
          <Search size={15} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') results[index]?.run()
              else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="Search pals, items, bases, pages…"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded border border-line-soft bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">No matches.</p>
          ) : (
            results.map((entry, i) => (
              <button
                key={entry.id}
                data-index={i}
                onClick={() => entry.run()}
                onMouseMove={() => setIndex(i)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                  i === index ? 'bg-surface-3 text-ink' : 'text-ink-muted',
                )}
              >
                <entry.icon size={15} className={i === index ? 'text-accent' : 'text-ink-faint'} />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="shrink-0 text-[11px] text-ink-faint">{entry.hint}</span>
                {i === index ? <ArrowRight size={13} className="shrink-0 text-ink-faint" /> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
