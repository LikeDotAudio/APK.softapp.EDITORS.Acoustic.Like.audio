# 16 · Berger 1984 — Speaker/Boundary Interference Response (SBIR)

> Berger, R. E., "Speaker/Boundary Interference Response (SBIR)", *Synergetic Audio Concepts
> Tech Topics*, Vol. 11, No. 5, Winter 1984.

**Kind:** newsletter article, short. **Read it for:** the name, and the idea, of Acoustic
X's Speaker Boundary Interference window.

## What it is

Russ Berger is a Dallas studio designer, the founder of the Russ Berger Design Group. This
*Tech Topic* went out to the readers of Synergetic Audio Concepts (Syn-Aud-Con), the
seminar company Don and Carolyn Davis ran for sound engineers. It gave a name, SBIR, to an
effect Roy Allison and others had measured in the 1970s: a loudspeaker near a wall, floor
or ceiling interferes with its own reflection, and the low-frequency response at the
listener depends on where the box stands as much as on the box. Acoustic-X took the name
and the calculation for one of its windows. This report keeps to the physics the article
is known for.

## Big ideas

### 1. A nearby boundary puts a notch in the response

**Summary.** The listener hears the direct sound and, a moment later, the sound reflected
from the boundary behind or beside the box. Where the extra path is half a wavelength, the
two cancel. For a box $d$ in front of a wall, with the listener on the line through it,
the extra path is $2d$ and the first notch falls at

$$f_\text{notch} = \frac{c}{4d}$$

Further notches follow at odd multiples. The notch is a property of the placement, not of
the speaker, so no amount of money spent on the speaker removes it.

**Challenge.** Work out $c/4d$ for $d$ = 0.3, 0.5, 1.0 and 1.5 m with $c = 343$ m/s. You
should find 286, 172, 86 and 57 Hz. Then put Speaker 1 0.5 m from the front wall in the
Speaker Boundary Interference window and find the notch on the chart. It sits near 172 Hz
but not exactly on it, because the listener is not on the line through the box and the
wall.

### 2. Every boundary adds its own comb

**Summary.** A box in a room has at least three near boundaries: the wall behind it, the
nearer side wall and the floor. Each gives its own notch at its own $c/4d$. If the three
distances are equal, the three notches land on one frequency and add into one deep hole.
If they differ, the notches spread out and each is shallower. The rule that follows is to
make the distances to the three nearest boundaries different.

**Challenge.** In a hard $6 \times 4.2 \times 2.8$ m box with the listener at $(2.1, 3.0,
1.2)$ (classic coordinates), compare a speaker 1.0 m from the front wall, the left wall and
the floor with one at 1.1 m, 0.7 m and 1.4 m. Run each with **No search** and read the
absolute deviation. With the engine's `sbirDeviation`, the equal-distance box scores about
5.1 dB, its deepest notch near 94 Hz, and the staggered box about 4.3 dB. Find whether
the staggered box has a single notch that is deeper, and decide whether a lower mean is
always the better placement.

### 3. Close to a wall the bass rises

**Summary.** When the box is very close to the boundary, the reflection arrives almost in
phase over the whole low-frequency range, and the level goes up instead of down. A
perfectly rigid wall, with the box against it, doubles the pressure in the limit: +6 dB.
In a corner each extra boundary adds more. The same move that removes the notch therefore
changes the bass level, and the speaker's own low-frequency controls must be set for its
place.

**Challenge.** A box 0.05 m in front of a hard wall, the listener 2 m away on the line
through it: the image is 2.1 m away. Work out $20\log_{10}(1 + 2/2.1)$ (5.8 dB). Then in
Speaker Boundary Interference choose **Negative** search, which ignores the boost and
minimises only the dips, and find whether it moves the speaker nearer the front wall than
**Absolute** does.

### 4. The fixes: flush, far, or thick

**Summary.** There are three ways out. Mount the box flush in the wall, so the wall is its
baffle and there is no reflection to interfere. Move it far enough that the first notch
falls below the speaker's low-frequency limit. Or absorb the reflection, which only works
when the absorber is deep compared with a quarter wavelength at the notch. A thin panel
behind a box does nothing at 100 Hz.

**Challenge.** Find the quarter wavelength at 86 Hz, the notch of a box 1 m from the wall
(1.0 m). Compare it with the 100 mm absorber in the material list. Then set a speaker with
a 45 Hz LF cut-off and find the distance $d$ that would put $c/4d$ below it (1.9 m), and
decide whether that is possible in a 6 m room.

### 5. Predict before you build

**Summary.** The calculation needs only the room's dimensions, the box and listener
positions, and the absorption of the near surfaces. It can run before a wall is built,
and it can search positions. That is what made SBIR a design tool rather than a
measurement curiosity.

**Challenge.** Let the SBIR window search Speaker 1 at the default 0.15 m step. Note the
best position and its score. Then halve the step and find whether the best position
moves by more than one step.

## Since then

The effect is now textbook. Toole's *Sound Reproduction* and Newell's *Recording Studio
Design* both treat boundary interference as a main cause of poor bass at the seat.
Loudspeaker makers answered with boundary-compensation switches, designs that radiate less
to the rear at low frequencies (cardioid bass), and soffit mounting. Measurement software
shows the notches directly. The point-source, first-order model is still how the effect is
explained, but a full prediction adds the room's modes, which the box also drives.

## In this app

- [Speaker Boundary Interference](../04-sbir.md#deviation): `js/acoustics/sbir.js`
  `sbirDeviation`, `searchPositions`; `js/acoustx/classic.js` `sbirScore`,
  `crossoverCheck`.
- [Engine chapter 10.1, The SBIR model](../../acoustics/10-sbir-nulls.md#101-the-sbir-model),
  with [the quarter-wave rule](../../acoustics/10-sbir-nulls.md#the-quarter-wave-rule) and
  its worked example at 0.5 m.
- [Engine chapter 15.3, Each speaker](../../acoustics/15-advisor.md#153-each-speaker): the
  advisor warns when $c/4d$ for the wall behind a box falls between 40 and 300 Hz.
- [Calculator, Comb](../07-calculator.md#comb--comb-filter-nulls): `classic.js`
  `combNulls` gives the notch series for any delay.
