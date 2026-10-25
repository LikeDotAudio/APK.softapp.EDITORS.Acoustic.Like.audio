# 12 · Everest 1989 — The Master Handbook of Acoustics, 2nd ed.

> Everest, F. Alton, *The Master Handbook of Acoustics*, 2nd edition, Blue Ridge Summit, PA,
> TAB Books, 1989.

**Kind:** book. **Read it for:** small-room acoustics from first principles to the finished
control room, in one volume, at the level of a working engineer.

## What it is

F. Alton Everest was an acoustical engineer who co-founded the Moody Institute of Science and
spent his retirement writing practical books on studio acoustics. The *Master Handbook* (first
edition 1981) is the best known of them. It starts with what sound is (wavelength, the
decibel, the ear), moves through reflection, diffraction, diffusion and comb filtering, then
reverberation, absorbers and room modes, and ends with the design of listening rooms, studios
and control rooms, including isolation. It is written for people who build rooms rather than
for researchers, with numbers worked out and many figures.

Acoustic-X's windows cover much of the same ground as the book's middle chapters: modes, room
proportions, boundary interference, reflections, reverberation. Of all the references, it is
the closest to a manual for what the program does.

## Big ideas

### 1. Think in wavelengths

**Summary.** Almost every small-room problem is a comparison between a wavelength and a
dimension. At 20 °C sound travels about 343 m/s, so 50 Hz has a 6.9 m wavelength and 5 kHz a
69 mm one. A room is large to a high frequency and small to a low one. An absorber, a
diffuser or a gap behind a speaker works or fails depending on how its size compares with the
wavelength.

**Challenge.** In the Calculator's **Wave** tab, find the wavelength of 50 Hz at 20 °C (about
6.86 m) and of 1 kHz ([chapter 7](../07-calculator.md#wave--frequency-wavelength-period)). Then
say which of the two a 100 mm absorber can do anything about: its depth is a quarter
wavelength near 860 Hz.

### 2. Axial modes rule the small room

**Summary.** A small room's bass response is set by its modes, and the axial ones (between one
pair of parallel surfaces) are the strongest. Everest's method is to list them, sort them, and
look at the gaps. A coincidence, two modes at one frequency, makes a peak; a wide gap makes a
hole. Following Gilford (1959), he treated gaps of more than about 20 Hz between neighbouring
axial modes as audible.

**Challenge.** List the axial modes of a $6 \times 4.2 \times 2.8$ m room up to 200 Hz at
$c = 343$ m/s (from 28.6 Hz, $L_1$, to 183.8 Hz, $H_3$). Find the coincidence: $H_2$ and $W_3$
both at 122.5 Hz, because $4.2 = 1.5 \times 2.8$. Find the four gaps over 20 Hz. Then open
Modal Response on the same room and check your list against its mode table
([chapter 3](../03-modal-response.md#room-modes)), and against the **Criteria** tab's *Axial
Spacing (Everest)*. That check runs to 300 Hz, so at 343 m/s it finds six gaps over 20 Hz
and three coincident pairs (122.5, 245 and 285.8 Hz).

### 3. Proportions are a first pass

**Summary.** Since the modes come from the dimensions, the dimensions can be chosen to spread
them. The book collects the published favourable ratios (Sepmeyer, Louden, Bolt's area) and
recommends using them. It also says what the original authors said: a ratio is a starting
point, to be checked by listing the modes for the actual size of the room.

**Challenge.** In Modal Response, apply Louden's 1 : 1.4 : 1.9 with $H = 2.8$ m, and then
Sepmeyer B, 1 : 1.28 : 1.54 ([chapter 3](../03-modal-response.md#favourable-ratios)). For each,
find whether Bonello's criterion passes, and read the axial gaps over 20 Hz in the
**Criteria** tab's *Axial Spacing (Everest)*. At 343 m/s both pass Bonello, and each has three
gaps over 20 Hz below 200 Hz (five below 300 Hz, where the group stops).

### 4. Reverberation is weak in a small room, but still useful

**Summary.** Sabine's and Eyring's formulas assume a diffuse field, which a small room barely
has. Everest still uses them, as a way to balance absorption across the bands: a room whose
calculated RT is flat from 125 Hz to 4 kHz is a room whose absorption is not lopsided. Small
studios and control rooms aim for short times, of the order of 0.3 to 0.5 s.

**Challenge.** By Sabine, find the absorption a $6 \times 4.2 \times 2.8$ m room (70.56 m³)
needs for 0.5 s: 22.7 m². In Reverb Time, lay 100 mm absorber on the side walls of that room
and compare Sabine and Fitzroy at 500 Hz (0.31 s against 1.49 s,
[chapter 6](../06-reverb-time.md#the-formulas)). Say what the gap between them tells you about
where the absorption sits.

### 5. Three kinds of absorber

**Summary.** Porous materials (glass fibre, mineral wool) absorb by friction and work best at
high frequencies; their low-frequency reach grows with depth and with an air gap behind them.
Panel absorbers resonate and take out a band in the bass. Helmholtz resonators, slotted or
perforated panels over a cavity, take out a tuned band. A good room uses all three, so that
the absorption is even with frequency.

**Challenge.** In the main app, put a 50 mm porous absorber on a wall and read the advisor
([chapter 15 §15.5](../../acoustics/15-advisor.md#155-treatment)): find the warning for thin
absorbers, which starts below 76 mm. Then find which material in the palette is rated below
125 Hz (`ratedLow`, [chapter 3 §3.1](../../acoustics/03-materials-patches.md#31-what-a-material-is)).

### 6. Early reflections comb the sound

**Summary.** A reflection that arrives soon after the direct sound adds to it at some
frequencies and cancels at others, a comb filter with nulls at $(2k-1)/(2\Delta t)$. The ear
fuses the two (the precedence effect, [report 7](07-haas-1972-single-echo.md)), so the comb is
heard as colouration, not echo. The book's control-room chapters follow from this: keep strong
early reflections away from the listener for the first 15 to 20 ms, then let diffuse energy
arrive later. This is the idea behind Live End Dead End (LEDE), which Everest describes in
detail.

**Challenge.** In the Calculator's **Comb** tab, find the nulls of a console reflection 1.5 ms
late: 333, 1000 and 1667 Hz ([chapter 7](../07-calculator.md#comb--comb-filter-nulls)). Then in
Ray Tracing put the listener at the mix position and find, in the Energy / Time chart, every
arrival in the first 20 ms that lies inside the 10 dB window
([chapter 5](../05-ray-tracing.md#the-charts)).

### 7. Diffusion as well as absorption

**Summary.** A room treated only with absorption sounds dead. The book presents the
reflection-phase grating diffusers of Schroeder and of D'Antonio and Konnert (reports
[14](14-dantonio-konnert-1984-rfz-rpg.md) and [15](15-dantonio-konnert-1986-new-materials.md)),
which scatter sound in many directions without absorbing it, as the way to keep energy in a
room while breaking up its strong reflections.

**Challenge.** In the main app, paint all four walls of the $6 \times 4.2 \times 2.8$ m room
with 100 mm absorber patches, then repaint the back wall with the QRD diffuser. Read the
advisor's absorption-and-diffusion check at 1 kHz each time
([chapter 15 §15.5](../../acoustics/15-advisor.md#155-treatment)); it applies once the room's
mean α at 1 kHz is over 0.3. Find which version it warns about, and check by hand that the
diffuser brings the scattered share over the 10 % it asks for.

## Since then

The book went through many editions. After Everest's death in 2005, Ken Pohlmann revised it
from the fifth edition (2009) on, adding modern measurement and computer modelling. Later
research weakened some of its rules of thumb: the 20 Hz mode-gap rule and the room ratios
predict listener preference only loosely (see [report 6](06-bonello-1979-room-mode-criterion.md)),
and LEDE gave way to the reflection-free zone and to designs with controlled-directivity
speakers. Its approach (wavelength first, modes listed, absorption balanced across the bands,
early reflections controlled) is still how small rooms are taught.

## In this app

- [Modal Response](../03-modal-response.md): modes, favourable ratios and Bonello;
  `js/acoustx/classic.js` `modeFreq`, `js/acoustics/modalDistribution.js`
  `FAVOURABLE_RATIOS`, `bonello`. The ratio list cites the *Master Handbook* as one of its
  sources ([engine chapter 5 §5.4](../../acoustics/05-modes.md#54-published-ratios)).
- [Reverb Time](../06-reverb-time.md): `js/acoustics/reverbTargets.js` `rtFormulas`.
- [Calculator](../07-calculator.md): `classic.js` `combNulls`, `addLevels`.
- [Ray Tracing](../05-ray-tracing.md): `classic.js` `traceRays`, `polarEnergy`.
- [Engine chapter 15 §15.5, Treatment](../../acoustics/15-advisor.md#155-treatment): the
  advisor's absorber-depth, bass-trap and diffusion checks.
- Modal Response, **Criteria** tab, *Axial Spacing (Everest)*: the axial modes below
  300 Hz, every gap over 20 Hz and every pair within 0.5 %; `js/acoustx/references.js`
  `axialCheck`. The same tab draws the *Bolt Area* the book reprints (`boltMap`). Bonello and
  the app's spread score ([engine chapter 5 §5.2](../../acoustics/05-modes.md#52-third-octave-counts-and-bonellos-criterion))
  still decide the optimiser.
- Calculator, **Res** tab, *Resonators*: Helmholtz, perforated and membrane absorbers;
  `references.js` `helmholtz`, `perforated`, `membrane`.
- The room library has a *LEDE control room* shape (`roomLibrary.js`), a splayed plan with no
  treatment laid; there is no LEDE layout with its absorption and diffusion.
- 📖 in the app: the groups *Favourable Room Ratios*, *Bolt Area*, *Axial Spacing (Everest)*,
  *Display Parameter*, *Speaker Critical Frequency*, *Specular Absorbers*, *Trace*, *Criteria
  Type*, *RT60 Of Empty Room (s)*, *Absorption*, *Comb-Filter* and *Resonators* open this
  report from their pop-up.
