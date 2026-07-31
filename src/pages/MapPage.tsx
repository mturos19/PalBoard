/**
 * Palpagos map — an honest one. Without bundling game artwork, the map is a
 * styled coordinate grid in the game's own map-coordinate system with bases
 * (with their real influence radius) and player positions plotted. Wheel to
 * zoom, drag to pan, matching the in-game compass numbers.
 */
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import { Home, MousePointer2, User } from 'lucide-react'
import { EmptyState } from '@/components/ui/Card'
import { useSyncStore } from '@/stores/syncStore'

/** World units per map unit — the same transform the compass uses. */
const WORLD_PER_MAP = 459.42

interface View {
  /** Map-space centre. */
  cx: number
  cy: number
  /** Pixels per map unit. */
  scale: number
}

export function MapPage() {
  const bases = useSyncStore((s) => s.snapshot?.bases)
  const players = useSyncStore((s) => s.snapshot?.players)
  const workers = useSyncStore((s) => s.stats?.workerCount)

  const initial = useMemo<View>(() => {
    const pts = [
      ...(bases ?? []).map((b) => b.coord),
      ...(players ?? []).flatMap((p) => (p.coord ? [p.coord] : [])),
    ]
    if (pts.length === 0) return { cx: 150, cy: 150, scale: 1.2 }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      scale: Math.min(3, 560 / Math.max(spanX, spanY, 120)),
    }
  }, [bases, players])

  const [view, setView] = useState<View | null>(null)
  const v = view ?? initial
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const toScreen = useCallback(
    (mx: number, my: number, w: number, h: number) => ({
      x: w / 2 + (mx - v.cx) * v.scale,
      y: h / 2 + (my - v.cy) * v.scale,
    }),
    [v],
  )

  if (!bases) return <EmptyState title="Reading your save…" />

  const size = { w: 1200, h: 800 } // viewBox; scales to container

  const gridLines: ReactElement[] = []
  const step = v.scale > 2.2 ? 25 : v.scale > 1 ? 50 : 100
  const mapLeft = v.cx - size.w / 2 / v.scale
  const mapRight = v.cx + size.w / 2 / v.scale
  const mapTop = v.cy - size.h / 2 / v.scale
  const mapBottom = v.cy + size.h / 2 / v.scale
  for (let gx = Math.floor(mapLeft / step) * step; gx <= mapRight; gx += step) {
    const { x } = toScreen(gx, 0, size.w, size.h)
    gridLines.push(
      <g key={`vx${gx}`}>
        <line x1={x} y1={0} x2={x} y2={size.h} stroke={gx === 0 ? '#39415466' : '#1b2029'} strokeWidth={1} />
        <text x={x + 4} y={14} fill="#667085" fontSize={10}>{gx}</text>
      </g>,
    )
  }
  for (let gy = Math.floor(mapTop / step) * step; gy <= mapBottom; gy += step) {
    const { y } = toScreen(0, gy, size.w, size.h)
    gridLines.push(
      <g key={`hy${gy}`}>
        <line x1={0} y1={y} x2={size.w} y2={y} stroke={gy === 0 ? '#39415466' : '#1b2029'} strokeWidth={1} />
        <text x={6} y={y - 4} fill="#667085" fontSize={10}>{gy}</text>
      </g>,
    )
  }

  return (
    <div className="relative h-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ background: 'radial-gradient(1200px 700px at 50% 42%, #10131a 0%, #0a0c11 70%)' }}
        onWheel={(e) => {
          const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
          setView({ ...v, scale: Math.min(8, Math.max(0.3, v.scale * factor)) })
        }}
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }
        }}
        onPointerMove={(e) => {
          const rect = svgRef.current?.getBoundingClientRect()
          if (rect) {
            const px = ((e.clientX - rect.left) / rect.width) * size.w
            const py = ((e.clientY - rect.top) / rect.height) * size.h
            setHover({
              x: Math.round(v.cx + (px - size.w / 2) / v.scale),
              y: Math.round(v.cy + (py - size.h / 2) / v.scale),
            })
          }
          if (!drag.current || !rect) return
          const dx = ((e.clientX - drag.current.x) / rect.width) * size.w
          const dy = ((e.clientY - drag.current.y) / rect.height) * size.h
          setView({ ...v, cx: drag.current.cx - dx / v.scale, cy: drag.current.cy - dy / v.scale })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => { drag.current = null; setHover(null) }}
      >
        {gridLines}

        {/* Base influence areas + markers. Labels are placed greedily: sorted
            by screen y, each one is pushed down until it no longer overlaps
            the previous label, so adjacent bases stay readable at any zoom. */}
        {(() => {
          const LABEL_H = 30
          const placed = bases
            .map((base) => {
              const p = toScreen(base.coord.x, base.coord.y, size.w, size.h)
              return { base, p, ty: p.y - 18 }
            })
            .sort((a, b) => a.p.y - b.p.y)
          for (let i = 1; i < placed.length; i++) {
            const prev = placed[i - 1]
            const cur = placed[i]
            // Only labels in the same horizontal band can collide.
            if (Math.abs(cur.p.x - prev.p.x) < 240 && cur.ty < prev.ty + LABEL_H) {
              cur.ty = prev.ty + LABEL_H
            }
          }
          return placed.map(({ base, p, ty }) => {
            const radius = (base.areaRange / WORLD_PER_MAP) * v.scale
            return (
              <g key={base.id}>
                <circle cx={p.x} cy={p.y} r={radius} fill="var(--color-accent)" opacity={0.07} />
                <circle cx={p.x} cy={p.y} r={radius} fill="none" stroke="var(--color-accent)" strokeOpacity={0.35} strokeDasharray="4 4" />
                <circle cx={p.x} cy={p.y} r={5} fill="var(--color-accent)" />
                <circle cx={p.x} cy={p.y} r={9} fill="none" stroke="var(--color-accent)" strokeOpacity={0.5} />
                <text x={p.x + 14} y={ty} fill="#e9ecf3" fontSize={12} fontWeight={600}>
                  {base.name}
                </text>
                <text x={p.x + 14} y={ty + 13} fill="#667085" fontSize={10}>
                  {base.workerCount} pals · {base.buildingCount} built · {base.coord.x}, {base.coord.y}
                </text>
              </g>
            )
          })
        })()}

        {/* Player last-known positions — labels hang below the dot to keep
            clear of base labels, which sit above their markers. */}
        {(players ?? []).map((player) => {
          if (!player.coord) return null
          const p = toScreen(player.coord.x, player.coord.y, size.w, size.h)
          return (
            <g key={player.uid}>
              <circle cx={p.x} cy={p.y} r={4} fill="#3ddc97" />
              <text x={p.x - 4} y={p.y + 17} fill="#3ddc97" fontSize={11}>
                {player.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* HUD */}
      <div className="pointer-events-none absolute left-4 top-4 space-y-2">
        <div className="rounded-lg border border-line-soft bg-surface/90 px-3 py-2 text-xs backdrop-blur">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <Home size={12} className="text-accent" /> {bases.length} bases
            <span className="text-ink-faint">· {workers ?? 0} workers</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-ink-faint">
            <User size={11} className="text-mint" /> last player positions
          </p>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-line-soft bg-surface/90 px-3 py-1.5 text-[11px] text-ink-faint backdrop-blur">
        <span className="flex items-center gap-1.5">
          <MousePointer2 size={11} />
          {hover ? `${hover.x}, ${hover.y}` : 'drag to pan · scroll to zoom'}
        </span>
      </div>
    </div>
  )
}
