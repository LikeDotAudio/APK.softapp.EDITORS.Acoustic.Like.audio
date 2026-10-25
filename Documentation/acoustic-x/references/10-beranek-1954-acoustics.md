# 10 · Beranek 1954 — Acoustics

> Beranek, L. L., *Acoustics*, New York, McGraw-Hill, 1954. Reprinted by the Acoustical
> Society of America, 1986.

**Kind:** textbook. **Read it for:** the room constant and the direct-plus-reverberant level
equation that Acoustic X's Ray Tracing window and this app's energy method both use.

## What it is

Leo Beranek wrote *Acoustics* while teaching at MIT, as a graduate text for electrical
engineers who had to design microphones, loudspeakers and the rooms they work in. It covers
the wave equation, the analogy between acoustic, mechanical and electrical circuits, radiation
from pistons and other sources, microphones, direct-radiator loudspeakers, enclosures and
horns, sound in rooms, and hearing. It works in rationalised MKS units throughout, unusual for
an American text of its time. For decades it was the book an audio engineer learned
transducers from, and its room chapter gave a generation the equations for level in a room.

Acoustic-X listed it for that room chapter, which is where its critical-distance and
room-constant figures come from.

## Big ideas

### 1. Acoustic and mechanical systems as electrical circuits

**Summary.** A mass behaves like an inductance, a spring like a capacitance and friction like
a resistance. An air volume is an acoustic compliance, a short tube of air is an acoustic mass,
and a fine screen is an acoustic resistance. Draw the system as a circuit, and the tools of
circuit analysis (impedance, resonance, filters) solve it. Beranek used this analogy to treat a
loudspeaker in its box, a microphone capsule or a resonant absorber as one network.

**Challenge.** A Helmholtz resonator is an acoustic mass (the neck) on an acoustic compliance
(the cavity), a series LC circuit. Its resonance is

$$f_0 = \frac{c}{2\pi}\sqrt{\frac{S}{V\,l'}}$$

with $S$ the neck area, $V$ the cavity volume and $l'$ the neck length plus end corrections.
Take a 50 mm diameter neck 100 mm long on a 10 litre cavity, with $l' = l + 1.7a$. Find
$f_0 \approx 64$ Hz. The app has no resonator calculator; its `membrane-trap` material is a
fixed estimate, not a design you can tune.

### 2. A piston radiates evenly only while it is small

**Summary.** A loudspeaker cone is a piston of radius $a$. While $ka = 2\pi f a / c$ is well
under 1, it radiates nearly evenly in all directions. Above $ka \approx 1$ it beams, and its
directivity factor $Q$ rises. $Q$ is the on-axis intensity over the mean intensity over the
sphere, and the directivity index is $\text{DI} = 10\log_{10} Q$. A source on a hard boundary
radiates into half the space and has $Q = 2$.

**Challenge.** Find the frequency where $ka = 1$ for a 200 mm woofer ($a = 0.1$ m): about
546 Hz. Then read
[engine chapter 6, Directivity factor](../../acoustics/06-sources-receivers.md#directivity-factor):
the app's cardioid monitor with `omniBelow` = 300 Hz has $Q$ = 1 at 150 Hz and 3.00 at 1 kHz.
Say which of the two (the pistonic $ka$ or the box's `omniBelow`) the app actually uses.

### 3. Direct plus reverberant: the room constant

**Summary.** In a room, the level at distance $r$ from a source of power level $L_W$ is the sum
of a direct field that falls with $r^2$ and a reverberant field that does not:

$$L_p = L_W + 10\log_{10}\!\left(\frac{Q}{4\pi r^2} + \frac{4}{R}\right), \qquad R = \frac{S\bar\alpha}{1 - \bar\alpha}$$

The room constant $R$, in m², says how much of the energy the room absorbs after the first
reflection. The equation goes back to Hopkins and Stryker (1948). Beranek's book made it the
working tool of room design.

**Challenge.** In Ray Tracing's Data View, the $6 \times 4.2 \times 2.8$ m room with
$\bar\alpha = 0.25$ has $R = 35.8$ m²
([chapter 5, room figures](../05-ray-tracing.md#room-figures-data-view)). With $Q = 2$, find
$L_p - L_W$ at 1 m ($-5.7$ dB) and at 3 m ($-8.9$ dB). Going from 1 m to 3 m the direct sound
alone falls 9.5 dB, but the total falls only 3.2 dB. Say which term is larger at 3 m.

### 4. The critical distance

**Summary.** Where the two terms are equal, $Q/(4\pi r^2) = 4/R$, and

$$r_c = \sqrt{\frac{QR}{16\pi}} \approx 0.141\sqrt{QR}$$

Inside $r_c$ the listener hears mostly the source; outside it, mostly the room. A more
directional source pushes $r_c$ out; a more absorbent room does too, but only as the square
root of $R$.

**Challenge.** Check the Data View's $D_c = 1.19$ m for $Q = 2$, $R = 35.8$ m²: find
$0.141\sqrt{71.6} = 1.19$ m. Then in the main app, place the mix seat just inside and just
outside a monitor's critical distance and read what the advisor says about it
([chapter 9 §9.4](../../acoustics/09-echogram-iso3382.md#94-critical-distance),
[chapter 15 §15.3](../../acoustics/15-advisor.md#153-each-speaker)).

### 5. Reverberation time with the air included

**Summary.** The book gives Sabine's and Eyring's formulas and adds the absorption of the air,
which grows with frequency and with the size of the room. In metric units,

$$T = \frac{0.161\,V}{-S\ln(1 - \bar\alpha) + 4mV}$$

with $m$ the air's intensity attenuation coefficient per metre. In a small room the air term
is small below 4 kHz; in a hall it sets the treble reverberation.

**Challenge.** Engine chapter 4 gives the air term for the $4 \times 5 \times 2.7$ m room at
500 Hz as $4mV = 0.134$ m²
([§4.2](../../acoustics/04-reverberation.md#42-the-engines-rt-with-air)). Compare it with
the room's $A = 5.43$ m² and find that it shortens the RT by about 2.4 %. Then multiply every
dimension by 4 and find how the air term grows against the absorption term ($V$ grows 64
times, $S$ only 16).

### 6. Microphones by how they respond to pressure

**Summary.** A pressure microphone is omnidirectional. A pressure-gradient microphone is a
figure of eight. Mixing the two gives the cardioid family. Each pattern rejects a share of a
diffuse field, given by its $Q$: 3 for cardioid and figure of eight, 4 for hypercardioid. A
directional microphone therefore picks up less of the room at the same distance, as if it
were closer.

**Challenge.** Find the DI of a cardioid, $10\log_{10}3 = 4.8$ dB. By the equation of idea 3,
find how much farther from the source a cardioid can stand than an omni for the same
direct-to-reverberant ratio: $\sqrt{3} = 1.73$ times. Check the app's patterns in
[chapter 6](../../acoustics/06-sources-receivers.md#directivity-factor), and how a mic's $Q$
divides the reverberant energy in the energy method
([chapter 8 §8.2](../../acoustics/08-field-methods.md#82-energy-method-direct--diffuse)).

### 7. Levels add as energy

**Summary.** Decibels are logarithms of energy ratios. Uncorrelated sources add their powers,
so two equal sources make 3 dB more than one, not 6 dB. The same signal in phase adds its
pressures and makes 6 dB more. Most room calculations assume the first.

**Challenge.** In the Calculator's **Add** tab, add 90, 87 and 84 dB as energy and find
92.44 dB ([chapter 7](../07-calculator.md#add--level-addition)). Then add 90 and 90 dB in
phase, 96.02 dB. Say which of the two the direct-plus-reverberant equation of idea 3 uses.

## Since then

The book stayed in print for decades and was reprinted by the Acoustical Society of America in
1986. Beranek, with Tim Mellow, rewrote it as *Acoustics: Sound Fields and Transducers* (2012),
with a second edition in 2019. The circuit analogies became the Thiele–Small loudspeaker
models of the 1960s and 1970s. The room-constant equation is still taught, but it assumes a
diffuse field: it overestimates the reverberant level far from the source in long or
absorbent rooms, and it says nothing below the Schroeder frequency, where modes rule. Barron
and Lee (1988) proposed a revised theory in which the reverberant level falls with distance.

## In this app

- [Ray Tracing, room figures](../05-ray-tracing.md#room-figures-data-view):
  `js/acoustx/classic.js` `roomFigures` gives $R$, MFP and $D_c$ with $Q = 2$.
- [Engine chapter 8 §8.2, Energy method](../../acoustics/08-field-methods.md#82-energy-method-direct--diffuse):
  `js/acoustics/field.js` `energyAt` is the direct-plus-reverberant equation, per band.
- [Engine chapter 9 §9.4, Critical distance](../../acoustics/09-echogram-iso3382.md#94-critical-distance):
  `js/acoustics/analysis.js` `criticalDistance`.
- [Engine chapter 4](../../acoustics/04-reverberation.md): `js/acoustics/room.js`
  `buildRoom` stores $R$ and the RT with air.
- [Engine chapter 6, Directivity](../../acoustics/06-sources-receivers.md#65-directivity):
  `js/acoustics/patterns.js` `directivityQ`.
- [Calculator](../07-calculator.md): `classic.js` `addLevels`, `inverseSquare`.
- The circuit analogies, horns, enclosures and transducer design of ideas 1 and 2 have no
  counterpart in the app.
