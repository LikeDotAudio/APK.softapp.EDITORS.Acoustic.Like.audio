# 9. Echogram, ISO 3382-1 parameters, critical distance and flutter

Module: `js/acoustics/analysis.js`.

## 9.1 The echogram

`analysis.js` `echogram(room, prep, mic, band)` builds the energy–time curve
at a microphone in octave band $b$ (centre $f_b$). It has three parts.

### Specular arrivals

For each speaker $s$ and each image $i$ (chapter 7), with
$r_i = \max(\lvert\mathbf x_m - \mathbf x_i\rvert, 0.05)$:

$$
L_i = L_0(f_b) + G_i - 20\log_{10} r_i - a_b r_i + 10\log_{10}\text{refl}_{i,b},\qquad E_i = 10^{L_i/10},\qquad t_i = \frac{r_i}{c} + \tau_s
$$

$G_i$ is the speaker gain toward the radiated direction plus the mic gain toward
the arrival (as in the wave method, chapter 8, but with the speaker pattern
always evaluated). Each arrival is put in bin $\lfloor t_i/\Delta t\rfloor$,
with $\Delta t$ = `ECHO_DT` = 0.5 ms.

### Late reverberant tail

The reverberant energy is the Hopkins–Stryker value of chapter 8:

$$
E_{\text{rev}} = \sum_s \frac{10^{\left(L_0 - 10\log_{10}(Q_s/4\pi) + 10\log_{10}(4/R_b)\right)/10}}{Q_{\text{mic}}}
$$

with decay constant from the Eyring time $T$ (with air) of band $b$:

$$
k = \frac{6\ln 10}{T} = \frac{13.8155}{T}\ \text{s}^{-1}
$$

Let $t_D$ be the direct sound's arrival (the first order-0 arrival) and
$t_{\text{tail}}$ the last image arrival. From $t_{\text{tail}}$ on, each bin
receives

$$
E_{\text{late}}[n] = E_{\text{rev}}\,k\,e^{-k(t_n - t_D)}\,\Delta t,\qquad t_n = n\Delta t \ge t_{\text{tail}}
$$

The exponential is referenced to $t_D$ but begins at $t_{\text{tail}}$, so
the tail starts where the images stop. Its total energy is
$E_{\text{rev}}\,e^{-k(t_{\text{tail}}-t_D)}$, not the full $E_{\text{rev}}$.
That is deliberate: the decay is the reverberant field's own, counted from
the direct sound, and the image arrivals up to $t_{\text{tail}}$ are its
early part. Starting it afresh at $t_{\text{tail}}$ would count that early
energy twice.

The echogram length is $\min\big(4\ \text{s},\ t_D + 1.4T + 0.05\big)$.

### Diffuse rain (scattered energy)

An image path keeps only its specular energy (chapter 7). The energy it
scattered is returned to the room as a diffuse tail starting at its own
arrival time. With $\text{sl}_i = $ `scatterLoss` of the path:

$$
E^{\text{scat}}_i = E^{\text{mirror}}_i - E_i = E_i\,\frac{\text{sl}_i}{1-\text{sl}_i}
$$

(0 when $\text{sl}_i \ge 1$; written from $E_i$ so that $E^{\text{mirror}} = E_i/(1-\text{sl})$
needs no separate evaluation). Each contribution decays at the same rate $k$:

$$
e_i(t) = E^{\text{scat}}_i\,k\,e^{-k(t-t_i)},\qquad t \ge t_i
$$

The code implements the sum of all these as one first-order recursion over
the bins. With $\rho = e^{-k\Delta t}$ and $d[n]$ the scattered energy dropped
into bin $n$:

$$
y[n] = \rho\,y[n-1] + (1-\rho)\,d[n]
$$

An impulse $E$ in bin $j$ becomes $E(1-\rho)\rho^{\,n-j}$, which sums to
exactly $E$. Scattering therefore leaves the echogram's total energy and its
decay rate unchanged. What it changes is *when* the energy arrives: early
specular energy moves into the tail, so C50, C80 and D50 fall and Ts and EDT
rise.

### Output

`bins[n]` holds specular arrivals + late + diffuse. `tail` = late + diffuse,
and `late` and `diffuse` are also kept separately, along with `eSpecular`,
`eScattered`, `tD`, `T` and `dt`.

The comment calls this the "secondary sources / diffuse rain" idea of hybrid
ray tracers, made statistical.

**Assumptions.** Image arrivals add as energy (no phase). The diffuse
parts are exponential with the single Eyring rate of the band. The discrete
arrivals carry no mounting gain (their images supply the boundary); the late
tail carries it, below the box's `omniBelow`, as the energy method's
reverberant field does (chapter 8). $r$ is
floored at 5 cm.

## 9.2 ISO 3382-1 parameters

`analysis.js` `iso3382(eg)` follows the parameter set of ISO 3382-1. Let
$e[n]$ be the bins and $i_0 = \lfloor t_D/\Delta t\rfloor$.

**Schroeder backward integral:**

$$
\text{Sch}[n] = \sum_{m \ge n} e[m],\qquad E_{\text{tot}} = \text{Sch}[i_0],\qquad
D(t_n) = 10\log_{10}\!\left(\frac{\text{Sch}[n]}{E_{\text{tot}}} + 10^{-30}\right),\ n \ge i_0
$$

**Decay times** (`regressionT`): least-squares line $D(t) \approx a + \beta t$
from the first sample at or below the upper level to the first sample at or
below the lower one, at least four samples. The decay time is
$T_{\text{x}} = -60/\beta$, and NaN if the slope is not negative.

| parameter | fitted range |
|---|---|
| EDT | 0 to −10 dB |
| T20 | −5 to −25 dB |
| T30 | −5 to −35 dB |

**Energy ratios.** With $E(\le t) = E_{\text{tot}} - \text{Sch}[i_0 + \operatorname{round}(t/\Delta t)]$:

$$
C_{50} = 10\log_{10}\frac{E(\le 50\ \text{ms})}{E_{\text{tot}} - E(\le 50\ \text{ms})},\qquad
C_{80} = 10\log_{10}\frac{E(\le 80\ \text{ms})}{E_{\text{tot}} - E(\le 80\ \text{ms})}
$$

$$
D_{50} = \frac{E(\le 50\ \text{ms})}{E_{\text{tot}}},\qquad
T_s = 1000\,\frac{\sum_{n\ge i_0}(n-i_0)\Delta t\,e[n]}{E_{\text{tot}}}\ \text{ms},\qquad
\text{SPL} = 10\log_{10}E_{\text{tot}}
$$

All times are measured from $t_D$.

### Worked example

The 4 × 5 × 2.7 m room of chapter 2 at 500 Hz. The library monitor
(cardioid, 94 dB at 1 m) at (1.2, 4.3, 1.2) aimed at −60°, an omni at
(2, 3.1, 1.2), image order 3 (91 arrivals). Eyring $T$ = 1.515 s:

| EDT | T20 | T30 | C50 | C80 | D50 | Ts | SPL |
|---|---|---|---|---|---|---|---|
| 1.60 s | 1.515 s | 1.515 s | −2.7 dB | +0.07 dB | 0.35 | 108 ms | 98.8 dB |

T20 and T30 read back the Eyring time used to build the tail, which the test
suite also checks. For comparison, `energyAt` at the same point gives direct
90.8, reverberant 98.7 and total 99.4 dB. The echogram's parts are: specular
arrivals 93.9 dB, late tail 96.9 dB, diffuse rain 84.9 dB (equal to
`eScattered`, as § 9.1 requires). The late tail is
$10\log_{10}e^{k(t_{\text{tail}}-t_D)} = 1.8$ dB below $E_{\text{rev}}$, because
it starts at the last image arrival, 50.8 ms (§ 9.1). (Node.)

## 9.3 Mic report

`analysis.js` `micReport(room, prep, modalPrep, mic, settings)` collects for
one microphone: the wave level at `settings.freq`, the modal level, the
energy result in all six bands, the ISO parameters for `settings.band`, the
echogram, the first 12 reflections (order > 0, with delay after $t_D$ and
level relative to the same speaker's direct sound) and the ITDG, which is the
delay of the first of those reflections.

## 9.4 Critical distance

`analysis.js` `criticalDistance(room, spk, band)`. The distance at which
direct and reverberant energy are equal is found by setting
$Q/(4\pi r^2) = 4/R$:

$$
r_c = \sqrt{\frac{QR}{16\pi}} = 0.141\sqrt{Q\,R_b}\ \text{m}
$$

The comment adds the equivalent Sabine form $\approx 0.057\sqrt{QV/T_{60}}$.
Example: the cardioid monitor in the chapter 2 room at 500 Hz, $Q = 2.905$
(the pattern is 96 % formed at 500 Hz with `omniBelow` 300), $R = 5.78$ m²:
$r_c = 0.141\sqrt{2.905\cdot5.78} = 0.58$ m.

## 9.5 Flutter-echo risk

`analysis.js` `flutterRisk(room, { threshold = 0.5, tolDeg = 5, minOverlap = 0.5 })`.

Two parallel, facing surfaces pass a sound back and forth with repetition
rate $c/2d$. The risk measure is the fraction of energy that survives one
specular round trip:

$$
\text{score}_b = (1-\alpha_{a,b})(1-s_{a,b})\,(1-\alpha_{b',b})(1-s_{b',b})
$$

It is evaluated at 500 Hz and 1 kHz (`FLUTTER_BANDS`) and reported at the
worse of the two. Absorbing or scattering either surface lowers it.

A pair of walls qualifies when:

1. their inward normals are opposed within `tolDeg`:
   $\hat n_A\cdot\hat n_B \le -\cos(\text{tolDeg})$;
2. $B$'s midpoint lies more than 5 cm in front of $A$, and that distance is
   $d$;
3. their overlap along $A$'s tangent is at least `minOverlap`.

The floor and ceiling form a pair at $d = H$ unless the room is sloped. Pairs
with $\text{score} \ge$ threshold are returned, worst first, as
`{ a, b, band, score, distance, rateHz }`.

Example: the chapter 2 room (bare gypsum walls, $\alpha_{1\text{k}} = 0.04$,
$s = 0.1$): front/back $d = 5$ m, score
$(0.96\cdot0.9)^2 = 0.746$, 34.3 Hz; left/right $d = 4$ m, 0.746, 42.9 Hz;
floor/ceiling 0.723, 63.5 Hz.

**Assumption.** A pair's distance is taken at $B$'s midpoint. Walls splayed
by more than `tolDeg` are treated as cured.
