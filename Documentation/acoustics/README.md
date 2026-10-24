# Acoustics engine: mathematical documentation

This folder documents what the ACOUSTIC.LIKE.AUDIO engine computes: every
module in `js/acoustics/` and `js/compute/`. Each chapter gives the governing
equations, defines the symbols and units, states the assumptions and limits,
and names the function that implements each equation as
`js/acoustics/file.js` `functionName`. The worked examples were checked by
running node against the real functions, importing them the way
`tests/*.mjs` does.

Out of scope: `js/acoustx/` (documented separately) and the UI
(`js/views`, `js/ui`, `js/cad`).

Equations use GitHub math syntax.

## Chapters, in reading order

| # | chapter | modules | summary |
|---|---|---|---|
| 1 | [Conventions, bands and constants](01-conventions.md) | `bands.js`, `geometry.js` | Units, the six octave bands, $c$ = 343 m/s, ISO 9613-1 air loss, dB arithmetic and the plane-geometry primitives. |
| 2 | [The room: plan, front frame and sections](02-room-model.md) | `room.js`, `elevations.js`, `wallChains.js` | How a CAD loop becomes walls, faces, the $L\times W$ front frame, a volume and surface areas cut by drawn elevations, and openings. |
| 3 | [Materials, scattering, patches and mixed surfaces](03-materials-patches.md) | `materials.js`, `patches.js`, `room.js` `effective` | $\alpha$, $s$ and TL per material, scattering spectra from one number, patches laid on surfaces, and the area/energy/transmission mixing rules. |
| 4 | [Reverberation, room constant and Schroeder frequency](04-reverberation.md) | `room.js`, `reverbTargets.js` | Sabine and Eyring with air, the room constant, Fitzroy, $f_S$, the EBU Tech 3276 and other target curves, and the absorber-area solver. |
| 5 | [Room modes and their distribution](05-modes.md) | `room.js`, `modalDistribution.js` | Rigid-box modes, axial nulls, third-octave counts, Bonello's criterion, spacing scores, dimension search, favourable ratios and the ITU-R BS.1116 bounds. |
| 6 | [Sources and receivers](06-sources-receivers.md) | `devices.js`, `patterns.js` | Speaker level from sensitivity and power, the −10 dB Butterworth range, mounting gain, first-order and horn patterns, the low-frequency fade and directivity $Q$. |
| 7 | [Image sources](07-image-sources.md) | `images.js` | Plan × height images of an extruded room, mirror matrices, convex pruning, and specular-only reflection factors with the scattered share. |
| 8 | [The three field methods](08-field-methods.md) | `field.js` | Wave (images with phase), energy (direct + Hopkins–Stryker 4/R) and modal (damped box modes), with their validity ranges. |
| 9 | [Echogram, ISO 3382-1, critical distance, flutter](09-echogram-iso3382.md) | `analysis.js` | The energy–time curve with diffuse rain, EDT/T20/T30/C50/C80/D50/Ts, $r_c$, and the flutter-echo score. |
| 10 | [SBIR and nulls](10-sbir-nulls.md) | `sbir.js`, `nulls.js` | First-order boundary interference, the $c/4d$ notch, absolute deviation, position search and notch detection. |
| 11 | [First reflections and panel placement](11-first-reflections.md) | `reflectionPanels.js` | Mirror-point reflections with level, delay and Fresnel zone, and where the treatment panels go. |
| 12 | [Isolation](12-isolation.md) | `isolation.js` | Floor transmissibility of a mass on a damped spring, wall TL by build, and the level that reaches the house. |
| 13 | [Sub placement and array width](13-subs-width.md) | `subDesigner.js`, `widthFinder.js`, `compute.js` seats | Seat weighting, power means, the sub-crawl flatness/evenness score and the low-end spread over array radius. |
| 14 | [Layouts, symmetry, console, growth, room library](14-layouts-placement.md) | `layouts.js`, `symmetry.js`, `console.js`, `roomFit.js`, `roomLibrary.js` | ITU-R BS.2051 / BS.775 layouts, placement and checks, mirror twins, console spot, room growth, and library rooms with their furnishing. |
| 15 | [The advisor](15-advisor.md) | `advisor.js` | Every rule the advisor checks, with its thresholds. |
| 16 | [The compute engine](16-compute-engine.md) | `compute/*.js` | Sample grids, what one job computes, scheduling and the sweep-frame ladder. |

## Standards and sources named in the code

These are cited because the code or its comments name them. Each chapter
says where.

* Sabine; Eyring; Fitzroy (1959): reverberation formulas (ch. 4).
* Hopkins–Stryker: direct plus reverberant field (ch. 8).
* Schroeder frequency $2000\sqrt{T/V}$ (ch. 4).
* ISO 9613-1: air absorption (ch. 1).
* ISO 3382-1: room-acoustic parameters (ch. 9).
* ISO 17497-1: the scattering coefficient, read at 1 kHz (ch. 3).
* IEC 61260: nominal third-octave centres (ch. 5).
* Bonello (1981): modal distribution criterion (ch. 5).
* Cox, D'Antonio & Avis (2004); Everest, *Master Handbook of Acoustics*:
  sources of the favourable ratios (Sepmeyer, Louden, Bolt, Volkmann, golden
  section) (ch. 5).
* ITU-R BS.1116: room proportions (ch. 5).
* ITU-R BS.2051 and BS.775: loudspeaker layouts, and NHK 22.2 as BS.2051
  System H (ch. 14).
* EBU Tech 3276: control-room reverberation target (ch. 4).
* Dolby cinema design guidance (approximated) and the Dolby Atmos Room
  Design Tool (two rules kept) (ch. 4, 14).
* EASE, ODEON, CATT: the absorbed / specular / diffuse split (ch. 3, 7).
* CHORAS: several methods behind one interface (ch. 8, 9).
* AcousticRooms (facebookresearch): material categories and sampling rules
  (ch. 3, 15).
* Tronci, *Computational Acoustics*: the rigid-box mode benchmark (ch. 5).
