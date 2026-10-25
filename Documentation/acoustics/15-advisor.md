# 15. The advisor: design rules checked against the drawing

Module: `js/acoustics/advisor.js`, function
`advise(room, speakers, mics, settings, mirror)`.

Each finding is `{ level: 'ok' | 'warn' | 'info', title, detail }`. The
rules apply the formulas of earlier chapters to the drawing as it stands.

## 15.1 Room summary

* `info` Room: $L\times W\times H$, $V$, Eyring $RT_{60}$ in the selected band,
  Schroeder frequency (chapters 2, 4).
* `info` The six lowest axial modes, from `axialModes(room, 3)` (chapter 5).
* `warn` Re-entrant plan: the plan is not convex, so some image sources are
  not physical (chapter 7).
* `warn` One per pair returned by `flutterRisk` (chapter 9), with the distance,
  the specular round-trip score and the repetition rate $c/2d$.

## 15.2 The listening position (mix seat)

With the seat in the front frame (`inFrame`), and the local floor and ceiling
above it (`heightsAtXY`):

$$
\phi_L = \frac{\text{fromFront}}{L},\qquad \phi_W = \frac{\text{fromLeft}}{W},\qquad
\phi_H = \frac{z - z_f}{z_c - z_f}
$$

| rule | ok when | otherwise |
|---|---|---|
| 38 % rule (length) | $\lvert\phi_L - 0.38\rvert \le 0.03$ | warn |
| centred (width) | $\lvert\phi_W - 0.5\rvert \le 0.01$ | warn |
| ear height | $0.38 \le \phi_H \le 0.42$ | warn if $\lvert\phi_H - 0.5\rvert < 0.04$, else info |

The length and height checks also list every axial null the position sits
on. A null is a hit when $\lvert\phi - (2k-1)/(2n)\rvert < 0.025$ for
$n = 1\ldots4$ (`nullHits`, `nullFractions`, chapter 5). The width check
looks only for the 50 % centre, and does not list width nulls.

Under a slope the height is read at the seat, not the room's mean.

With the CAD mirror enabled: `warn` if the seat is more than 1 cm off the
mirror axis, and `warn` if $\lvert\sin\theta_F\rvert < 0.99$ (front not ±y),
because then the vertical mirror is not a left/right mirror.

## 15.3 Each speaker

| check | rule | level |
|---|---|---|
| max SPL | `speakerLevel` limited | warn; info if headroom < 3 dB |
| range | $20\log_{10}\lvert H(f_b)\rvert < -10$ dB, response without crossover | info |
| acoustic axis | angle between $\hat f$ and the direction to the seat $> 10°$ (not subs) | warn |
| critical distance | monitors only: seat distance $\le r_c$ (chapter 9) | ok / warn |
| half height | $\lvert(z-z_f)/(z_c - z_f) - 0.5\rvert < 0.04$ (not subs); the box cannot drive the first vertical mode | warn |
| SBIR | free-standing: distance $d$ to the nearest wall whose inward normal lies along the aim ($\hat f\cdot\hat n^{\text{in}} \ge 0.5$), $f = c/4d$ | warn if $40 \le f \le 300$ Hz, else info |
| near a surface | free-standing, nearest wall, floor or ceiling $< 0.5$ m | warn |

For the SBIR rule, $d$ is the distance to the wall segment
(`distToSegment`) and must exceed 2 cm. A box 0.5 m in front of its
back wall gives $343/2 = 171.5$ Hz, which is a warning.

## 15.4 Spacing

The comment cites these as AcousticRooms' sampling rules:

* `info` for two speakers less than 1 m apart;
* `warn` for a speaker and a microphone less than 0.5 m apart.

## 15.5 Treatment

These are the room-acoustics literature's treatment criteria, checked by
`treatment(room, speakers, mix, settings, add)` at the end of `advise`. Mains
are every speaker but the subs.

* **The wall behind each box.** For each free-standing main,
  `wallBehind` and `finishAt` (chapter 11) read the finish at the box's foot
  on the wall behind it, at its height: `ok` when $\alpha_{500} \ge 0.5$,
  else `warn`. The warning gives the share kept and the return delay $2d/c$,
  and asks for ≥ 76 mm of absorption there.
* **Below 125 Hz.** `info` when the lowest axial mode is under 100 Hz and no
  finish or patch in the room is `ratedLow` (chapter 3). Below about 100 Hz
  only engineered absorbers (membrane, Helmholtz, deep porous) work, and only
  their measured figures say how much.
* **Thin absorbers.** `warn` once per palette id for porous-absorber patches
  (`isPorousAbsorber`) whose `depthOfId` is under `MIN_ABSORBER_DEPTH`
  (76 mm). When any of them lies within 0.3 m of a wall's end, a second
  `warn`: *Corner foam is not a bass trap*.
* **Absorption and diffusion.** Over the patches at 1 kHz, absorbed
  $\sum S\alpha$ against scattered $\sum S(1-\alpha)s$ for $s \ge 0.5$.
  When the room's mean $\alpha_{1\text{k}} > 0.3$: `ok` when scattering is at
  least 10 % of the two, else `warn` (all absorption sounds dead).
* **Hard floor.** `info` when the floor's $\alpha_{500} < 0.3$, naming
  `carpet-felt`: clipped-pile carpet on 1.36 kg/m² felt.
* **Diffuser band.** `warn` for a Diffuser-category patch on a side wall with
  less than half its height inside `diffuserBand` (chapter 11).
* **Directivity.** Per main, the directivity index $10\log_{10}Q$ at 1, 2 and
  4 kHz (`cachedQ`, chapter 6): `ok` within 3 dB, `info` within 6 dB, else
  `warn`. A constant-directivity box's reflections sound like its direct
  sound. A narrow horn keeps energy off the side walls.
* **Spaciousness.** `info` with the seat's LF at 1 kHz (chapter 9 §9.6),
  echogram order $\min(3, \text{maxOrder})$, mains only.
* **Reflection-free zone.** `ok` / `warn` from `reflectionFreeZone`
  (chapter 9 §9.7), naming the worst arrival. The cure offered is absorbing
  its spot or splaying its wall 1 in 20 to 1 in 10.
* **Several subs.** `info` when there are two or more: tune them together
  (chapter 13 §13.4).
* **Sub isolation.** For each wall shared with the house when the room has a
  sub: the level in the room at 31 and 63 Hz is each sub's
  $L_{1\,\text{m}} + 11 + 10\log_{10}(4/R_{125})$, power-summed, and is put
  through `lowHouseLeak` (chapter 12 §12.4). `warn` above 45 dB at 63 Hz,
  else `info`.

Example: the room of chapter 9 §9.6 with a wood floor, two subs in the front
corners and the room inside a house. The advisor warns *L: wall behind*,
*R: wall behind*, *Reflection-free zone* (32 reflections, the worst −6.9 dB,
3.5 ms after L) and *Sub through the front wall* (TL 5 / 11 dB at
31 / 63 Hz). It informs *Nothing rated below 125 Hz* (lowest mode 25 Hz),
*Hard floor*, LF 0.20 and *2 subwoofers* *(Node.)*.