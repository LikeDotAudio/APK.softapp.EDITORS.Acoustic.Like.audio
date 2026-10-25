# 25 · Hall 1980 — Musical Acoustics

> Hall, D. E., *Musical Acoustics: An Introduction*, Belmont, California, Wadsworth, 1980.

**Kind:** introductory college textbook. **Read it for:** how musicians' sound, hearing and
rooms connect, at a level that needs only algebra.

## What it is

Donald Hall, a physicist at California State University, Sacramento, wrote this for a
course on the physics of music taken by music and general students. It starts from vibration
and waves, moves through hearing, pitch, loudness and timbre, covers the families of
instruments and the voice, and ends with rooms, electronic sound and tuning systems. It
became one of the standard texts for such courses and went into later editions. Acoustic-X
cited it as a readable bridge between the physics in [Tipler](20-tipler-1991-physics.md)
and the musician's ear.

## Big ideas

### 1. Pitch is heard on a logarithmic scale

**Summary.** Equal steps of pitch are equal frequency ratios, not equal differences. An
octave is a ratio of 2, the equal-tempered semitone $2^{1/12}$, and the cent one hundredth
of a semitone: the interval from $f_1$ to $f_2$ is $1200\log_2(f_2/f_1)$ cents. This is why
acoustic charts use a logarithmic frequency axis and fractional-octave bands.

**Challenge.** Find the size of a ⅓-octave band in cents (400). Then take two room modes at
50 and 53 Hz and find the interval between them (about 101 cents, a semitone). The
Calculator's **Tone** tab, *Two Tones*, reads 100.9 cents, nearest the minor second 16:15.
In Modal Response's chart, find a pair of neighbouring modes below 80 Hz in a
$6 \times 4.2 \times 2.8$ m room that are more than a whole tone (200 cents) apart.

### 2. Loudness is not level

**Summary.** The ear's sensitivity depends on frequency and on level. Equal-loudness
contours show that a 50 Hz tone needs a much higher SPL than a 1 kHz tone to sound equally
loud, the more so at low levels. Loudness level is measured in phons, and loudness in sones,
with roughly a 10 dB rise needed to sound twice as loud.

**Challenge.** In the Calculator's **Add** tab, find how many uncorrelated sources at
80 dB it takes to raise the level by 10 dB (ten), and so to sound roughly twice as loud as
one. Note how much more than a doubling of players that is. In the **Tone** tab, *Loudness*,
80 phon reads 16.00 sone and 90 phon 32.00. A phon equals a dB only at 1 kHz; the app has
no equal-loudness contours to convert a level at another frequency.

### 3. Strings and air columns have harmonic modes

**Summary.** A string fixed at both ends, and a pipe open at both ends, resonate at all
multiples of $f_1 = v/2L$. A pipe closed at one end resonates only at odd multiples of
$v/4L$, and sounds an octave lower than an open pipe of the same length. The pattern of
these resonances shapes an instrument's spectrum, and so its timbre.

**Challenge.** By hand, find the lowest resonance of a 0.6 m pipe closed at one end
(about 143 Hz) and open at both ends (about 286 Hz), with $c = 343$ m/s. A room between two
rigid walls behaves, for pressure, like a pipe closed at both ends. In Modal Response, check
that the axial modes of a 6 m length run 28.6, 57.2, 85.8 Hz: all multiples, like the open
pipe.

### 4. Rooms add reverberation, and music asks for some

**Summary.** In a room the listener hears the direct sound, then early reflections, then a
reverberant tail. Sabine's formula, $T = 0.161\,V/A$, predicts the tail's length from the
volume and the absorption. Music benefits from more reverberation than speech, and larger
spaces from more than small ones. A studio is a compromise: dry enough to record cleanly,
live enough that players can hear themselves.

**Challenge.** By hand, find the Sabine $T$ for a $6 \times 4.2 \times 2.8$ m room with
$\bar\alpha = 0.25$ (about 0.42 s), then check it in Ray Tracing's Data View room figures.
In Reverb Time, compare that with the Studio criteria and say whether the room is too live
or too dead.

### 5. Two ears locate the source

**Summary.** The ear locates a source from the difference in arrival time and level at the
two ears. When the same sound arrives from two directions within a few milliseconds, the
first arrival sets the perceived direction: the precedence effect
([Haas](07-haas-1972-single-echo.md)). Stereo reproduction relies on both: two speakers and
the listener in an equilateral triangle place a phantom image between them.

**Challenge.** In Speaker Boundary Interference's Listener tab, put the speakers at
$X = 0.9$ and $3.3$ m, both at $Y = 0.8$ m. Find the listener distance $Y$ that makes the
angle between them 60° (about 2.88 m), and check the window reports it.

### 6. Tuning systems are compromises

**Summary.** Pure intervals from the harmonic series do not close into a circle: twelve
pure fifths overshoot seven octaves by the Pythagorean comma, about 23.5 cents. Just
intonation, meantone and equal temperament distribute that error differently. Equal
temperament makes every key alike at the cost of slightly impure thirds and fifths.

**Challenge.** By hand, compute $1200\log_2\big((3/2)^{12}/2^7\big)$ and find the comma
(about 23.46 cents). In the Calculator's **Tone** tab, *Two Tones*, enter 440 and 660 Hz:
the interval reads 702.0 cents, a just fifth 3:2, with equal temperament 2.0 cents flat of it.
Twelve of those shortfalls make the comma. The app has no tuning systems beyond this
nearest-just-interval readout.

## Since then

The physics in the book has not changed. Equal-loudness contours were remeasured and
revised in ISO 226:2003, which found the ear less sensitive in the bass than the older
Fletcher–Munson and Robinson–Dadson curves showed. Hall's text went to a 2nd edition
(1991) and a 3rd (2002); Rossing's *The Science of Sound* covers the same ground at a
similar level.

## In this app

- Idea 1: the ⅓-octave bands of [Modal Response](../03-modal-response.md#the-ideal-count-bolts-statistics);
  `js/acoustics/modalDistribution.js` `thirdOctaveBands`.
- Idea 2: [Calculator, Add](../07-calculator.md#add--level-addition) (`classic.js`
  `addLevels`). The ⅓-octave table `FREQ_3RD` in `js/acoustics/bands.js` carries an
  A-weighting offset per band. Calculator, **Tone** tab, *Loudness*: phons to sones,
  `js/acoustx/references.js` `sones`, `phons`. Nothing computes loudness from a spectrum:
  no ISO 226 contours and no Zwicker model.
- Idea 3: [Modal Response, room modes](../03-modal-response.md#room-modes); `room.js`
  `axialModes`.
- Idea 4: [Reverb Time](../06-reverb-time.md#the-formulas) (`reverbTargets.js`
  `rtFormulas`) and [Ray Tracing, room figures](../05-ray-tracing.md#room-figures-data-view)
  (`classic.js` `roomFigures`).
- Idea 5: [SBIR, the listener and the angles](../04-sbir.md#the-listener-and-the-angles)
  (`classic.js` `listenerGeometry`).
- Ideas 1 and 6: Calculator, **Tone** tab, *Two Tones*: the interval in cents, the
  nearest just interval and how far equal temperament is from it, the notes and their cents
  off; `references.js` `twoTones`, `noteOf`, `JUST`. No meantone or other temperaments.
- 📖 in the app: the groups *Frequency / Wavelength / Period*, *Two Tones* and *Loudness* open
  this report from their pop-up.
