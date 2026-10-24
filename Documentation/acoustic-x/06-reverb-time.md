# 6 · Reverb Time

How long does the room take to decay by 60 dB, band by band, and how does that compare with what a room of its kind should have? Reverb Time sizes the treatment that gets it there.

**Tabs:**
- **Type:** the criteria, or your own per band.
- **RT60:** the formula, or a measured empty room.
- **Surface:** pick a surface, set its base material, lay further materials on it by area.
- **Optimize:** the absorber overview and the area optimiser.
- **Show Item:** whether the Data View shows reverb times or absorption coefficients.

**Views:**
- **Chart:** the selected material's α beside the RT against the criteria. Green bars are inside the criteria, orange outside.
- **Room:** the surface being edited, filled.
- **Data:** the table and the report.

## Surfaces and materials

Each of the six surfaces has a **base** material and up to eight further materials **laid on it** by area. The base covers whatever the laid materials leave; **Unspecified** shows how much that is, and turns red if the laid areas add up to more than the surface. In the formulas, each laid material is a surface of its own on the same face (`classicRoom`). That keeps the per-axis split Fitzroy needs. Select a material in the **Absorber Edit Manager** (the 148 materials and commercial treatments from the 1997 Acoustic X database in `js/acoustx/database.js` `ACOUSTX_ABSORBERS`, plus the CAD palette) and double-click it, or press **Attach to surface**. Its α per octave is charted, with its manufacturer or source as the edit readout.

## The formulas

`js/acoustics/reverbTargets.js` `rtFormulas`. In each octave band (125 Hz … 4 kHz), with $V$ the volume in m³, $S_i$ and $\alpha_i$ the surfaces and their absorption, $S = \sum S_i$, $A = \sum S_i\alpha_i$ and $\bar\alpha = A/S$:

**Sabine** suits a live room, where $\bar\alpha$ is small:
$$T = \frac{0.161\,V}{A}$$

**Eyring** suits a dead one. It does not let $T$ stay finite as $\bar\alpha \to 1$:
$$T = \frac{0.161\,V}{-S\ln(1 - \bar\alpha)}$$

**Fitzroy** (1959) suits absorption that is *not* evenly spread, the common case of absorbent walls between a hard floor and ceiling. Each pair of opposite surfaces decays on its own: $x$ (left + right), $y$ (front + back), $z$ (floor + ceiling), with areas $S_x, S_y, S_z$ and mean absorptions $\bar\alpha_x, \bar\alpha_y, \bar\alpha_z$.

$$T_\text{Fitzroy(Eyring)} = \frac{0.161\,V}{S^2}\sum_{a \in \{x,y,z\}} \frac{S_a}{-\ln(1 - \bar\alpha_a)}, \qquad T_\text{Fitzroy(Sabine)} = \frac{0.161\,V}{S^2}\sum_a \frac{S_a}{\bar\alpha_a}$$

With the same $\bar\alpha$ on every pair, each collapses to Eyring or Sabine. Every $\alpha$ is clamped to $[10^{-4}, 0.99]$. These formulas take no air absorption, as the original's didn't; below 4 kHz in a room this size the air hardly matters ([chapter 2](02-general-parameters.md)).

*Example:* a $6 \times 4.2 \times 2.8$ m drywall room with 100 mm porous absorber on both side walls, at 500 Hz:

| Formula | $T$ |
|---|---|
| Sabine | 0.31 s |
| Eyring | 0.25 s |
| Fitzroy (Sabine) | 1.49 s |
| Fitzroy (Eyring) | 1.42 s |

Fitzroy is much longer because the front–back and floor–ceiling pairs are hard: sound bouncing between them decays slowly, whatever the side walls do. That is the flutter a room like this is known for.

## A measured empty room

**RT60 → Edit Measured RT60 (Empty)** takes the empty room's measured decay $T_0$ per band as the basis (`classic.js` `rtFromMeasured`). The measurement fixes the room's own absorption, and each treatment then changes it by its area times the difference in α against what it covers:

$$A_0 = \frac{0.161\,V}{T_0}, \qquad A = A_0 + \sum_\text{laid} S_m\,(\alpha_m - \alpha_\text{under}), \qquad T = \frac{0.161\,V}{A}$$

The measurement already contains the air, so none is added. **No Measured RT60** goes back to the formulas.

*Example:* the 70.56 m³ room measured at 0.6 s flat, with 10 m² of 100 mm absorber laid over drywall, gives 0.55 / 0.42 / 0.40 / 0.40 / 0.40 / 0.41 s.

## Criteria

`reverbTargets.js` `RT_TARGETS`. Each gives a target per band and a tolerance band (the grey lines):

| Criteria | Target |
|---|---|
| Control room | EBU Tech 3276: $T_m = 0.25\,(V/100)^{1/3}$ s, flat ±0.05 s from 200 Hz to 4 kHz, the upper limit rising toward the bass (+0.15 s at 125 Hz) |
| Studio | 0.4–0.6 s, flat or rising slightly in the bass (a rule of thumb) |
| Isolation booth | 0.2–0.3 s (a rule of thumb) |
| Dolby surround cinema | the volume-dependent 500 Hz value of Dolby's cinema guidance, ×1.4 at 125 Hz, ±20 % (design intent) |
| User | your own six values, ±10 % (**Edit user defined RT60 criteria**) |

## The area optimiser

**Optimize** lists every laid material. Tick up to **five**, and give each a **Begin**, **End** and **Step** in area. **Go Optimize** tries **every combination** (`classic.js` `optimiseAreas`) and keeps the one closest to the criteria over all six bands:

$$\text{cost} = \sum_{b=1}^{6}\left(\frac{T_b - T_{\text{target},b}}{T_{\text{target},b}}\right)^2$$

It uses the formula currently selected, or the measured basis. The relative error weights a 0.05 s miss at 0.25 s as heavily as a 0.2 s miss at 1 s. The number of combinations is the product of each range's step count; over 200 000, it asks for a wider step. **Apply** sets the areas. Unlike the original, the surface particulars are kept: each material stays on its surface, and only its area changes.
