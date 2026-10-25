# 20 · Tipler 1991 — Physics for Scientists and Engineers

> Tipler, P. A., *Physics for Scientists and Engineers*, 3rd ed., New York, Worth Publishers,
> 1991.

**Kind:** university textbook, two volumes in the extended edition. **Read it for:** the
physics of waves and sound that every Acoustic X window takes for granted.

## What it is

Paul Tipler's calculus-based introductory text was a standard first-year course book in
North America. Its chapters on oscillations, mechanical waves and sound cover what a
room-acoustics program assumes the user already knows: what a wave is, how fast sound
travels, how intensity falls with distance, and what happens when two waves meet. The
manual pointed at it as background, not as a source of any one method. This report takes
the wave and sound material only.

## Big ideas

### 1. The speed of sound depends on the gas and its temperature

**Summary.** Sound in a gas is a pressure wave whose speed is set by the gas's stiffness
and density. For an ideal gas this reduces to

$$v = \sqrt{\frac{\gamma R T}{M}}$$

where $\gamma$ is the ratio of specific heats (1.4 for air), $R = 8.314$ J/(mol·K), $T$ the
absolute temperature in K and $M$ the molar mass in kg/mol (0.029 for air). The speed goes
as $\sqrt{T}$ and does not depend on pressure.

**Challenge.** Compute $v$ at 20 °C by hand with $M = 0.02897$ kg/mol. You should get about
343.2 m/s. Then open **General Parameters**, set the temperature to 0 °C and to 30 °C, and
read the 100 mode of a 6 m long room in Modal Response. Find that it moves from about
27.6 Hz to about 29.1 Hz: every mode frequency scales with $c$.

### 2. Frequency, wavelength and speed are tied by $v = f\lambda$

**Summary.** A harmonic wave repeats every period $T = 1/f$ in time and every wavelength
$\lambda$ in space, and travels one wavelength per period. In air at room temperature the
audible range runs from about 17 m (20 Hz) to about 17 mm (20 kHz). That span is why a room
behaves as a set of resonances in the bass and as a field of rays in the treble.

**Challenge.** In the Calculator's **Wave** tab, find the wavelength at 50 Hz, 500 Hz and
5 kHz at 20 °C. Compare each with the 2.8 m ceiling height of a typical control room, and
say at which of the three frequencies the ceiling is less than half a wavelength away.

### 3. Intensity falls as $1/r^2$, and the decibel measures it

**Summary.** A point source of acoustic power $P$ spreads it over a sphere, so the intensity
at distance $r$ is $I = P/4\pi r^2$. Sound levels are logarithmic: $\beta = 10\log_{10}(I/I_0)$
with $I_0 = 10^{-12}$ W/m². Doubling the distance costs 6 dB.

**Challenge.** By hand, find the intensity level 1 m from a source radiating 1 W of
acoustic power into free space (about 109 dB) and at 4 m (about 97 dB). Check the second
number with the Calculator's **ISL** tab, spherical.

### 4. Waves superpose, and a path difference makes interference

**Summary.** Two waves in the same place add. For two coherent waves at one frequency the
result depends on their phase difference $\delta = 2\pi\,\Delta x/\lambda$, where $\Delta x$
is the path difference. They cancel when $\Delta x$ is an odd number of half wavelengths and
reinforce when it is a whole number. A reflection arriving later than the direct sound is
exactly this case.

**Challenge.** In the Calculator's **Comb** tab, enter a path difference of 0.5 m at 20 °C.
Find the first three nulls (about 343, 1030 and 1716 Hz) and check the first by hand: the
null is where $\Delta x = \lambda/2$, so $f = c/(2\cdot 0.5)$.

### 5. Standing waves have nodes and antinodes fixed in space

**Summary.** Two equal waves travelling in opposite directions make a standing wave. A pipe
closed at both ends, or air between two rigid walls, holds standing waves at
$f_n = n v/2L$, with pressure antinodes at the walls and pressure nodes between them. A room
is three such pipes at once, plus the modes that use two or three pairs of walls together.

**Challenge.** In Modal Response, show the single mode 200 of a 6 m long room on a
horizontal plane. Find where its two pressure nodes lie (they should be 1.5 m and 4.5 m from
the front wall, $L/4$ and $3L/4$) and check its frequency is twice that of mode 100.

### 6. Coherent and incoherent sums differ by 3 dB

**Summary.** Two sources of the same signal, in phase, add their pressures: equal levels
make +6 dB. Two unrelated sources add their intensities on average: equal levels make +3 dB.
Two tones of slightly different frequency drift in and out of phase, which is heard as
beats at the difference frequency, and their average is the intensity sum.

**Challenge.** In the Calculator's **Add** tab, add 90 and 90 dB as energy and as pressure.
Find 93.01 dB and 96.02 dB. Then say what level two 90 dB tones at 100 Hz and 101 Hz swing
between, and how often per second.

## Since then

None of this has changed. Later editions (with Gene Mosca from the 5th edition, 2004) kept
the same treatment of waves and sound. The one refinement a room program needs beyond the
textbook is air absorption, which the textbook ideal gas ignores; ISO 9613-1 (1993)
supplies it.

## In this app

- [General parameters, speed of sound](../02-general-parameters.md#speed-of-sound);
  `js/acoustx/classic.js` `speedOfSound`.
- [Calculator](../07-calculator.md): [Wave](../07-calculator.md#wave--frequency-wavelength-period),
  [ISL](../07-calculator.md#isl--inverse-square-law) (`inverseSquare`),
  [Add](../07-calculator.md#add--level-addition) (`addLevels`),
  [Comb](../07-calculator.md#comb--comb-filter-nulls) (`combNulls`).
- [Modal Response, pressure display](../03-modal-response.md#pressure-display);
  `classic.js` `modeShape`, `pressureField`.
- [Engine chapter 1, level arithmetic](../../acoustics/01-conventions.md#15-level-arithmetic);
  `js/acoustics/bands.js` `dbSum`. The main app uses a fixed $c = 343$ m/s.
