/**
 * Alert rules — everything PalBoard can warn about from a single snapshot.
 *
 * Alerts are aggregated per rule (one "6 pals are starving" rather than six
 * rows) with sample names, so the bell stays scannable on a 500-pal world.
 * Ids are stable across reloads; the renderer diffs them to decide what is
 * new enough to raise an OS notification for.
 */
import type { Alert, BaseCamp, Pal, StorageSummary } from '../../../shared/domain'

/**
 * Sanity below this counts as "low". Palworld applies work penalties well
 * before a pal is formally depressed, so this is an early warning, not the
 * game's own threshold. Shared with the dashboard stats roll-up.
 */
export const SANITY_CONCERN = 50

const PALBOX_WARN_RATIO = 0.9

function sample(pals: Pal[], max = 3): string {
  const names = pals.slice(0, max).map((p) => p.nickname ?? p.speciesName)
  const extra = pals.length - names.length
  return extra > 0 ? `${names.join(', ')} +${extra} more` : names.join(', ')
}

export interface AlertInputs {
  pals: Pal[]
  bases: BaseCamp[]
  storage: StorageSummary
  /** Used palbox slots / capacity, when known. */
  palbox: { used: number; capacity: number } | null
}

export function buildAlerts(input: AlertInputs): Alert[] {
  const alerts: Alert[] = []
  const owned = input.pals.filter((p) => !p.isTowerBoss && !p.isHuman)

  const starving = owned.filter((p) => p.isHungry)
  if (starving.length > 0) {
    alerts.push({
      id: 'starving',
      severity: 'critical',
      title: `${starving.length} pal${starving.length === 1 ? ' is' : 's are'} starving`,
      detail: sample(starving),
      link: '/pals?filter=hungry',
    })
  }

  const sick = owned.filter((p) => p.sickness !== null)
  if (sick.length > 0) {
    alerts.push({
      id: 'sick',
      severity: 'critical',
      title: `${sick.length} pal${sick.length === 1 ? ' is' : 's are'} sick or injured`,
      detail: sample(sick),
      link: '/pals?filter=sick',
    })
  }

  const depressed = owned.filter((p) => p.sanity < SANITY_CONCERN && p.sickness === null)
  if (depressed.length > 0) {
    alerts.push({
      id: 'depressed',
      severity: 'warning',
      title: `${depressed.length} pal${depressed.length === 1 ? ' has' : 's have'} low sanity`,
      detail: sample(depressed),
      link: '/pals?filter=depressed',
    })
  }

  if (input.storage.nearFullContainers > 0) {
    alerts.push({
      id: 'storage-full',
      severity: 'warning',
      title: `${input.storage.nearFullContainers} storage container${input.storage.nearFullContainers === 1 ? '' : 's'} nearly full`,
      detail: 'At 95% capacity or more',
      link: '/inventory',
    })
  }

  if (input.palbox && input.palbox.capacity > 0) {
    const ratio = input.palbox.used / input.palbox.capacity
    if (ratio >= PALBOX_WARN_RATIO) {
      alerts.push({
        id: 'palbox-full',
        severity: ratio >= 0.98 ? 'critical' : 'warning',
        title: 'Palbox nearly full',
        detail: `${input.palbox.used} of ${input.palbox.capacity} slots used`,
        link: '/pals',
      })
    }
  }

  for (const base of input.bases) {
    if (base.buildingCount >= 10 && base.workerCount === 0) {
      alerts.push({
        id: `base-idle-${base.id}`,
        severity: 'info',
        title: `${base.name} has no assigned pals`,
        detail: `${base.buildingCount} structures with nobody working`,
        link: '/bases',
      })
    }
  }

  const order: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}
