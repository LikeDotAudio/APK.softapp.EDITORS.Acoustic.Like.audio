# 4 · Louden 1971 — Dimension-Ratios of Rectangular Rooms With Good Distribution of Eigentones

> Louden, M. M., "Dimension-Ratios of Rectangular Rooms With Good Distribution of
> Eigentones", *Acustica*, Vol. 24, 1971, pp. 101–104.

**Kind:** journal paper, 4 pages. **Read it for:** the Louden ratio, 1 : 1.4 : 1.9, in
Acoustic X's list of favourable ratios, and the idea of ranking ratios by one number.

## What it is

By 1971 several "best" room ratios were in print, each from a different argument. Louden
took a computer to the question. He scored a large grid of height : width : length ratios
with one figure of merit for how evenly the lowest eigentones (modes) are spaced, and
published the best of them as a ranked table. The ratio at the top, 1 : 1.4 : 1.9, is the
one most handbooks now quote under his name. Acoustic-X put it in its favourable-ratio list,
and this app keeps it there. This report covers the paper's method and result rather than
its table in detail.

## Big ideas

### 1. One number for a ratio: the spread of the mode spacing

**Summary.** If the modes were perfectly evenly spaced, every gap between neighbours would
be the same. Louden's figure of merit measures how far the actual gaps depart from that,
using the standard deviation of the spacing of the low modes. A small value means even
spacing. A large one means pile-ups and gaps. Because it is one number, ratios can be
sorted by it. The app's optimiser uses the same kind of measure, the coefficient of
variation of the gaps,

$$\text{CV} = \frac{\sigma_g}{\bar g}, \qquad g_i = f_{i+1} - f_i$$

which is 0 for perfectly even spacing.

**Challenge.** Take the axial modes of a $5.13 \times 3.78 \times 2.7$ m room (the Louden
ratio at $H = 2.7$ m) below 100 Hz. Work them out by hand with $c = 343$ m/s: there are
five, at 33.4, 45.4, 63.5, 66.9 and 90.7 Hz (the next, 100.3 Hz, is just over the limit).
Find the four gaps, their mean and their population standard deviation, and form the CV.
You should get a mean gap of about 14.3 Hz, a standard deviation of about 7.6 Hz and a CV
of about 0.53. Then do the same for a 2.7 m cube's nine axial modes below 200 Hz (three
each at 63.5, 127.0 and 190.6 Hz). Six of its eight gaps are zero, and the CV is about
1.73.

### 2. Search the whole grid, not a few candidates

**Summary.** Earlier authors argued for a ratio from a principle: a geometric series, the
golden section, simple integers. Louden instead tried every ratio on a grid, with the
height as 1 and the other two dimensions stepped across a range, and let the figure of
merit choose. The method makes no assumption about what a good ratio looks like. It is the
same brute-force approach the app's optimiser takes, on dimensions in metres rather than
ratios.

**Challenge.** In Modal Response, Optimize, fix $H = 2.7$ m and let $L$ run from 4.6 to
5.6 m and $W$ from 3.3 to 4.3 m with a step of 0.1 m. Find the best box: about
$4.9 \times 4.3 \times 2.7$ m, score about 1.52. Write it as a ratio, $1 : 1.59 : 1.81$, and
note that it is not the Louden ratio.

### 3. The winner: 1 : 1.4 : 1.9

**Summary.** The top of Louden's table is 1 : 1.4 : 1.9. Near it are many ratios that score
almost as well. The optimum is flat: a few per cent change in a ratio barely moves the
figure of merit, unless it creates a coincidence. That is useful, because a real room
rarely lands exactly on a ratio.

**Challenge.** In the Room tab, apply the Louden ratio with $H = 2.4$, 2.7, 3.0 and 3.5 m in
turn and read the Bonello check each time. You should find that it passes at 2.4, 3.0 and
3.5 m, and fails at 2.7 m: the 40 Hz band holds no mode while the 31.5 Hz band holds one.

### 4. A ratio is scale-free, the ear's bands are not

**Summary.** Scaling a room by a factor $k$ divides every mode frequency by $k$, so the
pattern of gaps, measured over a fixed *number* of modes, does not change. Louden's ranking
is therefore a property of the ratio alone. But the ear and Bonello's test work in fixed
⅓-octave bands. As the room is scaled, the same pattern slides across fixed band edges, and
a mode can drop out of one band into the next. So a good ratio can fail at one size and pass
at another, as idea 3's challenge shows. The app's score uses all modes below 200 Hz, a
fixed frequency limit, so it changes with size too.

**Challenge.** Compute the app's score for the Louden ratio at $H = 2.7$ m: about 3.64,
because the Bonello failure costs 2 on its own. Compare the Bolt (∛2) ratio at the same
height, $4.29 \times 3.40 \times 2.7$ m: it passes, with a score of about 1.40. Then open
the **Criteria** tab's *Spacing Index (Louden)* list, which scores the gaps between the lowest
30 modes, lower being more even. Find Louden at 0.807 and Bolt at 0.833: an index of
Louden's kind ranks these two the other way. Explain in one sentence why.

## Since then

Louden's ratio stayed in the handbooks, beside Sepmeyer's and Bolt's. Later studies changed
the figure of merit rather than the method. Bonello ([report
6](06-bonello-1979-room-mode-criterion.md)) counted modes per ⅓ octave. Walker (BBC, 1990s)
and Cox, D'Antonio and Avis (*J. Audio Eng. Soc.* 2004) scored the actual frequency response
at a seat, with the source placed, and found that the best ratio depends on those positions.
The brute-force search Louden used is now routine.

## In this app

- [Modal Response, Favourable ratios](../03-modal-response.md#favourable-ratios);
  `js/acoustics/modalDistribution.js` `FAVOURABLE_RATIOS`.
- [Modal Response, The room-size optimiser](../03-modal-response.md#the-room-size-optimiser);
  `modalDistribution.js` `scoreDimensions`, `optimiseDimensions`.
- [Engine chapter 5, Spacing uniformity](../../acoustics/05-modes.md#spacing-uniformity);
  `modalDistribution.js` `spacingSpread`.
- [Engine chapter 14, The room library](../../acoustics/14-layouts-placement.md#145-the-room-library):
  the Louden-ratio room, `js/acoustics/roomLibrary.js`.
- Modal Response, **Criteria** tab, *Spacing Index (Louden)*: the spread of the gaps between
  the lowest 30 modes, scale-free, for this room, and the favourable ratios ranked by it;
  `js/acoustx/references.js` `spacingIndex`, `gapCv`. It is a figure of merit of Louden's
  kind, not his own, and it ranks the app's seven ratios, not his table: Sepmeyer A comes
  first there, Louden fourth.
- Modal Response, **Criteria** tab, *Bolt Area*: the app's score mapped over the ratios at the
  room's height; `references.js` `boltMap`. The score itself still mixes Bonello failures with
  spacing spread over every mode below 200 Hz.
- 📖 in the app: the groups *Favourable Room Ratios*, *Bolt Area* and *Spacing Index
  (Louden)* open this report from their pop-up.
