# EDITORS.Acoustic.Like.audio

> 🔊 **ACOUSTIC.LIKE.AUDIO**: room acoustics built on [CAD.Like.audio](../EDITORS.CAD.Like.audio). The CAD supplies the plan. This app adds the room on top of it and around it.

---

## What it does

- **The plan is the CAD.** CAD.Like.audio runs live in the plan tile, opened as `#/drawing?host=acoustic`. You draw the room there as a closed loop. Everything acoustic is drawn as an overlay on that sheet and follows it as you pan and zoom.
- **The walls are in the CAD too.** Click an elevation tile and the CAD jumps to that wall's drawing: the same file, on its own layer (`Elevation Front`, `Back`, `Left`, `Right`). A wall not drawn yet is seeded with the room's current outline, under the plan. Drag it into a sloped ceiling, a raked floor or a vault. The room becomes the plan extruded and cut by every elevation drawn: the ceiling is the lowest any of them allows there, the floor the highest. Volume, surface areas and RT are integrated over that real shape. Image sources and modes stand in with the mean floor and ceiling height. Click the ceiling tile (or ⌂ Plan) to jump back.
- **Six drawings or a 3-D room.** The plan is extruded to a ceiling height, with a front direction you choose. That gives the plan (a slice at ear height) plus the reflected ceiling and the front, back, left and right elevations. The 3-D view is a cut-away. Every surface is painted with its sound field.
- **Sources and receivers.**
  - Speakers come as studio monitors, 90×50 and 60×40 projection horns, or subs. Each can be free-standing, flush/soffit, in a corner or in a trihedral corner.
  - Mics range from omni to figure-8, and one of them is the mix position.
  - Place them on the plan and set their height by dragging in an elevation.
- **Symmetry is the CAD's mirror.** L/R pairs stay reflected across the CAD's Virtual Mirror. Moving one moves its twin. The app keeps no centre line of its own.
- **Three methods side by side.** The idea is borrowed from CHORAS; no code was taken from it.
  - *Wave:* image sources with phase. Interference, SBIR and boundary gain all come out of it.
  - *Scattering:* a bounce off a surface keeps (1−α)(1−s) as a mirror reflection and scatters (1−α)·s. Image sources carry only the mirror part, so a diffuser fades its wall's reflections from the field and the early-arrivals list. The echogram returns the scattered energy as a diffuse tail, starting at each arrival and decaying at the Eyring rate. Total energy and T30 are unchanged; C50, C80 and D50 fall and Ts rises.
  - *Energy:* direct plus diffuse sound per octave band.
  - *Modal:* the modes of the working-space box.
- **Meter bridge.** For the monitored mic:
  - SPL (dBZ/dBA) and an octave RTA
  - Frequency response with axial, tangential and oblique modes marked under it. Click it to tune the field to that frequency.
  - Echogram with its Schroeder decay
  - ISO 3382 parameters: EDT, T20, T30, C50, C80, D50, Ts, ITDG and D/R
  - RT60 per band against the EBU Tech 3276 window
  - Polar plots
  - ▶ Listen, which plays a clap through the estimated impulse response
- **Finishes and products painted in the CAD.** Every material carries octave-band absorption and scattering. The app sends them to the CAD as a palette, with fixed-size products (a 600×600 QRD, 1200×600 panels, a door, a window). A fill or block on an elevation layer lands on that face's walls, split across a splayed face and clipped to the wall's floor and ceiling. On the `Ceiling` layer it lands on the ceiling, and anywhere else on the floor. Each surface then carries the area-weighted mix (`js/acoustics/patches.js`).
- **Treatments where you can see them.** Placed treatments are drawn on their elevation, on the reflected ceiling and in 3-D; click one to inspect it. The **Treatments** tab lists them (α per band, s, area, the absorption each adds), **Room** shows every surface's base material, % treated and effective α/s, and **Materials** is the catalogue behind the palette. Click the ceiling tile to treat the ceiling: the CAD shows the plan with the `Ceiling` layer current, so clouds and tiles land overhead.
- **Advisor.** Checks the 38 % rule and modal nulls at (2k−1)/2n of L, W and H, ear height at 38–42 % of H, acoustic axis to the ears, a woofer at half height, critical distance, SBIR (c/4d), flutter between parallel surfaces that are both hard and flat at 500 Hz–1 kHz, and the AcousticRooms source-spacing rules.
- **Layouts.** 2.0, 5.1, 5.1.4, 7.1.4 and 9.1.6, placed around the mix position. Each is checked against the ITU-R BS.2051 reference angles, with the delay and trim needed to align it. Certification remains the Dolby Atmos Room Design Tool's job.

## How it talks to the CAD

The CAD is in an iframe. The CAD's `src/shell/hostBridge/` and `js/cad/cadLink.js` talk over same-origin `postMessage` using the protocol `cad.like.audio/host@1`.

| Direction | Message | Carries |
| :-- | :-- | :-- |
| CAD → app | `view` | zoom, pan, canvas rect, units |
| CAD → app | `geometry` | visible walls (arcs tessellated), closed rooms, layers, file name, and `patches` `[{id, paletteId, layerId, points}]` (fills and product blocks placed from the palette) |
| CAD → app | `mirror` | Symmetrical Mode on/off, axis x |
| app → CAD | `hello` · `fit` · `mirror {x, enabled}` | resend · zoom to drawing · place the mirror axis |
| app → CAD | `sheet {layer, color?, seed?}` | jump to the drawing on that layer and make it current; draw `seed` there first if the layer is empty |
| app → CAD | `palette {title, items}` | every finish and product (`{id, name, category, color, hatch?, size?, note?}`; `size` [w, h] m = a fixed-size block). Resent on every `ready` |

The CAD only publishes; it never reads this app's state. The overlay is saved in the browser per CAD file name. It can be exported as JSON, and positions can be exported in the AcousticRooms metadata shape.

## Layout

```
js/acoustics/   physics, no DOM: bands, materials, patterns, devices, room, elevations, patches, images, field, analysis, layouts, symmetry, advisor
js/compute/     sample grids, the job, the worker, the engine that schedules it
js/views/       plan overlay, ceiling + elevations, 3-D, colour map, glyphs
js/ui/          inspector (every parameter), meter bridge
js/cad/         the bridge client
tests/          node --test: physics checked against closed forms
```

No build step and no dependencies: plain ES modules, served as they are.

## Tests

```
npm test
```

The tests check the following against closed forms:
- flush mounting gives +6 dB
- SBIR notches at c/4d
- T30 reads back the Eyring RT, with or without scattering
- with s = 0 the image sources and the echogram are exactly as they were. With s = 0.9 on a wall, its image drops by √(1−s) and the echogram's total energy stays the same, while C80 falls and Ts rises. Bare parallel gypsum walls flag flutter, and a diffuser or an absorber clears it
- the modal sum peaks at the analytic eigenfrequencies of a rigid box (Tronci, *Computational Acoustics with Open Source Software*)
- the modal null sits at L/2
- 7.1.4 placement lands inside its reference windows
- mirroring is its own inverse
- the advisor flags a seat at half the length
- a patch on an elevation raises A by exactly area·Δα; it splits across a splayed face, clips under a sloped ceiling, lands on the floor or the `Ceiling` layer, and an unknown palette id is ignored
- a shed roof drawn in a side elevation gives V = L·W·mean height and the true sloped area; front and side elevations intersect; a seeded elevation reads back as the room it came from

## References

- AcousticRooms (facebookresearch, CC BY 4.0): material categories and source/receiver spacing
- CHORAS (choras-org, GPL-3.0): several methods compared side by side. Ideas only; no code was taken.
- ITU-R BS.775 / BS.2051: layout reference angles. Dolby Atmos Room Design Tool v6.9.0 release notes: L/C/R line, 5.1.4 rears at 135°.
- ISO 3382-1 for room parameters, ISO 9613-1 for air absorption, EBU Tech 3276 for listening-room RT.
