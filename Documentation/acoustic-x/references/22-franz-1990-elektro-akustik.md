# 22 · Franz 1990 — Elektro-Akustik

> Franz, D., *Elektro-Akustik*, Munich, Franzis-Verlag GmbH, 1990. The manual prints the
> publisher's legal form as "GmBH".

**Kind:** German-language technical book. **Read it for:** the transducers and the
electrical chain that feed sound into the room Acoustic X models.

## What it is

Franzis-Verlag in Munich published practical electronics books for technicians and
hobbyists, and *Elektro-Akustik* belongs to that list. We could not confirm its contents
beyond the manual's citation, so this report covers the main themes a book of this title
and kind reliably treats: how loudspeakers and microphones convert between electrical and
acoustic energy, how their sensitivity, directivity and frequency range are specified, and
how crossovers and levels fit them into a system. Acoustic-X needed these ideas because its
SBIR window asks for a real speaker's woofer height, low-frequency cut-off and crossover.
No page-level claim about the book is made here.

## Big ideas

### 1. The moving-coil transducer and its low-frequency roll-off

**Summary.** In a dynamic loudspeaker a current $i$ in a coil of length $l$ in a magnetic
field $B$ feels a force $F = Bl\,i$, which drives the cone. The cone, its suspension and the
air in the box form a mass–spring system with a resonance. Above it the output is roughly
flat. Below it the output falls: about 12 dB per octave for a closed box, about 24 dB per
octave for a vented one. The same principle run backwards is a dynamic microphone.

**Challenge.** The app models a speaker's bottom end as a 4th-order (24 dB per octave)
high-pass with its quoted $f_\text{low}$ at −10 dB. For the library monitor
($f_\text{low} = 45$ Hz), compute the level at 22.5 Hz from the formula in engine chapter
6.2. Find about −33.6 dB, and about −0.15 dB at 90 Hz.

### 2. Sensitivity, power and distance

**Summary.** A loudspeaker datasheet gives sensitivity as the SPL on axis at 1 m for 1 W
of electrical input. Doubling the power adds 3 dB; doubling the distance in free field takes
6 dB away. Efficiency is low: a box of 87 dB/W/m turns well under 1 % of the amplifier's
power into sound. Getting 10 dB more takes ten times the power.

**Challenge.** A box of 87 dB at 1 W/1 m driven with 5 W: find the free-field level at
2.5 m by hand (about 86.0 dB). Then use the app's `wattsFor` arithmetic,
$W = 10^{(\text{SPL} - \text{sens})/10}$, to find the power for 100 dB at 1 m (about
20 W).

### 3. Boundaries load the source

**Summary.** At low frequencies a speaker radiates in all directions. Put it against a
large wall and it radiates into half space: the same power over half the solid angle, so
6 dB more pressure. A corner gives 12 dB and a three-way corner 18 dB. Out from the wall, the
reflection arrives late and the gain turns into a comb with a deep first notch near $c/4d$.
That notch is what Acoustic-X's SBIR window measures.

**Challenge.** In Speaker Boundary Interference, move the speaker from 1.0 m to 0.3 m from
the front wall, keeping the listener fixed. Find that the first deep notch moves up, from
near 86 Hz toward 286 Hz ($c/4d$), and say whether the deviation score gets better or
worse.

### 4. Polar patterns and the directivity factor

**Summary.** A pressure microphone is omnidirectional. A pressure-gradient microphone has a
figure-of-eight pattern $\cos\theta$. Mixing the two gives the first-order family
$G(\theta) = a + (1 - a)\cos\theta$: cardioid at $a = 0.5$, hypercardioid at $a = 0.25$.
The directivity factor $Q$ is the on-axis intensity over the mean intensity: 1 for omni,
3 for cardioid and figure-of-eight, 4 for hypercardioid. A directional microphone or
speaker hears or excites less of the diffuse field.

**Challenge.** Integrate $G^2$ over the sphere for the cardioid by hand: the mean of
$(0.5 + 0.5\cos\theta)^2$ over all directions is $1/3$, so $Q = 3$. Then compute the
critical distance $0.141\sqrt{QR}$ for $Q = 1$ and $Q = 3$ with $R = 35.8$ m² (the Ray
Tracing example room) and find how much farther a cardioid's direct sound dominates.

### 5. Crossovers split the band with filters of known slope

**Summary.** A multi-way speaker sends lows and highs to different drivers through filters.
A Butterworth filter of order $n$ is −3 dB at its corner and falls $6n$ dB per octave
beyond it. A dip in the summed response at the crossover is a common fault, and room
interference at that frequency makes it worse.

**Challenge.** The app's sub crossover is a 4th-order Butterworth low-pass. Compute its
level one octave above the corner, $20\log_{10}(1/\sqrt{1 + 2^8})$, and find −24.1 dB. Then
in Speaker Boundary Interference, enter a crossover and find whether the window flags a dip
there for your speaker position.

### 6. Levels along the chain

**Summary.** Electrical levels are decibels against a reference voltage: dBu against
0.775 V, dBV against 1 V. Professional line level is +4 dBu (1.228 V), consumer −10 dBV
(0.316 V), about 11.8 dB apart. Gain staging keeps each stage above its noise and below its
clipping point.

**Challenge.** By hand, find the voltage at +4 dBu and at −10 dBV and the difference in dB.
The app has no electrical side: it starts at the speaker's acoustic output.

## Since then

The transducer principles are unchanged. What changed is the system around them: active
monitors with built-in amplifiers and DSP crossovers, and room correction that equalises
part of the boundary and modal response. Equalisation cannot fill a deep SBIR notch, which
is a cancellation, so placement still matters. The Thiele–Small parameters, already
standard by 1990, remain how drivers and boxes are specified.

## In this app

- [Engine chapter 6.1, loudspeaker level](../../acoustics/06-sources-receivers.md#61-loudspeaker-level);
  `js/acoustics/devices.js` `speakerLevel`, `wattsFor`.
- [Engine chapter 6.2, frequency response](../../acoustics/06-sources-receivers.md#62-frequency-response);
  `devices.js` `responseGain`, `lowpassGain`.
- [Engine chapter 6.3, mounting](../../acoustics/06-sources-receivers.md#63-mounting): the
  half-space and corner gains; `js/acoustics/field.js` `mountGainDb`.
- [Engine chapter 6.5, directivity](../../acoustics/06-sources-receivers.md#first-order-patterns);
  `js/acoustics/patterns.js` `shapeGain`, `directivityQ`.
- [SBIR](../04-sbir.md): [deviation](../04-sbir.md#deviation) (`js/acoustics/sbir.js`
  `sbirDeviation`) and [the speaker's critical frequencies](../04-sbir.md#the-speakers-critical-frequencies)
  (`classic.js` `crossoverCheck`).
- Idea 6: nothing. The app has no electrical signal chain.
