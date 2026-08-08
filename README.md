# PalBoard

**A Palworld save dashboard that runs entirely in your browser.** Drop your save folder on
the page and it decodes a proprietary binary format the game never documented — no upload,
no account, no install, and no write path anywhere near your world.

<p>
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-135%20passing-3fb950">
  <img alt="Licence" src="https://img.shields.io/badge/licence-GPL--3.0--or--later-blue">
</p>

![PalBoard dashboard](assets/main_screen.png)

`Level.sav` is a 32 MB Unreal Engine `GVAS` tree wrapped in an undocumented container and
compressed with Oodle, a proprietary codec. PalBoard opens it in **about half a second** in a
browser tab — 1,008 pals, 4 bases, 988 structures — and can keep following it as you play.

## Why it works without a server

Everything the app needs is in the page:

- **Oodle** decodes through [`ooz-wasm`](https://github.com/SnosMe/ooz-wasm), a WebAssembly
  build of the open-source `ooz` reimplementation. Decode-only, which is all a read-only
  dashboard needs.
- **zlib** is `fflate`, so the parser has no Node dependency.
- **The 32 MB parse runs in a Web Worker**, so the page never freezes on an autosave.
- The save is read from a `File` or a directory handle and **never sent anywhere**. There is
  no backend to send it to; the page's own Content-Security-Policy has no remote origin in
  it, so an accidental upload would fail before it left the browser.

## Coming back

Opening a save is a one-time act. PalBoard keeps it in IndexedDB — on your machine, under
this site's origin — so a later visit goes straight to the dashboard with nothing to pick
again. Two things are stored, doing different jobs:

| | What it is | Why |
|---|---|---|
| **The save bytes** | a copy of `Level.sav` and friends, ~2–3 MB | reopens instantly, in every browser, with no prompt |
| **The folder handle** | a reference, no data | lets PalBoard re-read the folder and follow autosaves |

Browsers drop a folder's read permission on restart and will only re-grant it inside a
click. Rather than greet a returning visitor with a permission prompt, PalBoard renders the
stored copy immediately and offers a **Reconnect** button in Settings to resume live updates.

**Forget this save** in Settings erases all of it — bytes, chart history and folder
permission — and is verified to actually do so by the browser driver.

## Live sync, and why it is the secondary path

PalBoard can follow a save as the game writes it: a 5-second timer checks `Level.sav`'s
mtime — one stat call, not a 32 MB reparse — and re-reads only when it moves. That needs a
`FileSystemDirectoryHandle`, which only the File System Access API provides.

**Chromium refuses to hand out a handle for anything under `AppData`.** Both
`DIR_ROAMING_APP_DATA` and `DIR_LOCAL_APP_DATA` are in its blocklist as `kBlockAllChildren`
([source](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc)),
and the picker answers *"Can't open this folder because it contains system files."* That is
precisely where Palworld keeps Steam and Game Pass saves, so live sync is unavailable to
most Windows players no matter which button they press.

| Where the save lives | Opening it | Follows autosaves |
|---|---|---|
| `%LOCALAPPDATA%\Pal\...` (Steam, Windows) | upload / drag-drop | No — Chrome blocks the folder API here |
| `%LOCALAPPDATA%\Packages\...` (Game Pass) | upload / drag-drop | No — same block |
| Dedicated server directory | "Open as a live folder" | **Yes** |
| `~/.steam/...` (Linux / Proton) | "Open as a live folder" | **Yes** — home is not blocklisted |
| Anywhere, on Firefox or Safari | upload / drag-drop | No — no File System Access API |

So the landing page leads with the plain upload button, which uses an ordinary OS dialog and
works everywhere, and offers the live folder as a clearly-labelled secondary option. Uploads
are a snapshot; press Reload to pick up newer saves.

---

## Screens

### Dashboard

The landing view resolves the whole world into one screen: a live resource strip, workers,
alphas, structures, towers and fast travels; alerts for starving pals and near-full storage;
a per-player breakdown with Paldeck progress; and base cards with in-game compass coordinates.
The status bar reports the parse itself — container codec, compression ratio, timing, slots
read, and any warnings.

### Pals

| Virtualized table | Detail drawer |
|---|---|
| [![Pals table](assets/pal_screen.png)](assets/pal_screen.png) | [![Pal detail drawer](assets/pal_screen_2.png)](assets/pal_screen_2.png) |

Every owned pal in a virtualized table that stays smooth at any world size — nicknames, real
species names and elements, level, IVs, food, sanity, whereabouts and passive skills, with
full-text search, quick filters (alpha, lucky, condensed, hungry, depressed…), sorting, and
CSV export. Selecting a row opens a drawer with live condition, IV bars, condense rank and
soul enhancements, skills, and exactly where the pal lives.

### Bases and inventory

| Bases | Inventory |
|---|---|
| [![Bases](assets/bases_screen.png)](assets/bases_screen.png) | [![Inventory](assets/inventory_screen.png)](assets/inventory_screen.png) |

**Bases** lists each camp with its worker count, structure count, real influence radius,
an attention counter for hungry, sad or sick workers, and the full assigned roster.

**Inventory** aggregates the storage you actually own — chests standing in your bases, plus
each player's pouches — searched, category-filtered, sorted and exported to CSV.

### Statistics

[![Statistics](assets/statistics_screen.png)](assets/statistics_screen.png)

Level distribution, element mix, top species with alpha counts, and IV quality. **Pals over
time** is recorded by PalBoard itself, since the save keeps no history.

Also: an interactive **Map** in the game's compass coordinates, and a `Ctrl+K` command palette
that fuzzy-searches pals, items, bases and actions.

---

## How it works

### The save format

Palworld saves are GVAS (Unreal Engine 5.1 `SaveGame`) payloads inside a small custom
container. Three variants exist in the wild; PalBoard reads all three.

| Magic | Codec | Seen in |
|-------|-------|---------|
| `PlZ` | zlib, single or double pass | Palworld < 0.6 |
| `PlM` | Oodle (Kraken/Mermaid family) | Palworld ≥ 0.6, including 1.0 |
| `CNK` | Xbox/Game Pass envelope around one of the above | Game Pass |

### Two things make it fast

**Selective parsing.** `Level.sav` decompresses to ~32 MB, but a large share of that is world
foliage and dungeon spawner state a dashboard never shows. Every GVAS property declares its
own byte length, so the parser seeks straight past those subtrees (`LEVEL_SKIP_PATHS`) instead
of allocating millions of objects.

**Read-only decoding.** Because PalBoard never writes saves, the parser discards UE's
round-tripping metadata — property GUIDs, struct ids, declared type names — and decodes
directly to plain JS values. An `IntProperty` becomes a `number`, not a wrapper object.

### Whose chest is it?

`ItemContainerSaveData` holds *every* container on the island. In a real 1.0 world about
4,900 of ~5,000 are unopened treasure chests, enemy camp loot and drop tables for wild pals,
each carrying a few hundred gold. Summing them reports the whole map's contents as the
player's — 6.7M gold against the 1.7M actually held, and 12,696 "storage slots" against a
real 429.

Ownership is resolved structurally instead. Each placed object records the base camp it
stands in, and a storage object carries an `ItemContainer` module naming the container it
owns; one pass over `MapObjectSaveData` yields both. Storage is what a base you founded can
reach, plus each player's own pouches. Everything else is scenery.

### Resilience to game updates

Palworld reshapes its save between patches. The parser is built so that costs one subtree,
not the whole save:

- Container properties parse inside a boundary that restores the cursor to the property's
  declared end — whether the inner parse under-read, over-read, or threw.
- Unknown property types are skipped by declared size rather than desynchronising the stream.
- Unrecognised struct types fall back to a nested property walk.
- Every recovery is reported as a warning and surfaced in the UI, so drift is **visible**
  rather than silent. That includes the chest-ownership link above: if it ever stops
  resolving, Inventory says so instead of quietly showing an empty world.

### Names and static data

The save stores developer ids (`AmaterasuWolf_Dark`, `Pal_crystal_S`) and no static
per-species data. Rather than ship a hand-maintained community table, PalBoard extracts
display names straight from the game's own localisation assets
(`tools/extract-gamedata.ts`) — 322 pals, 1,993 items, 1,141 skills. Anything unmapped
renders as a humanised id rather than a guess.

## Architecture

```
core/                platform-neutral parser — no Node built-ins, runs in both shells
  compression.ts     PlZ / PlM / CNK containers (fflate + ooz-wasm)
  gvas/              generic Unreal GVAS reader + property parser
  palworld/          type hints, RawData decoders, domain mapping, alerts
  loader.ts          WorldSource -> SaveSnapshot
  exporter.ts        CSV / JSON exports
shared/              domain model, platform contract, extracted game data
src/
  platform/          the browser adapter
    worldSource.ts   dropped files / directory handle -> WorldSource
    parse.worker.ts  decompress + parse off the main thread
    storage.ts       the remembered save, in IndexedDB
    history.ts       the over-time series, in localStorage
    webApi.ts        window.palboard for the browser
  pages/             Landing, Dashboard, Pals, Bases, Inventory, Map, Statistics, Settings
  components/ stores/
electron/            desktop shell — see "Desktop" below
tests/               parser, compression, inventory, watcher and business-logic tests
tools/               dev utilities: survey, probes, verify, data extraction, browser driver
```

**One parser, two shells.** `core/loader.ts` takes a `WorldSource` — read a path, list a
directory, stat a file — and nothing under it knows what a filesystem is. The web build
satisfies that interface over dropped `File`s or a `FileSystemDirectoryHandle`; the desktop
build satisfies it over `node:fs`.

**One API surface.** Every page talks to `window.palboard` and nothing else. On the web that
is `createWebApi()`, installed before React mounts; the pages themselves were not rewritten
for the port.

**Buffer.** The GVAS reader is written against Buffer's typed accessors, and the browser gets
them from the `buffer` polyfill — a `Uint8Array` subclass. That is a deliberate trade: ~20 kB
gzipped instead of rewriting 2,000 lines of verified binary parsing.

## Getting started

```bash
npm install
npm run dev        # hot-reloading dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve the built site
npm test           # 135 tests
```

To see the whole browser path working against a real save — WASM, worker, upload, every
screen — point the driver at a world folder:

```bash
npm run build
npm run drive -- "%LOCALAPPDATA%\Pal\Saved\SaveGames\<steam-id>\<world>"
```

It screenshots every page into `shots/` and fails on any console error, a tooltip that
renders unreadably, horizontal overflow at phone width, a reload that does not restore the
remembered save, or a "Forget" that leaves data behind.

## Deploying

`npm run build` produces a static `dist/`. There is no backend, no environment variable and
no server runtime. Asset paths are relative and routing is hash-based, so it works from a
domain root or a subpath with **no rewrite rules**.

| Host | Build command | Output | Notes |
|---|---|---|---|
| **Cloudflare Pages** | `npm run build` | `dist` | Simplest. Leave the deploy command empty. |
| **Cloudflare Workers** | `npm run build` | `dist` | `wrangler.jsonc` is included — see below. |
| **Netlify** | `npm run build` | `dist` | `netlify.toml` is included. |
| **Vercel** | `npm run build` | `dist` | Framework preset: Vite. |
| **GitHub Pages** | `npm run build` | `dist` | Relative `base` makes `/<repo>/` work. |
| **Any web server** | — | — | Copy `dist/` in. |

`public/_headers` travels with the build and sets the security and caching headers on
Cloudflare and Netlify alike.

### A note on Cloudflare Workers

Cloudflare now steers new projects towards **Workers** rather than Pages, which means the
deploy step runs `npx wrangler deploy`. With no Wrangler config in the repo, that command
starts an interactive setup that CI auto-answers "yes" to: it rewrites `vite.config.ts` to
add `@cloudflare/vite-plugin`, does not install it, re-runs the build, and fails on its own
edit.

`wrangler.jsonc` exists to prevent that. It declares an assets-only deployment — no `main`,
because there is no server code to run — so Wrangler skips setup and just uploads `dist/`.

**Cloudflare Pages remains the better fit**: same result, and no deploy command at all.

## Desktop

`electron/` holds the original desktop shell: save auto-discovery, a debounced write-aware
file watcher, and history on disk. It shares `core/` and still typechecks, but the renderer
now targets the web adapter's API, so **the desktop build needs its preload bridge widened to
the same surface before it will run again** (`openFiles`, `openDirectory`, `isLive`, `setLive`,
`forget`, `canOpenDirectory`). The web app is the maintained target.

### Development tools

```bash
npx vite-node tools/verify.ts <worldDir>  # load a save, print the domain model
npx vite-node tools/survey.ts <worldDir>  # size every subtree of Level.sav
npx vite-node tools/probe-fields.ts <dir> # union every field across all characters
```

## Safety

PalBoard opens save files for reading only. There is no write path in the codebase — the
Oodle binding is decode-only and no adapter exposes a mutation API. It is safe to leave open
while you play.

## Licence

GPL-3.0-or-later, inherited from `ooz-wasm`.

Not affiliated with Pocketpair. Palworld and its assets belong to their owners.
