# 4. Reverberation time, room constant and Schroeder frequency

Modules: `js/acoustics/room.js` (`buildRoom` per-band totals, `schroeder`),
`js/acoustics/reverbTargets.js`.

The engine computes reverberation time in two places, for two purposes:

* `room.js` computes Sabine and Eyring **with air absorption**. Every method
  uses these: the Eyring time drives the echogram tail, the modal damping and
  the Schroeder frequency.
* `reverbTargets.js` computes the four classic formulas **without air**, for
  the treatment-sizing view, together with target curves and an absorber-area
  solver.

## 4.1 Symbols

| symbol | meaning | unit |
|---|---|---|
| $V$ | room volume | m³ |
| $S$ | total surface area | m² |
| $S_j$, $\alpha_{j,b}$ | area and absorption of surface $j$ in band $b$ | m², – |
| $A_b = \sum_j S_j\alpha_{j,b}$ | equivalent absorption area | m² (sabins) |
| $\bar\alpha_b = A_b/S$ | mean absorption coefficient | – |
| $m_b$ | air intensity attenuation coefficient (chapter 1) | 1/m |
| $T$ | reverberation time, 60 dB decay | s |
| $R_b$ | room constant | m² |

The constant $0.161$ (s/m) stands for $24\ln 10/c$ at $c \approx 343$ m/s.

## 4.2 The engine's RT (with air)

`room.js` `buildRoom`, per band, with $\bar\alpha$ capped at 0.99:

$$
T^{\text{Sabine}}_b = \frac{0.161\,V}{A_b + 4m_bV}
$$

$$
T^{\text{Eyring}}_b = \frac{0.161\,V}{-S\ln(1-\bar\alpha_b) + 4m_bV}
$$

$$
R_b = \frac{S\,\bar\alpha_b}{1-\bar\alpha_b}
$$

$R$ is the room constant of the Hopkins–Stryker reverberant field (chapter 8).
It contains no air term. These values are stored as
`room.perBand[b] = { S, A, abar, sabine, eyring, R }`.

**Assumptions.** A diffuse field: energy uniformly distributed and incident
from all directions, with absorption spread evenly enough that a mean
coefficient means something. Sabine assumes small $\bar\alpha$, while Eyring
holds better for dead rooms. Neither accounts for uneven absorption
distribution; Fitzroy (below) addresses that. Neither is valid below the
Schroeder frequency, where individual modes dominate.

## 4.3 Schroeder frequency

`room.js` `schroeder(room, band = 2)`:

$$
f_S = 2000\sqrt{\frac{T}{V}}\quad\text{Hz}
$$

with $T$ the Eyring time (with air) in band `band`, 500 Hz by default, and
$V$ in m³. Below $f_S$ the response is dominated by discrete modes
(chapter 5, and the modal method of chapter 8); above it the diffuse-field
statistics of this chapter apply.

## 4.4 The four classic formulas (no air)

`reverbTargets.js` `rtFormulas(room, band)` takes any object of the form
`{ V, surfaces: [{ face, area, material }] }`. A built room is one.
`absorptionByAxis` groups the surfaces into three pairs:

$$
x:\ \{\text{left},\text{right}\},\qquad y:\ \{\text{front},\text{back}\},\qquad z:\ \{\text{floor},\text{ceiling}\}
$$

and for each axis computes $S_a$ and $A_a$, with
$\bar\alpha_a = \operatorname{clamp}(A_a/S_a,\ 10^{-4},\ 0.99)$. Overall,
$\bar\alpha = \operatorname{clamp}(A/S,\ 10^{-4},\ 0.99)$.

| formula | `rtFormulas` key | equation |
|---|---|---|
| Sabine | `sabine` | $T = \dfrac{0.161V}{\max(A,\ 10^{-4}S)}$ |
| Eyring | `eyring` | $T = \dfrac{0.161V}{-S\ln(1-\bar\alpha)}$ |
| Fitzroy, Sabine-based | `fitzroySabine` | $T = \dfrac{0.161V}{S^2}\displaystyle\sum_{a\in\{x,y,z\}} \frac{S_a}{\bar\alpha_a}$ |
| Fitzroy, Eyring-based | `fitzroyEyring` | $T = \dfrac{0.161V}{S^2}\displaystyle\sum_{a\in\{x,y,z\}} \frac{S_a}{-\ln(1-\bar\alpha_a)}$ |

Fitzroy (1959, as the comment cites it) lets each pair of opposite surfaces
decay on its own. When every pair has the same $\bar\alpha$, $\sum S_a = S$
and the formula reduces to Eyring (or Sabine). An axis with no area is skipped.

**Validity.** Fitzroy is meant for rooms whose absorption is concentrated on
some pairs of surfaces. It is dominated by the least absorbent pair, so with
very hard floor and ceiling it gives far longer times than Sabine or Eyring.
The surface-to-axis assignment uses each wall's face label, so the splayed
walls of a trapezoid count as left and right.

### Worked example

The room of chapter 2 (4 × 5 × 2.7 m, wood floor, gypsum elsewhere,
$V = 54$ m³, $S = 88.6$ m²):

| band | 125 Hz | 500 Hz |
|---|---|---|
| $A$ (m²) | 22.89 | 5.43 |
| `rtFormulas` Sabine | 0.380 s | 1.601 s |
| `rtFormulas` Eyring | 0.328 s | 1.552 s |
| `rtFormulas` Fitzroy (Sabine) | 0.387 s | 1.667 s |
| `rtFormulas` Fitzroy (Eyring) | 0.335 s | 1.618 s |
| `perBand` Sabine with air | 0.379 s | 1.562 s |
| `perBand` Eyring with air | 0.328 s | 1.515 s |
| $R$ | 30.87 m² | 5.78 m² |

At 500 Hz the air term is $4mV = 4(0.000622)(54) = 0.134$ m², which is why
`perBand` reads about 0.04 s shorter than `rtFormulas`. Schroeder:
$2000\sqrt{1.515/54} = 335$ Hz.

The same box with 50 mm porous absorber on all four walls, a concrete floor
and a plaster ceiling, at 500 Hz: Sabine 0.19 s, Eyring 0.13 s, Fitzroy
(Sabine-based) 2.59 s. The hard floor–ceiling pair
($\bar\alpha_z \approx 0.0175$ over 40 m²) dominates Fitzroy's sum. (All
numbers from node against the functions named.)

## 4.5 Target curves

`reverbTargets.js` `RT_TARGETS`, read through `rtTarget(id, V, user)`. Each
entry returns six-band `{ rt, lo, hi }` in seconds.

**Control room**, `control`, source EBU Tech 3276:

$$
T_m = 0.25\left(\frac{V}{100\ \text{m}^3}\right)^{1/3}\ \text{s}
$$

The target is flat at $T_m$ with tolerance $\pm 0.05$ s. At 125 Hz the upper
limit is raised to $T_m + 0.15$ s. The comment explains this as the EBU
allowance, rising to +0.3 s at 63 Hz, read at 125 Hz.
For $V = 54$ m³: $T_m = 0.204$ s, band 0.154–0.254 s (0.354 s at 125 Hz).

**Studio**, `studio` (rule of thumb): rt $[0.6, 0.55, 0.5, 0.5, 0.5, 0.45]$ s,
lo $[0.4,\ldots,0.35]$, hi $[0.75, 0.65, 0.6, 0.6, 0.6, 0.6]$.

**Isolation booth**, `booth` (rule of thumb): rt $[0.3, 0.25, \ldots]$,
lo 0.2, hi $[0.35, 0.3, \ldots]$.

**Dolby surround cinema**, `cinema`. The comment describes it as an
approximation to Dolby's published cinema guidance and states it is not a
certification figure:

$$
T_{500} = \operatorname{clamp}\!\big(-0.19 + 0.2\log_{10}\max(V, 50),\ 0.25,\ 0.8\big)
$$

$$
T_b = T_{500}\,k_b,\quad k = [1.4, 1.15, 1, 1, 0.95, 0.9],\qquad \text{lo} = 0.8\,T_b,\quad \text{hi} = 1.2\,T_b
$$

This gives 0.350 s at 500 m³ and 0.550 s at 5000 m³.

**User**, `user`: flat at the user's value, $\pm 10\,\%$.

## 4.6 How much absorber

`reverbTargets.js` `absorberAreaFor(room, materialId, target, band, { face })`
solves Sabine (no air) for the area $a$ of a new material $\alpha_1$ that must
replace existing finish of mean absorption $\alpha_0$:

$$
A_{\text{need}} = \frac{0.161V}{T_{\text{target}}},\qquad
a = \frac{A_{\text{need}} - A}{\alpha_1 - \alpha_0}
$$

$\alpha_0$ is the area-weighted $\alpha$ of the chosen face, or of the whole
room when no face is given. The pool's total area is `maxArea`. `feasible` is
false when $a < 0$, when $a > \text{maxArea}$, or when
$\lvert\alpha_1-\alpha_0\rvert \le 10^{-9}$. The returned `area` is clamped to
$[0, \text{maxArea}]$.

Example: the chapter 2 room, aimed at its EBU target of 0.204 s at 500 Hz with
`absorber-100` ($\alpha_{500} = 1.0$, clamped to 0.99):
$A_{\text{need}} = 42.71$ m², $A = 5.43$ m², and $\alpha_0 = 0.0613$, so
$a = 40.1$ m², out of 88.6 m² available.

`reverbTargets.js` `applyAbsorber(room, materialId, area, { face })` builds the
treated room. Each surface in the pool is split by the fraction
$k = \min(1, a/S_{\text{pool}})$ into a shrunk original
($S_j(1-k)$) and a new surface of the material ($S_jk$) on the same face, so
Fitzroy's per-axis split stays correct.
