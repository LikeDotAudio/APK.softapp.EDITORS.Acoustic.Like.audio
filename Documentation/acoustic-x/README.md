# Acoustic X (classic) — documentation

Acoustic X is the set of Windows-95-style windows behind the **Acoustic X ▾** button in the app's header. It is modelled on *Acoustic-X*, the room-acoustics program Pilchner Schoustal Inc. released in 1997. It asks the same questions, lays them out the way that program did, and answers them with this app's own arithmetic. It is not that program, and none of its code or artwork is here.

These chapters follow the 1997 manual's chapter order, so you can read the two side by side. Each one says what the window does, and then works through the math behind it: every equation, its symbols and units, the function that implements it, and a worked example. The numbers in the examples come from running those functions.

| # | Chapter | 1997 manual chapter | Code |
|---|---|---|---|
| 1 | [Using Acoustic X](01-using-acoustic-x.md): the windows, the three views, the Room View Manager, the start screen, Fast Guide, reports, the 📖 topic pop-ups and Help | 4.0 *Using Acoustic-X* | `js/acoustx/acoustx.js`, `js/acoustx/roomView.js`, `js/acoustx/topics.js` |
| 2 | [General parameters](02-general-parameters.md): temperature, humidity, the speed of sound, air absorption | 6.0 *General Parameters* | `classic.js` `speedOfSound`, `airDbPerM` |
| 3 | [Modal Response](03-modal-response.md): modes, the ideal count, Bonello, the optimiser, pressure maps; the Criteria tab (Bolt area, Louden's spacing index, Everest's axial check, Sepmeyer's directions); each mode's decay (Knudsen) | 5.0 *Modal Response* | `classic.js`, `js/acoustics/modalDistribution.js`, `js/acoustx/references.js` |
| 4 | [Speaker Boundary Interference](04-sbir.md): deviation, LF cut-off, crossover, search, excited modes, listening window, surrounds | 5.0 *Speaker Boundary Interference Response* | `classic.js`, `js/acoustics/sbir.js` |
| 5 | [Ray Tracing](05-ray-tracing.md): equal-area rays, the receiver sphere, energy and arrival time, polar energy, room figures, comb nulls; the Time tab (Haas's precedence and echo check, Schroeder's decay with EDT, T20, T30) | 5.0 *Ray Tracing* | `classic.js` `traceRays` and friends, `js/acoustx/references.js` |
| 6 | [Reverb Time](06-reverb-time.md): Sabine, Eyring, Fitzroy, measured basis, criteria (including concert hall, opera and chamber music), Beranek's hall checks, the area optimiser | 5.0 *Reverb Time* | `js/acoustics/reverbTargets.js`, `classic.js`, `js/acoustx/references.js` |
| 7 | [Calculator](07-calculator.md): units, spreading, level addition, wavelength, comb filters; walls and Rw, resonant absorbers, QRD diffusers, NC rating, speech and gain, pistons and boxes, electrical levels, impedance steps, two tones and loudness | 5.0 *The Acoustic-X Calculator* | `classic.js`, `js/acoustx/references.js` |

The manual's 26 suggested references are read one report each, with a summary and a challenge per big idea, in [references/](references/README.md). The arithmetic they teach beyond what the 1997 program computed is in `js/acoustx/references.js`, and each window links the matching reports from its 📖 buttons (`js/acoustx/topics.js`, [chapter 1](01-using-acoustic-x.md#topic-pop-ups-and-help)).

The math behind the main app (the wave field, energy, image sources, the advisor) is in [../acoustics/](../acoustics/README.md).

## The classic model

Every Acoustic X window works in a **plain box**, as the original did:

- $L$ runs front to back, $W$ left to right and $H$ floor to ceiling, all in metres.
- **Classic coordinates** put $X$ from the left wall ($0 \dots W$), $Y$ from the front wall ($0 \dots L$) and $Z$ above the floor ($0 \dots H$).
- Mode indices go $n_x \leftrightarrow L$, $n_y \leftrightarrow W$, $n_z \leftrightarrow H$, as the manual assigns them.
- There are six surfaces (floor, ceiling, front, back, left, right), each with a base material. In Reverb Time, further materials can be laid on each surface by area.

A window opens on the room being designed. It takes the working-space $L \times W \times H$ of `engine.out.room`, its face materials, the left main speaker and the mix-position listener, all mapped through the room's front frame. It stays **linked** to that room and redraws as the room changes, until you edit an input for a what-if. **↻ From room** links it again. Every window shares the one model, so a dimension typed into one window is the dimension all of them show.

## The manual itself

The 1997 manual is copyrighted, and its licence forbids reproducing it, so it is not in this repository. If you have a copy, the chapters split from it live locally under `Documentation/acoustic-x/manual-1997/`. Git ignores that folder.
