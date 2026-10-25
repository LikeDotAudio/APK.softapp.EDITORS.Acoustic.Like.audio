# 6 · Bonello 1979 — A New Criterion for the Distribution of Normal Room Modes

> Bonello, O. J., "A New Criterion for the Distribution of Normal Room Modes", 64th
> Convention of the Audio Engineering Society, New York, November 1979, Preprint 1530.
> Published in revised form in *J. Audio Eng. Soc.*, Vol. 29, No. 9, September 1981,
> pp. 597–606.

**Kind:** convention paper, 11 pages. **Read it for:** the test Acoustic X's Modal Response
window runs on every room.

## What it is

Oscar Bonello, an Argentine engineer and the founder of Solidyne, wanted a test for room
proportions that a designer could run on a desk calculator, and that matched what people
heard in small studios. Earlier rules judged a room by how evenly its modes were *spaced*.
Bonello judged it by how many modes fall in each ⅓-octave band, the bandwidth the ear uses
to integrate low-frequency energy. Acoustic-X put his criterion in the Modal Response
window, and this app keeps it there.

## Big ideas

### 1. Count modes per critical band, not the gaps between them

**Summary.** Below a few hundred hertz, the ear does not hear single modes. It hears the
energy in a critical band, which is roughly ⅓ octave wide at low frequencies. So the useful
description of a room's bass is a histogram: modes per ⅓-octave band from the lowest mode up
to about 200 Hz. Two rooms with the same mean spacing can have very different histograms,
and the histogram is what predicts colouration.

**Challenge.** Open Modal Response on a $6 \times 4.2 \times 2.8$ m room and read the
⅓-octave count chart. Then change the room to a cube, $4 \times 4 \times 4$ m. Both rooms
hold dozens of modes below 200 Hz. Find which bands of the cube are empty and which are
crowded, and say why the cube's axial modes stack (each $n$ gives three identical
frequencies).

### 2. The count must never fall as frequency rises

**Summary.** Mode density in a box grows roughly as $f^2$ (Bolt's $N(f)$, [report
1](01-bolt-1946-normal-frequency-statistics.md)). A room whose ⅓-octave count drops in a
higher band has a gap there: that band will sound thin next to its neighbours. Bonello's
first condition is that, from the first band holding any mode upward, $n_{i+1} \ge n_i$.

**Challenge.** In the Room tab, find a room that fails the first condition by lowering $H$
until two height modes leave a band. Note which band falls and by how many modes. Then let
the Optimize tab search ±5 % on all three dimensions and check that the result passes.

### 3. Coincident modes are tolerable only in a crowded band

**Summary.** Two modes at the same frequency double the energy at one point of the
spectrum. In a band holding many modes that is lost in the crowd. In a sparse band it is a
peak you hear. Bonello's second condition: no two modes may coincide unless their band
already holds five or more. Acoustic X counts modes as coincident within 0.5 % of each
other.

**Challenge.** Take $L = 2H$, for example $5.6 \times 4.1 \times 2.8$ m. Find the pair of
modes that coincide exactly (the 200 and 001 modes share $c/2H$) and the band they fall in.
Does that band hold five modes? Change $L$ by 3 % and see whether the coincidence leaves the
report.

### 4. A criterion is a filter, not a score

**Summary.** Bonello's test is pass/fail. It does not rank two passing rooms, and the paper
never claimed it should. Many proportions pass, and among them the designer chooses by
other means: the plan, the budget, the speaker positions.

**Challenge.** List three ratios that pass Bonello in the Room tab's *favourable ratios*
list. Put the same speaker and listener in each room and compare the SBIR deviation (Speaker
Boundary Interference window). Does the best room by modes also give the flattest SBIR?

## Since then

Later reviews (Cox, D'Antonio and Avis, *J. Audio Eng. Soc.* 2004; Fazenda and others)
found Bonello's test only loosely predicts what listeners rate best, because it ignores
where the source and listener sit and how damped the modes are. A mode the loudspeaker
cannot excite, or that the seat sits in a null of, does not matter however it is counted.
Modern practice treats any ratio rule as a first pass, and judges the room by the response
at the seat with speakers placed. The criterion survives because it is fast and catches the
worst rooms.

## In this app

- [Modal Response, Bonello's criterion](../03-modal-response.md#bonellos-criterion);
  `js/acoustics/modalDistribution.js` `bonello`.
- [Engine chapter 5, Room modes and their distribution](../../acoustics/05-modes.md).
- The favourable-ratio list and the optimiser in the Modal Response window both report
  pass or fail against it.
- Modal Response, **Criteria** tab, *Bolt Area*: every ratio on the map is coloured green or
  red by whether it passes at the room's height; `js/acoustx/references.js` `boltMap`.
- 📖 in the app: the groups *Bonello Criterion* and *Modes per 1/3 Octave — actual against
  ideal* open this report from their pop-up.
