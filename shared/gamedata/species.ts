/**
 * Species data table — community-established mapping from Palworld's internal
 * character ids to display names, elements, and base work suitabilities.
 *
 * The save stores only internal ids (`SheepBall`, `KingBahamut`); display names
 * and elements live in the game's data tables, so this file carries the subset
 * that is well-established community knowledge. Coverage is deliberately
 * partial: an entry exists only where the name and elements are solid, and the
 * `work` field only where the base suitabilities are known cold. Everything
 * else falls back to a humanised id — honest over invented.
 *
 * Keys are normalised (lowercase, underscores stripped) so `Manticore_Dark`
 * and `ManticoreDark` both resolve.
 */

export type Element =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'ice'
  | 'ground'
  | 'dark'
  | 'dragon'

export type WorkKey =
  | 'kindling'
  | 'watering'
  | 'planting'
  | 'electricity'
  | 'handiwork'
  | 'gathering'
  | 'lumbering'
  | 'mining'
  | 'medicine'
  | 'cooling'
  | 'transporting'
  | 'farming'

export interface SpeciesInfo {
  name: string
  elements: Element[]
  /** Base work suitability levels; omitted when not confidently known. */
  work?: Partial<Record<WorkKey, number>>
}

const T: Record<string, SpeciesInfo> = {
  // --- starters & early game --------------------------------------------------
  sheepball: { name: 'Lamball', elements: ['neutral'], work: { handiwork: 1, transporting: 1, farming: 1 } },
  pinkcat: { name: 'Cattiva', elements: ['neutral'], work: { handiwork: 1, gathering: 1, mining: 1, transporting: 1 } },
  chickenpal: { name: 'Chikipi', elements: ['neutral'], work: { gathering: 1, farming: 1 } },
  carbunclo: { name: 'Lifmunk', elements: ['grass'], work: { planting: 1, handiwork: 1, lumbering: 1, medicine: 1, gathering: 1 } },
  kitsunebi: { name: 'Foxparks', elements: ['fire'], work: { kindling: 1 } },
  blueplatypus: { name: 'Fuack', elements: ['water'], work: { watering: 1, handiwork: 1, transporting: 1 } },
  eleccat: { name: 'Sparkit', elements: ['electric'], work: { electricity: 1, handiwork: 1, transporting: 1 } },
  monkey: { name: 'Tanzee', elements: ['grass'], work: { planting: 1, handiwork: 1, gathering: 1, lumbering: 1, transporting: 1 } },
  redarmorbird: { name: 'Rooby', elements: ['fire'], work: { kindling: 1 } },
  penguin: { name: 'Pengullet', elements: ['water', 'ice'], work: { watering: 1, handiwork: 1, cooling: 1, transporting: 1 } },
  captainpenguin: { name: 'Penking', elements: ['water', 'ice'], work: { watering: 2, handiwork: 2, mining: 2, cooling: 2, transporting: 2 } },
  hedgehog: { name: 'Jolthog', elements: ['electric'], work: { electricity: 1 } },
  hedgehogice: { name: 'Jolthog Cryst', elements: ['ice'], work: { cooling: 1 } },
  plantslime: { name: 'Gumoss', elements: ['grass', 'ground'], work: { planting: 1 } },
  bastet: { name: 'Mau', elements: ['dark'], work: { farming: 1 } },
  bastetice: { name: 'Mau Cryst', elements: ['ice'], work: { cooling: 1, farming: 1 } },
  cutefox: { name: 'Vixy', elements: ['neutral'], work: { gathering: 1, farming: 1 } },
  flyingmanta: { name: 'Celaray', elements: ['water'], work: { watering: 1, transporting: 1 } },
  garm: { name: 'Direhowl', elements: ['neutral'], work: { gathering: 1 } },
  colorfulbird: { name: 'Tocotoco', elements: ['neutral'], work: { gathering: 1 } },
  wizardowl: { name: 'Hoocrates', elements: ['dark'], work: { gathering: 1 } },
  ganesha: { name: 'Teafant', elements: ['water'], work: { watering: 1 } },
  negativekoala: { name: 'Depresso', elements: ['dark'], work: { handiwork: 1, mining: 1, transporting: 1 } },
  dreamdemon: { name: 'Daedream', elements: ['dark'], work: { handiwork: 1, mining: 1, gathering: 1, transporting: 1 } },
  boar: { name: 'Rushoar', elements: ['ground'], work: { mining: 1 } },
  nightfox: { name: 'Nox', elements: ['dark'], work: { gathering: 1 } },
  mole: { name: 'Fuddler', elements: ['ground'], work: { mining: 1 } },
  negativeoctopus: { name: 'Killamari', elements: ['dark'], work: { gathering: 1, transporting: 1 } },
  sharkkid: { name: 'Gobfin', elements: ['water'], work: { watering: 2, transporting: 1 } },
  sharkkidfire: { name: 'Gobfin Ignis', elements: ['fire'], work: { kindling: 2, transporting: 1 } },

  // --- mid game ---------------------------------------------------------------
  grasspanda: { name: 'Mossanda', elements: ['grass'], work: { planting: 2, handiwork: 2, lumbering: 2, transporting: 3 } },
  grasspandaelectric: { name: 'Mossanda Lux', elements: ['electric'], work: { electricity: 2, handiwork: 2, lumbering: 2, transporting: 3 } },
  sweetssheep: { name: 'Woolipop', elements: ['neutral'], work: { farming: 1 } },
  berrygoat: { name: 'Caprity', elements: ['grass'], work: { planting: 2, farming: 1 } },
  alpaca: { name: 'Melpaca', elements: ['neutral'], work: { farming: 1 } },
  deer: { name: 'Eikthyrdeer', elements: ['neutral'], work: { lumbering: 2 } },
  deerground: { name: 'Eikthyrdeer Terra', elements: ['ground'], work: { lumbering: 2 } },
  cowpal: { name: 'Mozzarina', elements: ['neutral'], work: { farming: 1 } },
  littlebriarrose: { name: 'Bristla', elements: ['grass'], work: { planting: 1, handiwork: 1, medicine: 1, gathering: 1 } },
  pinkrabbit: { name: 'Flopie', elements: ['grass'], work: { planting: 1, medicine: 1, gathering: 1, transporting: 1 } },
  baphomet: { name: 'Incineram', elements: ['fire', 'dark'], work: { kindling: 1, handiwork: 2, mining: 1, transporting: 2 } },
  baphometdark: { name: 'Incineram Noct', elements: ['dark'], work: { handiwork: 2, mining: 1, transporting: 2 } },
  flamebuffalo: { name: 'Arsox', elements: ['fire'], work: { kindling: 2, lumbering: 1 } },
  lazycatfish: { name: 'Dumud', elements: ['ground'] },
  darkcrow: { name: 'Cawgnito', elements: ['dark'], work: { lumbering: 1 } },
  lizardman: { name: 'Leezpunk', elements: ['dark'], work: { gathering: 1 } },
  lizardmanfire: { name: 'Leezpunk Ignis', elements: ['fire'], work: { kindling: 1, gathering: 1 } },
  werewolf: { name: 'Loupmoon', elements: ['dark'], work: { handiwork: 2 } },
  hawkbird: { name: 'Galeclaw', elements: ['neutral'], work: { gathering: 2 } },
  robinhood: { name: 'Robinquill', elements: ['grass'], work: { planting: 1, handiwork: 2, gathering: 2, medicine: 1, transporting: 1 } },
  robinhoodground: { name: 'Robinquill Terra', elements: ['ground'] },
  gorilla: { name: 'Gorirat', elements: ['neutral'] },
  soldierbee: { name: 'Beegarde', elements: ['grass'], work: { planting: 1, handiwork: 1, medicine: 1, gathering: 1, farming: 1 } },
  queenbee: { name: 'Elizabee', elements: ['grass'] },
  naughtycat: { name: 'Grintale', elements: ['neutral'], work: { gathering: 2 } },
  mopbaby: { name: 'Swee', elements: ['ice'], work: { cooling: 1 } },
  mopking: { name: 'Sweepa', elements: ['ice'], work: { cooling: 2 } },
  weaseldragon: { name: 'Chillet', elements: ['ice', 'dragon'], work: { cooling: 1 } },
  kirin: { name: 'Univolt', elements: ['electric'], work: { electricity: 2, lumbering: 1, transporting: 1 } },
  icefox: { name: 'Foxcicle', elements: ['ice'], work: { cooling: 2 } },
  firekirin: { name: 'Pyrin', elements: ['fire'], work: { kindling: 2, lumbering: 1 } },
  firekirindark: { name: 'Pyrin Noct', elements: ['fire', 'dark'], work: { kindling: 2, lumbering: 1 } },
  icedeer: { name: 'Reindrix', elements: ['ice'], work: { lumbering: 2, cooling: 2 } },
  thunderdog: { name: 'Rayhound', elements: ['electric'] },
  amaterasuwolf: { name: 'Kitsun', elements: ['fire'], work: { kindling: 2 } },
  raijindaughter: { name: 'Dazzi', elements: ['electric'], work: { electricity: 1, handiwork: 1 } },
  flowerdinosaur: { name: 'Dinossom', elements: ['grass', 'dragon'], work: { planting: 2, lumbering: 2 } },
  flowerdinosaurelectric: { name: 'Dinossom Lux', elements: ['electric', 'dragon'], work: { electricity: 2, lumbering: 2 } },
  serpent: { name: 'Surfent', elements: ['water'], work: { watering: 2 } },
  serpentground: { name: 'Surfent Terra', elements: ['ground'] },
  ghostbeast: { name: 'Maraith', elements: ['dark'] },
  drillgame: { name: 'Digtoise', elements: ['ground'], work: { mining: 3 } },
  catbat: { name: 'Tombat', elements: ['dark'], work: { gathering: 2, mining: 2, transporting: 2 } },
  pinklizard: { name: 'Lovander', elements: ['neutral'], work: { handiwork: 2, mining: 2, medicine: 2 } },
  lavagirl: { name: 'Flambelle', elements: ['fire'], work: { kindling: 1, handiwork: 1 } },
  birddragon: { name: 'Vanwyrm', elements: ['fire', 'dark'], work: { kindling: 1, transporting: 3 } },
  birddragonice: { name: 'Vanwyrm Cryst', elements: ['ice', 'dark'], work: { cooling: 2, transporting: 3 } },
  ronin: { name: 'Bushi', elements: ['fire'], work: { kindling: 2, handiwork: 1, lumbering: 3, gathering: 1, transporting: 2 } },
  thunderbird: { name: 'Beakon', elements: ['electric'], work: { electricity: 2, gathering: 1, transporting: 3 } },
  catmage: { name: 'Katress', elements: ['dark'], work: { handiwork: 2 } },
  foxmage: { name: 'Wixen', elements: ['fire'], work: { kindling: 2 } },
  grassrabbitman: { name: 'Verdash', elements: ['grass'], work: { gathering: 3, lumbering: 2, planting: 2, handiwork: 2, transporting: 2 } },
  violetfairy: { name: 'Vaelet', elements: ['grass'] },
  whitemoth: { name: 'Sibelyx', elements: ['ice'], work: { cooling: 2, farming: 1 } },
  fairydragon: { name: 'Elphidran', elements: ['dragon'] },
  fairydragonwater: { name: 'Elphidran Aqua', elements: ['dragon', 'water'] },
  kelpie: { name: 'Kelpsea', elements: ['water'], work: { watering: 1 } },
  bluedragon: { name: 'Azurobe', elements: ['water', 'dragon'], work: { watering: 3 } },
  whitetiger: { name: 'Cryolinx', elements: ['ice'] },
  manticore: { name: 'Blazehowl', elements: ['fire'], work: { kindling: 3, lumbering: 1 } },
  manticoredark: { name: 'Blazehowl Noct', elements: ['fire', 'dark'], work: { kindling: 3, lumbering: 1 } },
  lazydragon: { name: 'Relaxaurus', elements: ['water', 'dragon'] },
  sakurasaurus: { name: 'Broncherry', elements: ['grass'] },
  sakurasauruswater: { name: 'Broncherry Aqua', elements: ['grass', 'water'] },
  flowerdoll: { name: 'Petallia', elements: ['grass'] },
  volcanicmonster: { name: 'Reptyro', elements: ['fire', 'ground'], work: { kindling: 3, mining: 3 } },
  volcanicmonsterice: { name: 'Ice Reptyro', elements: ['ice', 'ground'], work: { cooling: 3, mining: 3 } },
  kingalpaca: { name: 'Kingpaca', elements: ['neutral'] },
  kingalpacaice: { name: 'Ice Kingpaca', elements: ['ice'] },
  yeti: { name: 'Wumpo', elements: ['ice'] },
  yetigrass: { name: 'Wumpo Botan', elements: ['grass'] },
  herculesbeetle: { name: 'Warsect', elements: ['grass', 'ground'], work: { planting: 1, handiwork: 1, lumbering: 3, transporting: 3 } },
  fengyundeeper: { name: 'Fenglope', elements: ['neutral'], work: { lumbering: 2 } },
  catvampire: { name: 'Felbat', elements: ['dark'], work: { medicine: 3 } },
  skydragon: { name: 'Quivern', elements: ['dragon'] },
  grassmammoth: { name: 'Mammorest', elements: ['grass'] },

  // --- late game & legendaries ------------------------------------------------
  kingbahamut: { name: 'Blazamut', elements: ['fire'], work: { kindling: 3, mining: 4 } },
  hadesbird: { name: 'Helzephyr', elements: ['dark'], work: { transporting: 3 } },
  blackmetaldragon: { name: 'Astegon', elements: ['dragon', 'dark'], work: { mining: 4 } },
  darkscorpion: { name: 'Menasting', elements: ['dark', 'ground'] },
  anubis: { name: 'Anubis', elements: ['ground'], work: { handiwork: 4, mining: 3, transporting: 2 } },
  umihebi: { name: 'Jormuntide', elements: ['water', 'dragon'], work: { watering: 4 } },
  umihebifire: { name: 'Jormuntide Ignis', elements: ['fire', 'dragon'], work: { kindling: 4 } },
  suzaku: { name: 'Suzaku', elements: ['fire'], work: { kindling: 3 } },
  suzakuwater: { name: 'Suzaku Aqua', elements: ['water'], work: { watering: 3 } },
  elecpanda: { name: 'Grizzbolt', elements: ['electric'], work: { electricity: 3, handiwork: 2, lumbering: 2, transporting: 3 } },
  lilyqueen: { name: 'Lyleen', elements: ['grass'], work: { planting: 4, handiwork: 3, gathering: 2, medicine: 3 } },
  lilyqueendark: { name: 'Lyleen Noct', elements: ['grass', 'dark'], work: { planting: 3, handiwork: 3, medicine: 3 } },
  horus: { name: 'Faleris', elements: ['fire'], work: { kindling: 3, transporting: 3 } },
  thunderdragonman: { name: 'Orserk', elements: ['dragon', 'electric'], work: { electricity: 4, handiwork: 2, transporting: 3 } },
  blackgriffon: { name: 'Shadowbeak', elements: ['dark'] },
  saintcentaur: { name: 'Paladius', elements: ['neutral'] },
  blackcentaur: { name: 'Necromus', elements: ['dark'] },
  icehorse: { name: 'Frostallion', elements: ['ice'], work: { cooling: 4 } },
  icehorsedark: { name: 'Frostallion Noct', elements: ['dark'] },
  jetdragon: { name: 'Jetragon', elements: ['dragon'] },
  nightlady: { name: 'Bellanoir', elements: ['dark'] },
  nightladydark: { name: 'Bellanoir Libero', elements: ['dark'] },
}

/** Ids matching these are captured humans (guards, raiders), not pals. */
const HUMAN_ID = /^(hunter|police|soldier|believer|visitor|guard|male|female|salesperson|npc|randomevent|firecult|scientist|viking|yamishima)/i

const normalise = (id: string) => id.toLowerCase().replace(/_/g, '')

/** Looks up a species by internal id (alpha/boss prefix already stripped). */
export function speciesInfo(speciesId: string): SpeciesInfo | null {
  return T[normalise(speciesId)] ?? null
}

export function isHumanCharacter(speciesId: string): boolean {
  return HUMAN_ID.test(speciesId)
}

/** Number of table entries — exposed for tests and the settings/about card. */
export const SPECIES_TABLE_SIZE = Object.keys(T).length
