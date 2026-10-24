# 3 · Modal Response

Does the room's shape spread its bass resonances evenly? Modal Response answers that, finds better dimensions, and shows where in the room a mode or a band of them is loud: that is where bass traps work.

**Tabs:**
- **Room:** dimensions, or a ratio; the favourable ratios; the Bonello and ITU-R BS.1116 checks.
- **Optimize:** which dimensions may change, by ±% and the step; the search.
- **Mode 1:** a mode index, or a band to sum; display resolution.
- **Mode 2:** display type, plane distance, display parameter, hold.

**Views:**
- **Chart:** the modes at their frequencies, and the count per ⅓ octave against the ideal.
- **Room:** the pressure display.
- **Data:** the mode list (sort and filter), the band table, the report.

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

## Pressure display

**Mode 1** picks what to show:
- **A single mode:** enter its index $n_x, n_y, n_z$. One non-zero index gives an axial mode, two a tangential mode, three an oblique one. Its frequency is shown.
- **Multi-mode summation:** every mode between an **LF cut-off** and an **HF cut-off**. Fill the cut-offs from the octave or ⅓-octave database, or with **Get freq.** from the mode picked on the chart (±0.05 Hz round it).

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
