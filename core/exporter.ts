/**
 * CSV/JSON exports of the current snapshot. Pure functions produce the bytes;
 * the IPC layer owns the save dialog and file write.
 */
import type { SaveSnapshot } from '@shared/domain'
import { itemName, categorise } from '@shared/gamedata/items'

/**
 * Leading characters that make a spreadsheet treat a cell as a formula.
 *
 * Pal nicknames are free text typed by a player, and a nickname beginning `=` or
 * `@` is executed on open by Excel, Sheets and LibreOffice alike. Prefixing a
 * tab neutralises it — the cell still reads as the original text, but it is
 * unambiguously data.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function csvEscape(value: unknown): string {
  let s = String(value ?? '')
  // Numbers and booleans are ours, not the player's, so a leading `-` there is a
  // negative sign rather than an injection attempt.
  if (typeof value === 'string' && FORMULA_PREFIX.test(s)) s = `\t${s}`
  return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  // CRLF per RFC 4180; Excel on Windows expects it.
  return lines.join('\r\n') + '\r\n'
}

export function buildPalsCsv(snapshot: SaveSnapshot): string {
  const header = [
    'nickname', 'species', 'speciesId', 'level', 'gender', 'alpha', 'lucky',
    'iv_hp', 'iv_attack', 'iv_defense', 'rank', 'soul_hp', 'soul_attack',
    'soul_defense', 'soul_workspeed', 'passives', 'active_skills', 'location',
    'base', 'sanity', 'hungry', 'sick', 'owner',
  ]
  const baseNames = new Map(snapshot.bases.map((b) => [b.id, b.name]))
  const rows = snapshot.pals
    .filter((p) => !p.isTowerBoss)
    .map((p) => [
      p.nickname ?? '', p.speciesName, p.speciesId, p.level, p.gender,
      p.isAlpha, p.isLucky, p.ivHp, p.ivAttack, p.ivDefense, p.rank, p.soulHp,
      p.soulAttack, p.soulDefense, p.soulWorkSpeed, p.passiveSkills.join('; '),
      p.equippedSkills.join('; '), p.location,
      p.baseId ? (baseNames.get(p.baseId) ?? p.baseId) : '',
      Math.round(p.sanity), p.isHungry, p.sickness ?? '', p.ownerPlayerUid ?? '',
    ])
  return toCsv(header, rows)
}

export function buildItemsCsv(snapshot: SaveSnapshot): string {
  const header = ['name', 'id', 'category', 'count']
  const rows = snapshot.storage.items.map((s) => [
    itemName(s.id), s.id, categorise(s.id), s.count,
  ])
  return toCsv(header, rows)
}

export function buildPalsJson(snapshot: SaveSnapshot): string {
  return JSON.stringify(snapshot.pals.filter((p) => !p.isTowerBoss), null, 2)
}

export type ExportKind = 'pals-csv' | 'pals-json' | 'items-csv'

export interface ExportResult {
  data: string
  defaultName: string
  /** MIME type, for the browser's download blob. */
  mimeType: string
  /** File-type description and extension, for the desktop save dialog. */
  filter: { name: string; extensions: string[] }
}

const CSV = { mimeType: 'text/csv', filter: { name: 'CSV', extensions: ['csv'] } }
const JSON_TYPE = { mimeType: 'application/json', filter: { name: 'JSON', extensions: ['json'] } }

export function buildExport(kind: ExportKind, snapshot: SaveSnapshot): ExportResult {
  switch (kind) {
    case 'pals-csv':
      return { data: buildPalsCsv(snapshot), defaultName: 'palboard-pals.csv', ...CSV }
    case 'pals-json':
      return { data: buildPalsJson(snapshot), defaultName: 'palboard-pals.json', ...JSON_TYPE }
    case 'items-csv':
      return { data: buildItemsCsv(snapshot), defaultName: 'palboard-items.csv', ...CSV }
  }
}
