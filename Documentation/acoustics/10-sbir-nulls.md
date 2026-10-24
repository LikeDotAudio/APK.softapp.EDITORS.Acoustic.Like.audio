# 10. Speaker boundary interference (SBIR) and nulls

Modules: `js/acoustics/sbir.js`, `js/acoustics/nulls.js`.

## 10.1 The SBIR model

A loudspeaker near a boundary is heard twice: once directly, and again off the
boundary slightly later. Where the reflected path is half a wavelength longer
than the direct one, the two cancel. `sbir.js` reproduces the classic SBIR
calculator:

* The speaker is an **omnidirectional point source**. The comment's
  justification is that below about 300 Hz, where SBIR matters, a box is nearly
  omni. No pattern, level or response is applied.
* The paths are the **direct path plus the first-order images**: one per
  plan wall whose specular point lands on the wall segment itself, one for the
  floor at $z_{\text{floor}}$ and one for the ceiling at $z_{\text{ceiling}}$.
  A rectangle gives six images; a plan with more walls can give more.
* Each image keeps $(1-\alpha_b)$ of its energy (no scattering term), so its
  pressure is $\sqrt{1-\alpha_b}/r$. $\alpha$ comes from the nearest octave
  band (`bandFor`), and 125 Hz stands in below 125 Hz.
* No air loss.

### Paths

`sbir.js` `firstOrderPaths(room, src, mic)`. For a wall with the source at
distance $d_s > 0$ and the mic at $d_m > 0$ in front of it:

$$
\mathbf x' = \text{mirror}(\mathbf x_s),\qquad t = \frac{d_s}{d_s+d_m},\qquad \mathbf x_{\text{hit}} = \mathbf x' + t(\mathbf x_m - \mathbf x')
$$

The path counts if $\mathbf x_{\text{hit}}$ lies on the wall segment,
$u \in [0, 1]$ along it with $10^{-9}$ tolerance. Floor and ceiling use
$z' = 2z_0 - z_s$ and require the hit point to lie inside the plan. Path length
$r = \max(\lvert\mathbf x' - \mathbf x_m\rvert,\ 0.01)$.

### Deviation

`sbir.js` `sbirDeviation(room, speaker, mic, freqs)`:

$$
\Delta(f) = 20\log_{10}\max\!\left(r_0\left\lvert\sum_{p}\frac{g_p}{r_p}e^{-jkr_p}\right\rvert,\ 10^{-6}\right)\ \text{dB},\qquad k = \frac{2\pi f}{c}
$$

with $g_0 = 1$ for the direct path, $g_p = \sqrt{\max(0, 1-\alpha_{p,b(f)})}$
for the others, and $r_0$ the direct distance. $\Delta = 0$ means the room
adds nothing.

`sbirFreqs(fMin = 16, fMax = 1000, perOctave = 12)` gives log-spaced
frequencies $f_{\min}2^{i/12}$.

**Absolute deviation** (`absDeviation`) is the mean of $\lvert\Delta\rvert$
over the frequencies at or below `ABS_DEV_MAX_HZ` = 300 Hz, or over all of
them if none are that low. The comment describes this as the region where
boundary interference is a placement problem rather than something absorption
fixes:

$$
\overline{\lvert\Delta\rvert} = \frac{1}{N}\sum_{f_i \le 300}\lvert\Delta(f_i)\rvert
$$

### The quarter-wave rule

For a speaker $d$ from a wall with the listener on the line through it, the
reflected path is $2d$ longer, and the first cancellation is where
$2d = \lambda/2$:

$$
f_{\text{notch}} = \frac{c}{4d}
$$

The advisor (chapter 15) uses this directly.

### Worked example: 0.5 m from a wall

A source 0.5 m in front of a concrete wall, the listener 2 m in front of
the source on the same line, in a room so large (1000 m) that the other
surfaces are 1000 m away. Paths: direct 2.000 m, wall 3.000 m.

* Quarter-wave rule: $343/(4\cdot0.5) = 171.5$ Hz.
* Analytic depth at the notch: $20\log_{10}\lvert 1 - \sqrt{0.99}\cdot\tfrac{2}{3}\rvert = -9.4$ dB.
* `sbirDeviation` at 48 points per octave: minimum below 300 Hz at
  **172.0 Hz, −9.6 dB** (the far surfaces add the small difference).

The notch is shallow because the reflected path is 1.5 times the direct
one. The closer the listener, the shallower it gets.

In the 4 × 5 × 2.7 m room of chapter 2, with the speaker at (2, 4.5, 1.2),
0.5 m from the front wall, and the listener at 38 % of L
(2, 3.1, 1.2): $\overline{\lvert\Delta\rvert} = 5.7$ dB.

### Reflection list

`sbir.js` `reflectionsBySurface(room, speakers, mic, { band = 3 })` lists
every first-order path for each speaker, earliest first:

$$
\text{delay} = \frac{r_p}{c},\qquad \text{lag} = \frac{r_p - r_0}{c},\qquad
L_{\text{rel}} = 20\log_{10}\frac{r_0}{r_p} + 10\log_{10}\max(10^{-6},\ 1-\alpha_{p,b})
$$

In the room example at 1 kHz: front 2.92 ms / −4.9 dB, floor 4.02 ms / −6.3 dB,
ceiling 5.57 ms / −7.7 dB, sides 8.27 ms / −9.8 dB, back 18.08 ms / −14.9 dB.

`directArrivals(speakers, mic)` returns each speaker's direct $r$ and $r/c$.

### Position search

`sbir.js` `searchPositions(room, speaker, mic, ranges, { step = 0.1, freqs, top = 8 })`
tries every grid point in the given $x$, $y$, $z$ ranges. A missing range
pins that axis. Points outside the plan, or within 5 cm of the floor or
ceiling, are skipped. It returns the `top` positions with the smallest
$\overline{\lvert\Delta\rvert}$, evaluated by default on 16–300 Hz at 12 per
octave.

## 10.2 Finding nulls in a response

`nulls.js` `findNulls(freqs, db, { depth = 6, max = 8, window = 1/3 })`
finds notches that a listener hears relative to the curve's own surroundings,
not relative to a fixed line.

**Reference.** For each point $i$, the power mean of the finite values within
half a window either side in log frequency:

$$
L_{\text{ref}}(f_i) = 10\log_{10}\!\left(\frac{1}{\lvert J_i\rvert}\sum_{j\in J_i}10^{L_j/10}\right),\qquad J_i = \left\{j : \left\lvert\log_2\frac{f_j}{f_i}\right\rvert \le \frac{w}{2}\right\}
$$

A power average is dominated by the higher levels, so the notch itself barely
lowers its own reference.

**Detection.** An interior local minimum ($L_i \le L_{i\pm1}$, all three
finite) is a null if $D_i = L_{\text{ref}}(f_i) - L_i \ge$ `depth`.

**Extent.** `lo`…`hi` extends outwards while the neighbours still sit more
than $D_i/2$ below their own reference.

**Thinning.** Candidates are taken deepest first. One within a sixth of an
octave of a kept null is dropped. At most `max` are kept, and they are
returned in frequency order as `{ f, db, depth, lo, hi }`.

**Limitation.** A notch wider than the window has its own floor inside its
reference, so it scores shallow. The broad 172 Hz SBIR notch in the
large-room example above is not reported at the default settings. The only
null found on that curve is a narrower one at 854 Hz (8.0 dB). In the
chapter 2 room example, the curve's nulls are at 431 Hz (20.0 dB), 542 Hz
(6.1 dB), 645 Hz (6.4 dB) and 813 Hz (31.7 dB). (Node, `sbirDeviation` +
`findNulls`.)
