# PalBoard

A real-time, **read-only** desktop dashboard for Palworld. It finds your local save,
parses it, and keeps the UI live as the game autosaves. It never writes to your saves.

## What works today

- **Auto-detects** Palworld worlds (Windows and Proton/Wine layouts), remembers the last one, or point it at a folder manually.
- **Live sync** — watches the world folder and re-parses within a couple of seconds of an autosave; single-instance app with persisted window state and a native-overlay custom title bar.
- **Dashboard** — hero summary, live resource strip (gold, wood, ore, ingots…), alerts, pals needing attention, per-player technology points, Paldeck species caught, towers cleared, fast travels unlocked.
- **Pals** — every owned pal in a virtualized table: species names and elements from a bundled data table, avatars, search, quick filters, sorting — and a full **detail drawer** (IVs, souls, condense rank, work suitability with base+added levels, skills, whereabouts).
- **Inventory** — all 10k+ storage slots decoded and aggregated: world storage plus each player's pouches, searchable, category-filtered, sortable, CSV export.
- **Map** — pan/zoom map in the game's own compass coordinates: bases with their real influence radius, worker/structure counts, and last player positions.
- **Statistics** — level distribution, element donut, top species, IV quality, plus **pals/resources over time** recorded by PalBoard itself (the save keeps no history).
- **Alerts & notifications** — starving/sick/depressed pals, near-full storage, near-full palbox, idle bases; critical ones raise OS notifications (toggleable).
- **Command palette** — `Ctrl+K` fuzzy search across pals, items, bases, pages and actions.
- **Exports** — pals as CSV/JSON, storage as CSV.
- **Settings** — switch worlds, accent themes, shortcuts, parser diagnostics and warnings.

Verified against a real Palworld 1.0 save: 26.6 MB of decompressed save data, 581 characters,
3 bases, 3,626 structures, **10,907 item slots** — parsed in **~330 ms** end to end, zero warnings.

## Quick start

```bash
npm install
npm run dev      # hot-reloading dev app
npm run build    # typecheck + production build
npm start        # run the built app
npm test         # parser and business-logic tests
```

## How save reading works

Palworld saves are GVAS (Unreal Engine 5.1 SaveGame) payloads inside a small custom
container. Three container variants exist, and PalBoard reads all of them:

| Magic | Codec | Seen in |
|-------|-------|---------|
| `PlZ` | zlib, single or double pass | Palworld < 0.6 |
| `PlM` | Oodle (Kraken/Mermaid family) | Palworld >= 0.6, including 1.0 |
| `CNK` | Xbox/Game Pass envelope around one of the above | Game Pass |

Oodle is proprietary, so decoding uses [`ooz-wasm`](https://github.com/SnosMe/ooz-wasm) —
a WebAssembly build of the open-source `ooz` reimplementation. It is decode-only,
which is all a read-only dashboard needs.

### Species and item names

The save stores internal ids (`KingBahamut`, `Pal_crystal_S`). A bundled community data
table maps the well-established ones to display names, elements and base work
suitabilities (~130 species); anything unmapped shows a humanised id rather than a guess.
Item categories are rule-based over the id vocabulary observed in real saves.

### Two things make it fast

**Selective parsing.** `Level.sav` decompresses to ~26 MB, but a large share of that is
world foliage and dungeon spawner state a dashboard never shows. Every GVAS property
declares its own byte length, so the parser seeks straight past those subtrees
(see `LEVEL_SKIP_PATHS`) instead of allocating millions of objects.

**Read-only decoding.** Because PalBoard never writes saves, the parser discards UE's
round-tripping metadata (property GUIDs, struct ids, declared type names) and decodes
directly to plain JS values. An `IntProperty` becomes a `number`, not a wrapper object.

### Resilience to game updates

Palworld reshapes its save between patches. The parser is built so that costs you one
subtree, not the whole save:

- Container properties are parsed inside a boundary that restores the cursor to the
  property's declared end — whether the inner parse under-read, over-read, or threw.
- Unknown property types are skipped by their declared size rather than desynchronising
  the stream.
- Unrecognised struct types fall back to a nested property walk.
- Every recovery is reported as a warning and surfaced in the UI, so drift is visible
  rather than silent.

## Architecture

```
electron/            main process — never exposed to the renderer
  parser/
    compression.ts   PlZ / PlM / CNK container handling
    gvas/            generic Unreal GVAS reader + property parser
    palworld/        Palworld type hints, RawData decoders, domain mapping
    loader.ts        world folder -> SaveSnapshot
  locator/           save auto-discovery and folder validation
  watcher/           debounced, write-aware file watching
  services/          SaveStore: the single source of truth
  api/               IPC handlers
shared/              domain model + typed IPC contract (both processes)
src/                 renderer (React)
  components/ pages/ stores/ lib/ types/
tests/               parser and business-logic tests
tools/               dev utilities: survey, probes, verify, UI driver
```

**Separation of concerns.** The GVAS parser knows nothing about Palworld — it leaves
game-specific `RawData` blobs as `Buffer`s. `parser/palworld/` decodes those and maps
them onto `shared/domain`. The renderer only ever sees domain types, so a save-format
change is absorbed in one layer.

**Single source of truth.** The main process owns state. The renderer mirrors it and
issues commands; it never derives save data independently.

## Safety

PalBoard opens save files for reading only. There is no write path in the codebase —
the Oodle decoder is decode-only and the preload bridge exposes no mutation API. It is
safe to leave running while you play.

## Development tools

```bash
npx vite-node tools/verify.ts             # load your save, print the domain model
npx vite-node tools/survey.ts <worldDir>  # size every subtree of Level.sav
npx vite-node tools/probe-fields.ts <dir> # union every field across all characters
node tools/drive.mjs                      # launch the built app and screenshot it
```

See [ROADMAP.md](ROADMAP.md) for what's planned and [TASKS.md](TASKS.md) for current work.

## Licence

GPL-3.0-or-later, inherited from `ooz-wasm`.
