# 19 · Fitzroy 1959 — Reverberation Formula Which Seems to be More Accurate with Nonuniform Distribution of Absorption

> Fitzroy, D., "Reverberation Formula Which Seems to be More Accurate with Nonuniform
> Distribution of Absorption", *J. Acoust. Soc. Am.*, Vol. 31, No. 7, July 1959,
> pp. 893–897. The manual prints "Nore Accurate"; corrected here.

**Kind:** journal paper, short. **Read it for:** the third formula in Acoustic X's Reverb
Time window, and why it gives such long times.

## What it is

Dariel Fitzroy noticed that rooms with their absorption on only some surfaces rang longer
than Sabine's or Eyring's formula said. The typical case is an office or classroom with an
absorbent ceiling over a hard floor and hard walls. Both classic formulas average the
absorption over the whole surface, as if sound visited every surface equally often. Fitzroy
split the room into its three pairs of opposite surfaces and let each pair decay on its own.
The title's "seems to be" is honest: the formula is an empirical fit, argued from
measurement, not a derivation. Acoustic-X offered it beside Sabine and Eyring, and this app
keeps it.

## Big ideas

### 1. One average absorption is not enough

**Summary.** Sabine ($T = 0.161V/A$) and Eyring ($T = 0.161V/(-S\ln(1-\bar\alpha))$) use a
single mean coefficient $\bar\alpha = A/S$. That is right when the sound field is diffuse,
so that energy strikes every surface in proportion to its area. Where the absorption sits
on one pair of surfaces, the field is not diffuse: sound running between the hard
surfaces rarely meets the absorber, and the decay is longer than the mean predicts.

**Challenge.** Take a $6 \times 4.2 \times 2.8$ m room ($V$ = 70.56 m³, $S$ = 107.52 m²)
with $\alpha$ = 0.05 everywhere except an absorbent ceiling at 0.8. Find $\bar\alpha$
(0.226), the Sabine time (0.47 s) and the Eyring time (0.41 s). Keep these for idea 2.

### 2. Three pairs, each decaying on its own

**Summary.** Fitzroy groups the surfaces by axis: $x$ the two side walls, $y$ the front and
back, $z$ the floor and ceiling. Each pair has its area $S_a$ and its mean coefficient
$\bar\alpha_a$. The reverberation time is the area-weighted sum of three Eyring-like
terms:

$$T = \frac{0.161\,V}{S^2}\sum_{a \in \{x,y,z\}} \frac{S_a}{-\ln(1-\bar\alpha_a)}$$

(the paper's constant is 0.049 in feet). Each term is the decay of one pair, weighted by
the share of the surface it holds.

**Challenge.** In the room of idea 1, the pair areas are $S_x$ = 33.6, $S_y$ = 23.52 and
$S_z$ = 50.4 m², and the floor–ceiling pair has $\bar\alpha_z$ = 0.425. Work out the three
terms $S_a/(-\ln(1-\bar\alpha_a))$ and then $T$. You should find about 655, 459 and 91,
and $T$ = 1.18 s, nearly three times Eyring.

### 3. The hard pair rules

**Summary.** Because each term divides by its own absorption, a pair with little
absorption gives a huge term and dominates the sum, however dead the other pairs are. The
long time Fitzroy predicts is the sound running back and forth between the hard pair. In
a small room it is heard as flutter, and in the decay as a long tail after a fast start.

**Challenge.** Move the absorber to the two side walls instead ($\bar\alpha_x$ = 0.8,
the rest 0.05). Find Sabine (0.37 s), Eyring (0.32 s) and Fitzroy (1.44 s). Then open
Reverb Time, lay 100 mm absorber on both side walls of a drywall room of this size, and
compare the four formulas the window reports at 500 Hz. Run the main app's flutter-echo
report on the same room and find which pair it names.

### 4. Uniform absorption gives Eyring back

**Summary.** If all three pairs have the same $\bar\alpha$, the three terms share one
denominator, $\sum S_a = S$, and the formula reduces exactly to Eyring. With Sabine's
$\bar\alpha_a$ in place of $-\ln(1-\bar\alpha_a)$ it reduces to Sabine. So Fitzroy is a
correction that matters only as far as the absorption is uneven.

**Challenge.** Set every surface of the room to $\alpha$ = 0.2 and work out all four
times. You should find Sabine and Fitzroy (Sabine-based) both 0.53 s, Eyring and Fitzroy
(Eyring-based) both 0.47 s.

### 5. Spread the absorber over all three axes

**Summary.** The design lesson follows from idea 3. The same area of absorber does far more
when it is shared among the three pairs than when it is all on one. Sabine and Eyring
cannot see this, since they only count the total.

**Challenge.** Keep 25.2 m² of absorber at 0.8, the area of the ceiling. Put it all on the
ceiling, then 12.6 m² on the ceiling and 12.6 m² on the side walls, then 8.4 m² on each
pair. Sabine stays 0.47 s in all three. Find Fitzroy (Eyring-based) for each: you should
get about 1.18, 0.72 and 0.44 s.

## Since then

Comparisons with measurement found that Fitzroy usually overestimates, sometimes badly,
because real rooms are not empty boxes: furniture, people and rough surfaces scatter sound
from the hard axes toward the absorber. Arau-Puchades (1988) proposed a formula that
weights the three pairs geometrically. Neubauer (2001) modified Fitzroy's to bring it
closer to measured rooms, and Nilsson's studies of rooms with absorbent ceilings showed
how strongly the result depends on scattering. Most practice now uses Eyring or Sabine as a
first estimate and ray tracing where the absorption is uneven. Fitzroy is kept as a warning
that the decay will be longer than the mean suggests.

## In this app

- [Reverb Time, The formulas](../06-reverb-time.md#the-formulas): Sabine, Eyring and the
  two Fitzroy forms side by side.
- [Engine chapter 4.4, The four classic formulas](../../acoustics/04-reverberation.md#44-the-four-classic-formulas-no-air):
  `js/acoustics/reverbTargets.js` `absorptionByAxis`, `rtFormulas` (`fitzroySabine`,
  `fitzroyEyring`). Laid materials stay on their own face, so the per-axis split holds.
- [Engine chapter 9.5, Flutter-echo risk](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk):
  `analysis.js` `flutterRisk`, the same hard-pair problem seen as an echo.
- The app's Fitzroy takes no scattering, as the original did not. The engine's own RT
  (`room.js` `buildRoom`) uses Sabine and Eyring with air, not Fitzroy.
