# 26 · Cooper 1988 — Building a Recording Studio

> Cooper, J., *Building a Recording Studio*, Los Angeles, Synergy Group, 1988. The author is
> Jeff Cooper; the book went through several editions, and the manual cites the 1988 one.

**Kind:** practical construction guide. **Read it for:** how a studio is actually built so
that it isolates, and how its rooms are shaped and treated.

## What it is

Jeff Cooper was a Los Angeles studio designer and architect, and his book was written for
studio owners and builders rather than acousticians. It walks through the decisions in the
order a project meets them: what the studio must keep in and out, how walls, floors,
ceilings, doors and windows are built to do that, how the control room and studio are
shaped, how they are treated, and how air gets in and out quietly. We could not check the
1988 edition page by page, so this report covers the book's main themes as a construction
guide of this kind reliably presents them. Acoustic-X cited it as the builder's companion to
the design tools.

## Big ideas

### 1. Isolation needs mass, airtightness and decoupling

**Summary.** Sound through a wall is stopped by mass, by breaking the structural path
between its two sides, and by sealing every gap. The third matters most in practice: the
transmitted energy is an area-weighted sum, so a small opening lets through more than the
whole wall around it. The composite transmission loss of parts with areas $S_i$ and losses
$\text{TL}_i$ is

$$\text{TL} = -10\log_{10}\frac{\sum_i S_i\,10^{-\text{TL}_i/10}}{\sum_i S_i}$$

**Challenge.** A 50 dB wall with 1 % of its area open (TL 0 dB): find the composite TL by
hand (about 20 dB). Repeat with 0.1 % open (about 30 dB). Then in the main app, put a window
in a wall shared with the house and find how much the wall's rating drops.

### 2. Float the room inside the building

**Summary.** For the best isolation the studio is a room within a room: an inner shell on
its own floor, on resilient mounts, touching the outer building nowhere. The mounts and the
inner mass form a spring–mass system that isolates only well above its natural frequency,
so the lower $f_0$ the better, and any rigid bridge undoes it.

**Challenge.** With the app's floor model ($\zeta = 0.1$), find the insertion loss at
50 Hz of a floor with $f_0 = 22$ Hz (floating wood, about 12 dB), 12 Hz (floating slab,
about 22 dB) and 6 Hz (room-in-room on springs, about 31 dB). Then set the room-in-room
build in the main app and read how much its second leaf adds to the wall's TL.

### 3. Shape the room before treating it

**Summary.** Room proportions decide how the bass modes fall; cubes and simple multiples
are worst. Parallel hard walls produce flutter echo, a rapid repeat at $c/2d$. Splaying one
wall of each pair, even a few degrees, or treating one surface of the pair, breaks it up.

**Challenge.** In Modal Response, compare a $4 \times 4 \times 4$ m cube with a room of the
same height in the Louden ratio, and find which fails Bonello. Then compute the flutter
repetition rate between side walls 4.2 m apart (about 41 Hz), and in the main app find
whether the advisor flags that pair when both walls are bare.

### 4. The control room is symmetric about the mix position

**Summary.** The monitors and the engineer form a symmetric layout, so left and right hear
the same room. The speakers form an equilateral triangle with the listening position, and
early reflections from the side walls, ceiling and console are controlled so that the
direct sound arrives clean. In the 1980s this was argued as Live End–Dead End and, from
1984, the reflection-free zone ([report 14](14-dantonio-konnert-1984-rfz-rpg.md)).

**Challenge.** In the main app, set the mix seat at 38 % of the room length and centred,
put the monitors in a 60° triangle, and read the advisor's reflection-free-zone finding.
Absorb the side-wall first-reflection points and find whether the worst remaining arrival
is the console or floor bounce.

### 5. Treat for balance, not for deadness

**Summary.** A room covered in thin absorber is dead in the treble and still boomy in the
bass. Treatment is a balance: deep or resonant absorbers for the bass, broadband absorbers
where reflections must go, diffusion where the room should stay live. The target is a
reverberation time suited to the room's use, roughly even across the bands.

**Challenge.** In Reverb Time, lay the database's 1 in (25 mm) porous acoustic foam over
most of the walls of a $6 \times 4.2 \times 2.8$ m room and read the RT per band against the Studio criteria. Find
which bands fall below the criteria and which stay above. Then let the area optimiser
choose areas of a thin and a deep absorber, and compare.

### 6. Air without noise

**Summary.** A sealed studio needs ventilation, and a duct is a hole in the isolation. The
remedy is slow air, lined ducts with bends, and silencers where the duct crosses a wall,
with the background noise held to a low noise-criterion (NC) curve.

**Challenge.** By hand: for a fixed airflow, halving the duct velocity doubles the duct
area. Find what diameter a round duct needs to carry 0.1 m³/s at 2.5 m/s (about 0.23 m).
The app does not model ventilation. Once the duct's noise is known per octave, the
Calculator's **NC** tab rates it against the NC curves; its target for a recording studio is
NC 15–20.

## Since then

The isolation principles are unchanged and are now standard in every studio design book,
for example Rod Gervais's *Home Recording Studio: Build It Like the Pros* (2006) and Philip
Newell's *Recording Studio Design* (from 2003). Control-room design moved toward
non-environment rooms in some studios and toward the RFZ approach in most, with
diffusers made routine by [D'Antonio and Konnert](15-dantonio-konnert-1986-new-materials.md).
Noise criteria moved toward NCB and RC curves for ventilation noise.

## In this app

- Idea 1: [engine chapter 12.2, walls](../../acoustics/12-isolation.md#122-walls-transmission-loss-per-band)
  and [12.3, level in the house](../../acoustics/12-isolation.md#123-level-in-the-house);
  `js/acoustics/wallPlan.js` `wallTransmission` (the composite of the wall and its windows),
  `stcRating`; `js/acoustics/isolation.js` `houseLeak`.
- Idea 2: [engine chapter 12.1, the floor](../../acoustics/12-isolation.md#121-the-floor-a-mass-on-a-damped-spring);
  `isolation.js` `transmissibility`, `floorF0`, `wallTl`.
- Idea 3: [Modal Response](../03-modal-response.md#bonellos-criterion);
  [engine chapter 9.5, flutter-echo risk](../../acoustics/09-echogram-iso3382.md#95-flutter-echo-risk)
  (`js/acoustics/analysis.js` `flutterRisk`).
- Idea 4: [engine chapter 15.2, the listening position](../../acoustics/15-advisor.md#152-the-listening-position-mix-seat)
  and [15.5, treatment](../../acoustics/15-advisor.md#155-treatment) (`js/acoustics/advisor.js`
  `advise`, `analysis.js` `reflectionFreeZone`); [SBIR, the listener and the angles](../04-sbir.md#the-listener-and-the-angles).
- Idea 5: [Reverb Time](../06-reverb-time.md) (`classic.js` `optimiseAreas`); the advisor's
  thin-absorber warning.
- Idea 6: Calculator, **NC** tab, *Background Noise (NC)*: the NC rating of an octave
  spectrum you type, the band that sets it, and targets by room; `js/acoustx/references.js`
  `ncRating`, `NC_CURVES`, `NC_TARGETS`. The app has no ventilation or duct model to
  produce that spectrum.
- 📖 in the app: the group *Background Noise (NC)* opens this report from its pop-up.
