# Principles — EDITORS.Acoustic.Like.audio

The rules ACOUSTICS.LIKE.AUDIO keeps, each with the code that keeps it. The ecosystem's rules for this app are the [Room Acoustics golden rules](../../../../../../../Documentation/%F0%9F%8F%9BPhilosophy/Room%20Acoustics/goldenrule.md) (reasoning in [readme.Room Acoustics.md](../../../../../../../Documentation/%F0%9F%8F%9BPhilosophy/Room%20Acoustics/readme.Room%20Acoustics.md)); they are cited here, not copied. The physics behind each module is in [Documentation/acoustics/](../acoustics/README.md).

← [Wiki home](../README.md)

| Principle | Kept by | Where it breaks |
|---|---|---|
| **The room is the drawing** (rule 1). Walls, rooms, elevations and painted patches arrive from the CAD on `geometry`; the app draws its results back into the CAD as layers instead of keeping a drawing. The session file holds the acoustics and the drawing's name, never its geometry; popped out, the plan tile draws walls only while the CAD window answers, and says "No CAD" when it does not. | `js/cad/cadLink.js` (`HOST_PROTOCOL`, `live`/`heartbeat`); `js/model/session.js` (`sessionDoc`, `readSession`); `js/views/plan.js` (the "No CAD" branch of `render`); `js/cad/marks.js`, `js/cad/schematic.js`; `tests/session.test.mjs` | — the pop-out is a CAD-to-CAD handover: `popOut()` sends the docked CAD `handover` { token } and the two CADs pass the drawing over a BroadcastChannel (the CAD's `hostHandover.ts`); this app never reads it back. `dockIn()` hands it back the same way (`handover` to the window, iframe at `&handover=<token>`, window closed on the iframe's `ready`). `tests/session.test.mjs` proves no `session` is asked for or relayed. |
| **Symmetry is the CAD's mirror.** No centre line of its own; twins are reflected about the axis the CAD reports. | `mirrorDevice`, `syncTwin` (`js/acoustics/symmetry.js` lines 29, 45) | — |
| **Physics has no DOM.** Pure functions over plain data, so the tests import it into node and the field runs in a Worker. | `js/acoustics/`; `new Worker(…fieldWorker.js…, {type:'module'})` (`js/compute/engine.js` line 99) | — |
| **Closed forms, then executed examples** (rule 5). | `tests/*.test.mjs` — 281 tests (+6 dB flush, c/4d, Eyring T30, rigid-box modes) | — |
| **Three methods, each in its range** (rule 3). | `js/acoustics/field.js`, `images.js`, `analysis.js`; `schroeder()` (`js/acoustics/room.js` line 338) | — |
| **Fail loud, not plausible** (rule 8). An unknown palette id is a warning, not drywall. | the `unknown palette id` warning in `js/acoustics/patches.js` (line 64); an empty parts catalogue leaves the rack to be typed in (`js/ui/rackPanel.js`) | — |
| **Measurement outranks the model** (rule 7). | a seat-measured WAV read beside the model's RT60 (`js/acoustics/measure.js`) | — |
| **Cite, never certify.** | layouts checked against ITU-R BS.2051 angles (`js/acoustics/layouts.js`); certification left to the Dolby Atmos Room Design Tool | — |
| **One state, saved per drawing.** The overlay is keyed by the CAD file name; a storage failure leaves the app working. | `save()` (`js/model/store.js` lines 155–161, the `try`/`catch` around `localStorage`) | — |
| **No build, no dependencies.** | `package.json` (only `"test"`), plain ES modules | — |

**The CAD's protocol is the CAD's.** This repo does not restate `cad.like.audio/host@1`: it vendors the schema and samples the CAD publishes (`vendor/cad.like.audio/contract/`) and tests `cadLink.js` against them (`tests/cadContract.test.mjs`). `HOST_PROTOCOL` stays a string in `cadLink.js` — the browser loads no JSON modules here, with no build step — and the test holds it to the schema's.

**Where things are is one file.** The CAD's address and the parts catalogue's are named once, in `js/site.js`, relative to the page; the published site swaps in `js/site.published.js`. Nothing climbs the tree from a module, and nothing is rewritten by pattern at deploy.
