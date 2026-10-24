# 5. Room modes and their distribution

Modules: `js/acoustics/room.js` (`axialModes`, `nullFractions`, `allModes`),
`js/acoustics/modalDistribution.js`.

## 5.1 Modes of a rigid box

The model is a rectangular box $L\times W\times H$ with perfectly rigid walls
(normal particle velocity zero), filled with air at sound speed $c$. Its
pressure eigenfunctions and eigenfrequencies are

$$
\psi_{n_x n_y n_z}(u,v,w) = \cos\frac{n_x\pi u}{L}\cos\frac{n_y\pi v}{W}\cos\frac{n_z\pi w}{H}
$$

$$
f_{n_x n_y n_z} = \frac{c}{2}\sqrt{\left(\frac{n_x}{L}\right)^2 + \left(\frac{n_y}{W}\right)^2 + \left(\frac{n_z}{H}\right)^2}
$$

with $n_x, n_y, n_z \in \{0, 1, 2, \ldots\}$, not all zero, and
$(u, v, w)$ = (fromFront, fromLeft, height above the floor) in m.

| symbol | meaning | unit |
|---|---|---|
| $L, W, H$ | working-space length, width, mean height (chapter 2) | m |
| $c$ | 343 | m/s |
| $f$ | modal frequency | Hz |

A mode is **axial** when two indices are zero, **tangential** when one is,
and **oblique** when none is.

**Validity.** The formula is exact only for a rigid rectangular box. For any
other plan the engine uses the front-frame bounding box (`room.rect` says
which case applies), and under a slope it uses the mean height. Absorption
shifts and damps real modes. The undamped frequencies here ignore that, but
the modal field (chapter 8) adds damping.

### Functions

* `room.js` `axialModes(room, nMax = 4)` returns $f = cn/(2\ell)$ for
  $n = 1\ldots n_{\max}$ along each of $L, W, H$, sorted.
* `room.js` `allModes(room, fMax)` enumerates every
  $(n_x,n_y,n_z)$ with $n_\bullet \le \lfloor 2\ell f_{\max}/c\rfloor$,
  keeps those with $f \le f_{\max}$, classifies them and sorts them. The
  comment notes this is the analytic benchmark Tronci's *Computational
  Acoustics* series uses to validate FEM against.
* `modalDistribution.js` `modeList(dims, fMax = 200)` wraps `allModes` for a
  plain `{ L, W, H }`.

### Pressure nulls of an axial mode

Along a dimension of length $\ell$, mode $n$ has pressure nulls where
$\cos(n\pi x/\ell) = 0$:

$$
\frac{x}{\ell} = \frac{2k-1}{2n},\qquad k = 1, \ldots, n
$$

`room.js` `nullFractions(n)` returns these fractions, for example
$n=1$: 0.5; $n=2$: 0.25, 0.75; $n=3$: 1/6, 1/2, 5/6. The advisor
(chapter 15) checks the listening position against them.

### Worked example: 5 × 4 × 2.7 m

$L = 5$, $W = 4$, $H = 2.7$ m. Axial modes ($n \le 3$, from `axialModes`):

| mode | L1 | W1 | H1 | L2 | W2 | L3 | H2 | W3 | H3 |
|---|---|---|---|---|---|---|---|---|---|
| $f$ (Hz) | 34.3 | 42.9 | 63.5 | 68.6 | 85.8 | 102.9 | 127.0 | 128.6 | 190.6 |

For example, $f_{L1} = 343/(2\cdot5) = 34.3$ Hz. All modes up to 80 Hz
(`allModes`), written $n_xn_yn_z$:

| mode | 100 | 010 | 110 | 001 | 200 | 101 | 011 |
|---|---|---|---|---|---|---|---|
| type | axial | axial | tangential | axial | axial | tangential | tangential |
| $f$ (Hz) | 34.3 | 42.9 | 54.9 | 63.5 | 68.6 | 72.2 | 76.6 |

## 5.2 Third-octave counts and Bonello's criterion

`modalDistribution.js` `thirdOctaveBands(fMin = 16, fMax = 200)` lists the
base-2 third-octave bands whose exact centre
$f_k = 1000\cdot 2^{k/3}$ ($k = -20 \ldots 0$) lies in
$[0.97f_{\min},\ 1.03f_{\max}]$. Their edges are

$$
f_{lo} = f_k\,2^{-1/6},\qquad f_{hi} = f_k\,2^{1/6}
$$

Each band is labelled with the nearest IEC 61260 nominal centre. From 16 to
200 Hz this gives 12 bands, 16 Hz [13.9, 17.5) up to 200 Hz [176.8, 222.7).

`thirdOctaveCounts(dims, fMax)` counts modes with $f_{lo} \le f < f_{hi}$ in
each band. The list of modes extends to the top band's upper edge.

`coincidentModes(modes, tol = 0.005)` groups a sorted mode list greedily. A
mode joins the current group if $f - f_{\text{first}} \le \text{tol}\cdot f_{\text{first}}$,
and every group of two or more is reported, with its mean frequency.

`bonello(dims, fMax = 200, { tol })` applies the two conditions the comment
attributes to Bonello (1981):

1. **No decrease.** From the first band holding any mode upward, each band's
   count must be at least the count of the band below. Each violation adds to
   `decreases` and produces a warning.
2. **No coincidence in sparse bands.** In a band holding fewer than five
   modes, every coincident group counts against the room.

`ok` is true when there are no warnings.

### Spacing uniformity

`spacingSpread(freqs)` is the coefficient of variation of the gaps between
neighbouring sorted frequencies:

$$
g_i = f_{i+1}-f_i,\qquad \text{CV} = \frac{\sigma_g}{\bar g} = \frac{\sqrt{\tfrac1N\sum (g_i-\bar g)^2}}{\bar g}
$$

with the population standard deviation. Fewer than three frequencies, or a
non-positive mean gap, returns 1, which is treated as a poor result.

### One score per box

`scoreDimensions(dims, fMax = 200)`:

$$
\text{score} = 2\,N_{\text{decreases}} + 2\,N_{\text{coincident}} + \text{CV}_{\text{axial}} + \text{CV}_{\text{all}}
$$

Lower is better. Each Bonello failure costs 2, more than any improvement in
spacing can make up, so among boxes that pass, the most even spacing wins.

### Worked example

For the 5 × 4 × 2.7 m box, `bonello` reports `ok = true`. The counts per band
are 16–25 Hz: 0, 31.5: 1, 40: 1, 50: 1, 63: 2, 80: 5, 100: 6, 125: 13,
160: 22, 200: 44. `scoreDimensions` gives $\text{CV}_{\text{axial}} = 0.702$,
$\text{CV}_{\text{all}} = 1.069$, score 1.771.

A 4 m cube fails, as expected. Its coincident groups below 100 Hz are triple
at 42.9, 60.6 and 85.8 Hz and six-fold at 95.9 Hz.

## 5.3 Searching for good dimensions

`optimiseDimensions(ranges, { step = 0.05, fMax = 200, top = 10, maxCandidates = 40000 })`
scores every $L\times W\times H$ on a grid inside the `[min, max]` ranges
(`steps`, `dimensionGrid`). If the grid holds more than `maxCandidates`
boxes, the step is doubled until it fits. The best `top` are kept in a sorted
list by `keepBest`. Example: $L \in [4.5, 5.5]$, $W \in [3.5, 4.5]$,
$H = 2.7$, step 0.1 m. The best result is $4.9 \times 4.3 \times 2.7$ m,
score 1.52.

## 5.4 Published ratios

`FAVOURABLE_RATIOS` lists H : W : L. The comment cites the classic sources as
summarised by Cox, D'Antonio & Avis (2004) and Everest's *Master Handbook of
Acoustics*:

| id | ratio |
|---|---|
| Sepmeyer A | 1 : 1.14 : 1.39 |
| Sepmeyer B | 1 : 1.28 : 1.54 |
| Sepmeyer C | 1 : 1.6 : 2.33 |
| Louden | 1 : 1.4 : 1.9 |
| Bolt (∛2 series) | 1 : 1.26 : 1.59 |
| Volkmann | 1 : 1.5 : 2.5 |
| Golden section | 1 : 1.618 : 2.618 |

### ITU-R BS.1116 proportions

`ituBs1116({ L, W, H })` checks:

$$
1.1\,\frac{W}{H} \le \frac{L}{H} \le 4.5\,\frac{W}{H} - 4,\qquad \frac{L}{H} < 3,\qquad \frac{W}{H} < 3
$$

For 5 × 4 × 2.7 m: $L/H = 1.85$, $W/H = 1.48$. The bounds are
$1.63 \le 1.85 \le 2.67$, so the check passes.
