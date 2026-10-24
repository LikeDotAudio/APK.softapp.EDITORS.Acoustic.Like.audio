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
