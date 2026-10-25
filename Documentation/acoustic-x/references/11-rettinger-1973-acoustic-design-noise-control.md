# 11 · Rettinger 1973 — Acoustic Design and Noise Control

> Rettinger, M., *Acoustic Design and Noise Control*, New York, Chemical Publishing Co., 1973.
> A revised edition followed in two volumes (*Acoustic Design* and *Noise Control*), 1977.

**Kind:** book. **Read it for:** the practitioner's side of studio work: how much a wall
isolates, how a panel absorbs bass, how a floor is floated.

## What it is

Michael Rettinger was an acoustical consultant who spent much of his career on film-studio
and recording work for RCA in Hollywood, and wrote about architectural acoustics for forty
years, from *Applied Architectural Acoustics* (1947) to the *Handbook of Architectural
Acoustics and Noise Control* (1988). This book joins the two halves of a studio designer's
job: making a room sound right, and keeping sound in and out. It is written for engineers and
architects, with worked numbers and rules of thumb more than derivations.

We could not check the 1973 edition's table of contents, so the ideas below are kept to what
the book's subject and Rettinger's work are reliably known for. Acoustic-X listed it for its
practical treatment of absorbers and isolation, the parts of studio design the program's
windows did not compute.

## Big ideas

### 1. The mass law

**Summary.** A single, limp wall stops sound by its mass. Its transmission loss grows about
6 dB for each doubling of its surface density $m$ (kg/m²), and 6 dB for each doubling of
frequency. A common field-incidence form is

$$\text{TL} \approx 20\log_{10}(m f) - 47\ \text{dB}$$

Real walls fall below this near their coincidence frequency, where the wall's bending waves
match the sound in the air, and above it they rise again.

**Challenge.** Find the mass-law TL of a 10 kg/m² wall (about one layer of 12.5 mm gypsum
board) at 500 Hz: 27 dB. Double the frequency or the mass and find 33 dB. Then read
[engine chapter 12 §12.4](../../acoustics/12-isolation.md#124-below-125-hz-the-octaves-a-sub-lives-in):
the app carries each wall's 125 Hz TL down to 63 and 31 Hz at 6 dB per octave, the mass law's
slope. Say why the chapter calls that a best case.

### 2. Two leaves and the air between them

**Summary.** Two leaves separated by an air gap isolate far better than their combined mass
would alone, above the mass–air–mass resonance at which the air gap acts as a spring between
them:

$$f_0 \approx 60\sqrt{\frac{m_1 + m_2}{m_1\,m_2\,d}}\ \text{Hz}$$

with $m$ in kg/m² and the gap $d$ in m. Below $f_0$ the double wall is no better than a single
one of the same total mass, and near it, worse. Absorbent fill in the cavity damps the
resonance. Separate studs, so the leaves share no rigid path, matter as much as the gap.

**Challenge.** Two 10 kg/m² leaves 100 mm apart: find $f_0 \approx 85$ Hz. Halve the gap and
find how $f_0$ moves (by $\sqrt 2$, to about 120 Hz). Then in the main app compare the
single-stud and double-stud wall builds per band
([chapter 12 §12.2](../../acoustics/12-isolation.md#122-walls-transmission-loss-per-band)).
The app uses tabulated figures for each build; it does not compute $f_0$.

### 3. Panel absorbers take out the bass

**Summary.** A porous absorber needs depth comparable to a quarter wavelength to work, which
at 100 Hz is close to a metre. A thin panel (plywood, hardboard) mounted over a sealed air
space instead resonates and absorbs a band around

$$f_0 \approx \frac{60}{\sqrt{m\,d}}\ \text{Hz}$$

with $m$ the panel's surface density in kg/m² and $d$ the air space in m. Insulation in the
cavity widens the band. Such panels are the classic studio bass trap.

**Challenge.** A 5 kg/m² panel over a 100 mm cavity: find $f_0 \approx 85$ Hz. Find the
cavity depth that brings the same panel to 60 Hz (about 200 mm). Then in Reverb Time's
Absorber Edit Manager find the Diaphragmatic entries (DIAP-…) from the 1997 database, and in
the main app the `membrane-trap` material
([chapter 3 §3.1](../../acoustics/03-materials-patches.md#31-what-a-material-is)). Neither is
designed from $m$ and $d$; both are tables of α.

### 4. Floating floors and vibration isolation

**Summary.** A floor on resilient mounts is a mass on a spring. It transmits vibration fully
at low frequency, amplifies it near its natural frequency $f_0$, and isolates only above
$\sqrt 2\,f_0$. The lower $f_0$, which means a heavier mass or a softer spring, the more it
isolates at a given frequency. Machines, and whole rooms, are isolated the same way.

**Challenge.** With damping ratio $\zeta = 0.1$, the transmissibility is
$T = \sqrt{(1 + (2\zeta r)^2)/((1 - r^2)^2 + (2\zeta r)^2)}$, $r = f/f_0$. Find the insertion
loss $-20\log_{10}T$ at 50 Hz for a floating slab ($f_0 = 12$ Hz, 22.0 dB) and a room-in-room
on springs ($f_0 = 6$ Hz, about 30.9 dB). Then check both against the floor builds of
[chapter 12 §12.1](../../acoustics/12-isolation.md#121-the-floor-a-mass-on-a-damped-spring),
`js/acoustics/isolation.js` `floorLoss`.

### 5. Splay the walls, or treat them

**Summary.** Parallel hard walls trap sound between them as a flutter echo, a buzz at the
repetition rate $c/2d$. Splaying one wall by a small angle, or covering one of the pair with
absorption or diffusion, breaks it. The commonly published splay is 1 in 20 to 1 in 10.
Studio rooms are often designed with no two walls parallel for this reason.

**Challenge.** Find the offset that splays a 5 m wall by 1 in 20: 250 mm, an angle of 2.86°.
In the main app, draw a room with one side wall splayed by that much and check that the
advisor's flutter warning for that pair goes away
([chapter 9 §9.5](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk),
`js/acoustics/analysis.js` `flutterRisk`).

### 6. Background noise sets the target

**Summary.** Isolation is designed backwards from the quietest thing the room must allow. A
studio is given a background-noise criterion, usually a curve such as NC 15 to NC 25. The
outside noise, minus the criterion, gives the isolation each wall, door, window and duct must
provide, band by band. The ventilation is part of the same budget, since a quiet room with a
noisy duct is a noisy room.

**Challenge.** Outside a studio wall the traffic is 75 dB in the 125 Hz band, and the room
should be below 30 dB there. Find the TL needed, 45 dB, and compare it with the 125 Hz figure
of each wall build in the main app's isolation settings. The app has no NC curves and does
not model ventilation noise; it estimates only the leak the other way, from the room into the
house ([chapter 12 §12.3](../../acoustics/12-isolation.md#123-level-in-the-house)).

## Since then

The mass law and the double-wall formulas are still the starting point; Sharp's work in the
1970s and later prediction models (and standards such as ISO 12354) added coincidence,
flanking and the effect of studs. Panel absorbers turned out harder to predict than the
simple formula suggests, and makers now publish measured figures. NC curves were largely
replaced by the RC and NCB curves, and later by the RC Mark II and NR systems, but the method
of designing isolation down from a noise target is unchanged.

## In this app

- [Engine chapter 12, Isolation](../../acoustics/12-isolation.md): `js/acoustics/isolation.js`
  `transmissibility`, `floorLoss`, `wallTl`, `houseLeak`, `lowWallTl`.
- [Engine chapter 9 §9.5, Flutter-echo risk](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk):
  `flutterRisk`, with `SPLAY_CURE_DEG` set to a 1 in 20 splay.
- [Reverb Time, surfaces and materials](../06-reverb-time.md#surfaces-and-materials): the
  Diaphragmatic absorbers of the 1997 database, `js/acoustx/database.js`
  `ACOUSTX_ABSORBERS`.
- Mass-law and mass–air–mass calculations, panel-absorber design, NC criteria and HVAC noise
  have no counterpart in the app.
