# 15 · D'Antonio & Konnert 1986 — New Acoustical Materials and Designs Improve Room Acoustics

> D'Antonio, P. and Konnert, J. H., "New Acoustical Materials and Designs Improve Room
> Acoustics", 81st Convention of the Audio Engineering Society, Los Angeles, November 1986,
> Preprint 2365. The manual prints "81th" and "Novmber"; corrected here.

**Kind:** convention paper. **Read it for:** where the diffusers in Acoustic X's absorber
database come from, and why a treated room should scatter as well as absorb.

## What it is

Two years after the RFZ/RPG paper ([report 14](14-dantonio-konnert-1984-rfz-rpg.md)),
D'Antonio and Konnert surveyed what number-theoretic diffusers could do in rooms beyond the
control room. The work builds on Manfred Schroeder's diffusers of the 1970s: rows of wells
whose depths follow a number sequence, so the reflected wave leaves the surface spread over
many angles. RPG made these as products, and several of them, with their absorption
figures, are in the 1997 Acoustic-X database this app carries. This report keeps to the
ideas the paper and RPG's work of that period are known for, not its section detail.

## Big ideas

### 1. Diffusion is the third tool

**Summary.** Before these products, a designer could reflect sound or absorb it.
Absorption removes the problem reflection and the room's energy with it, and a room
treated only that way sounds dead. A diffuser keeps most of the energy but breaks up the
specular reflection, spreading it in direction and in time. It cures echo and flutter
without shortening the reverberation much.

**Challenge.** Two facing walls, bare drywall ($\alpha_{1\text{k}} = 0.04$, $s = 0.1$),
keep $\big((1-0.04)(1-0.1)\big)^2 = 0.746$ of a specular round trip, the score
`flutterRisk` uses. Find the score with one wall a QRD ($\alpha = 0.2$, $s = 0.9$ at
1 kHz): 0.069. Then with one wall 100 mm absorber ($\alpha$ clamped to 0.99, $s = 0.2$):
0.007. Both cure the flutter. Now find which one costs more reverberation, in Reverb Time,
by laying 10 m² of each on a side wall.

### 2. The quadratic residue diffuser

**Summary.** Schroeder's QRD has $N$ wells per period, $N$ a prime. Well $n$ has depth

$$d_n = \frac{s_n\,\lambda_0}{2N}, \qquad s_n = n^2 \bmod N$$

where $\lambda_0$ is the wavelength of the design frequency. The sequence has a flat
Fourier transform, so at the design frequency and its multiples the period sends equal
energy into each of its diffraction lobes. The wells are separated by thin fins so that
each acts as its own short tube.

**Challenge.** Take $N = 7$ and $f_0 = 500$ Hz ($\lambda_0 = 0.686$ m). Work out the
sequence (0, 1, 4, 2, 2, 4, 1) and the depths in mm. You should find 0, 49, 196, 98, 98,
196, 49 mm. The deepest well sets the panel's depth, about 200 mm before the back plate. Check
the depths in the Calculator's **QRD** tab with 7 wells at 500 Hz.

### 3. A diffuser works in a band

**Summary.** Below its design frequency the wells are too shallow, compared with the
wavelength, to change the reflection much, and the panel acts as a flat wall. At the top,
a well narrower than half a wavelength stops working as a tube: the upper limit is about
$f_\max \approx c/2w$ for well width $w$. And a periodic row only scatters into lobes at
$\sin\theta_m = m\lambda/(Nw)$, so a period shorter than one wavelength sends sound back
only in the specular direction.

**Challenge.** For 50 mm wells, find $f_\max$ (3430 Hz; the **QRD** tab reads 3432 Hz at
20 °C). For a 7-well period of 50 mm
wells, $Nw = 0.35$ m, find the lowest frequency with a first diffraction lobe, where
$\lambda = Nw$ (980 Hz). So a single 7-well period of this design scatters little at its
own 500 Hz design frequency. Say what that implies for building a wall of several periods
side by side.

### 4. Diffusers absorb a little too

**Summary.** A diffuser is not a lossless surface. Energy flows between neighbouring wells
of different depth, and air friction in the narrow wells absorbs, most of all near the
wells' resonances. RPG published absorption figures for its diffusers, and also made
products that absorb at low frequencies and diffuse at high ones. Treat a diffuser's
$\alpha$ as a real part of the room's absorption.

**Challenge.** In Reverb Time, open the Absorber Edit Manager and find RPG's *Wood QRD,
734*. Its $\alpha$ is 0.23, 0.24, 0.35, 0.23, 0.20, 0.20 from 125 Hz to 4 kHz. Work out
its NRC (the mean of 250 Hz–2 kHz, rounded to 0.05): 0.25. Lay 10 m² of it on a drywall
rear wall in a $6 \times 4.2 \times 2.8$ m room and find how much the 500 Hz RT drops.

### 5. Use the materials where the reflections are

**Summary.** The paper's message for designers is placement. Diffusers go where a
reflection is wanted but its specular form is not: the rear wall of a control room, the
side walls beside a listener, the ceiling over a performing area, the back of a hall where
a long-delayed echo would return to the stage. Absorbers go where the energy should not
come back at all.

**Challenge.** In the main app, switch on side-wall diffusers in the automatic panels.
Read the band they span for ears at 1.2 m (0.895–2.114 m, from `diffuserBand`), and check
in the advisor's *Absorption and diffusion* line what share of the treatment's work at
1 kHz is now scattering (it asks for at least 10 %).

## Since then

Diffusion became measurable. ISO 17497-1 (2004) defined the random-incidence scattering
coefficient, the $s$ this app carries for every material, and ISO 17497-2 (2012) the
directional diffusion coefficient; AES-4id-2001 set out how to report it. Later research
showed QRDs absorb more than first assumed, especially when the wells resonate, and that
repeating a single period produces strong lobes. Modulated and optimised sequences, and
Cox and D'Antonio's book (2004, later editions), answer both. The QRD is still the
diffuser most rooms reach for.

## In this app

- [Engine chapter 3, Scattering from one number](../../acoustics/03-materials-patches.md#scattering-from-one-number):
  `js/acoustics/materials.js`, the `diffuser` material with the `qrd` spectral shape
  (design band about 500 Hz), and the `qrd-600` and `qrd-1200x600` products.
- [Engine chapter 11, What each panel is](../../acoustics/11-first-reflections.md#what-each-panel-is):
  `reflectionPanels.js` `diffuserBand` and the side-wall and ceiling diffusers.
- [Engine chapter 9.5, Flutter-echo risk](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk):
  `analysis.js` `flutterRisk` counts scattering as well as absorption.
- [Reverb Time, Surfaces and materials](../06-reverb-time.md#surfaces-and-materials): the
  RPG rows in `js/acoustx/database.js` `ACOUSTX_ABSORBERS`.
- Calculator, **QRD** tab, *QRD Diffuser*: the residues, the well depths, the band from the
  design frequency up to $c/2w$, and the period; `js/acoustx/references.js` `qrd`, `isPrime`.
- There is no model of diffraction lobes. In the rooms a diffuser is still a material with
  $\alpha$ and $s$ per band.
- 📖 in the app: the group *QRD Diffuser* opens this report from its pop-up.
