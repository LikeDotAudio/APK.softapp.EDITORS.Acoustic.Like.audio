# 9 · Beranek 1962 — Music, Acoustics, and Architecture

> Beranek, L. L., *Music, Acoustics, and Architecture*, New York, John Wiley & Sons, 1962.

**Kind:** book. **Read it for:** what makes a hall sound good, in words musicians use, tied
to numbers an engineer can compute: reverberation time by use, the bass ratio, the
initial-time-delay gap.

## What it is

Leo Beranek, co-founder of the Boston consulting firm Bolt Beranek and Newman, spent the
1950s visiting concert halls and opera houses in Europe and the Americas. He measured them,
studied their drawings, and interviewed conductors, musicians and critics about how each one
sounded. This book reports 54 of those halls, each with plans, data and comment, and tries to
connect the listeners' judgements to physical measures. It gave the field a shared vocabulary
of subjective attributes (intimacy, liveness, warmth, clarity, brilliance, balance, blend,
ensemble and others) and a rating scheme that weighted them into one score.

Acoustic-X was a small-room program, so it took little of the book directly. It listed it for
the ideas that carry across: reverberation time chosen by what the room is for, balance
between bass and mid reverberation, and the timing of the first reflection.

## Big ideas

### 1. Ask listeners first, then look for the number

**Summary.** The book starts from what experienced listeners said about real halls, not from
a formula. Beranek collected their judgements, grouped them into a set of named attributes,
and then looked for a measurable quantity behind each one. Where he found one, the attribute
became something a designer could aim at. This order of work, judgement first and physics
second, is the book's method and its lasting example.

**Challenge.** Pick three attributes the book names: liveness, warmth and intimacy. For each,
write down which number in this app comes closest: the mid-band RT and the bass ratio in the
Reverb Time window's *Hall Checks (Beranek)* (Type tab), and the initial-time-delay gap in
Ray Tracing's **Time** tab, *Precedence & Echo (Haas)*. Then name one attribute (blend, for
example) for which the app gives no number at all.

### 2. Intimacy and the initial-time-delay gap

**Summary.** Beranek found that the halls rated most intimate had a short initial-time-delay
gap (ITDG): the time between the direct sound and the first reflection at a seat in the middle
of the main floor. In the best-rated halls it was about 20 ms or less. Narrow, shoebox halls
achieve this with their side walls; wide fan-shaped halls struggle to, and often need
reflectors.

**Challenge.** Plan view only, ignore floor and ceiling. A source on the centre line, a
listener 20 m in front of it on the same line. In a hall 24 m wide, the side-wall image is
24 m to the side of the source: find the reflected path, 31.2 m, and the ITDG, 11.2 m or
32.8 ms at 343 m/s. Narrow the hall to 18 m and find 6.9 m, 20.1 ms. Then open Ray Tracing on
the $6 \times 4.2 \times 2.8$ m room and read the initial-time-delay gap in the **Time** tab's
*Precedence & Echo (Haas)*: a few milliseconds. In a small room the question is not whether
the first reflection is early enough, but whether it is quiet enough (the 10 dB window,
[chapter 5](../05-ray-tracing.md#the-charts)).

### 3. Liveness: reverberation time chosen by use

**Summary.** Liveness follows the reverberation time at mid frequencies (500 Hz and 1 kHz)
with the audience in place. Beranek showed that the preferred value depends on the music and
grows with the size of the room: near 2 s for the symphonic repertoire, less for opera, where
words must carry, and less again for chamber music. A single "good" RT does not exist; a good
RT exists for each use.

**Challenge.** By Sabine, $A = 0.161\,V/T$. Find the absorption a 20 000 m³ hall needs to reach
2.0 s: 1610 m². Then build the hall in the Reverb Time window as a $40 \times 25 \times 20$ m
box with plaster walls and ceiling and the occupied `audience` material on the floor. With
Sabine selected, find that it rings about 3.4 s at 500 Hz and 3.0 s at 1 kHz: 1000 m² of audience is not enough on
its own. *Hall Checks (Beranek)* on the Type tab gives the mid-band RT as 3.20 s. Choose the
**Concert hall (symphonic)** criteria, 2.0 s at mid band and rising toward the bass, and use
the area optimiser to find how much more absorption the walls need.

### 4. Warmth: the bass ratio

**Summary.** Beranek tied warmth to the strength of the bass, and measured it by the bass
ratio, the low-frequency reverberation over the mid-frequency reverberation:

$$\text{BR} = \frac{T_{125} + T_{250}}{T_{500} + T_{1000}}$$

A hall whose bass dies faster than its mids sounds thin. The halls he rated warm had a ratio
somewhat above 1.

**Challenge.** A hall measures 2.2, 2.0, 1.9 and 1.8 s at 125, 250, 500 and 1000 Hz. Find
$\text{BR} = 4.2 / 3.7 = 1.14$. Then read the bass ratio of the plaster-and-audience hall of
idea 3 in the Reverb Time window's *Hall Checks (Beranek)*, with Sabine selected: about 1.41.
Say which material makes it high: the audience absorbs much less at 125 Hz than at 1 kHz.

### 5. Audience and loudness

**Summary.** In a large hall the audience is most of the absorption, so the audience sets both
the reverberation time and how loud the reverberant sound is. Beranek argued from his
measurements, published just before the book, that audience absorption goes with the area the
seating covers more than with the number of people. A hall made bigger to hold more seats gets
quieter as well as deader. Loudness of the direct and of the reverberant sound are two of his
attributes.

**Challenge.** The reverberant level in a diffuse field goes as $10\log_{10}(4/R)$, with the
room constant $R = S\bar\alpha/(1 - \bar\alpha)$. Double the seated area in a hall where the
audience is nearly all the absorption, so $R$ roughly doubles. Find that the reverberant level
falls by about 3 dB. In the main app, put a large absorbing area on the floor of a room and
read the reverberant part of the energy method at a seat
([chapter 8 §8.2](../../acoustics/08-field-methods.md#82-energy-method-direct--diffuse)).

### 6. One score from many attributes

**Summary.** The book ends its survey by weighting the attributes into a single rating, so that
halls could be ranked. Intimacy carried the most weight, then liveness and warmth, with the
rest sharing smaller weights. The ranking matched the musicians' opinions of the halls fairly
well, which was its purpose. It was also the book's most criticised part, because the weights
were chosen by judgement and a few halls rated well on paper and badly in use.

**Challenge.** Take the three numbers you collected for idea 1 for two rooms of your own
design. Decide on a target and a tolerance for each, give each a weight, and rank the rooms.
Then change the weights and see whether the ranking survives. A score that flips when the
weights change by a little is not telling you much.

## Since then

The book's year was also the year New York's Philharmonic Hall opened, with Beranek's firm as
its acousticians, to poor reviews and years of rebuilding. That hurt the book's standing.
Beranek returned to the subject with *Concert and Opera Halls: How They Sound* (1996) and
*Concert Halls and Opera Houses: Music, Acoustics, and Architecture* (2004), covering about
100 halls and adding measures that research had since found to matter: clarity (C80),
strength (G), lateral energy and interaural cross-correlation. ISO 3382-1 now defines most of
these. The ITDG remains in use, but later work by Barron, Marshall and others put more weight
on reflections from the side than on how early the first one is. Reverberation time chosen by
use, and the bass ratio, survive as he stated them.

## In this app

- [Reverb Time, criteria](../06-reverb-time.md#criteria): besides the small rooms (control
  room, studio, booth, cinema) the presets now include **Concert hall (symphonic)**, **Opera
  house** and **Chamber music**: 2.0, 1.5 and 1.6 s at mid band, rising toward the bass,
  ±10 %. They are his preferred ranges read as one curve each, approximate.
  `js/acoustics/reverbTargets.js` `RT_TARGETS`, `rtTarget`.
- [Reverb Time, the area optimiser](../06-reverb-time.md#the-area-optimiser):
  `js/acoustx/classic.js` `optimiseAreas`.
- Reverb Time, **Type** tab, *Hall Checks (Beranek)*: the mid-band RT and the bass ratio of
  the chosen formula against his ranges, and in the report a pointer to the ITDG;
  `js/acoustx/references.js` `bassRatio`.
- Ray Tracing, **Time** tab, *Precedence & Echo (Haas)*: the initial-time-delay gap of the
  traced arrivals; `references.js` `haasCheck`.
- The ITDG is in each microphone's report, `js/acoustics/analysis.js` `micReport`
  (`itdgMs`, [chapter 9 §9.3](../../acoustics/09-echogram-iso3382.md#93-mic-report)).
  Lateral energy, which later replaced much of the ITDG's role, is
  [§9.6](../../acoustics/09-echogram-iso3382.md#96-lateral-energy-fraction-apparent-source-width),
  `lateralFraction`.
- The rating scheme of idea 6 is not implemented: the app gives his measurable parts (ITDG,
  mid RT, bass ratio), not the weighted score.
- 📖 in the app: the groups *Criteria Type* and *Hall Checks (Beranek)* open this report from
  their pop-up.
