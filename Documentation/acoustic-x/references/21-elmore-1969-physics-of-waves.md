# 21 · Elmore & Heald 1969 — Physics of Waves

> Elmore, W. C., and Heald, M. A., *Physics of Waves*, New York, McGraw-Hill, 1969. Reprinted
> New York, Dover, 1985. The manual omits the co-author, Mark Heald, and gives Dover as the
> 1969 publisher.

**Kind:** upper-level undergraduate textbook. **Read it for:** the wave equation and normal
modes, the theory under the Modal Response window.

## What it is

William Elmore and Mark Heald, both at Swarthmore College, wrote a textbook that treats
waves as one subject: strings, membranes, sound in fluids, elastic solids and
electromagnetic waves, with the same mathematics throughout. It derives the wave equation
for each medium, solves it with boundary conditions, and builds general solutions out of
normal modes and Fourier analysis. Acoustic-X cited it for the physics behind its room-mode
formula. It is denser than [Tipler](20-tipler-1991-physics.md) and assumes calculus and
some differential equations.

## Big ideas

### 1. Sound in a fluid obeys the wave equation, with $c^2 = B/\rho$

**Summary.** Linearising the equations of motion and continuity for small disturbances of a
fluid gives

$$\nabla^2 p = \frac{1}{c^2}\frac{\partial^2 p}{\partial t^2}, \qquad c = \sqrt{\frac{B}{\rho}}$$

where $p$ is the acoustic pressure, $\rho$ the density and $B$ the bulk modulus. Sound
compresses air too fast for heat to flow, so $B$ is the adiabatic modulus $\gamma p_0$, not
the isothermal $p_0$. Newton used $p_0$ and was about 15 % low.

**Challenge.** Compute $c$ with $\gamma = 1.4$, $p_0 = 101\,325$ Pa and
$\rho = 1.204$ kg/m³ (air at 20 °C). Find about 343.2 m/s, and compare with
`speedOfSound(20)` in General Parameters. Then compute the isothermal value and find how far
off Newton was.

### 2. Boundaries select normal modes

**Summary.** Solve the wave equation in a box with rigid walls by separation of variables.
Each axis gives a cosine that must have zero slope at both walls, so only whole numbers of
half wavelengths fit. The product of three such cosines is a normal mode, and its frequency
is

$$f_{n_x n_y n_z} = \frac{c}{2}\sqrt{\left(\frac{n_x}{L}\right)^2 + \left(\frac{n_y}{W}\right)^2 + \left(\frac{n_z}{H}\right)^2}$$

This is the formula Modal Response evaluates. A symmetric box has degenerate modes: several
index triples with one frequency.

**Challenge.** List by hand every mode below 100 Hz of a $6 \times 4.2 \times 2.8$ m room at
20 °C and check the list against Modal Response's Data View. There are 16. Then do the same
for a $4 \times 4 \times 4$ m cube: it also has 16 modes below 100 Hz, but find that they sit
at only 5 distinct frequencies.

### 3. Any field is a sum of modes

**Summary.** The normal modes of a bounded system form a complete set. Any motion of the
system, including its response to a source, can be written as a weighted sum of them, and
Fourier series and transforms are the tool for finding the weights. The weight of each mode
depends on how strongly the source and the receiver couple to it: a source on a node does
not drive that mode at all.

**Challenge.** In Modal Response, show mode 010 and then mode 020 on a horizontal plane.
Read both at mid-width: find a null for 010 and a maximum for 020. Say which of the two a
subwoofer on the room's centre line can drive, from $\cos(n_y\pi X/W)$ at $X = W/2$.

### 4. Damping turns each mode into a resonance with a bandwidth

**Summary.** A damped oscillator driven near its natural frequency responds over a band of
frequencies, not at one. Its half-power bandwidth is $\Delta f = f_0/Q$, and the energy of a
free oscillation decays at a rate tied to the same bandwidth. In a room, a mode whose decay
takes $T$ seconds to fall 60 dB has a bandwidth of about $2.2/T$ Hz. When neighbouring modes
overlap by more than their bandwidths, the response stops being a set of separate peaks.

**Challenge.** Take $T = 0.4$ s. Find the modal bandwidth (5.5 Hz). In the mode list of the
$6 \times 4.2 \times 2.8$ m room, find below which frequency the gaps between neighbours are
mostly wider than 5.5 Hz and above which most are narrower. Compare with the Schroeder
frequency $2000\sqrt{T/V}$ for $V = 70.56$ m³ (about 151 Hz).

### 5. Impedance mismatch makes walls reflect

**Summary.** At a boundary between two media, a plane wave at normal incidence reflects with
pressure ratio $R = (Z_2 - Z_1)/(Z_2 + Z_1)$, where $Z = \rho c$ is the characteristic
impedance. The fraction of energy transmitted into the second medium is $1 - R^2$. Air's
impedance is tiny next to a solid's, so a bare wall reflects nearly everything.

**Challenge.** With $Z_\text{air} = 413$ rayl and concrete at $\rho = 2300$ kg/m³,
$c = 3700$ m/s, find $R$ (about 0.9999) and the energy that enters the concrete (about
0.02 %). In the Calculator's **Z** tab, *Impedance Step*, from air into concrete (taken
there as 8.0 × 10⁶ rayl) reads $R$ = 0.9999 and 0.0206 % through. Compare with the α of a
concrete material in Reverb Time's Absorber Edit Manager, and say why measured values are
larger than this.

## Since then

The rigid-box solution is still the benchmark every numerical method is checked against.
What later work added is the finite-impedance wall: modal frequencies shift and modes gain
damping that differs from mode to mode (Morse and Ingard, *Theoretical Acoustics*, 1968, set
this out in detail). Finite-element and boundary-element solvers handle rooms that are not
boxes. Modal-overlap arguments like idea 4 became the standard way to explain the Schroeder
frequency.

## In this app

- [Modal Response, room modes](../03-modal-response.md#room-modes); `js/acoustics/room.js`
  `allModes`, `js/acoustx/classic.js` `modeFreq`, `modeShape`.
- [Engine chapter 5.1, modes of a rigid box](../../acoustics/05-modes.md#51-modes-of-a-rigid-box).
- [Engine chapter 8.3, modal method](../../acoustics/08-field-methods.md#83-modal-method):
  the sum of modes with damping from the Eyring time; `js/acoustics/field.js`
  `prepareModal`, `modalDb`.
- [Engine chapter 4.3, Schroeder frequency](../../acoustics/04-reverberation.md#43-schroeder-frequency);
  `room.js` `schroeder`.
- [Modal Response, pressure display](../03-modal-response.md#pressure-display) and
  [SBIR, mode excited by position](../04-sbir.md#mode-excited-by-position): where a source
  couples to a mode.
- Modal Response, Data View: each mode's own T60 from the walls it presses on, the decay that
  sets its bandwidth in idea 4; `js/acoustx/references.js` `modeDecay`.
- Idea 5: Calculator, **Z** tab, *Impedance Step*: $R$, the energy reflected and the energy
  through, between media of the `MEDIA` table; `references.js` `impedanceStep`. The rooms
  still take α from tables and measurements.
- 📖 in the app: the groups *Enter Input Data*, *Enter Mode Index*, *Environment*, *Frequency /
  Wavelength / Period* and *Impedance Step* open this report from their pop-up.
