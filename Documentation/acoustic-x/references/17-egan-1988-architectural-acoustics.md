# 17 · Egan 1988 — Architectural Acoustics

> Egan, M. D., *Architectural Acoustics*, New York, McGraw-Hill, 1988. Reissued by J. Ross
> Publishing in 2007.

**Kind:** textbook for architects. **Read it for:** absorption, isolation and room shape,
explained for the people who draw the building.

## What it is

M. David Egan taught architectural acoustics to architecture students and wrote this book
for them, after his earlier *Concepts in Architectural Acoustics* (1972). It is known for
its many hand-drawn diagrams, its rules of thumb and its worked examples, nearly all in US
units (feet, sabins in ft², pounds). It covers the whole field at design level: sound and
hearing, absorption, reverberation, room shaping, sound isolation, mechanical noise, speech
privacy and sound systems. It has little mathematics. Acoustic-X pointed to it as the
architect's companion to the more physical books on the list.

## Big ideas

### 1. Absorption is area times coefficient

**Summary.** A surface's absorption is its area $S$ times its absorption coefficient
$\alpha$, the share of incident energy it does not reflect. The sum $A = \sum S_i\alpha_i$
is in sabins (m² here, ft² in the book). A material's single-number summary is its noise
reduction coefficient, NRC, the mean of $\alpha$ at 250, 500, 1000 and 2000 Hz, rounded to
the nearest 0.05. Porous absorbers work better when thicker or spaced off the wall, because
the air gap lets them reach lower frequencies.

**Challenge.** Work out the NRC of drywall ($\alpha$ = 0.10, 0.05, 0.04, 0.07 at
250 Hz–2 kHz) and of heavy carpet on foam (0.24, 0.57, 0.69, 0.71). You should find 0.05
and 0.55. Then look at both materials' 125 Hz figures (0.29 and 0.08) and say what the NRC
hides about each.

### 2. Reverberation time by Sabine, and a target by use

**Summary.** The book sizes treatment with Sabine's formula, $T = 0.161\,V/A$ in metric
($0.049\,V/A$ in feet; $0.161 \times 0.3048 = 0.049$). It gives charts of the preferred
reverberation time against room volume for each use: speech rooms short, music rooms long,
worship spaces between. The designer reads a target off the chart and solves for $A$.

**Challenge.** A $6 \times 4.2 \times 2.8$ m room has $V$ = 70.56 m³. Find the absorption
it needs for $T$ = 0.3 s (37.9 m²). In Reverb Time, choose the Control room criteria and
let the area optimiser size one absorber to reach it. Compare its area with your hand
figure, and say why the two differ by band.

### 3. Shape decides where reflections go

**Summary.** Surfaces reflect sound like mirrors when they are large compared with the
wavelength. Ray diagrams on plan and section show where each surface sends sound. Useful
reflections reach the audience soon after the direct sound. A reflection delayed by more
than about 50 ms, and strong, is heard as an echo. Concave surfaces focus sound and are to
be avoided or treated. Parallel hard walls cause flutter. Splaying or diffusing them cures
it.

**Challenge.** Find the extra path that makes a 50 ms delay (17.2 m). In the main app, read
the flutter-echo report for a bare rectangular room, then splay one side wall by 1 in 20
(2.9°) and find whether that pair leaves the report.

### 4. Isolation is mass, and the mass law

**Summary.** A single wall's transmission loss (TL) grows with its mass per area and with
frequency, about 6 dB for each doubling of either. A common field-incidence approximation
is $\text{TL} \approx 20\log_{10}(m f) - 47$ dB, with $m$ in kg/m² and $f$ in Hz. A double
wall with an air gap and absorbent fill does better than its mass alone. The book rates
walls by the single-number STC.

**Challenge.** Work out the mass-law TL of a 10 kg/m² panel at 500 Hz (27 dB), at 1 kHz,
and of a 20 kg/m² panel at 500 Hz. Both doublings should give 33 dB. Then compare with the
single-stud wall's TL in the app's wall builds (engine chapter 12.2), and say why a real
stud wall does not follow the mass law in every band.

### 5. A small leak spoils a good wall

**Summary.** TL adds up through transmission coefficients, not decibels. The composite
wall transmits $\tau = \sum S_i \tau_i / S$, with $\tau = 10^{-\text{TL}/10}$, and an
opening has $\tau = 1$. A small open area, a gap under a door or a back-to-back outlet box,
sets the result. Seal first, then add mass.

**Challenge.** A 50 dB wall with 1 % of its area open transmits $\tau = 0.99 \times
10^{-5} + 0.01$. Find its TL (20.0 dB). Then cut the opening to 0.1 % and find the TL
again (30.0 dB). In the main app, put a window in a wall in the wall builder and read the
wall's composite TL and STC.

### 6. Background noise has a criterion too

**Summary.** A room must be quiet enough for its use. The book rates background noise
from ventilation and plant with noise criterion (NC) curves, octave-band limits that get
looser at low frequencies, and gives target NC values by room type. Noise control starts
with layout: keep plant away from quiet rooms, and slow the air in ducts.

**Challenge.** The app has no noise criterion check and no model of mechanical noise. Use
the Calculator's level addition instead: two fans at 45 dB and one at 50 dB, as energy,
make how much? Find it (52.1 dB), and say which fan you would silence first.

## Since then

The book is still in print and still used in architecture schools. Its single-number
ratings have been partly replaced: STC by the ISO $R_w$ in most countries, and NC by RC and
NCB curves, which judge the low end and the spectral balance better. Diffusion is now
measured (ISO 17497) rather than drawn. The method it teaches, a target RT by use, sabins
by Sabine, isolation by mass and sealing, is unchanged.

## In this app

- [Engine chapter 3.1, What a material is](../../acoustics/03-materials-patches.md#31-what-a-material-is):
  $\alpha$ and $s$ per band in `js/acoustics/materials.js`.
- [Reverb Time, The formulas](../06-reverb-time.md#the-formulas) and
  [Criteria](../06-reverb-time.md#criteria): `js/acoustics/reverbTargets.js` `rtFormulas`,
  `RT_TARGETS`; `classic.js` `optimiseAreas`.
- [Engine chapter 9.5, Flutter-echo risk](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk):
  `analysis.js` `flutterRisk`, cured by a 1 in 20 splay.
- [Engine chapter 12.2, Walls](../../acoustics/12-isolation.md#122-walls-transmission-loss-per-band)
  and [12.3, Level in the house](../../acoustics/12-isolation.md#123-level-in-the-house):
  `isolation.js` `wallTl`, `houseLeak`; composite TL and STC in `js/acoustics/wallPlan.js`
  `wallTransmission`, `stcRating`.
- [Engine chapter 12.4, Below 125 Hz](../../acoustics/12-isolation.md#124-below-125-hz-the-octaves-a-sub-lives-in):
  `isolation.js` `lowWallTl` carries the 125 Hz TL down the mass law's 6 dB per octave.
  That slope is the only use of the mass law; wall TL above it comes from tabulated builds.
- Not in the app: noise criterion curves and mechanical noise.
