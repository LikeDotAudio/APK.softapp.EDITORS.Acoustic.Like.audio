# 4 · Speaker Boundary Interference Response (SBIR)

At low frequencies a loudspeaker radiates nearly as much behind and beside itself as in front. That energy reflects off the nearby wall and arrives at the listener a little after the direct sound. Where the extra path is half a wavelength, the reflection cancels; where it is a whole wavelength, it adds. SBIR draws that comb, scores a placement by it, and searches for the placement that has least of it.

**Tabs:**
- **Room:** dimensions and surfaces.
- **SPK:** *Size* (the speaker database, cabinet size, woofer height) or *Position* (Speaker 1; Speaker 2 is its mirror image; the mode the position excites).
- **Listener:** position, the LF cut-off and crossover, the valid listening window, the angles.
- **Search:** no search, step, absolute or negative, limits, results.

## Deviation

`js/acoustics/sbir.js` `sbirDeviation`. The speaker is a **point source** at the **woofer centre**. Below about 300 Hz a cabinet is close to omnidirectional, so no directivity is applied. It is heard by the direct path $r_0$ and by one first-order image per surface that reflects toward the listener ($r_i$; six in a box), each keeping $(1 - \alpha_i)$ of its energy:

$$p(f) = \frac{e^{-jkr_0}}{r_0} + \sum_i \frac{\sqrt{1 - \alpha_i(f)}}{r_i}\, e^{-jkr_i}, \qquad k = \frac{2\pi f}{c}$$
$$\text{dev}(f) = 20\log_{10}\big(r_0\,|p(f)|\big) \quad \text{dB}$$

$\alpha_i(f)$ comes from the nearest octave band, with 125 Hz standing in below it. 0 dB means the room adds nothing; −20 dB is a deep notch. A speaker $d$ from a hard wall, with the listener out in front, notches near $c/4d$: 172 Hz at 0.5 m.

The chart draws the deviation at 1/1, ⅓, ⅙ or 1/12 octave resolution (the original's default was 1/12). Each bar is the mean of a fine 1/48-octave curve over its band.

## The speaker's critical frequencies

- **LF cut-off** (red line): the speaker's designed lower limit. Only frequencies **above** it count toward the deviation, and the bars below it are greyed. Picking a speaker from the database fills it in from that model's low-frequency limit (`devices.js` `SPEAKER_PRESETS[*].fLow`).
- **LF cross-over** (yellow line): if the deviation **dips** at the crossover, the window flags it (`classic.js` `crossoverCheck`). The deviation there is read off the curve by linear interpolation on a log-frequency axis:

$$\text{dev}(f_x) = d_{i-1} + \frac{\ln(f_x/f_{i-1})}{\ln(f_i/f_{i-1})}\,(d_i - d_{i-1})$$

  After a search, if the best position dips at the crossover, the window asks whether to find one that does not. That second search keeps only positions where $\text{dev}(f_x) \ge 0$.

## Absolute or negative search

`classic.js` `sbirScore`. A placement scores, over the frequencies $f_j$ from the LF cut-off up to 300 Hz:

$$\text{Absolute: } \frac{1}{n}\sum_j |\text{dev}(f_j)| \qquad\qquad \text{Negative: } \frac{1}{n}\sum_j \max\big(0,\, -\text{dev}(f_j)\big)$$

Above 300 Hz, boundary interference is something absorption fixes, not placement. **Absolute** wants the flattest response. **Negative** ignores the boost and minimises only the dips. That suits a speaker meant to work near a wall, whose low-frequency controls can trim the build-up, and it usually puts the speaker nearer the front or side wall. With negative selected, negative bars are drawn in red.

The optimiser walks a grid of Speaker 1 positions at the **search step** (default 0.15 m, the original's ½ ft). It never changes the speaker's **height**: a height is a decision, not an optimisation, and the original fixed it for the same reason. Speaker 2 is always the mirror image $X_2 = W - X_1$.

- **Automatic** limits run from 0.3 m off the walls to the centre, less half the minimum spacing across, and to 45 % of the length or 0.5 m in front of the listener along.
- **Custom** limits (General Parameters → SBIR) set the minimum and maximum distance from the front and side walls.

Positions that would put the pair closer than **Min. Between SPKs** ($W - 2X_1 <$ min) are never tried. The best eight are listed, and **Apply** moves the design's left speaker and its mirror twin.

## Mode excited by position

A speaker sitting on a pressure maximum of a mode drives that mode hard. Of the modes below 300 Hz, the window flags those with

$$|\psi_n(\text{speaker})| \ge 0.95 \quad\text{and}\quad |\psi_n(\text{listener})| \ge 0.3$$

where $\psi_n$ is as defined in [chapter 3](03-modal-response.md). The first condition puts the speaker on a maximum; the second keeps the listener off a null of that mode, where it would not be heard. The lowest six are drawn as magenta lines with their indices, and the lowest is reported on the SPK tab.

## The listener and the angles

`classic.js` `listenerGeometry`. For the pair and the listener:

$$\text{angle between} = \big|\operatorname{atan2}(X_1 - X_l,\, Y_l - Y_1) - \operatorname{atan2}(X_2 - X_l,\, Y_l - Y_2)\big|$$
$$\text{tilt} = \operatorname{atan2}\!\left(Z_1 - Z_l,\ \sqrt{(X_1 - X_l)^2 + (Y_1 - Y_l)^2}\right)$$

The speakers are taken to be aimed at the listener, so the heights set the tilt. A tilt of more than ±15° is flagged as too high or too low. The usual stereo target is 60°, an equilateral triangle.

*Example:* speakers at $(0.9, 0.8, 1.2)$ and $(3.3, 0.8, 1.2)$, listener at $(2.1, 2.28, 1.2)$. The pair subtends 78.1°, each 1.905 m away, with 0° tilt.

## Surround speakers

General Parameters → SBIR → **Center speaker**, **Rear speakers**, **Rear height offset**. `classic.js` `surroundPositions`. Every speaker sits on the circle round the listener that the mains define, radius $r = |S_1 - P_l|$:

- **Centre:** straight ahead at the mains' height. $X_c = X_l$, $Y_c = Y_l - \sqrt{r^2 - (Z_1 - Z_l)^2}$.
- **Rears:** at ±110° (ITU-R BS.775), raised by the offset $\Delta z$, with the **distance kept**. The plan radius becomes $r_p = \sqrt{r^2 - \Delta z^2}$, so $X = X_l \pm r_p\sin 110°$, $Y = Y_l - r_p\cos 110°$, $Z = Z_l + \Delta z$. The tilt is $\operatorname{atan2}(\Delta z, r_p)$.

*Example:* the pair above with a rise of 0.3 m puts the centre at $(2.10, 0.375, 1.2)$ and the rears at $(0.33, 2.92, 1.5)$ and $(3.87, 2.92, 1.5)$, tilted 9.1°.

To check another speaker's SBIR, as the original manual suggested, type its position on the SPK tab and run with **No search**.

## The valid listening window and the specular absorbers

`classic.js` `specularAbsorbers`. The listening window is a square $w$ across (default 1 m) round the listener, ±$w/4$ in height: how far a head moves and should still hear no first reflection. For each speaker and each corner of that window, the first-reflection point is found on the left wall, the right wall and the ceiling. The speaker is mirrored in the surface, and the reflection point is where the line from the image to the corner crosses it:

$$P^* = I + t\,(Q - I), \qquad t = \frac{\text{plane} - I_k}{Q_k - I_k}$$

where $I$ is the image, $Q$ the window corner and $k$ the axis normal to the surface.

Each surface's absorber is the rectangle round its points, 0.15 m wider each way, because a panel needs margin past the geometric point. The rectangles are given in that surface's own coordinates (side walls: $u = Y$, $v = Z$; ceiling: $u = X$, $v = Y$) with their areas, and listed in the report. The Room View draws the window in yellow, the absorbers in cyan, and corner bass traps in orange in the front corners. Ray Tracing uses the same absorbers with their own α ([chapter 5](05-ray-tracing.md)).

*Example:* the room and pair above, a 1 m window. On each side wall the absorber runs $Y$ 0.90–2.28 m and $Z$ 0.88–1.52 m (0.88 m²). On the ceiling it runs $X$ 1.08–3.13 m and $Y$ 1.10–2.02 m (1.89 m²).
