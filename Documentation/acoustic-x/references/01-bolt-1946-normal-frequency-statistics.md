# 1 · Bolt 1946 — Note on Normal Frequency Statistics in Rectangular Rooms

> Bolt, R. H., "Note on Normal Frequency Statistics in Rectangular Rooms", *J. Acoust. Soc.
> Am.*, Vol. 18, No. 1, July 1946, pp. 130–133.

**Kind:** journal note, 4 pages. **Read it for:** the ideal mode count behind the blue line
in Acoustic X's Modal Response chart, and the "Bolt area" of good room proportions.

## What it is

Richard Bolt, then at MIT and later a founder of Bolt Beranek and Newman, had worked on the
wave theory of rooms since the late 1930s. This short note asks a practical question: for a
rectangular room, how do the proportions change the way its normal frequencies are spread?
It sets the average count of modes, which depends only on volume, surface and edges,
against the actual count, which depends on the ratios. It then charts the ratios that spread
the low modes most evenly. That chart became the "Bolt area" printed in most studio
handbooks since. Acoustic-X used the average count as its "ideal" curve, and this app keeps
it. This report covers the note's main themes.

## Big ideas

### 1. On average, the mode count depends only on size

**Summary.** The average number of modes below $f$ in a rigid box is a smooth function of
the room's volume $V$, total surface $S$ and total edge length $E$:

$$N(f) = \frac{4\pi V f^3}{3c^3} + \frac{\pi S f^2}{4c^2} + \frac{E f}{8c}$$

The volume term counts oblique modes. The surface and edge terms correct for the
tangential and axial modes, which a pure volume count misses. Bolt used this asymptotic
result, from the wave-theory work of Morse and Maa, as the yardstick. At high frequency the
volume term dominates and the count grows as $f^3$. At low frequency the corrections carry
most of it.

**Challenge.** For a $6 \times 4.2 \times 2.8$ m room with $c = 343$ m/s, work out
$N(f)$ by hand at 50, 100 and 200 Hz. You should get about 3.7, 16.4 and 91.1. Then find
what share the volume term carries at each frequency: about 25 %, 45 % and 64 %. Open Modal
Response on the same room and count the modes in the Data view below 200 Hz. There are 89,
close to the 91.1 the formula predicts.

### 2. The average hides the gaps, and the gaps depend on shape

**Summary.** $N(f)$ is the same for every box of the same size, whatever its proportions.
The actual modes are not. In a cube, the axial modes of the three dimensions land on the
same frequencies, so modes pile up in a few places and leave gaps between. Bolt's point is
that, at low frequency, the departure from the smooth average is what you hear, and the
proportions control it. The mean spacing between modes is $1/(dN/df)$. Below 100 Hz in a
domestic-size room it is several hertz, so a single gap or pile-up is audible.

**Challenge.** Take two boxes of 64 m³: a 4 m cube, and the ∛2 ratio $1 : 1.26 : 1.59$
scaled to the same volume, about $5.05 \times 4.00 \times 3.17$ m. Compute $N(200)$ for
both: about 82.3 and 82.8. Now put each into Modal Response. The actual counts are 83 and
82, nearly equal. But the cube's ⅓-octave chart reads 3, 0, 3 in the 40, 50 and 63 Hz
bands, and it fails Bonello. The ∛2 box rises steadily and passes. Also work out the mean
spacing of the 6 m room of idea 1 at 50 Hz and at 100 Hz: about 6.9 Hz and 2.6 Hz.

### 3. Some ratios spread the modes more evenly than others: the Bolt area

**Summary.** Bolt computed a measure of how irregular the mode spacing is for a range of
ratios, with the smallest dimension (usually the height) as 1. He plotted the result on a
chart of the two other ratios and marked the region where the spacing is smoothest. Ratios
inside that region avoid the worst coincidences. The note is careful about what the chart
means: it applies to the frequency range he analysed, and it is a statistic, not a
guarantee for every room.

**Challenge.** Write the $6 \times 4.2 \times 2.8$ m room as $1 : W/H : L/H$. You should
get $1 : 1.50 : 2.14$. Then do the same for the Louden ratio room in the room library
(height 2.7 m), whose note says it sits inside Bolt's area. Compare both with a printed
copy of the chart in a handbook (Everest's *Master Handbook*, [report
12](12-everest-1989-master-handbook.md), reproduces it) and find whether the 6 m room is
inside. The app does not draw the Bolt area, so this step is on paper.

### 4. Shape matters less as frequency and size grow

**Summary.** The relative fluctuation of the actual count about $N(f)$ shrinks as the count
grows. In a large room, or high enough in frequency, every ⅓-octave band holds dozens of
modes and the proportions stop mattering. That is why ratio rules are about small rooms and
low frequencies. The same idea later got a number of its own, the Schroeder frequency.

**Challenge.** Compute the ideal count in the 100 Hz ⅓-octave band (89.1 to 112.2 Hz) as
$N(112.2) - N(89.1)$ for a $3 \times 2.5 \times 2.4$ m booth and a $12 \times 9 \times 5$
m hall. You should find about 2.9 and 53.6. Check them in Modal Response: the actual counts
are 3 and 52. One mode more or less changes the booth's band by a third. In the hall it
changes it by 2 %.

## Since then

Bolt's average count is still the standard reference for mode density, and the Bolt area
still appears in handbooks. Later work narrowed what it can claim. Sepmeyer, Louden and
Bonello ([reports 4](04-louden-1971-dimension-ratios.md),
[5](05-sepmeyer-1965-normal-modes.md), [6](06-bonello-1979-room-mode-criterion.md))
proposed other ways to score a ratio. Cox, D'Antonio and Avis (*J. Audio Eng. Soc.* 2004)
showed that the best ratio depends on where the source and listener are. Schroeder's
frequency, $f_S = 2000\sqrt{T/V}$, gave the crossover from modal to statistical behaviour
that Bolt's idea 4 describes.

## In this app

- [Modal Response, the ideal count](../03-modal-response.md#the-ideal-count-bolts-statistics);
  `js/acoustx/classic.js` `modesBelow`, `idealCounts`.
- [Engine chapter 5, Room modes and their distribution](../../acoustics/05-modes.md);
  `js/acoustics/modalDistribution.js` `thirdOctaveCounts`, `modeList`.
- The favourable-ratio list carries the ∛2 series under Bolt's name
  ([Favourable ratios](../03-modal-response.md#favourable-ratios),
  `modalDistribution.js` `FAVOURABLE_RATIOS`).
- [Schroeder frequency](../../acoustics/04-reverberation.md#43-schroeder-frequency);
  `js/acoustics/room.js` `schroeder`.
- The Bolt area chart itself is not drawn anywhere in the app.
