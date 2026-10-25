# 18 · Eargle 1989 — Handbook of Sound System Design

> Eargle, J., *Handbook of Sound System Design*, New York, Elar Publishing, 1989.

**Kind:** engineering handbook. **Read it for:** directivity, critical distance and
coverage, the arithmetic that ties a loudspeaker to the room it plays into.

## What it is

John Eargle (1931–2007) was a recording engineer and a long-time consultant to JBL, and
the author of *The Microphone Book* and *Loudspeaker Handbook*, among others. This book
covers sound reinforcement from the room's point of view: how loudspeaker directivity, the
room's absorption and the listener's distance decide level and intelligibility, and how to
lay out central clusters, distributed ceiling systems and delayed fills. Its equations are
the standard ones of the field, worked through with design examples. Acoustic-X used the
same arithmetic for its room figures, and pointed here for the system-design side.

## Big ideas

### 1. Directivity: Q and DI

**Summary.** A loudspeaker's directivity factor $Q$ is its on-axis intensity divided by
the intensity an omnidirectional source of the same power would give at the same
distance. The directivity index is $\text{DI} = 10\log_{10} Q$. A source on a hard floor
radiates into half space, $Q = 2$; a horn rated for a narrow angle can reach $Q$ = 10–20 or
more. $Q$ changes with frequency: most boxes are near omni in the bass.

**Challenge.** Find the DI for $Q$ = 2, 5 and 10 (3.0, 7.0 and 10.0 dB). Then look up the
app's computed $Q$ for a 90 × 50° horn (18.2, engine chapter 6.5) and work out its DI.

### 2. Direct and reverberant fields

**Summary.** At distance $r$ from a source of sound power level $L_W$, in a room with room
constant $R = S\bar\alpha/(1-\bar\alpha)$, the level is

$$L = L_W + 10\log_{10}\!\left(\frac{Q}{4\pi r^2} + \frac{4}{R}\right)$$

Near the source the first term rules and the level falls 6 dB per doubling of distance.
Far from it the second rules and the level stops falling. The reverberant level depends on
the room's absorption, not on the distance.

**Challenge.** Take $L_W$ = 100 dB, $Q$ = 10, $R$ = 50 m². Find $L$ at 1, 2, 4, 8 and
16 m. You should find 99.4, 94.5, 91.1, 89.7 and 89.2 dB. Repeat with $Q$ = 1 and find
the distance beyond which the two sources give nearly the same level.

### 3. Critical distance

**Summary.** The distance where the two terms are equal is the critical distance,

$$D_c = \sqrt{\frac{QR}{16\pi}} \approx 0.141\sqrt{QR}\ \text{m}$$

Inside $D_c$ the listener hears mostly the loudspeaker. Outside it they hear mostly the
room. Raising $Q$ or the absorption pushes $D_c$ out. A sound system's job is to put the
audience inside $D_c$, or near it.

**Challenge.** With $R$ = 50 m², find $D_c$ for $Q$ = 1 and $Q$ = 10 (1.0 m and 3.2 m).
Then open Ray Tracing's Data View on a $6 \times 4.2 \times 2.8$ m room with
$\bar\alpha = 0.25$ and read its critical distance (1.19 m, at $Q$ = 2). Find the $Q$ a
monitor would need for a listener at 2 m to sit at $D_c$.

### 4. Intelligibility from distance, RT and Q

**Summary.** The book uses Peutz's articulation loss of consonants, which estimates the
percentage of consonants misheard. In metric units, for a listener within about $3D_c$,

$$\%\text{AL}_\text{cons} \approx \frac{200\,r^2\,T^2}{VQ}$$

with $T$ the reverberation time in seconds and $V$ in m³. Below about 10 % speech is good;
above about 15 % it is poor. Distance and reverberation hurt as their squares; a more
directional loudspeaker helps in proportion.

**Challenge.** In a 2000 m³ hall with $T$ = 1.5 s and a $Q$ = 10 cluster, find
%AL$_\text{cons}$ at 10 m (2.25 %) and at 20 m (9.0 %). Then halve $Q$ and find it at
10 m again. Check all three in the Calculator's **PA** tab, *Speech & Gain*: it reads
2.3 %, 9.0 % and, with $Q$ = 5, 4.5 %, to one decimal. The main app computes the STI
instead, from the echogram (engine chapter 6.7). Compare a talker pair's STI at two distances
there.

### 5. Potential acoustic gain

**Summary.** A system with a live microphone can only be turned up until it feeds back.
The book treats acoustic gain in the standard way: the gain available before feedback
depends on four distances (talker to microphone, microphone to loudspeaker, loudspeaker
to listener, talker to listener), the number of open microphones, and a feedback margin,
usually 6 dB:

$$\text{PAG} = 20\log D_0 - 20\log D_s + 20\log D_1 - 20\log D_2 - 10\log\text{NOM} - 6$$

The single most useful move is to bring the microphone closer to the talker.

**Challenge.** Take $D_0$ = 20 m, $D_s$ = 0.6 m, $D_1$ = 6 m, $D_2$ = 10 m and one
microphone. Find PAG (20.0 dB). Halve $D_s$ and find the new figure. Check both in the
Calculator's **PA** tab, *Speech & Gain*: 20.0 and 26.0 dB. With an EAD of 3 m the needed
gain is 16.5 dB, so both settings work. The app has no feedback model beyond this equation.

### 6. Coverage: the −6 dB edge

**Summary.** A loudspeaker's coverage angle is where its level is 6 dB below on-axis.
Constant-directivity horns hold that angle over a wide band. For distributed ceiling
loudspeakers the spacing follows from the coverage angle $\theta$ and the height $h$ of
the loudspeaker above the ears: edge to edge, $s = 2h\tan(\theta/2)$; for smoother
coverage, closer.

**Challenge.** A 3.0 m ceiling, ears at 1.2 m, a 90° loudspeaker: find the edge-to-edge
spacing (3.6 m). Then for a 60° loudspeaker (2.1 m). The Calculator's **PA** tab, *Ceiling
Speakers*, reads 3.60 m and 2.08 m edge to edge, with the overlap and centre-to-centre
spacings beside them. In the main app, set a speaker's
pattern to horn with 90° coverage and check at 22.5°, 45° and 67.5° off axis that the
pattern reads −0.4, −6 and −30 dB.

### 7. Delay loudspeakers and precedence

**Summary.** A fill loudspeaker partway down a room is delayed so that its sound arrives
just after the sound from the main system. By the precedence effect (Haas, [report
7](07-haas-1972-single-echo.md)) the listener then locates the sound at the stage, even if
the fill is louder. The delay is the path difference over $c$, plus about 10–20 ms.

**Challenge.** A fill sits 17.15 m in front of the main cluster. Find the delay that
aligns them (50 ms), and the setting you would use with a 10 ms precedence margin. In the
main app each speaker has a delay (`delayMs`) that the wave method applies; set it on a
second speaker and find the comb the misaligned pair makes at a seat between them.

## Since then

Line arrays, from the 1990s on, changed large-room design: their vertical directivity is
steered and their level falls more slowly than 6 dB per doubling in the near field.
AL$_\text{cons}$ has given way to the STI (IEC 60268-16), which is measured directly. The
Hopkins–Stryker model and the critical distance are still the first estimate, before
prediction software with measured loudspeaker data. Eargle and Foreman's *Audio
Engineering for Sound Reinforcement* (2002) carried the book's material forward.

## In this app

- [Engine chapter 6.5, Directivity](../../acoustics/06-sources-receivers.md#65-directivity):
  `js/acoustics/patterns.js` `directivityQ`, `shapeGain` (the horn's −6 dB edge).
- [Engine chapter 8.2, Energy method](../../acoustics/08-field-methods.md#82-energy-method-direct--diffuse):
  `field.js` `energyAt`, the direct-plus-reverberant level.
- [Engine chapter 9.4, Critical distance](../../acoustics/09-echogram-iso3382.md#94-critical-distance):
  `analysis.js` `criticalDistance`; [Ray Tracing, Room figures](../05-ray-tracing.md#room-figures-data-view):
  `classic.js` `roomFigures`.
- [Engine chapter 6.7, Talkers](../../acoustics/06-sources-receivers.md#67-talkers--every-person-speaks-every-person-hears):
  `intelligibility.js` `mtfOfEnergy`, `stiFromMtf` (STI, not AL$_\text{cons}$).
- Calculator, **PA** tab, *Speech & Gain*: %AL$_\text{cons}$ with its 9 $T$ limit past
  $3.16\,D_c$, and PAG against NAG; *Ceiling Speakers*: edge-to-edge, overlap and
  centre-to-centre spacing. `js/acoustx/references.js` `alcons`, `acousticGain`,
  `ceilingSpacing`.
- Calculator, **Spk** tab, *Electrical Levels*: dBu and dBV of a voltage, and the SPL from
  sensitivity, power and distance; `references.js` `electrical`, `splFromPower`.
- Not in the app: feedback itself (only the PAG equation), and an electrical chain beyond those
  levels.
- 📖 in the app: the groups *Inverse Square Law*, *Speech & Gain*, *Ceiling Speakers* and
  *Electrical Levels* open this report from their pop-up.
