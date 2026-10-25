# 13. Room-wide low-end scores: sub placement, several subs and array width

Modules: `js/acoustics/subDesigner.js`, `js/acoustics/widthFinder.js`, and the
seat helpers in `js/compute/compute.js`.

Both tools score a candidate arrangement by how even the low-end
response is across the room's seats. They use the wave method (chapter 8) and
search over positions or radii.

## 13.1 Seats and weights

* `compute.js` `roomSeats(mics)` returns the listeners (mics with a tier), or
  every mic if none has one.
* `compute.js` `seatWeight(m)` returns $w = \max(w_{\text{tier}},\ 2 \text{ if mix seat, else } 1)$.
  Tier weights are mixer 3, producer 2, client 1.5, entourage 1, and a
  measurement mic counts 1.
* `compute.js` `powerMean(dbs, weights)` gives the weighted power average,
  skipping non-finite values:

$$
\bar L = 10\log_{10}\frac{\sum_i w_i 10^{L_i/10}}{\sum_i w_i}
$$

Example: 100 and 80 dB average to 97.0 dB with equal weights, and to
98.8 dB with weights 3 : 1.

## 13.2 Sub placement: the sub crawl

`subDesigner.js` `scoreSub(room, at, seats, { maxOrder = 3, freqs = SUB_FREQS })`
places one subwoofer preset (crossover off, $z$ = 0.3 m by default) at `at`,
computes the wave response $L_{i}(f_j)$ at each seat $i$ (with that seat's
own pattern), and scores:

**Flatness**, the weighted mean over seats of each seat's population
standard deviation over frequency:

$$
\text{flat} = \frac{\sum_i w_i\,\sigma_i}{\sum_i w_i},\qquad
\sigma_i = \sqrt{\frac{1}{N_f}\sum_j\big(L_i(f_j) - \bar L_i\big)^2}
$$

**Evenness**, the mean over frequency of the range between seats
(unweighted, and 0 with one seat):

$$
\text{even} = \frac{1}{N_f}\sum_j\Big(\max_i L_i(f_j) - \min_i L_i(f_j)\Big)
$$

$$
\text{score} = \text{flat} + \text{even}\ \ \text{(dB, lower is better)}
$$

Seat weights are as in § 13.1.

`SUB_FREQS` are $20\cdot2^{i/12}$ for $i = 0\ldots31$: 32 points at
1/12 octave, from 20 Hz to 119.9 Hz, inside the 20–120 Hz the crawl
promises.

`subGrid(room, step = 0.25, margin = 0.2)` lays the candidate points on a
square grid over the plan's bounding box, inset by `margin` and kept inside
the plan, all at $z$ = 0.3 m. `subCrawl` scores the grid in slices of 12
points so the page stays responsive, and returns all cells plus the best
`top`.

The existing speakers are left out, so the result is the best place for one
sub on its own, before the mains are blended in. The score includes the
sub's own roll-off (−10 dB at 30 Hz, chapter 6). That roll-off is the same
for every position, so it raises every candidate's flatness term alike.

Example: the chapter 2 room with a mixer at (2, 3.1, 1.2) and a producer at
(2, 2.1, 1.3). The front-left corner (0.3, 4.7) scores 10.3 dB and
front-centre (2, 4.7) scores 10.8 dB. (Node.)

## 13.3 Array width: the best radius

`widthFinder.js` `lowEndSpread(room, speakers, mics, settings, { lo = 30, hi = 250 })`
computes the room curve, the weighted power mean across seats of the
wave response at 1/12-octave steps from `lo` to `hi`:

$$
\bar L(f_j) = \text{powerMean}_i\big(L_i(f_j);\ w_i\big)
$$

and returns its population standard deviation over frequency, in dB:

$$
\text{spread} = \sqrt{\frac{1}{N_f}\sum_j\big(\bar L(f_j) - \overline{\bar L}\big)^2}
$$

`widthSweep(room, speakers, mics, settings, { from = 0.8, to = 6, step = 0.05 })`
tries each radius $r$. The arranged speakers are carried to $r$ by
`layouts.js` `carryArray` (chapter 14), and a radius that would put any
moved speaker outside the plan or at $z \ge H$ is skipped. The sweep records
`{ r, spread }` for each radius and keeps the minimum as `best`. `now` is the
spread of the arrangement as placed. The sweep advances one radius per
`step()` call so a page can keep drawing.

**Validity.** This is the image-source model's estimate, which the comment
describes as a starting point rather than a measurement. Below the Schroeder
frequency, the image series truncated at `settings.maxOrder` approximates the
modal field only roughly (chapter 8).

## 13.4 Several subs tuned together

Module: `js/acoustics/multiSub.js`.

One sub can only be put where the modes hurt least. Several can be set against
each other so their modes cancel across the seats. No single position and no
EQ can do that, because EQ changes every seat alike.
`optimiseSubs(room, subs, seats, { delayMax = 20, delayStep = 0.25, trimMin = -6, trimStep = 1, passes = 2, eqBands = 4 })`
keeps every sub where the designer put it and searches only what the
processor sets: per sub, the delay $\tau_k \in [0, 20]$ ms, the gain
$g_k \in [-6, 0]$ dB (never a boost) and the polarity $\pm 1$.

Each sub is heard alone once at every seat $i$ and frequency $f_j$ with the
wave method, $P_{kij}$ (chapter 8, `field.js` `waveAt`). A candidate is
recombined as

$$
L_{ij} = 20\log_{10}\Big|\sum_k \pm g_k\, e^{-j2\pi f_j\tau_k} P_{kij}\Big|
$$

and scored as in §13.2, flat + even, the seats weighted by tier
(`scoreCurves`). The first sub is the reference (0 ms, 0 dB, normal). The
others are set by coordinate descent over the full grid, `passes` times.

**The shared EQ.** `fitCutEq(freqs, curve)` fits cut-only RBJ peaking
filters (`peakingDb`, $f_s$ = 48 kHz) to the seats' weighted power mean
(`powerMeanCurve`). It takes the worst peak over the curve's own power mean
first. The cut is that excess, capped at 12 dB, and the Q comes from the width
where the peak stands half its excess over the mean,
$Q = \sqrt{2^{B}}/(2^{B}-1)$, with $B$ in octaves. It repeats up to
`eqBands` times while a peak stands more than 1 dB over the mean. A null is
never boosted, because it is a cancellation. A filter common to every sub
turns them all by the same phase, so it may be applied to the sum afterwards,
magnitude only. It lowers flat and leaves even exactly as it was.

Returns `{ freqs, subs: [{ id, name, delayMs, gainDb, invert }], eq, before, after, eqd }`.

Example: the 5 × 7 × 2.7 m gypsum room on a concrete floor, a sub in each
corner 0.3 m from both walls, a mixer at (2.5, 4.3) and two clients at
(1.5, 2.5) and (3.5, 2.5). As placed: flat 7.56, even 5.71, score 13.27 dB.
Tuned: 5.74 / 3.24 / 8.98 dB (the second sub inverted, 14 ms, −5 dB). With
three EQ cuts (50.4 Hz −5.1 dB Q 3.45, 75.5 Hz −2.4 dB, 44.9 Hz −1.0 dB):
flat 4.61, even unchanged at 3.24 *(Node.)*. One sub alone in the first
corner scores 16.15 dB.