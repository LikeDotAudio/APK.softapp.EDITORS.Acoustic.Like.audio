# 7 · Calculator

`js/acoustx/acoustx.js` (the Calculator window), using `classic.js` and `js/acoustx/references.js`.

**Tabs:**
- **U:** units conversion.
- **ISL:** the inverse square law.
- **Add:** level addition.
- **Wave:** frequency, wavelength and period.
- **Comb:** comb-filter nulls.
- **Wall:** the mass law, coincidence, the mass–air–mass resonance, Rw.
- **Res:** Helmholtz, perforated and membrane absorbers.
- **QRD:** the quadratic-residue diffuser.
- **NC:** a background-noise spectrum's NC rating.
- **PA:** %ALcons, potential and needed acoustic gain, ceiling speaker spacing.
- **Spk:** the piston in a baffle, the closed box, electrical levels, SPL from power.
- **Z:** reflection at an impedance step.
- **Tone:** two tones together, and loudness.

The tabs from **Wall** on come from the manual's suggested references. Every input is metric. Wherever the speed of sound enters, it is $c$ at the temperature typed on the **Wave** tab: 343.21 m/s at the default 20 °C, which the examples use. Each example is the tab's default inputs.

## U — units conversion

Pick **IMP to MKS** or **MKS to IMP**, a quantity, and a value (`classic.js` `convert`). The factors are exact by definition, except the last two:

| Quantity | MKS | IMP | MKS per IMP |
|---|---|---|---|
| length | m | ft | 0.3048 |
| short length | mm | in | 25.4 |
| area | m² | ft² | 0.09290304 |
| volume | m³ | ft³ | 0.028316846592 |
| absorption | metric sabin (m²) | sabin (ft²) | 0.09290304 |
| speed | m/s | ft/s | 0.3048 |
| mass | kg | lb | 0.45359237 |
| surface density | kg/m² | lb/ft² | 4.882427636 |
| pressure | Pa | psi | 6894.757293 |

Temperature converts as $t_\text{°C} = (t_\text{°F} - 32)\cdot 5/9$.

## ISL — inverse square law

`classic.js` `inverseSquare`. Given a level $L_1$ measured at distance $d_1$, the level at $d_2$ is:

$$\text{Spherical (point source):}\quad L_2 = L_1 - 20\log_{10}\frac{d_2}{d_1}$$
$$\text{Cylindrical (line source):}\quad L_2 = L_1 - 10\log_{10}\frac{d_2}{d_1}$$

A point source loses 6.02 dB per doubling of distance; a line source loses 3.01 dB.

*Example:* 94 dB at 1 m gives 81.96 dB at 4 m spherically, and 87.98 dB cylindrically.

## Add — level addition

`classic.js` `addLevels`. Separate the levels with commas.

**Energy**, for uncorrelated sources, sums the powers:
$$L = 10\log_{10}\sum_i 10^{L_i/10}$$

**Pressure**, for the same signal in phase, sums the pressures:
$$L = 20\log_{10}\sum_i 10^{L_i/20}$$

Two equal energy levels add 3.01 dB; two in phase add 6.02 dB.

*Example:* 90 + 87 + 84 dB as energy is 92.44 dB; 90 + 90 dB in phase is 96.02 dB.

## Wave — frequency, wavelength, period

$$\lambda = \frac{c}{f}, \qquad T = \frac{1}{f}$$

where $c = c(t)$ is the speed of sound at the temperature entered ([chapter 2](02-general-parameters.md)). Type into any one of frequency, wavelength or period, and the other two follow. Metric or imperial applies to the wavelength and to the speed shown.

## Comb — comb-filter nulls

A reflection that arrives $\Delta t$ after the direct sound, or travels $\Delta d = c\,\Delta t$ further, cancels where it is an odd number of half-periods late (`classic.js` `combNulls`):

$$f_k = \frac{2k - 1}{2\,\Delta t}, \qquad k = 1, 2, 3, \dots \qquad \text{spacing} = \frac{1}{\Delta t}$$

Enter either the time or the path difference. The window shows the first three nulls and the spacing.

*Example:* a console-top reflection 1.5 ms late nulls at 333, 1000 and 1667 Hz, every 667 Hz.

## Wall — mass law, coincidence, Rw

**Mass Law & Rw**, after [Rettinger 1973](references/11-rettinger-1973-acoustic-design-noise-control.md), [Egan 1988](references/17-egan-1988-architectural-acoustics.md) and [Fasold 1987](references/24-fasold-1987-bau-und-raumakustik.md).

**Mass law** (`references.js` `massLaw`). A limp single leaf of surface mass $m$ (kg/m²) passes less sound the heavier it is and the higher the frequency $f$ (Hz). For sound arriving from all angles (field incidence), its transmission loss is

$$\text{TL} = 20\log_{10}(m f) - 47\ \text{dB}$$

That is 6 dB more per doubling of mass or of frequency. Leaf 1 is not typed: it is the chosen plate's $m_1 = \rho t$ (the readout marked ρ·t), so plate, thickness and mass agree. Leaf 2, $m_2$, is typed (0 for a single leaf). The TL and Rw use the total mass $m = m_1 + m_2$ and ignore the cavity.

**Coincidence** (`references.js` `coincidence`). Above the frequency where the leaf's bending wave travels as fast as the sound's trace along it, the leaf passes sound easily. For a plate of thickness $t$ (m), density $\rho$ (kg/m³), Young's modulus $E$ (Pa) and Poisson's ratio $\nu$:

$$f_c = \frac{c^2}{2\pi t}\sqrt{\frac{12\,\rho\,(1 - \nu^2)}{E}}$$

The **Leaf** list (`PLATES`) gives $\rho$, $E$ and $\nu$ for gypsum board, plywood, MDF, glass, concrete, brick and steel.

**Mass–air–mass resonance** (`references.js` `massAirMass`). Two leaves $m_1$, $m_2$ over a cavity $d$ (m) bounce on the air between them at

$$f_0 = 60\sqrt{\frac{m_1 + m_2}{m_1\,m_2\,d}}\ \text{Hz}$$

The 60 is $\sqrt{\rho_0 c^2}/2\pi$ for air, rounded. Below $f_0$ the pair acts as one leaf; at $f_0$ it passes more than one would; above it the loss rises fast. It is shown only when $m_2 > 0$.

**Rw** (`references.js` `ratingRw`, ISO 717-1). The mass-law TL is taken in the 16 third-octave bands from 100 Hz to 3150 Hz. The reference curve (`ISO717_REF`, 52 dB at 500 Hz) is shifted in whole decibels. Each band where the TL falls below the shifted curve adds its shortfall. The curve is raised as far as it goes while the shortfalls sum to no more than 32 dB. Rw is the shifted curve's value at 500 Hz:

$$\text{Rw} = \max\Big\{\, R \;:\; \sum_{b=1}^{16} \max\big(0,\ \text{ref}_b - 52 + R - \text{TL}_b\big) \le 32 \,\Big\}$$

*Example:* gypsum board 12.5 mm, so $m_1 = 800 \times 0.0125$ = 10 kg/m², with a second leaf of 10 kg/m² over 100 mm. TL at 500 Hz = 33.0 dB, $f_c$ = 2804 Hz, $f_0$ = 84.9 Hz. For Rw, $m$ = 20 kg/m²:

| Band (Hz) | 100 | 125 | 160 | 200 | 250 | 315 | 400 | 500 | 630 | 800 | 1k | 1.25k | 1.6k | 2k | 2.5k | 3.15k |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TL | 19.0 | 21.0 | 23.1 | 25.0 | 27.0 | 29.0 | 31.1 | 33.0 | 35.0 | 37.1 | 39.0 | 41.0 | 43.1 | 45.0 | 47.0 | 49.0 |
| ref at Rw 37 | 18 | 21 | 24 | 27 | 30 | 33 | 36 | 37 | 38 | 39 | 40 | 41 | 41 | 41 | 41 | 41 |
| shortfall | 0 | 0 | 0.9 | 2.0 | 3.0 | 4.0 | 4.9 | 4.0 | 3.0 | 1.9 | 1.0 | 0 | 0 | 0 | 0 | 0 |

The shortfalls sum to 24.8 dB. At 38 they would sum to 35.8 dB, over 32, so Rw = 37 dB. A real double wall does worse near $f_0$ and $f_c$, and better above $f_0$ with a filled cavity. The figure is for comparing, not certifying.

## Res — resonant absorbers

**Resonators**, after [Helmholtz 1863/1954](references/23-helmholtz-1954-sensations-of-tone.md), [Rettinger 1973](references/11-rettinger-1973-acoustic-design-noise-control.md) and [Everest 1989](references/12-everest-1989-master-handbook.md). Each absorbs a band round its resonance.

**Helmholtz resonator** (`references.js` `helmholtz`). A neck of radius $a$ and length $l$ on a cavity of volume $V$ (m, m³):

$$f = \frac{c}{2\pi}\sqrt{\frac{S}{V\,l'}}, \qquad S = \pi a^2, \qquad l' = l + 1.7a$$

$l'$ adds an end correction of $0.85a$ at each flanged end.

**Perforated or slotted panel** (`references.js` `perforated`). A panel of thickness $t$ with open-area fraction $P$, over an air gap $D$, holes of diameter $d$:

$$f = \frac{c}{2\pi}\sqrt{\frac{P}{D\,t'}}, \qquad t' = t + 0.8d$$

For slots, the slot width stands in for $d$. That is rougher, but adequate for design.

**Membrane (panel) absorber** (`references.js` `membrane`). A limp sheet of surface mass $m$ (kg/m²) over an air space $d$ (m):

$$f = \frac{60}{\sqrt{m\,d}}\ \text{Hz}$$

*Example:* a 25 mm neck radius, 50 mm long, on 10 litres: 79.6 Hz. A 6 mm panel with 6 mm holes, 10 % open, over 100 mm: 525.6 Hz. A 5 kg/m² membrane over 100 mm: 84.9 Hz.

## QRD — the quadratic-residue diffuser

**QRD Diffuser**, `references.js` `qrd`, after [D'Antonio & Konnert 1986](references/15-dantonio-konnert-1986-new-materials.md) and [1984](references/14-dantonio-konnert-1984-rfz-rpg.md). $N$ wells (a prime, up to 97) of width $w$, for a design frequency $f_0$ with wavelength $\lambda_0 = c/f_0$. Well $n = 0 \dots N-1$ has the residue and depth

$$s_n = n^2 \bmod N, \qquad d_n = \frac{s_n\,\lambda_0}{2N}$$

It scatters from about $f_0$ up to where the wells stop being narrow against a half-wave, and repeats every $N$ wells:

$$f_\text{high} = \frac{c}{2w}, \qquad \text{period} = N w$$

The dividers between wells are left out of $w$.

*Example:* $N$ = 7, $f_0$ = 500 Hz, $w$ = 50 mm. $\lambda_0$ = 0.686 m. The residues are 0, 1, 4, 2, 2, 4, 1, so the depths are 0, 49, 196, 98, 98, 196 and 49 mm. It works from 500 to 3432 Hz, with a period of 0.35 m.

## NC — background noise

**Background Noise (NC)**, `references.js` `ncRating`, after [Egan 1988](references/17-egan-1988-architectural-acoustics.md). Enter the octave-band levels from 63 Hz to 8 kHz. The NC curves (Beranek 1957, `NC_CURVES`) give, for NC 15 to 65 in steps of 5, the most each band may have.

For each band, the level $L_b$ is placed between the two curves that bracket it, and the NC value it reaches is read off by straight-line interpolation (extrapolated past NC 15 or NC 65):

$$\text{NC}_b = \text{NC}_k + (L_b - L_{b,k})\,\frac{\text{NC}_{k+1} - \text{NC}_k}{L_{b,k+1} - L_{b,k}}, \qquad \text{NC} = \max_b \text{NC}_b$$

where $L_{b,k}$ is curve $k$'s level in band $b$. The rating is shown rounded up (`Math.ceil(nc − 1e-9)`, so an exact 30.0 stays NC-30), with the band that sets it, and checked against the targets by room (`NC_TARGETS`): recording studio NC 15–20, control room 15–25, broadcast studio 15–20, concert hall 15–20, theatre 20–25, cinema 25–30, classroom 25–30, open office 35–40. A ✓ marks each target the room meets.

*Example:* 50, 45, 40, 35, 30, 28, 26 and 25 dB from 63 Hz to 8 kHz reach NC 18.8, 26.3, 28.8, 30.0, 28.8, 29.0, 28.3 and 28.3. The rating is **NC-30**, set by 500 Hz.

## PA — speech and gain

After [Eargle 1989](references/18-eargle-1989-sound-system-design.md).

**Articulation loss of consonants** (`references.js` `alcons`, Peutz). For a listener $r$ (m) from the nearest of $n + 1$ like loudspeakers, in a room of volume $V$ (m³) and reverb time $T$ (s), with a loudspeaker directivity factor $Q$:

$$\%\text{AL}_\text{cons} = \frac{200\,r^2\,T^2\,(n + 1)}{V\,Q}$$

Past $3.16\,D_c$ it levels off at $9T$, and it is never more than $9T$. The critical distance $D_c$ comes from `classic.js` `roomFigures` ([chapter 5](05-ray-tracing.md#room-figures-data-view)), with this tab's $Q$, for a cube of volume $V$: $S = 6V^{2/3}$ and $\bar\alpha = 0.161\,V/(T S)$ (at most 0.95). Up to 5 % is good, up to 10 % acceptable, past 15 % unusable.

**Potential and needed acoustic gain** (`references.js` `acousticGain`, after Davis). With $D_0$ talker to farthest listener, $D_s$ talker to microphone, $D_1$ microphone to nearest loudspeaker, $D_2$ loudspeaker to farthest listener (all m), NOM open microphones and a 6 dB feedback margin:

$$\text{PAG} = 20\log_{10}\frac{D_1\,D_0}{D_s\,D_2} - 10\log_{10}\text{NOM} - 6, \qquad \text{NAG} = 20\log_{10}\frac{D_0}{\text{EAD}}$$

The EAD (equivalent acoustic distance) is how close the farthest listener should seem to the talker. The system can reach that level without feedback when $\text{PAG} \ge \text{NAG}$.

**Ceiling speakers** (`references.js` `ceilingSpacing`). A speaker with coverage angle $\theta$ in a ceiling of height $h$ covers a circle at ear height $e$ of radius

$$r = (h - e)\tan\frac{\theta}{2}$$

On a square grid, the spacing centre to centre is $2r$ edge to edge (cheapest), $r\sqrt2$ for minimum overlap, and $r$ centre to centre (the most even).

*Example:* $r$ = 10 m, $T$ = 1.5 s, $V$ = 2000 m³, $Q$ = 10, $n$ = 0. The cube has $S$ = 952.4 m² and $\bar\alpha$ = 0.225, so $D_c$ = 7.42 m. %ALcons = 2.25 %, good. At $r$ = 30 m, beyond $3.16\,D_c$ = 23.5 m, it is $9T$ = 13.5 %. With $D_0$ = 20, $D_s$ = 0.5, $D_1$ = 6, $D_2$ = 15 and EAD = 3 m, PAG = 18.1 dB and NAG = 16.5 dB, so it works. With four open microphones PAG falls to 12.1 dB, and it does not. A 90° speaker in a 3 m ceiling, ears at 1.2 m, covers $r$ = 1.80 m: spacing 3.60 m edge to edge, 2.55 m minimum overlap, 1.80 m centre to centre.

## Spk — piston, box and levels

**Piston & Box**, after [Beranek 1954](references/10-beranek-1954-acoustics.md) and [Franz 1990](references/22-franz-1990-elektro-akustik.md).

**Piston in a baffle** (`references.js` `piston`). A rigid piston of radius $a$ (m) in an infinite baffle at frequency $f$. Its size against the wavelength is $ka$, and its pressure off axis, relative to on axis, is

$$ka = \frac{2\pi f a}{c}, \qquad D(\theta) = \frac{2 J_1(x)}{x}, \quad x = ka\sin\theta$$

where $J_1$ is the Bessel function of the first kind, order 1 (`besselJ1`, the rational approximation of Numerical Recipes' `bessj1`). $D = \tfrac12$ (−6 dB) at $x = 2.215$, so the **−6 dB half-angle** is

$$\theta_{-6} = \arcsin\frac{2.215}{ka}, \qquad ka > 2.215$$

Below that the beam is wider than ±90°. The **directivity index** is

$$\text{DI} = 10\log_{10}\frac{(ka)^2}{1 - J_1(2ka)/ka}\ \text{dB}$$

At low $ka$ it tends to 3 dB, the baffle's half-space.

**Closed box** (`references.js` `closedBox`, Thiele and Small). A driver with free-air resonance $f_s$, total Q $Q_{ts}$ and compliance volume $V_{as}$ in a box $V_b$:

$$f_c = f_s\sqrt{1 + \frac{V_{as}}{V_b}}, \qquad Q_{tc} = Q_{ts}\sqrt{1 + \frac{V_{as}}{V_b}}$$

*Example:* a 100 mm radius at 2 kHz: $ka$ = 3.66, ±37° at −6 dB, DI = 11.4 dB, −3.9 dB at 30° and −15.3 dB at 60°. At 200 Hz, $ka$ = 0.37: wider than ±90°, DI = 3.1 dB. A driver with $f_s$ = 40 Hz, $Q_{ts}$ = 0.4 and $V_{as}$ = 50 litres in 25 litres: $f_c$ = 69.3 Hz, $Q_{tc}$ = 0.69.

**Electrical levels** (`references.js` `electrical`, `splFromPower`). For $U$ volts RMS, and for a speaker of sensitivity $S_1$ (dB SPL at 1 W, 1 m) driven with $P$ watts and heard $d$ m away on axis in free field:

$$\text{dBu} = 20\log_{10}\frac{U}{0.7746}, \qquad \text{dBV} = 20\log_{10}U, \qquad L = S_1 + 10\log_{10}P - 20\log_{10}d$$

0.7746 V is 1 mW in 600 Ω.

*Example:* 1.228 V is +4.0 dBu and +1.8 dBV. An 88 dB speaker on 100 W at 4 m makes 96.0 dB.

## Z — impedance step

**Impedance Step**, `references.js` `impedanceStep`, after [Elmore & Heald 1969](references/21-elmore-1969-physics-of-waves.md) and [Tipler 1991](references/20-tipler-1991-physics.md). A plane wave at normal incidence meets a change of characteristic impedance from $Z_1$ to $Z_2$ (rayl, Pa·s/m). The pressure reflection coefficient and the energy shares are

$$R = \frac{Z_2 - Z_1}{Z_2 + Z_1}, \qquad \text{reflected} = R^2, \qquad \text{transmitted} = 1 - R^2$$

The media list (`MEDIA`) gives $\rho c$ for air (413), water, wood, brick, concrete (8 × 10⁶), glass and steel.

*Example:* air into concrete: $R$ = 0.9999, 99.979 % of the energy reflected and 0.0206 % through, which is −36.9 dB. Air into steel lets through 0.0036 % (−44.4 dB).

## Tone — two tones, loudness

**Two Tones**, `references.js` `twoTones`, `noteOf`, after [Helmholtz 1863/1954](references/23-helmholtz-1954-sensations-of-tone.md) and [Hall 1980](references/25-hall-1980-musical-acoustics.md). For two tones $f_1 < f_2$:

| Readout | Formula |
|---|---|
| beats | $f_2 - f_1$ Hz; over 20 Hz apart the readout says the tones are too far apart to beat |
| difference tone | $f_2 - f_1$ |
| cubic difference tone | $2f_1 - f_2$ |
| sum tone | $f_1 + f_2$ |
| interval | $1200\log_2(f_2/f_1)$ cents |

The interval is reduced to within the octave and named after the nearest just interval (`JUST`: unison 1:1 to octave 2:1). An interval over 600 cents that lands within 50 cents above a whole number of octaves is reduced to $(…, 1200]$ instead, so an octave, or two, reads as **octave 2:1**, not unison. Offsets smaller than $10^{-6}$ cents are shown as 0. The readout gives how far the pair is from that just interval, and how far equal temperament (the nearest whole hundred cents) is from it. Each tone is named by its nearest equal-tempered note, A4 = 440 Hz, with MIDI number $69 + 12\log_2(f/440)$.

**Roughness** is Plomp and Levelt's curve as Sethares fits it. With $x = f_2 - f_1$:

$$s = \frac{0.24}{0.021\,f_1 + 19}, \qquad \text{roughness} = \frac{e^{-3.5\,s\,x} - e^{-5.75\,s\,x}}{0.180775}$$

It is 0 for a unison, peaks at 1 when $x = \ln(5.75/3.5)/(2.25\,s)$ (26.0 Hz at 440 Hz), and falls back toward 0 as the tones separate. The critical band is wider in higher registers, so the peak moves up with $f_1$.

*Example:* 440 and 660 Hz: 220 Hz apart, too far to beat; combination tones 220, 220 and 1100 Hz, 701.96 cents, a just fifth 3:2 (0.0¢ off it; equal temperament −1.96¢), roughness 0.01. The notes are A4 +0¢ and E5 +2¢. 440 and 444 Hz beat 4 times a second, 15.7 cents apart, roughness 0.36. 440 and 470 Hz are near the roughest, 0.99. 440 and 880 Hz are an octave 2:1, 0.0¢ off it.

**Loudness** (`references.js` `sones`). The phon is the level of an equally loud 1 kHz tone; the sone doubles with each 10 phons above 40:

$$N = 2^{(P - 40)/10}\ \text{sone} \quad (P \ge 40), \qquad N = \left(\frac{P}{40}\right)^{2.642} \quad (P < 40)$$

`phons` is the inverse.

*Example:* 20 phon is 0.16 sone; 40 is 1; 50 is 2; 60 is 4; 80 is 16; 100 is 64.
