# Architecture — EDITORS.Acoustic.Like.audio

← [Wiki home](../README.md)

What every control does is in the repo [README](../../README.md#what-it-does); the mathematics is in [Documentation/acoustics/](../acoustics/README.md); the classic windows in [Documentation/acoustic-x/](../acoustic-x/README.md). This page is how the app is put together.

## Entry point

`index.html` loads `js/main.js` as a module. The plan tile is an iframe of the CAD at the address `js/site.js` names (`../EDITORS.CAD.Like.audio/dist/index.html` in the tree; the deploy copies `js/site.published.js` over it, `cad/index.html`), opened at `#/drawing?host=acoustic`. `js/site.js` also names the parts catalogue the rack panel fetches, relative to the page. `main.js` wires:

| Piece | File | Role |
|---|---|---|
| the store | `js/model/store.js` (`createStore`) | speakers, mics, sets, racks, furniture, settings; undo/redo; saved to `localStorage` per CAD file name |
| the CAD link | `js/cad/cadLink.js` (`connectCad`) | same-origin `postMessage`, protocol `cad.like.audio/host@1` (schema and samples vendored from the CAD in `vendor/cad.like.audio/contract/`, held by `tests/cadContract.test.mjs`), to the iframe — or to `window.opener` when the CAD is popped out |
| the engine | `js/compute/engine.js` (`createEngine`) | builds the room, schedules the field on a module Worker (`fieldWorker.js`), refines in passes |
| the views | `js/views/` | plan overlay, ceiling and elevations, the Wall page, 3-D cut-away, colour maps |
| the UI | `js/ui/` | inspector, meter bridge, rack panel, tour, wizard, licence, pop-out |
| Acoustic X | `js/acoustx/` (`createAcousticX`) | the 1997-style windows and their `data.json` |

## Data flow

```text
CAD (iframe) ── geometry: walls, rooms, layers, patches ──▶ cadLink ──▶ main.js
                                                                         │ buildRoom() (js/acoustics/room.js)
store (devices, settings) ───────────────────────────────────────────▶ engine ──▶ fieldWorker (wave · scattering · energy · modal)
                                                                         │
                     views + meters ◀── results (field grids, echogram, ISO 3382, RT60, modes)
                                                                         │
CAD ◀── marks {key, hash, items} · place · palette · sheet · spaces ◀── marks.js / schematic.js (the slices, the schematic)
```

The app never edits the drawing's geometry directly: what it adds to the CAD goes as `marks` (kept under a key, redrawn when their hash changes) or `place`. Save project writes the overlay and the CAD drawing's file name, never its geometry, into one `.acoustic-session.json` (`session@2`, `js/model/session.js`; `saveSession`, `openSession` in `main.js`). An old `session@1` file's drawing is handed to the CAD once and not kept. Popped out, the plan tile draws walls only while the CAD window answers (`cadLink` `live`, a `hello` ping after 4 s quiet, gone after 10 s) and says "No CAD" otherwise.

## Directories

| Path | What |
|---|---|
| `js/acoustics/` | physics, no DOM: bands, materials, patterns, devices, room, elevations, patches, images, field, analysis, layouts, symmetry, advisor, sbir, nulls, isolation, measure, multiSub, rack, windows, … |
| `js/compute/` | sample grids, the job, the field worker, the engine |
| `js/audio/` | ▶ Listen: the echogram as an impulse response, a clap through it |
| `js/cad/` | the bridge client and what is drawn into the CAD |
| `css/` | `app.css`, `acoustx.css` |
| `tests/` | `node --test`, 281 tests against closed forms and the CAD contract |
| `vendor/cad.like.audio/contract/` | the CAD's published `host@1` schema, samples and `validate.mjs`, unchanged |
| `scripts/smoke-frame.mjs` | the framed CAD is there and speaks host@1 (`npm run smoke:frame`) |
| `Documentation/acoustics/`, `acoustic-x/` | books of their own; the app's help opens them, so they stay where they are |

## Running and testing

Serve the folder beside `EDITORS.CAD.Like.audio/` (as `js/site.js` says) — the APK.audio desktop does this, as does any static server at `PODS/POD.THIN/Softapps/EDITORS/`. `npm test` runs the suite with no install (281 passed, 2026-10-30).
