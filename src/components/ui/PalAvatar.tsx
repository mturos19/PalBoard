import type { Pal } from '@shared/domain'
import { avatarGradient, monogram } from '@/lib/elements'
import { cx } from '@/lib/format'

/**
 * Species tile: element-colored gradient with a monogram. The game's artwork
 * cannot be bundled, so identity comes from stable per-species color + letters.
 */
export function PalAvatar({ pal, size = 'md' }: { pal: Pal; size?: 'sm' | 'md' | 'lg' }) {
  const cls =
    size === 'lg'
      ? 'size-14 rounded-xl text-lg'
      : size === 'sm'
        ? 'size-6 rounded-md text-[9px]'
        : 'size-8 rounded-lg text-[11px]'
  return (
    <div
      aria-hidden
      className={cx('grid shrink-0 place-items-center font-bold text-black/70', cls)}
      style={{ background: avatarGradient(pal.speciesId, pal.elements) }}
    >
      {monogram(pal.speciesName)}
    </div>
  )
}
