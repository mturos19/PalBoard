/** Element presentation: colors and labels shared by badges, avatars, charts. */
import type { PalElement } from '@shared/domain'

export const ELEMENT_COLORS: Record<PalElement, string> = {
  neutral: '#b9c0cf',
  fire: '#ff7a45',
  water: '#4b9cff',
  grass: '#5ad06e',
  electric: '#ffd23e',
  ice: '#6fd8e8',
  ground: '#d9a05b',
  dark: '#a06bff',
  dragon: '#ff5b8f',
}

export const ELEMENT_LABELS: Record<PalElement, string> = {
  neutral: 'Neutral',
  fire: 'Fire',
  water: 'Water',
  grass: 'Grass',
  electric: 'Electric',
  ice: 'Ice',
  ground: 'Ground',
  dark: 'Dark',
  dragon: 'Dragon',
}

/**
 * Deterministic gradient for a pal avatar. Mapped species use their element
 * colors; unmapped species get a stable hash-derived hue so the same species
 * always looks the same.
 */
export function avatarGradient(speciesId: string, elements: PalElement[]): string {
  if (elements.length >= 2) {
    return `linear-gradient(135deg, ${ELEMENT_COLORS[elements[0]]}, ${ELEMENT_COLORS[elements[1]]})`
  }
  if (elements.length === 1) {
    const c = ELEMENT_COLORS[elements[0]]
    return `linear-gradient(135deg, ${c}, ${c}88)`
  }
  let hash = 0
  for (let i = 0; i < speciesId.length; i++) hash = (hash * 31 + speciesId.charCodeAt(i)) | 0
  const hue = ((hash % 360) + 360) % 360
  return `linear-gradient(135deg, hsl(${hue} 45% 55%), hsl(${(hue + 40) % 360} 45% 40%))`
}

/** Two-letter monogram for avatar tiles: "Vanwyrm Cryst" -> "VC". */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
