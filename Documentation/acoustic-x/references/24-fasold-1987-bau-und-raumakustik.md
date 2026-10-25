# 24 · Fasold, Sonntag & Winkler 1987 — Bau- und Raumakustik

> Fasold, W., Sonntag, E., and Winkler, H., *Bau- und Raumakustik*, Köln, Verlagsgesellschaft
> Rudolf Müller GmbH, 1987. The title is spelled here as published, *Bau- und
> Raumakustik* (building and room acoustics).

**Kind:** German-language engineering handbook. **Read it for:** sound insulation and room
acoustics as German building practice treated them, with the design formulas in one place.

## What it is

Wolfgang Fasold and his co-authors came from East German building research. Their book was
published in Berlin by Verlag für Bauwesen, and the Rudolf Müller edition the manual cites
is, as far as this report can tell, the licensed edition for the West. It covers the two halves of
the subject: building acoustics (how much sound gets through walls, floors and services)
and room acoustics (how a room sounds inside). This report covers the book's main themes as
a handbook of this kind reliably presents them, not chapter by chapter. For a room
designer its value is the design formulas: the mass law, double walls, floating floors and resonant
absorbers.

## Big ideas

### 1. The mass law for single walls, and the coincidence dip

**Summary.** A single homogeneous wall resists sound mainly by its mass. For field
incidence its sound reduction index is roughly

$$R \approx 20\log_{10}(m' f) - 47\ \text{dB}$$

with $m'$ the surface mass in kg/m² and $f$ in Hz: +6 dB per doubling of mass or of
frequency. Above the coincidence frequency, where the bending wave in the panel matches the
trace of the sound wave in air, the wall lets sound through more easily, and $R$ shows a dip.
For thin, stiff boards such as gypsum it lies in the upper midrange.

**Challenge.** Two layers of 12.5 mm gypsum board, about 20 kg/m² in all, at 500 Hz: find
$R \approx 33$ dB by hand. In the app's isolation settings, read the single-stud wall's
octave TL (17, 31, 40, 46, 39, 43 dB from 125 Hz to 4 kHz). Find where it falls from one
octave to the next, and say whether that fits a coincidence dip in the boards.

### 2. Double walls are a mass–spring–mass system

**Summary.** Two leaves with an air gap $d$ between them resonate at

$$f_0 \approx 60\sqrt{\frac{m'_1 + m'_2}{m'_1\, m'_2\, d}}\ \text{Hz}$$

with $m'$ in kg/m² and $d$ in m. Below $f_0$ the pair acts as one mass. Near it, insulation
is worse than the mass law. Above it, insulation rises much faster than for a single wall,
provided the leaves are not tied together and the cavity is damped with mineral wool.

**Challenge.** Two 10 kg/m² boards on a 100 mm cavity: find $f_0 \approx 85$ Hz. Then
compare the app's single-stud and double-stud wall builds at 125 Hz and 1 kHz, and find how
much the decoupled build gains in each band.

### 3. Floating floors against impact and structure-borne sound

**Summary.** A screed on a resilient layer is a mass on a spring, with

$$f_0 \approx 160\sqrt{\frac{s'}{m'}}\ \text{Hz}$$

where $s'$ is the layer's dynamic stiffness in MN/m³ and $m'$ the screed's surface mass in
kg/m². The floor isolates only above about $\sqrt2\,f_0$, and amplifies near $f_0$. A low
$f_0$ needs a heavy screed on a soft layer, and any rigid bridge, such as a pipe or a
skirting board, short-circuits it.

**Challenge.** A 100 kg/m² screed on a 10 MN/m³ layer: find $f_0 \approx 51$ Hz. With the
app's transmissibility model ($\zeta = 0.1$, engine chapter 12.1), find the insertion loss
at 50 Hz (about −14 dB), 100 Hz (about +9 dB) and 200 Hz (about +21 dB). Say why such a floor
does little against a kick drum.

### 4. Resonant absorbers for the bass

**Summary.** Porous absorbers need depth comparable to a quarter wavelength, which is
impractical in the bass. A panel on a closed air cavity (in German, *Plattenschwinger*)
absorbs a band round its resonance,

$$f_0 \approx \frac{600}{\sqrt{m'\, d}}\ \text{Hz}$$

with $m'$ in kg/m² and $d$ in cm. Perforated and slotted panels work as Helmholtz
resonators ([report 23](23-helmholtz-1954-sensations-of-tone.md)). Mineral wool in the
cavity broadens the band and lowers the peak.

**Challenge.** A 6 kg/m² panel on a 50 mm cavity: find $f_0 \approx 110$ Hz. In Reverb
Time, attach the `membrane-trap` material to a wall and read its α chart. Find in which
octave band it peaks.

### 5. Reverberation time chosen by volume and use

**Summary.** The handbook treats reverberation time as the first room-acoustic design
target, chosen from the room's volume and use: shorter for speech, longer for music, longer
for bigger rooms. It calculates with Sabine and Eyring, and also discusses energy measures
that describe clarity and speech intelligibility, which German practice developed, such as
the definition $D_{50}$ and the clarity $C_{80}$.

**Challenge.** In Reverb Time, set the criteria to Control room and then Studio for a
$6 \times 4.2 \times 2.8$ m room, and read the targets at 500 Hz. Then in the main app, place a
microphone at the mix seat and read $D_{50}$ and $C_{80}$ in its report. Find whether they
move the same way as the RT when you add absorber.

## Since then

The design formulas in ideas 2 to 4 are still in use. Building-acoustic prediction moved to
EN 12354 (from 2000), which adds flanking paths through the structure; DIN 4109 was revised
in 2016. Single-number ratings are $R'_w$ by ISO 717-1 in Europe and STC in North America.
DIN 18041 (revised 2004 and 2016) sets reverberation targets by volume and use for speech
rooms. ISO 3382-1 (2009) standardised $D_{50}$, $C_{80}$ and the other energy measures.

## In this app

- Ideas 1 and 2: [engine chapter 12.2, walls](../../acoustics/12-isolation.md#122-walls-transmission-loss-per-band);
  `js/acoustics/isolation.js` `wallTl`, `js/acoustics/wallPlan.js` `stcRating`. The wall
  builds carry tabulated TL; the app does not compute TL from mass, and rates by STC, not
  $R'_w$.
- Idea 3: [engine chapter 12.1, the floor](../../acoustics/12-isolation.md#121-the-floor-a-mass-on-a-damped-spring);
  `isolation.js` `transmissibility`, `floorF0`.
- Idea 4: `membrane-trap`, `perforated-wood`, `slat-resonator` in
  `js/acoustics/materials.js`, and [chapter 3.4](../../acoustics/03-materials-patches.md#34-construction-adds-a-little-bass-absorption)
  for the bass absorption a light build adds. No resonance is computed from $m'$ and $d$.
- Idea 5: [Reverb Time, formulas and criteria](../06-reverb-time.md#criteria)
  (`js/acoustics/reverbTargets.js` `rtFormulas`, `rtTarget`);
  [engine chapter 9.2, ISO 3382-1 parameters](../../acoustics/09-echogram-iso3382.md#92-iso-3382-1-parameters)
  (`js/acoustics/analysis.js` `iso3382`).
