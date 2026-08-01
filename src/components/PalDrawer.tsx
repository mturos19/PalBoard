/** Slide-over with everything the save knows about one pal. */
import { useMemo } from 'react'
import { Brain, Heart, MapPin, Star, Sparkles, User, UtensilsCrossed, Zap } from 'lucide-react'
import { SANITY_CONCERN, type Pal } from '@shared/domain'
import { skillDisplayName } from '@shared/gamedata/names'
import { speciesInfo, type WorkKey } from '@shared/gamedata/species'
import { Drawer } from './ui/Drawer'
import { ElementBadge } from './ui/ElementBadge'
import { PalAvatar } from './ui/PalAvatar'
import { cx, formatNumber } from '@/lib/format'
import { useSyncStore } from '@/stores/syncStore'
import { useUiStore } from '@/stores/uiStore'

const WORK_LABELS: Record<WorkKey, string> = {
  kindling: 'Kindling',
  watering: 'Watering',
  planting: 'Planting',
  electricity: 'Electricity',
  handiwork: 'Handiwork',
  gathering: 'Gathering',
  lumbering: 'Lumbering',
  mining: 'Mining',
  medicine: 'Medicine',
  cooling: 'Cooling',
  transporting: 'Transporting',
  farming: 'Farming',
}

export function PalDrawer() {
  const selectedId = useUiStore((s) => s.selectedPalId)
  const close = useUiStore((s) => s.closePal)
  const pal = useSyncStore((s) =>
    selectedId ? s.snapshot?.pals.find((p) => p.instanceId === selectedId) ?? null : null,
  )
  const baseName = useSyncStore((s) =>
    pal?.baseId ? s.snapshot?.bases.find((b) => b.id === pal.baseId)?.name ?? null : null,
  )
  const ownerName = useSyncStore((s) =>
    pal?.ownerPlayerUid
      ? s.snapshot?.players.find((p) => p.uid.toLowerCase() === pal.ownerPlayerUid?.toLowerCase())
          ?.name ?? null
      : null,
  )

  return (
    <Drawer open={pal !== null} onClose={close} title={pal ? <DrawerTitle pal={pal} /> : null}>
      {pal ? <Body pal={pal} baseName={baseName} ownerName={ownerName} /> : null}
    </Drawer>
  )
}

function DrawerTitle({ pal }: { pal: Pal }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PalAvatar pal={pal} size="sm" />
      <span className="truncate text-sm font-semibold">{pal.nickname ?? pal.speciesName}</span>
      {pal.isAlpha ? <Star size={13} className="shrink-0 text-amber" /> : null}
      {pal.isLucky ? <Sparkles size={13} className="shrink-0 text-violet" /> : null}
    </div>
  )
}

function Body({ pal, baseName, ownerName }: { pal: Pal; baseName: string | null; ownerName: string | null }) {
  // Effective suitability = table base level + save-recorded added ranks.
  const work = useMemo(() => {
    const base = speciesInfo(pal.speciesId)?.work ?? {}
    const keys = new Set<string>([...Object.keys(base), ...Object.keys(pal.workSuitabilities)])
    return [...keys]
      .map((key) => {
        const baseLevel = (base as Record<string, number>)[key] ?? 0
        const added = pal.workSuitabilities[capitalise(key)] ?? pal.workSuitabilities[key] ?? 0
        return { key, level: baseLevel + added, added, disabled: pal.disabledWorkSuitabilities.some((d) => d.toLowerCase().includes(key.toLowerCase())) }
      })
      .filter((w) => w.level > 0)
      .sort((a, b) => b.level - a.level)
  }, [pal])

  return (
    <div className="space-y-5 p-4">
      {/* Identity */}
      <section className="flex items-center gap-3.5">
        <PalAvatar pal={pal} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{pal.nickname ?? pal.speciesName}</p>
          <p className="truncate text-xs text-ink-muted">
            {pal.isAlpha ? 'Alpha ' : ''}
            {pal.speciesName}
            {pal.isHuman ? ' · Human' : ''}
            <span className="text-ink-faint"> · {pal.characterId}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {pal.elements.map((el) => (
              <ElementBadge key={el} element={el} />
            ))}
            <span
              className={cx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                pal.gender === 'male' ? 'bg-accent/15 text-accent' : pal.gender === 'female' ? 'bg-rose/15 text-rose' : 'bg-surface-3 text-ink-faint',
              )}
            >
              {pal.gender === 'male' ? '♂ Male' : pal.gender === 'female' ? '♀ Female' : 'Unknown'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Level</p>
          <p className="text-2xl font-bold tabular-nums text-accent">{pal.level}</p>
        </div>
      </section>

      {/* Condition */}
      <Section title="Condition">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat icon={Heart} label="HP" value={formatNumber(Math.round(pal.hp / 1000))} tone={pal.isFainted ? 'text-rose' : undefined} />
          <MiniStat
            icon={UtensilsCrossed}
            label="Hunger"
            value={pal.isHungry ? 'Hungry' : 'Fed'}
            tone={pal.isHungry ? 'text-amber' : 'text-mint'}
          />
          <MiniStat
            icon={Brain}
            label="Sanity"
            value={`${Math.round(pal.sanity)}%`}
            tone={pal.sanity < SANITY_CONCERN ? 'text-amber' : undefined}
          />
        </div>
        {pal.sickness ? (
          <p className="mt-2 rounded-lg border border-rose/25 bg-rose/10 px-2.5 py-1.5 text-xs text-rose">
            Sick: {pal.sickness}
          </p>
        ) : null}
      </Section>

      {/* Talents */}
      <Section title="Individual values">
        <IvBar label="HP" value={pal.ivHp} />
        <IvBar label="Attack" value={pal.ivAttack} />
        <IvBar label="Defense" value={pal.ivDefense} />
      </Section>

      {/* Enhancement */}
      <Section title="Enhancement">
        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
          <Row label="Condense rank" value={pal.rank > 1 ? `★${pal.rank - 1}` : '—'} />
          <Row label="Friendship" value={formatNumber(pal.friendshipPoints)} />
          <Row label="Soul · HP" value={pal.soulHp > 0 ? `+${pal.soulHp}` : '—'} />
          <Row label="Soul · Attack" value={pal.soulAttack > 0 ? `+${pal.soulAttack}` : '—'} />
          <Row label="Soul · Defense" value={pal.soulDefense > 0 ? `+${pal.soulDefense}` : '—'} />
          <Row label="Soul · Work" value={pal.soulWorkSpeed > 0 ? `+${pal.soulWorkSpeed}` : '—'} />
        </div>
      </Section>

      {/* Work */}
      {work.length > 0 ? (
        <Section title="Work suitability">
          <div className="space-y-1">
            {work.map((w) => (
              <div key={w.key} className="flex items-center gap-2 text-xs">
                <span className={cx('w-24 shrink-0', w.disabled ? 'text-ink-faint line-through' : 'text-ink-muted')}>
                  {WORK_LABELS[w.key as WorkKey] ?? w.key}
                </span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={cx('size-2 rounded-sm', i < w.level ? 'bg-accent' : 'bg-surface-3')}
                    />
                  ))}
                </div>
                <span className="tabular-nums text-ink-faint">
                  {w.level}
                  {w.added > 0 ? <span className="text-mint"> (+{w.added})</span> : null}
                </span>
              </div>
            ))}
          </div>
          {pal.currentWork ? (
            <p className="mt-2 text-[11px] text-ink-faint">Currently: {pal.currentWork}</p>
          ) : null}
        </Section>
      ) : null}

      {/* Skills */}
      <Section title="Passive skills">
        {pal.passiveSkills.length === 0 ? (
          <p className="text-xs text-ink-faint">None</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pal.passiveSkills.map((skill) => (
              <span
                key={skill}
                title={skill}
                className="rounded-md border border-line-soft bg-surface-2 px-2 py-1 text-[11px] text-ink-muted"
              >
                {skillDisplayName(skill) ?? skill}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Active skills">
        <div className="flex flex-wrap gap-1.5">
          {pal.equippedSkills.map((skill) => (
            <span
              key={skill}
              title={skill}
              className="flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[11px] text-accent"
            >
              <Zap size={10} />
              {skillDisplayName(skill) ?? skill}
            </span>
          ))}
          {pal.masteredSkills
            .filter((s) => !pal.equippedSkills.includes(s))
            .map((skill) => (
              <span
                key={skill}
                title={skill}
                className="rounded-md border border-line-soft bg-surface-2 px-2 py-1 text-[11px] text-ink-faint"
              >
                {skillDisplayName(skill) ?? skill}
              </span>
            ))}
        </div>
      </Section>

      {/* Whereabouts */}
      <Section title="Whereabouts">
        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
          <Row
            label="Location"
            value={pal.location === 'base' ? (baseName ?? 'Base') : pal.location}
            icon={MapPin}
          />
          <Row label="Slot" value={pal.slotIndex >= 0 ? `#${pal.slotIndex}` : '—'} />
          <Row label="Owner" value={ownerName ?? '—'} icon={User} />
          <Row label="Instance" value={pal.instanceId.slice(0, 8)} mono />
        </div>
      </Section>
    </div>
  )
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{title}</h3>
      {children}
    </section>
  )
}

function MiniStat({ icon: Icon, label, value, tone }: { icon: typeof Heart; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
        <Icon size={10} />
        {label}
      </p>
      <p className={cx('mt-0.5 text-sm font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function IvBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, value)
  return (
    <div className="mb-1.5 flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-ink-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cx('h-full rounded-full', pct >= 90 ? 'bg-mint' : pct >= 60 ? 'bg-accent' : 'bg-ink-faint')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cx('w-8 text-right tabular-nums', pct >= 90 ? 'text-mint' : 'text-ink-muted')}>{value}</span>
    </div>
  )
}

function Row({ label, value, icon: Icon, mono }: { label: string; value: string; icon?: typeof Heart; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1 whitespace-nowrap text-ink-faint">
        {Icon ? <Icon size={10} /> : null}
        {label}
      </span>
      <span className={cx('truncate font-medium text-ink', mono && 'font-mono text-[10px]')}>{value}</span>
    </div>
  )
}
