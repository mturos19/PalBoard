# PalBoard Roadmap

Phased plan. Each phase ends with the app compiling, tests passing, and the
feature usable against a real save.

---

## Phase 1 — Foundation ✅ complete

Goal: prove the save can be read, and get a live dashboard on screen.

- [x] Project setup: Electron + Vite + React 19 + TypeScript + Tailwind v4
- [x] Container decompression: `PlZ` (zlib ×1/×2), `PlM` (Oodle), `CNK` (Xbox)
- [x] Generic GVAS reader and property parser
- [x] Palworld type hints and `RawData` decoders
- [x] Save auto-discovery + manual folder selection
- [x] Debounced, write-aware file watcher → live updates
- [x] Domain model: world, players, guilds, pals, bases
- [x] Typed IPC contract and preload bridge
- [x] Dashboard, app shell, live-sync indicator
- [x] Tests for parser, compression, and business logic

**Outcome:** 26.6 MB save parsed in ~300 ms with zero warnings.

---

## Phase 2 — Depth (in progress)

Goal: go from summary to detail.

### Pals
- [x] Virtualized table, search, quick filters, sorting
- [ ] Pal detail drawer: full stats, skills, equipment, ownership history
- [ ] Computed effective stats (IV + condense + souls + passives)
- [ ] Work suitability columns — **needs the species data table** (see Data below)
- [ ] Favourite flag, `FavoriteIndex`

### Bases
- [x] Coordinates, worker roster, structure counts, problem pals
- [ ] Building breakdown by type (ranch, furnace, crusher, generator, incubator…)
- [ ] Per-building status: assigned worker, current production, progress
- [ ] Base resource totals (wood, stone, ore, ingots, food, ammo, spheres…)
- [ ] Workforce view by suitability with idle / overworked / injured highlighting
- [ ] Efficiency score and happiness

### Inventory & storage
- [ ] Decode `ItemContainerSaveData` slots (5,065 containers in a typical world)
- [ ] Player, pal, and base inventories
- [ ] Aggregated storage: searchable, sortable, filterable by category
- [ ] Total carried weight

### Breeding
- [ ] Breeding farms with parents and egg type
- [ ] Incubator timers and remaining time
- [ ] Expected offspring where calculable

---

## Phase 3 — Insight

- [ ] Statistics: resources over time, pal count, species captured, production,
      food and electricity usage, worker utilisation
- [ ] Time-series store — PalBoard records history itself, since the save has none
- [ ] Notifications: generator unmanned, food low, incubator finished, pal starving,
      pal depressed, storage nearly full
- [ ] Global search across pals, items, buildings, bases and recipes
- [ ] Keyboard shortcuts and a command palette
- [ ] CSV / JSON export

---

## Phase 4 — Polish and extension

- [ ] Interactive map: bases, fast travel points, ore/oil/quartz nodes
- [ ] Plugin system (see below)
- [ ] Technology tree viewer, recipe browser, achievement/boss/alpha trackers
- [ ] Backup manager with auto-backup and save comparison
- [ ] Theme support beyond the default dark theme
- [ ] Dedicated-server monitoring and multiplayer guild dashboard

---

## Cross-cutting

### Data
The save stores developer ids (`StuffedShark`, `Manticore_Dark`), not display names,
and omits static per-species data. A bundled data table is the single biggest unlock
for Phase 2 — it enables real species names, base work suitabilities, max stomach,
element types, and breeding combos.

### Performance
Current numbers on a 581-character world: 26 ms decompress, ~195 ms parse, ~55 ms model
build. Planned work:
- [ ] Move parsing to a worker thread / utility process so the main process never blocks
- [ ] Incremental reparse — only re-read files whose mtime changed
- [ ] Structural sharing between snapshots to cut IPC payload size

### Plugin system
Design targets, informing current structure:
- The domain model in `shared/domain.ts` is the plugin-facing contract.
- Parsing, watching, and business logic are already separated, so a plugin can subscribe
  to snapshots without touching the parser.
- Planned plugin surface: a registration hook for extra pages, derived-data providers,
  and notification rules.
