# PalBoard Tasks

Running log of concrete work. See [ROADMAP.md](ROADMAP.md) for the phase plan.

## Done

### Save format research
- [x] Identified container variants: `PlZ` (zlib), `PlM` (Oodle), `CNK` (Xbox wrapper)
- [x] Confirmed this machine's Palworld 1.0 saves are `PlM`/Oodle — the format that
      broke most community tooling
- [x] Verified `ooz-wasm` decodes them: 1.8 MB → 26.6 MB in ~25 ms
- [x] Mapped `worldSaveData` subtree sizes to decide what to skip
- [x] Unioned every field across all 581 characters so the model covers fields
      Palworld omits when they hold default values

### Parser
- [x] `FArchiveReader`: UE primitives, FString (ASCII + UTF-16), FGuid, FVector/FQuat/FTransform
- [x] GVAS header + property parser for all types seen in Palworld saves
- [x] `SetProperty` support (`InLockerCharacterInstanceIDArray` needs it)
- [x] Subtree skipping via declared byte sizes
- [x] Error recovery boundary: a failed subtree seeks to its end and reports a warning
- [x] Palworld `RawData` decoders: character, base camp, group, containers

### Palworld 1.0 format deltas found and handled
- [x] Character `RawData` has 4 trailing bytes beyond the documented layout
- [x] Base camp `RawData` has 4 trailing bytes
- [x] Group `RawData` adds a 4-byte field **after** the character handle array
- [x] Guild adds a second int32 between `baseCampLevel` and the camp point array
- [x] Added type hints absent from community tables: `LockGimmickSaveData`,
      `GuildExtraSaveDataMap`, `InLockerCharacterInstanceIDArray`

### App
- [x] Save locator (Windows + Proton/Wine), manual folder picker with parent-folder fallback
- [x] Watcher using `awaitWriteFinish` so partial writes are never parsed
- [x] `SaveStore` with serialised reloads (coalesces writes during a parse)
- [x] Typed IPC contract, context-isolated preload bridge
- [x] Dashboard, Pals (virtualized), Bases, Settings, Welcome/onboarding
- [x] 35 tests across compression, GVAS parsing, and business logic
- [x] Verified running app end to end with a Playwright driver

### Bugs found and fixed
- [x] **Double-zlib truncation** — for `saveType 0x32`, `compressedLen` is the size *after*
      the first inflate, not the on-disk payload size; slicing to it truncated the stream.
      Caught by a test before it could reach a user with a pre-0.6 save.
- [x] **Stomach is not a percentage** — real values reached 450. Max stomach varies by
      species and lives in the game's data tables, so hunger now uses Palworld's own
      `HungerType` flag rather than a made-up threshold.
- [x] Electron ESM: `electron`'s CJS shim has no named ESM exports → build main as CommonJS
- [x] `ooz-wasm` is ESM with top-level await → load it through a real dynamic import

### Market-ready push (July 2026)

- [x] **Slot layout reverse-engineered**: post-0.3.7 item slots are custom binary
      (`u32 index, u32 count, fstring id, 2×guid dynamic ref`). Verified against all
      10,907 slots of a real save with zero failures.
- [x] Inventory: world storage aggregation + per-player pouches + resource totals
- [x] Species data table (~130 well-established ids → names/elements/suitabilities),
      case/underscore-insensitive lookup, captured-human detection, honest fallback
- [x] Item names, category rules, resource groups from the real id vocabulary
- [x] Alerts engine (starving/sick/depressed/storage/palbox/idle bases) + OS notifications
- [x] Player records: Paldeck count (= captured species), towers, fast travels, captures
- [x] History time-series (JSONL per world in userData) + over-time charts
- [x] Pal detail drawer, command palette (Ctrl+K), pan/zoom map, statistics page,
      inventory page, dashboard v2, accent themes, custom title bar, app icon,
      CSV/JSON exports, window-state persistence, single-instance lock
- [x] 48 tests across compression, GVAS, gamedata, alerts, model

## Next up

- [ ] Decode `MapObjectSaveData` `ConcreteModel` for per-building status and production
- [ ] Breeding farms, egg timers, expected offspring
- [ ] Per-base storage attribution (needs ConcreteModel container links)
- [ ] Move parsing to a worker thread before heavier derived data lands

## Known limitations

- **Species table is partial by design** (~130 confidently known ids; ~57% of a late-game
  1.0 save's pals). Unmapped species — mostly post-1.0 additions like `MonochromeQueen` —
  show a humanised id and a hash-colored avatar rather than a guessed name.
- **Play time is not shown** — Palworld does not record it in the save. PalBoard will
  need to track it itself over time.
- **Base names are generated** (`Base 1`, `Base 2`) because Palworld stores only an
  internal template string, not a player-facing name.
- **Guild player roster is read from character data**, not from the guild's own embedded
  roster, whose 1.0 layout gained fields that could not be confidently identified. The
  names are identical; this is just a more robust source.
- **Parsing runs on the main process** (~250 ms). Fine at this cadence, but it should
  move to a worker thread before Phase 3 adds heavier derived data.
- **Xbox Game Pass containers** are not located automatically. `CNK` decompression is
  implemented, but the Game Pass folder layout is not yet discovered.
