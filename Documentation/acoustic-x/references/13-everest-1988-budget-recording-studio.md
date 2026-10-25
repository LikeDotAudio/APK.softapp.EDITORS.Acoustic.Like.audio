# 13 · Everest 1988 — How to Build a Small Budget Recording Studio From Scratch, 2nd ed.

> Everest, F. Alton, *How to Build a Small Budget Recording Studio From Scratch… with 12
> Tested Designs*, 2nd edition, Blue Ridge Summit, PA, TAB Books, 1988.
> The manual omits the subtitle.

**Kind:** book. **Read it for:** the order in which a small studio is designed and built, and
the arithmetic at each step, on a budget.

## What it is

This is the hands-on companion to Everest's *Master Handbook of Acoustics*
([report 12](12-everest-1989-master-handbook.md)). Where the handbook explains, this book
builds. It walks a reader with modest money and carpentry skills through a small studio from
the choice of site to the finished treatment, and then presents a set of complete designs for
different spaces and uses, each with its plan, construction and treatment worked out. The
first edition appeared in 1979.

We have kept the big ideas to the method the book is known for rather than to the details of
individual designs. Acoustic-X listed it because a user who has found good dimensions and a
good speaker position in the program still has to build the room.

## Big ideas

### 1. Start from the noise

**Summary.** The first question is not how the room should sound but how quiet it must be,
and how loud the world outside is. The difference, band by band, is the isolation the shell
must provide. A quiet site can save more money than any wall construction, so the survey of
the site comes before the drawing.

**Challenge.** Outside a garage the street reads 70 dB at 125 Hz, and the studio should be
under 25 dB there. Find the TL the shell must give: 45 dB. In the main app, check which of the
wall builds reaches 45 dB at 125 Hz
([engine chapter 12 §12.2](../../acoustics/12-isolation.md#122-walls-transmission-loss-per-band)),
and whether any does without the room-in-room leaf.

### 2. The weakest part sets the isolation

**Summary.** A wall's isolation is the area-weighted sum of what passes through each part of
it: wall, door, window, gaps. Transmission coefficients add, so a door or a crack lets through
far more than its share of the area suggests. Doors need mass and seals; windows need two
panes of different thickness, well apart; ventilation needs lined, bending ducts.

$$\text{TL}_\text{composite} = -10\log_{10}\frac{\sum_i S_i\,10^{-\text{TL}_i/10}}{\sum_i S_i}$$

**Challenge.** A 10 m² wall of TL 50 dB with a 2 m² door of TL 25 dB: find the composite,
about 32.7 dB. Replace the door with one of 40 dB and find 46.0 dB. Then leave the 50 dB wall
alone and open a gap of 1 % of its 12 m² area (TL 0): find that the wall drops to 20 dB.
In the main app, the wall view composites doors and windows the same way
(`js/acoustics/wallPlan.js` `wallTransmission`).

### 3. Choose the dimensions for the modes

**Summary.** A budget studio is usually built inside an existing space, so the dimensions are
partly given. Everest's advice is to use what freedom remains (an inner wall, a lowered
ceiling) to spread the axial modes, checked by listing them, as in the *Master Handbook*. A
garage that is twice as long as it is high is a poor start, and a stud wall in the right place
can fix it.

**Challenge.** A garage is $6 \times 3 \times 2.4$ m. Open Modal Response and read Bonello's
verdict ([chapter 3](../03-modal-response.md#bonellos-criterion)), and the **Criteria** tab's
*Axial Spacing (Everest)*: at 343 m/s it finds seven gaps of 28.6 Hz and seven coincident
pairs below 300 Hz. Then let the optimiser move
only the length, as an inner wall would, within 4.5 to 6 m, and find the best length it offers
([chapter 3, the room-size optimiser](../03-modal-response.md#the-room-size-optimiser)).

### 4. Size the treatment by the reverberation equation

**Summary.** Each design is treated by calculation, not by eye. Pick a target reverberation
time for the room's use, compute the absorption needed per band, and choose a mix of
materials (porous panels, panel absorbers, carpet, resonators) that gives it in every band, not
just at mid frequencies. Everest worked in feet and sabins, with $T = 0.049\,V/A$.

**Challenge.** The $6 \times 4.2 \times 2.8$ m room is 70.56 m³, or 2492 ft³ in the
Calculator's **U** tab ([chapter 7](../07-calculator.md#u--units-conversion)). Find the
absorption for 0.5 s in imperial units, $0.049 \times 2492 / 0.5 = 244$ sabins, and convert it
back: 22.7 m², the same as $0.161\,V/T$ gives in metric. Then in Reverb Time, set the **Studio**
criteria and let the area optimiser size two materials to meet it
([chapter 6](../06-reverb-time.md#the-area-optimiser)).

### 5. The control room is designed around the listener

**Summary.** In the control room, the speakers and the mixing position come first and the room
is arranged around them: symmetrical left to right, with the early reflections from the front
of the room absorbed or deflected and the rear of the room kept live and diffusing (Live End
Dead End). The goal is a short time after the direct sound that is free of strong reflections.

**Challenge.** In the main app, place a stereo pair and a mix seat in a symmetric control
room and read the advisor's reflection-free-zone check
([chapter 15 §15.5](../../acoustics/15-advisor.md#155-treatment)). Absorb the side walls at
their first-reflection points ([engine chapter 11](../../acoustics/11-first-reflections.md))
and find which arrival is left as the worst. In chapter 9 §9.7's example it is the floor
bounce, which side-wall treatment cannot reach.

### 6. Build it so it stays built

**Summary.** The book spends as much effort on construction as on acoustics: staggered or
double studs, resilient mounting, sealed joints, heavy doors on good seals, floating floors
where the budget allows. An isolation design that the builder cannot carry out, or that leaks
at one joint, is worth no more than its weakest detail.

**Challenge.** Pick a floor build in the main app's isolation settings and find its natural
frequency ([engine chapter 12 §12.1](../../acoustics/12-isolation.md#121-the-floor-a-mass-on-a-damped-spring)).
For a kick drum at 50 Hz, find the insertion loss of a floating wood floor ($f_0 = 22$ Hz) by
the transmissibility formula there, about 11.6 dB, and compare it with the floating concrete
slab's 22.0 dB.
Say why the lighter floor is so much worse.

## Since then

Later editions kept the book's approach while updating the designs and the equipment around
them. The home studio changed more than the acoustics did: digital recording made the small
room the normal place to record and mix, and commercial absorbers, diffusers and bass traps
replaced much of the home-built treatment. The method (noise survey, isolation to a target,
dimensions for the modes, treatment by calculation, control room around the listener) is what
current small-studio guides still teach.

## In this app

- [Engine chapter 12, Isolation](../../acoustics/12-isolation.md): wall and floor builds,
  `js/acoustics/isolation.js` `wallTl`, `floorLoss`; `js/acoustics/wallPlan.js`
  `wallTransmission` for doors and windows in a wall.
- [Modal Response](../03-modal-response.md): Bonello and the room-size optimiser,
  `js/acoustics/modalDistribution.js` `bonello`, `optimiseDimensions`.
- [Reverb Time](../06-reverb-time.md): criteria and the area optimiser, `classic.js`
  `optimiseAreas`.
- [Engine chapter 11, First reflections](../../acoustics/11-first-reflections.md) and
  [chapter 9 §9.7, The reflection-free zone](../../acoustics/09-echogram-iso3382.md#97-the-reflection-free-zone).
- Modal Response, **Criteria** tab, *Axial Spacing (Everest)*: the axial list and its gaps
  over 20 Hz; `js/acoustx/references.js` `axialCheck`.
- Calculator, **Res** tab, *Resonators*: the panel and Helmholtz absorbers the book builds;
  `references.js` `helmholtz`, `perforated`, `membrane`.
- Calculator, **NC** tab, *Background Noise (NC)*: the NC rating of an octave spectrum you
  type, and targets by room (recording studio NC 15–20); `references.js` `ncRating`,
  `NC_TARGETS`.
- Site noise surveys, ventilation noise, door seals and construction detailing have no
  counterpart in the app.
- 📖 in the app: the groups *Axial Spacing (Everest)*, *Resonators* and *Background Noise
  (NC)* open this report from their pop-up.
