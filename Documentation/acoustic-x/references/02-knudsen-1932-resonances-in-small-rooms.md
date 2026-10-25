# 2 · Knudsen 1932 — Resonances in Small Rooms

> Knudsen, V. O., "Resonances in Small Rooms", *J. Acoust. Soc. Am.*, July 1932,
> pp. 20–27.

**Kind:** journal paper, 8 pages. **Read it for:** why a small room is judged by its modes
and not by a single reverberation time.

## What it is

Vern Knudsen, of UCLA and a founder of the Acoustical Society of America, wrote this early
in the life of the society's journal. Room acoustics then meant Sabine: one reverberation
time per room, computed from volume and absorption. Knudsen showed that this picture breaks
down in small rooms at low frequencies. There, a room behaves like a set of resonators, and
the sound depends on how close a tone falls to one of them. Broadcast and recording studios
were being built in large numbers, and many were small. Acoustic-X cites the paper as an
origin of the small-room mode problem its Modal Response window addresses. This report
covers the paper's main themes rather than its measurements in detail.

## Big ideas

### 1. A small room is a set of resonators

**Summary.** The air in a closed room has natural frequencies, the normal modes. In a large
room they are so dense that any tone excites many at once and the room responds evenly. In
a small room the low modes are few and far apart. A tone near one of them is reinforced,
and a tone between two of them is not. The low-frequency response is a row of peaks, not a
smooth curve.

**Challenge.** Open Modal Response on a $3 \times 2.5 \times 2.4$ m booth and list the
modes below 120 Hz in the Data view. You should find eight, from 57.2 Hz (100) to 114.4 Hz
(111). Below 57 Hz the booth has no mode at all. Work out the 100 mode by hand,
$343 / (2 \cdot 3)$, and check it.

### 2. Reverberation time stops being one number

**Summary.** Sabine's formula assumes the sound decays the same way everywhere and at every
frequency. In a small room each mode decays at its own rate, set by the absorption on the
surfaces it involves. A tone that excites two close modes gives a decay curve that beats.
So a measured "reverberation time" at low frequency in a small room depends on the exact
frequency, the source position and the microphone position. Knudsen used this to explain
why measurements in small rooms scatter.

**Challenge.** A mode decaying with reverberation time $T$ has a half-power bandwidth of
about $B = 2.2 / T$ Hz. For $T = 0.3$ s, find $B$: about 7.3 Hz. Now find the mean mode
spacing in the booth of idea 1 from Bolt's density
([report 1](01-bolt-1946-normal-frequency-statistics.md)) at 80 Hz: about 10.9 Hz. The
modes are spaced wider than they are wide, so they are heard one by one. Repeat at 200 Hz:
the spacing falls to about 2.9 Hz and the modes overlap.

### 3. Equal dimensions make it worse

**Summary.** When two dimensions are equal or in simple ratio, their modes land on the same
frequencies. The peaks add, and the gaps between them widen. Small rooms built as cubes or
near-cubes are the worst case. Knudsen's practical advice was to avoid equal and simply
related dimensions and to add low-frequency absorption. Later handbooks, including his own
with Harris (*Acoustical Designing in Architecture*, 1950), turned that advice into ratio
charts.

**Challenge.** In the Room tab, set a 3 m cube. Find the coincident groups below 120 Hz:
three-fold at 57.2, 80.8 and 114.3 Hz. Then go back to $3 \times 2.5 \times 2.4$ m and
check that its two near-coincident modes, 200 and 111 at 114.3 and 114.4 Hz, do not fail
Bonello, because the 125 Hz band holds five modes. The booth still fails Bonello for another
reason: find it in the report (the 80 Hz band holds 1 mode, fewer than the 2 below it).

### 4. Where you sit decides what you hear

**Summary.** A mode has a pressure pattern: high at the walls and corners, zero on its
nodal planes. A source on a node cannot drive that mode, and a listener on a node cannot
hear it. In a small room, moving the microphone or the loudspeaker by a fraction of a metre
changes the low-frequency response by many decibels. This is part of why small-room
measurements scatter, and it is the basis of all later advice on placing the listener.

**Challenge.** In the booth, the 100 mode has its node at mid-length, 1.5 m. Find
$\cos(\pi Y / L)$ for a listener at $Y = 1.14$ m (38 % of 3 m). You should get about 0.37:
that mode is heard, but at about −8.7 dB of its wall value. In Modal Response, Mode 1, show
mode 100 on a horizontal plane and find the dark band at 1.5 m.

## Since then

Knudsen's picture became standard. Morse and Bolt gave it the full wave theory in the 1930s
and 1940s. Schroeder (1954, 1962) put a number on the boundary between the modal and the
statistical room, $f_S = 2000\sqrt{T/V}$. For the booth with $T = 0.3$ s that is about 260
Hz. Modern small-room practice follows from this paper's conclusion: below $f_S$, judge the
room by its modes and its seat, and damp the modes with low-frequency absorbers.

## In this app

- [Modal Response, Room modes](../03-modal-response.md#room-modes);
  `js/acoustx/classic.js` `modeFreq`, `modeType`.
- [Engine chapter 5, Modes of a rigid box](../../acoustics/05-modes.md#51-modes-of-a-rigid-box);
  `js/acoustics/room.js` `allModes`, `axialModes`, `nullFractions`.
- [Engine chapter 8, Modal method](../../acoustics/08-field-methods.md#83-modal-method):
  modes damped by the Eyring time, $\delta = 6.91/T$; `js/acoustics/field.js`
  `prepareModal`, `modalDb`.
- [Schroeder frequency](../../acoustics/04-reverberation.md#43-schroeder-frequency);
  `room.js` `schroeder`.
- Modal Response, Data View: the mode table's T60 column gives each mode its own decay, from
  the walls it presses on (α at 125 Hz, after Morse and Bolt); `js/acoustx/references.js`
  `modeDecay`. With even absorption, an axial mode rings longest.
- Modal Response, **Mode 1** tab, *Mode Decay (Knudsen)*: the chosen mode, or the band of
  modes, struck together and left to ring, beating where modes are close; `references.js`
  `bandDecay`.
- The engine's modal method still damps every mode of a band alike, with the one Eyring time.
- 📖 in the app: the groups *Enter Input Data* and *Mode Decay (Knudsen)* open this report
  from their pop-up.
