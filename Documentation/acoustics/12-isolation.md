# 12. Isolation: floors, walls and the house next door

Module: `js/acoustics/isolation.js`.

The comment describes these as design estimates from textbook models, not
test results. They cover three construction choices: what the room stands on,
what its walls are built from, and where it sits.

## 12.1 The floor: a mass on a damped spring

A floating floor, or a room on isolators, is modelled as a single-degree-of-freedom
mass–spring–damper with natural frequency $f_0$ and damping ratio
$\zeta = 0.1$ (`ZETA`). `isolation.js` `transmissibility(f, f0, zeta)`:

$$
r = \frac{f}{f_0},\qquad
T(f) = \sqrt{\frac{1 + (2\zeta r)^2}{(1-r^2)^2 + (2\zeta r)^2}}
$$

$T = 1$ when $f_0$ is not set (slab on grade, timber joists).
`floorLoss(f, f0)` is the insertion loss:

$$
\text{IL}(f) = -20\log_{10}T(f)\ \text{dB}
$$

Positive values isolate and negative values amplify.

| $r = f/f_0$ | 0.5 | 1 | $\sqrt2$ | 2 | 4 | 10 |
|---|---|---|---|---|---|---|
| IL (dB), $\zeta = 0.1$ | −2.5 | −14.1 | 0.0 | +9.0 | +21.4 | +32.9 |

At resonance, $T = \sqrt{1+4\zeta^2}/(2\zeta) = 5.1$, an amplification of
14.1 dB. Isolation starts above $\sqrt2 f_0$. The slope is close to
12 dB/octave just above $\sqrt2 f_0$ and decreases with frequency. Once
$2\zeta r \gg 1$ (that is, $r \gg 5$), $T \to 2\zeta/r$ and the slope tends
to 6 dB/octave. With $f_0 = 10$ Hz, node gives 12.4 dB from 20 to 40 Hz,
8.3 dB from 50 to 100 Hz and 6.8 dB from 100 to 200 Hz.

`floorF0(iso)` returns the user's $f_0$ if one is set, and otherwise the
build's:

| floor build | $f_0$ |
|---|---|
| slab on grade | – |
| timber joists | – |
| floating wood on pads | 22 Hz |
| floating concrete slab | 12 Hz |
| room-in-room on springs | 6 Hz |

Example: a floating slab ($f_0$ = 12 Hz) against a 50 Hz kick drum gives
IL = 22.0 dB, and 33.4 dB at 125 Hz. At 12 Hz it gives −14.1 dB.

The floating-wood and timber-joist builds also carry a small bass
absorption `lfAlpha`, added to the floor's $\alpha$ (chapter 3).

## 12.2 Walls: transmission loss per band

`WALL_BUILDS` lists octave-band TL (125 Hz … 4 kHz) for common assemblies,
from the comment's "typical published figures, rounded". `wallTl(iso)`
returns the chosen build's TL. When the room floats on springs
(`floor = 'isolators'`), the inner room's second leaf adds
$[10, 14, 16, 18, 18, 18]$ dB:

$$
\text{TL}_b = \text{TL}^{\text{build}}_b + \Delta\text{TL}^{\text{room-in-room}}_b
$$

An unset build falls back to the single-stud figures.
Example: double stud on a spring floor gives $[48, 66, 77, 85, 84, 88]$ dB.

Light walls (stud builds) also carry `lfAlpha`, the panel-on-cavity bass
absorption added to every wall's $\alpha$ (chapter 3).

## 12.3 Level in the house

`sharedFaces(iso)` returns the walls shared with the house: none when
detached, the ticked faces when attached, and all four when inside.
`houseLeak(room, iso, roomDb)` estimates the receiving-room level behind each
shared face using the standard two-room relation:

$$
L_{\text{house},b} = L_{\text{room},b} - \text{TL}_b + 10\log_{10}\frac{S_{\text{face}}}{A_{\text{house}}}
$$

| symbol | meaning | unit |
|---|---|---|
| $L_{\text{room}}$ | level in the room, per band | dB SPL |
| $S_{\text{face}}$ | total area of the room's walls on that face | m² |
| $A_{\text{house}}$ | receiving-room absorption, fixed at 10 m² sabins (`A_HOUSE`, "a furnished room") | m² |

**Assumptions.** Diffuse fields on both sides. Transmission only through the
shared wall, with no flanking paths through floor, ceiling or structure. One TL
per band for the whole face, so the doors and windows patched onto it
(chapter 3) do not enter this calculation.

Example: the chapter 2 room inside a house with single-stud walls at 90 dB
in every band. The front face ($S$ = 10.8 m²) gives
$90 - \text{TL} + 10\log_{10}1.08 = [73.3, 59.3, 50.3, 44.3, 51.3, 47.3]$ dB.

## 12.4 Below 125 Hz: the octaves a sub lives in

A single-number rating says nothing about 31 and 63 Hz: STC is fitted from
125 Hz up, and NRC, on the absorption side, averages 250 Hz – 2 kHz. `LOW_BANDS` = [31, 63] carries
them. No build in `WALL_BUILDS` is rated there, so `lowWallTl(iso)` takes the
build's 125 Hz figure (room-in-room leaf included) down the mass law,
`LOW_SLOPE_DB` = 6 dB per octave:

$$
\text{TL}_{63} = \text{TL}_{125} - 6,\qquad \text{TL}_{31} = \text{TL}_{125} - 12
$$

This is **at best**: a double leaf falls faster below its mass–air–mass
resonance. Examples: single stud [5, 11] dB, double stud [26, 32] dB, block
plus stud [33, 39] dB at 31 / 63 Hz *(Node.)*.
`lowHouseLeak(room, iso, [L31, L63])` applies §12.3 at those two bands.
`wallPlan.js` `wallTransmission(…, lowDb)` returns the same as `low`:
`{ freqs, tl, leak }`, each part's 125 Hz figure carried down and composited as
in §12.2, glass included.