# 8. The three field methods: wave, energy, modal

Module: `js/acoustics/field.js`.

`field.js` answers one question three ways: what level does a point hear.
The comment credits CHORAS (choras-org) for the idea of putting several
methods side by side, and says no code was taken from it.

| method | what it sums | resolves | trust it |
|---|---|---|---|
| wave | image sources, with phase, at one frequency | interference, comb filtering, SBIR, boundary gain | at mid and high frequencies in rooms near the box/convex ideal |
| energy | direct sound plus a diffuse reverberant field per octave | coverage, direct-to-reverberant ratio | above the Schroeder frequency |
| modal | the rigid box's modes, damped, at one frequency | standing waves | below the Schroeder frequency |

Every level is in dB SPL. A source radiates $L_0(f)$ = `sourceDb(spk, f)`
on axis at 1 m (chapter 6).

`field.js` `prepare(room, speakers, { maxOrder })` builds each speaker's aim
frame and its image set (`roomImages`, chapter 7), once per job.

## 8.1 Wave method

`field.js` `waveAt(prep, pt, freq, mic)` returns the complex pressure at
$\mathbf x$ and `waveDb` returns its level.

$$
k = \frac{2\pi f}{c},\qquad \omega = 2\pi f,\qquad A_s = 10^{L_0(f)/20}
$$

For speaker $s$ with delay $\tau_s$ (`delayMs`/1000) and its images $i$ at
$\mathbf x_i$, with $r_i = \max(\lvert\mathbf x-\mathbf x_i\rvert,\ 0.05\ \text{m})$:

$$
p(\mathbf x) = \sum_s\sum_i \frac{A_s\,10^{(G_i - a_b r_i)/20}\,\text{amp}_{i,b}}{r_i}\;e^{\,j(-k r_i - \omega\tau_s)}
$$

$$
L_{\text{wave}} = 10\log_{10}\!\left(\lvert p\rvert^2 + 10^{-12}\right)
$$

with

* $b$ = `nearestBand(f)`; $a_b$ air loss in dB/m; $\text{amp}_{i,b} = \sqrt{\text{refl}_{i,b}}$.
* $G_i$ the gain in dB of the speaker toward the direction it radiated for
  this image, plus the gain of the microphone (when given) toward the
  arrival direction:

$$
\hat d_{\text{rad}} = \big(\mathbf M_i^{\mathsf T}(\Delta x, \Delta y),\ \sigma_i\Delta z\big),\qquad
G_i = G_{\text{spk}}(\hat d_{\text{rad}}, f) + G_{\text{mic}}(-\Delta\mathbf x, f)
$$

  where $\Delta\mathbf x = \mathbf x - \mathbf x_i$, $\mathbf M_i$ the image's
  mirror matrix and $\sigma_i$ its `zSign`. For a product of reflections
  $\mathbf M^{\mathsf T} = \mathbf M^{-1}$, so this maps the arrival
  direction back into the frame of the real box.
* When the speaker is `omni`, or its `patternWeight` is 0 (an octave or
  more below `omniBelow`), the speaker gain is skipped.
* A speaker with $A_s < 10^{-6}$ is skipped entirely.

Units: $A_s$ is the pressure at 1 m relative to 20 µPa, so $A_s/r$ is the
free-field pressure at $r$ and $L_{\text{wave}}$ reads directly as dB SPL.

**Assumptions.** Point sources and point receivers in an image-source
room (chapter 7). Phase comes only from path length and delay. Scattered
energy is excluded. The $e^{-jkr}$ convention gives a lagging phase with
distance. $r$ is floored at 5 cm.

**Boundary gain.** Mounting gain comes from the images. A source 1 mm from a
rigid wall, heard 2 m out, gains +5.7 dB at 50 Hz over free field, close to
the ideal +6 dB of a $2\pi$ mount (node, the engine's own test case).

## 8.2 Energy method (direct + diffuse)

`field.js` `energyAt(room, prep, pt, band, mic)` returns
`{ direct, reverb, total }` in dB for octave band $b$ with centre $f_b$.

For each speaker, with $r = \max(\lvert\mathbf x-\mathbf x_s\rvert, 0.05)$,
base level $L_B = L_0(f_b) + G_{\text{mount}}(f_b)$, and
$G_{\text{mount}} = $ `MOUNTS[mount].gainDb` if $f_b \le 250$ Hz, else 0
(`mountGainDb`):

**Direct** (no images; the real source's pattern toward the point, and the
microphone's toward the source):

$$
E_D = \sum_s 10^{\left(L_B + G_s + G_m - 20\log_{10}r - a_b r\right)/10}
$$

**Reverberant**, Hopkins–Stryker, as the comment names it. The source's
sound power level is recovered from its on-axis level and directivity, and
the diffuse field follows from the room constant:

$$
L_W = L_B - 10\log_{10}\frac{Q_s}{4\pi},\qquad
E_R = \sum_s \frac{10^{\left(L_W + 10\log_{10}(4/R_b)\right)/10}}{Q_{\text{mic}}}
$$

$$
L_{\text{direct}} = 10\log_{10}E_D,\quad L_{\text{reverb}} = 10\log_{10}E_R,\quad L_{\text{total}} = 10\log_{10}(E_D+E_R)
$$

| symbol | meaning | unit |
|---|---|---|
| $Q_s$ | speaker directivity factor at $f_b$ (`cachedQ`) | – |
| $Q_{\text{mic}}$ | microphone directivity factor, 1 without a mic | – |
| $R_b$ | room constant, $S\bar\alpha/(1-\bar\alpha)$ (chapter 4) | m² |

**Assumptions.** The relation $L_p = L_W + 10\log_{10}(Q/4\pi r^2 + 4/R)$
with $\rho c \approx 400$ rayl (so that the $L_W \to L_p$ conversion needs no
constant). The reverberant field is uniform throughout the room. Air loss is
applied to the direct path, while $R$ is the no-air room constant. $R$ depends
on absorption only, so scattering does not change $E_R$. Sources add
incoherently. Valid above the Schroeder frequency.

## 8.3 Modal method

`field.js` `prepareModal(room, speakers, freq)` and `modalDb(room, mp, pt)`
sum the modes of the working-space box (chapter 5) driven by point sources,
with every source treated as omni (the comment notes that sources are close to
omni at the frequencies where this method is meant to be read).

Coordinates are front-frame: $u$ = fromFront, $v$ = fromLeft (`toBox`), and
$w$ = height. Mode set: every $(n_x,n_y,n_z)$ with
$n_\bullet \le \min(40, \lfloor 2\ell f_{\max}/c\rfloor)$ and
$f_n \le f_{\max} = \max(1.6f,\ f+80)$.

Damping comes from the Eyring time $T$ (with air) of the nearest band:

$$
\delta = \frac{6.91}{T}\ \text{s}^{-1}\quad(=3\ln10/T,\ \text{the amplitude decay rate for 60 dB in } T)
$$

Normalisation: $\Lambda_n = \varepsilon_x\varepsilon_y\varepsilon_z$, with
$\varepsilon = 1$ for a zero index and $1/2$ otherwise, so
$\int_V\psi_n^2\,dV = V\Lambda_n$.

The pressure is

$$
p(\mathbf x) = 4\pi c^2 \sum_n \frac{\psi_n(\mathbf x)\displaystyle\sum_s A_s\,\psi_n(\mathbf x_s)\,e^{-j\omega\tau_s}}{V\Lambda_n\left[(\omega_n^2-\omega^2) + j\,2\delta\omega\right]}
$$

$$
L_{\text{modal}} = 10\log_{10}\!\left(\lvert p\rvert^2 + 10^{-12}\right)
$$

with $A_s = 10^{L_0(f)/20}$ and $\omega_n = 2\pi f_n$. `prepareModal` stores
each mode's complex coefficient (the source sum divided by the denominator,
computed with the conjugate), and `modalDb` multiplies by $\psi_n(\mathbf x)$
and the scale $4\pi c^2$.

**Where the scale comes from.** The Green's-function modal expansion for a
point source of volume velocity $q$ is
$p = j\omega\rho c^2 q\sum\psi_n(\mathbf x)\psi_n(\mathbf x_s)/[V\Lambda_n(\omega_n^2-\omega^2+j2\delta\omega)]$.
A free-field source with pressure $A_s$ at 1 m has $j\omega\rho q = 4\pi A_s$.
Substituting gives the $4\pi c^2 A_s$ above. Far from any mode, this makes a
single source read close to its free-field level, which is the stated aim of
the scaling.

**Validity.** A rigid rectangular box with uniform modal damping. The
bounding box stands in for a non-rectangular plan and the mean height for a
sloped ceiling. The truncated mode set is accurate below about
$f_{\max}$. Meant for frequencies below the Schroeder frequency. The compute
job stops using it above 1 kHz (chapter 16).

Height coordinate: in `modalDb` the receiver's $w$ is
$z - z_{\text{floor}}$. In `prepareModal` the source's $w$ is its raw $z$.
For a flat room ($z_{\text{floor}} = 0$) the two agree.

## 8.4 Worked comparison

The 4 × 5 × 2.7 m room of chapter 2. A sub (preset, crossover off, 94 dB at
1 m) at (0.3, 4.7, 0.3) near the front-left corner, and an omni receiver at
(2, 3.1, 1.2), $r$ = 2.50 m, free field $94 - 20\log_{10}2.5 = 86.0$ dB:

| $f$ (Hz) | wave (order 3) | modal |
|---|---|---|
| 34.3 (L1) | 86.5 | 95.9 |
| 40 | 93.2 | 96.9 |
| 42.9 (W1) | 95.7 | 96.6 |
| 50 | 98.1 | 96.2 |
| 63.5 (H1) | 98.0 | 99.3 |

Above the first modes, both methods show the corner loading, about 10 dB over
free field. They differ in detail. The wave sum is an image series cut off at
order 3, with energy lost only at the surfaces it includes. The modal sum is
an exact box solution with uniform Eyring damping. Near the lowest mode
(34 Hz) the truncated image series cannot build the resonance. (Node, `waveDb`
and `modalDb`.)
