# 23 · Helmholtz 1954 — On the Sensations of Tone

> Helmholtz, H. L. F., *On the Sensations of Tone as a Physiological Basis for the Theory of
> Music*, translated by A. J. Ellis, New York, Dover, 1954. The Dover edition reprints Ellis's
> 2nd English edition (London, Longmans, 1885), translated from the 4th German edition of
> *Die Lehre von den Tonempfindungen* (1877; first edition 1863).

**Kind:** scientific monograph, about 580 pages with Ellis's appendices. **Read it for:** the
resonator, and the idea that the ear analyses sound into partials.

## What it is

Hermann von Helmholtz, physician and physicist, set out to explain musical sound and musical
harmony from physics and the physiology of the ear. He analysed tones into their partials
with tuned glass and brass resonators of his own design, proposed that the inner ear works
as a bank of resonators, and explained consonance and dissonance by the beats between
partials. Alexander Ellis's translation added long notes and appendices of his own. The book
founded psychoacoustics. Acoustic-X cited it as the origin of two things a studio designer
still uses: the Helmholtz resonator and the habit of thinking about sound as a spectrum.

## Big ideas

### 1. The Helmholtz resonator

**Summary.** A cavity of volume $V$ with a neck of area $A$ and effective length $L'$
resonates as a mass–spring system: the air in the neck is the mass and the air in the cavity
the spring. Its frequency is

$$f_0 = \frac{c}{2\pi}\sqrt{\frac{A}{V L'}}$$

where $L'$ is the neck's length plus an end correction of the order of the neck radius.
Helmholtz used such resonators as filters to pick single partials out of a sound. A
perforated panel over a cavity is a sheet of them side by side, and its resonance falls where
the panel absorbs most.

**Challenge.** A perforated panel with open area $P = 0.02$, holes of 6 mm in a 6 mm board
($L' \approx 6 + 0.8\times6 = 10.8$ mm) over a 100 mm cavity: compute
$f_0 = \frac{c}{2\pi}\sqrt{P/(L' d)}$ at 20 °C and find about 235 Hz. Check it in the
Calculator's **Res** tab, *Resonators* (open area 2 %, gap 100 mm, panel 6 mm, holes 6 mm):
235.1 Hz. Find the
`perforated-wood` material in the app's palette (Resonator category) and say in which octave
band its α peaks.

### 2. A musical tone is a sum of partials, and the ear hears them

**Summary.** A sustained musical tone is periodic, so it is a sum of sine partials at whole
multiples of its fundamental. Helmholtz took Ohm's law of hearing, that the ear perceives a
tone's sine components, and argued that the strengths of the partials set its quality, or
timbre. Phase, he concluded, matters little to timbre.

**Challenge.** A bass guitar's A1 is 55 Hz. List its first three partials (55, 110,
165 Hz). In Modal Response's mode list for a $6 \times 4.2 \times 2.8$ m room at 20 °C, find
which partials fall within 1 Hz of a mode. You should find none for the first two, and two
modes, 520 at 164.7 Hz and 140 at 165.9 Hz, bracketing the third.

### 3. The ear as a bank of resonators

**Summary.** Helmholtz proposed that the basilar membrane holds a graded series of fibres,
each tuned to a frequency, so that each place in the cochlea responds to one part of the
spectrum. This is the place theory of pitch. Each resonator responds over a band, which sets
how finely the ear separates two tones.

**Challenge.** Compute the width of the ⅓-octave band centred on 100 Hz,
$100\,(2^{1/6} - 2^{-1/6})$, and find about 23 Hz. Two room modes 10 Hz apart near 100 Hz
fall inside one band. In Modal Response, read the ⅓-octave count chart and say why
[Bonello](06-bonello-1979-room-mode-criterion.md) counts modes per band rather than
judging each one.

### 4. Dissonance is beating between partials

**Summary.** Two tones whose partials lie close together beat. Slow beats are heard as a
waver; faster ones, round 30 per second by Helmholtz's estimate, as roughness. Intervals
whose low partials coincide exactly, the octave and the fifth, are smooth: that is
consonance. In equal temperament the coincidences are near, not exact, and slow beats
remain.

**Challenge.** In equal temperament A3 is 220 Hz and E4 is 329.63 Hz. Find the beat rate
between A3's 3rd partial and E4's 2nd (about 0.74 Hz). In the Calculator's **Tone** tab,
*Two Tones*, enter the two partials, 660 and 659.26 Hz: Beats reads 0.7 Hz. Enter the
fundamentals, 220 and 329.63 Hz, and the Interval line reads 700.0 cents, a fifth 3:2 less
1.9 cents. Its Beats line then reads 109.6 Hz, too far apart to beat: the beat you hear
lives between the partials, not the fundamentals. The **Add** tab shows the swing a beat goes
through: two equal tones add to +6 dB in phase and cancel out of phase.

### 5. Combination tones

**Summary.** Two loud tones at $f_1$ and $f_2$ produce faint additional tones, most
audibly the difference tone $f_2 - f_1$. Helmholtz traced them to nonlinearity in the ear's
mechanism, and also found weaker summation tones at $f_1 + f_2$.

**Challenge.** By hand: two tones at 800 and 1000 Hz. Find the difference tone and the
cubic difference tone $2f_1 - f_2$, and say which is lower. Check them in the Calculator's
**Tone** tab, *Two Tones*: Combination tones reads 200.0, 600.0 and, for the sum, 1800.0 Hz.
The tab computes where the tones fall; the app's sound models are linear and never make
them.

## Since then

The resonator formula is still taught unchanged and used for bass traps and slotted or
perforated absorbers. Georg von Békésy (Nobel Prize 1961) showed that the basilar membrane
carries a travelling wave rather than independent resonant fibres, but the place idea
survived, and the bandwidths Helmholtz's model implies became the critical bands of Fletcher
and Zwicker. Plomp and Levelt (1965) refined the roughness theory of dissonance using
critical bandwidth. The cubic difference tone, now known to arise in the cochlea, turned out
to be the more audible of the combination tones.

## In this app

- Idea 1: [engine chapter 3, materials](../../acoustics/03-materials-patches.md#31-what-a-material-is):
  `perforated-wood`, `slat-resonator` and `membrane-trap` in `js/acoustics/materials.js`.
  They carry tabulated α. The Calculator's **Res** tab, *Resonators*, computes the resonance
  from the geometry (`js/acoustx/references.js` `helmholtz`, `perforated`, `membrane`), but
  not an α curve, and the materials do not follow it.
- Idea 2: [Modal Response, room modes](../03-modal-response.md#room-modes).
- Idea 3: [Modal Response, Bonello's criterion](../03-modal-response.md#bonellos-criterion);
  `js/acoustics/modalDistribution.js` `thirdOctaveBands`, `thirdOctaveCounts`.
- Idea 4: [Calculator, Add](../07-calculator.md#add--level-addition) shows the coherent sum.
  Calculator, **Tone** tab, *Two Tones*: the beat rate, the interval in cents with the nearest
  just interval, and the roughness after Plomp and Levelt, 0 to 1; `references.js`
  `twoTones`, `noteOf`, `JUST`.
- Idea 5: the same *Two Tones* group gives the difference, cubic difference and sum tones
  (`twoTones`), as frequencies only.
- 📖 in the app: the groups *Resonators* and *Two Tones* open this report from their pop-up.
