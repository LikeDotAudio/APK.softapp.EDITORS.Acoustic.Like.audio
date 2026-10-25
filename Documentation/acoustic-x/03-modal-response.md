# 3 · Modal Response

Does the room's shape spread its bass resonances evenly? Modal Response answers that, finds better dimensions, and shows where in the room a mode or a band of them is loud: that is where bass traps work.

**Tabs:**
- **Room:** dimensions, or a ratio; the favourable ratios; the Bonello and ITU-R BS.1116 checks.
- **Optimize:** which dimensions may change, by ±% and the step; the search.
- **Mode 1:** a mode index, or a band to sum; display resolution; the decay of those modes (Knudsen).
- **Mode 2:** display type, plane distance, display parameter, hold.
- **Criteria:** the Bolt area map, the spacing index (Louden), the axial spacing (Everest), the mode directions (Sepmeyer).

**Views:**
- **Chart:** the modes at their frequencies, and the count per ⅓ octave against the ideal.
- **Room:** the pressure display.
- **Data:** the mode list with each mode's T60 and direction (sort and filter), the band table, the report.

## Room modes

A rigid rectangular box of length $L$, width $W$ and height $H$ resonates at

$$f_{n_x n_y n_z} = \frac{c}{2}\sqrt{\left(\frac{n_x}{L}\right)^2 + \left(\frac{n_y}{W}\right)^2 + \left(\frac{n_z}{H}\right)^2}, \qquad n_x, n_y, n_z \in \{0, 1, 2, \dots\}$$

where $c$ is the speed of sound in m/s ([chapter 2](02-general-parameters.md)), the dimensions are in m and $f$ in Hz. `js/acoustics/room.js` `allModes`; `classic.js` `modeFreq`.

The number of non-zero indices sets the **type** (`classic.js` `modeType`):

| Type | Non-zero indices | Surfaces involved |
|---|---|---|
| axial | 1 | one pair of opposite surfaces |
| tangential | 2 | two pairs |
| oblique | 3 | all three pairs |

Acoustic X lists every mode below **200 Hz**, as the original did.

*Example, $6 \times 4.2 \times 2.8$ m at 20 °C:*

| Mode | Frequency |
|---|---|
| 100 | 28.58 Hz |
| 010 | 40.83 Hz |
| 001 | 61.25 Hz |
| 110 | 49.84 Hz |
| 111 | 78.97 Hz |

## The ideal count: Bolt's statistics

How many modes should a room of this size have in a band? The average number of modes below $f$ in a box (Bolt 1946, after Morse) is

$$N(f) = \frac{4\pi V f^3}{3c^3} + \frac{\pi S f^2}{4c^2} + \frac{E f}{8c}$$

where:
- $V = LWH$ is the volume in m³;
- $S = 2(LW + LH + WH)$ is the total surface in m²;
- $E = 4(L + W + H)$ is the total length of the twelve edges in m.

The first term counts the oblique modes; the surface and edge terms correct for the tangential and axial modes, which a volume count misses. The **ideal** count in a band $[f_\text{lo}, f_\text{hi})$ is $N(f_\text{hi}) - N(f_\text{lo})$, the blue line on the lower chart. `classic.js` `modesBelow`, `idealCounts`.

Bands are ⅓ octave, with exact base-2 edges round the centres $1000 \cdot 2^{k/3}$ Hz and labelled with the nominal IEC 61260 centres (`modalDistribution.js` `thirdOctaveBands`).

*Example, the same room:* $N(200) = 91.1$ against 89 actual modes below 200 Hz.

| Band | 50 | 63 | 80 | 100 | 125 | 160 | 200 |
|---|---|---|---|---|---|---|---|
| actual | 1 | 3 | 7 | 6 | 18 | 30 | 56 |
| ideal | 1.67 | 2.85 | 4.95 | 8.79 | 15.89 | 29.22 | 54.51 |

The 100 Hz band holds fewer modes than the one below it, which is a Bonello failure (next section).

The Chart View Manager reads out **deviation** for the band under the mouse: actual − ideal.

## Bonello's criterion

`modalDistribution.js` `bonello`. Bonello (AES preprint 1530, 1979) asks two things of the ⅓-octave counts up to 200 Hz:

1. **The count never falls.** From the first band with any modes upward, $n_{i+1} \ge n_i$.
2. **No coincident modes in a thin band.** No two modes may share a frequency unless their band already holds five or more. "Share" means within a relative tolerance of 0.5 % ($|f_a - f_b| \le 0.005\, f_a$).

The Room tab says whether the room meets both, and lists each reason it doesn't. Under that it checks the **ITU-R BS.1116** listening-room proportions:

$$1.1\,\frac{W}{H} \le \frac{L}{H} \le 4.5\,\frac{W}{H} - 4, \qquad \frac{L}{H} < 3, \qquad \frac{W}{H} < 3$$

## Favourable ratios

The ratio is height : width : length, with the height as the 1. **Apply ratio** keeps $H$ and sets $W$ and $L$ from it.

| Name | H : W : L |
|---|---|
| Sepmeyer A | 1 : 1.14 : 1.39 |
| Sepmeyer B | 1 : 1.28 : 1.54 |
| Sepmeyer C | 1 : 1.60 : 2.33 |
| Louden | 1 : 1.40 : 1.90 |
| Bolt (∛2 series) | 1 : 1.26 : 1.59 |
| Volkmann 2:3:5 | 1 : 1.50 : 2.50 |
| Golden section | 1 : 1.618 : 2.618 |

As the original warned, a ratio is not good at every volume: check the result with Bonello.

## The room-size optimiser

**Optimize:**
- Tick the dimensions that may change.
- Either give a **search size ±%** and press **Set limits from ±%** (each ticked dimension $d$ ranges over $d(1 \mp p)$), or type the limits.
- Set the **search step**, in metres. The original's default of ½ ft is about 0.15 m.

Every box on the grid is scored (`modalDistribution.js` `scoreDimensions`), and the best ten are kept, lowest score first:

$$\text{score} = 2\,D + 2\,K + \sigma_\text{axial} + \sigma_\text{all}$$

where:
- $D$ is the number of bands where the count falls;
- $K$ is the number of coincident groups in bands of fewer than five;
- $\sigma$ is the coefficient of variation (standard deviation ÷ mean) of the gaps between neighbouring mode frequencies, for the axial modes and for all modes. It is 0 for perfectly even spacing.

Each Bonello failure costs 2, more than any spacing can win back. So the rooms that pass come first, and among them the most evenly spaced wins. A grid of more than 40 000 boxes is coarsened by doubling the step until it fits. **Use these** takes the selected box into every window and hands it to the host, which draws it in the CAD.

## Criteria

The **Criteria** tab holds four more tests of the dimensions, each from one of the manual's suggested references. `js/acoustx/references.js`.

### Bolt area

`references.js` `boltMap`. [Bolt 1946](references/01-bolt-1946-normal-frequency-statistics.md) charted the ratios whose mode spacing is smoothest. This map computes the same kind of chart with this app's own score. For the room's height $H$, it scores a $40 \times 40$ grid of ratios, $W/H$ from 1 to 2 and $L/H$ from 1 to 3, with the optimiser's score (`scoreDimensions`, previous section). Cells where $L < W$ are left empty.

Each cell is shaded by its score $s$ against the lowest and highest on the map:

$$g = 200 - 170\sqrt{\frac{s - s_\text{min}}{s_\text{max} - s_\text{min}}}$$

The lowest score is brightest: brighter scores better. A cell is green when the box passes Bonello, red when it fails. The map also draws:
- the ITU-R BS.1116 bounds as cyan dashed lines, $L/H = 1.1\,W/H$ and $L/H = 4.5\,W/H - 4$ (the inequality from the Room tab);
- the favourable ratios as yellow dots;
- this room as a white ring.

**Click** a cell to take its ratio. $H$ stays, and $W$ and $L$ follow. The Bonello count runs to 200 Hz, so the map depends on the height, not only on the ratio. It is computed at the room's $H$, scaled for the temperature, and recomputed when $H$ changes.

*Example, $H$ = 2.8 m:* 311 of the 1200 cells with $L \ge W$ pass Bonello. The best cell is $1 : 1.19 : 1.43$, score 1.17. The running room, $1 : 1.50 : 2.14$, scores 3.71: one band where the count falls (2), $\sigma_\text{axial}$ = 0.63 and $\sigma_\text{all}$ = 1.09.

### Spacing index (Louden)

`references.js` `spacingIndex`, `gapCv`. [Louden 1971](references/04-louden-1971-dimension-ratios.md) ranked ratios by how evenly their low modes are spaced. This index is a figure of the same kind, not Louden's own. With $f_1 \le f_2 \le \dots \le f_{30}$ the lowest 30 mode frequencies and $g_i = f_{i+1} - f_i$ the 29 gaps:

$$\text{SI} = \frac{\sigma_g}{\bar g}, \qquad \bar g = \frac{1}{29}\sum_i g_i, \qquad \sigma_g = \sqrt{\frac{1}{29}\sum_i (g_i - \bar g)^2}$$

It is 0 for perfectly even spacing, and lower is better. Scaling a room scales every gap alike, so SI depends on the ratio alone. To be sure of 30 modes, the box is first scaled so its smallest dimension is 10 m. Under the room's own figure the tab ranks the favourable ratios by the same index.

*Example:* the running room has SI = 0.811. The favourable ratios rank:

| Ratio | SI |
|---|---|
| Sepmeyer A, 1 : 1.14 : 1.39 | 0.670 |
| Sepmeyer B, 1 : 1.28 : 1.54 | 0.772 |
| Sepmeyer C, 1 : 1.60 : 2.33 | 0.799 |
| Louden, 1 : 1.40 : 1.90 | 0.807 |
| Bolt, 1 : 1.26 : 1.59 | 0.833 |
| Golden section, 1 : 1.618 : 2.618 | 1.005 |
| Volkmann, 1 : 1.50 : 2.50 | 1.056 |

A cube scores 1.732: its modes stack in threes.

### Axial spacing (Everest)

`references.js` `axialCheck`. The hand check [Everest 1989](references/12-everest-1989-master-handbook.md) teaches. Take the axial modes below 300 Hz in order, $f_1 \le f_2 \le \dots$, and flag:
- every gap $f_{i+1} - f_i > 20$ Hz;
- every pair that coincides, $f_{i+1} - f_i \le 0.005\,f_{i+1}$.

The room passes when nothing is flagged.

*Example, the running room:* 21 axial modes below 300 Hz. Six gaps are wider than 20 Hz: 61.3–81.7, 85.8–114.3, 122.5–142.9, 142.9–163.3, 204.2–228.7 and 257.3–285.8 Hz. Three pairs coincide: 002 and 030 at 122.5 Hz, 004 and 060 at 245.0 Hz, and 070 and (10, 0, 0) at 285.8 Hz. The first two pairs come from $W = 1.5\,H$, which puts every third width mode on every second height mode.

### Mode directions (Sepmeyer)

`references.js` `modeAngles`, `angularDistribution`. A mode is the sum of plane waves travelling along $(\pm n_x/L,\ \pm n_y/W,\ \pm n_z/H)$. With $k = \sqrt{(n_x/L)^2 + (n_y/W)^2 + (n_z/H)^2}$:

$$\text{azimuth} = \operatorname{atan2}\!\left(\frac{n_y}{W},\ \frac{n_x}{L}\right), \qquad \text{elevation} = \arcsin\frac{n_z/H}{k}$$

Azimuth is in plan from the length axis: 0° runs front to back, 90° side to side. Elevation is above the floor plane: 90° is vertical. The table counts the modes below 200 Hz in 15° bands of each. A vertical mode has no azimuth, so it is left out of the azimuth column. [Sepmeyer 1965](references/05-sepmeyer-1965-normal-modes.md) asked for an even spread in angle as well as in frequency.

*Example, the running room:* 110 travels at azimuth 55.0°, elevation 0°; 111 at azimuth 55.0°, elevation 50.9°; 101 at elevation 65.0°. Its 89 modes below 200 Hz spread as:

| Angle | Elevation | Azimuth |
|---|---|---|
| 0–15° | 31 | 21 |
| 15–30° | 20 | 13 |
| 30–45° | 13 | 12 |
| 45–60° | 11 | 13 |
| 60–75° | 8 | 10 |
| 75–90° | 6 | 17 |

The azimuth column holds 86: the three vertical modes 001, 002 and 003 are not in it. Most modes travel near the floor plane: $H$ is the smallest dimension, so each step of $n_z$ costs the most frequency.

## Pressure display

**Mode 1** picks what to show:
- **A single mode:** enter its index $n_x, n_y, n_z$. One non-zero index gives an axial mode, two a tangential mode, three an oblique one. Its frequency is shown.
- **Multi-mode summation:** every mode between an **LF cut-off** and an **HF cut-off**. Fill the cut-offs from the octave or ⅓-octave database (`js/acoustx/database.js` `ACOUSTX_FREQ_OCTAVE`, `ACOUSTX_FREQ_3RD`), or with **Get freq.** from the mode picked on the chart (±0.05 Hz round it).

**Display res.** is the grid spacing. The original's 12 in is 0.3048 m.

**Mode 2** picks where:
- **Horizontal Plane:** at a height $Z$.
- **Vertical Plane (Length):** at $X$ from the left wall.
- **Vertical Plane (Width):** at $Y$ from the front wall.
- **3-Dimensional:** the whole volume, as dots.

The defaults are the far surfaces (floor, far side wall, back wall), as in the original. **Hold previous display** keeps up to six earlier planes, so you can build up all three axes at once.

### The math

`classic.js` `modeShape`, `pressureField`. A rigid-walled mode's pressure shape at a classic point $P = (X, Y, Z)$ is

$$\psi_n(P) = \cos\frac{n_x \pi Y}{L}\;\cos\frac{n_y \pi X}{W}\;\cos\frac{n_z \pi Z}{H}, \qquad -1 \le \psi \le 1$$

It is maximal at every wall and in every corner, and zero on the nodal planes at $Y = L(2k+1)/2n_x$, and so on along the other axes.

A group of modes is weighted by type, $w_\text{axial} = 1$, $w_\text{tangential} = 0.5$, $w_\text{oblique} = 0.25$ (the original's defaults, editable under General Parameters). The display parameters are:

| Display parameter | Value at $P$ | Range |
|---|---|---|
| Relative Sound Pressure | $\sqrt{\sum_n w_n\,\psi_n^2(P)}$ | 0 … 1 |
| Relative Sound Intensity | $\sum_n w_n\,\psi_n^2(P)$ | 0 … 1 |
| Relative Phase Addition | $\sum_n w_n\,\psi_n(P)$ | −1 … 1 |

Each is divided by its largest absolute value over the grid. Pressure and intensity add the modes **as energy**: two modes of different frequencies do not interfere over time. Phase addition keeps the signs, and shows where neighbouring modes reinforce (red) and where they cancel (blue). The weights express the textbook observation that axial modes carry the most energy, then tangential, then oblique; they are a design convention, not a measurement.

**Reading it.** Brighter is more pressure. (The original drew darker for more on a white page; this panel is black.) Low-frequency absorbers belong where the display is brightest. A pressure-type (porous or membrane) absorber works on pressure, and for many modes at once the brightest place is the corners.

*Example:* the two lowest axial modes of the room above, 100 and 010, summed on a horizontal plane. The value is 1.00 in a corner and 0.16 at the grid point nearest the middle of the room.

## Mode decay (Knudsen)

**Mode 1 → Mode Decay (Knudsen)** draws how the mode, or the band of modes, chosen above dies away when struck and left to ring. [Knudsen 1932](references/02-knudsen-1932-resonances-in-small-rooms.md) heard small rooms ring at their modes, with decays that beat. Morse and Bolt then showed that each mode decays at its own rate.

### One mode

`references.js` `modeDecay`. With little absorption, a mode loses energy at each wall in proportion to the mean square pressure it presses on that wall. On a wall its own index runs between, that is twice the room average; on a wall it runs along, it is the room average. So the amplitude decays as $e^{-\delta t}$ with

$$\delta = \frac{c}{16V}\left(\varepsilon_x A_x + \varepsilon_y A_y + \varepsilon_z A_z\right), \qquad \varepsilon = \begin{cases} 2 & n \ne 0 \\ 1 & n = 0 \end{cases}$$

where:
- $\delta$ is the decay constant in 1/s;
- $V = LWH$ in m³ and $c$ in m/s;
- $A_x = WH\,(\alpha_\text{front} + \alpha_\text{back})$ is the absorption area of the pair normal to $L$, in m²;
- $A_y = LH\,(\alpha_\text{left} + \alpha_\text{right})$ and $A_z = LW\,(\alpha_\text{floor} + \alpha_\text{ceiling})$;
- $\varepsilon_x$ goes with $n_x$, $\varepsilon_y$ with $n_y$, $\varepsilon_z$ with $n_z$.

The energy falls 60 dB when $e^{-2\delta T} = 10^{-6}$, and the resonance's half-power bandwidth is the decay constant over $\pi$:

$$T_{60} = \frac{\ln 1000}{\delta} = \frac{6.91}{\delta}\ \text{s}, \qquad B = \frac{\delta}{\pi}\ \text{Hz}$$

For an oblique mode every $\varepsilon$ is 2, and $\delta = cA/8V$: Sabine's decay. Axial and tangential modes lose less, so they ring longer. Each face's $\alpha$ is taken at **125 Hz**, the lowest band, area-weighted over the base material and anything laid on it (Reverb Time, [chapter 6](06-reverb-time.md)).

*Example, the running room at 343 m/s with $\alpha$ = 0.1 on every face:*

| Mode | Type | $\delta$ (1/s) | $T_{60}$ | $B$ |
|---|---|---|---|---|
| 100 | axial | 3.98 | 1.74 s | 1.27 Hz |
| 010 | axial | 4.29 | 1.61 s | 1.36 Hz |
| 001 | axial | 4.80 | 1.44 s | 1.53 Hz |
| 110 | tangential | 5.00 | 1.38 s | 1.59 Hz |
| 111 | oblique | 6.53 | 1.06 s | 2.08 Hz |

The oblique mode's 1.06 s matches Sabine's $0.161\,V/A$ = 1.06 s for this room. Now make the side walls absorbent ($\alpha$ = 0.3) and the other four faces hard ($\alpha$ = 0.02). The side-to-side mode 010 drops to 1.05 s. The front-to-back mode 100 rings for 1.89 s and the vertical mode 001 for 1.81 s: they run along the absorbent walls and press on them only half as hard.

### A band of modes

`references.js` `bandDecay`. The chart strikes every mode of Mode 1 together, with equal amplitude and phase, and lets each decay at its own rate:

$$E(t) = \frac{1}{N^2}\left|\sum_{i=1}^{N} e^{-\delta_i t}\, e^{\,j 2\pi f_i t}\right|^2, \qquad \text{level} = 10\log_{10}E(t)\ \text{dB}$$

It is 0 dB at $t = 0$. Two modes $\Delta f$ apart beat, with dips every $1/\Delta f$ seconds, so the decay is not a straight line. The time axis runs to the longest $T_{60}$ (at least 0.2 s, at most 4 s). The line under the chart lists the modes' $T_{60}$.

*Example:* the two lowest axial modes, 100 at 28.58 Hz and 010 at 40.83 Hz, with $\alpha$ = 0.1. They are 12.25 Hz apart, so they beat every 81.6 ms. The curve dips to −42.0 dB at 41 ms, −36.3 dB at 122 ms and −37.4 dB at 204 ms.

### The Data View's T60, Az and El

Every mode in the Data View list carries its $T_{60}$ from `modeDecay`, with the 125 Hz $\alpha$ of the room's faces, and its azimuth and elevation from `modeAngles`. The report adds the bandwidth $B$ under **Mode decay and direction**.
