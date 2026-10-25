# 5 · Sepmeyer 1965 — Computed Frequency and Angular Distribution of the Normal Modes of Vibration in Rectangular Rooms

> Sepmeyer, L. W., "Computed Frequency and Angular Distribution of the Normal Modes of
> Vibration in Rectangular Rooms", *J. Acoust. Soc. Am.*, Vol. 37, No. 3, March 1965,
> pp. 413–423.

**Kind:** journal paper, 11 pages. **Read it for:** the three Sepmeyer ratios, A, B and C,
at the top of Acoustic X's favourable-ratio list, and the idea that modes have directions
as well as frequencies.

## What it is

L. W. Sepmeyer, an American acoustical consultant, used a digital computer to do
what Bolt ([report 1](01-bolt-1946-normal-frequency-statistics.md)) could only sample:
list every normal mode of many rectangular rooms and study how the modes are spread, in
frequency and in direction. From that he picked out proportions that spread the modes well.
The three he recommended, 1 : 1.14 : 1.39, 1 : 1.28 : 1.54 and 1 : 1.60 : 2.33, are the
most quoted room ratios in studio design. Acoustic-X put all three at the top of its list.
This report covers the paper's main themes rather than its tables in detail.

## Big ideas

### 1. Let the machine list every mode

**Summary.** The mode frequencies of a box are simple to compute, but there are many of
them: about 90 below 200 Hz in a modest control room. By hand, a designer checks a few
axial modes and stops. Sepmeyer computed complete lists for many proportions and looked at
the whole set, axial, tangential and oblique together. That turned the choice of ratio from
an argument into a comparison of data.

**Challenge.** In Modal Response, apply Sepmeyer A with $H = 2.7$ m (about
$3.75 \times 3.08 \times 2.7$ m). Open the Data view and count the modes below 200 Hz of
each type. Then do the same for a $2.7 \times 2.7 \times 5.4$ m room (1 : 1 : 2) and find
the coincident groups the report lists. The 1 : 1 : 2 room fails Bonello on two falling
bands and two coincident groups.

### 2. Every mode has a direction

**Summary.** A mode is a standing wave, the sum of plane waves travelling back and forth.
Mode $(n_x, n_y, n_z)$ is made of waves along the directions

$$\left(\pm\frac{n_x}{L},\ \pm\frac{n_y}{W},\ \pm\frac{n_z}{H}\right)$$

An axial mode runs along one axis. A tangential mode runs at an angle in a plane parallel
to one pair of surfaces. An oblique mode runs at an angle to all three. Sepmeyer charted
these angles as well as the frequencies. A room whose low modes all run along a few
directions has a sound field that is far from diffuse, even if the frequencies are well
spread.

**Challenge.** For a $6 \times 4.2 \times 2.8$ m room, find the angle of mode 110 from the
length axis in plan, $\arctan\big((1/4.2)/(1/6)\big)$: about 55.0°. Do the same for mode
210: about 35.5°. Then find the elevation of mode 111 above the floor plane: about 50.9°.
Check all three in Modal Response's Data View, whose mode table rounds them to whole degrees
in its Az° and El° columns: 55°, 36° and 51°. Then read the **Criteria** tab's *Mode
Directions (Sepmeyer)* table, which counts the modes below 200 Hz in each 15° band of
elevation and of azimuth.

### 3. The three ratios

**Summary.** From his computations Sepmeyer recommended three ratios:

| | H : W : L |
|---|---|
| A | 1 : 1.14 : 1.39 |
| B | 1 : 1.28 : 1.54 |
| C | 1 : 1.60 : 2.33 |

Each avoids the coincidences of simple-integer ratios over the low modes and spreads them
fairly evenly in both frequency and direction.

**Challenge.** In the Room tab, apply each ratio at $H = 2.7$ m and read the Bonello check.
You should find that A and B pass, and C fails: its 31.5 Hz band holds no mode while the
25 Hz band holds one. Then check each against ITU-R BS.1116 in the same tab. Sepmeyer A
fails it: the rule needs $L/H \le 4.5\,W/H - 4 = 1.13$, and $L/H$ is 1.39.

### 4. A ratio is good at some sizes, not all

**Summary.** A ratio fixes the pattern of modes. The volume fixes where that pattern lands
on the frequency axis. Sepmeyer's ratios were chosen from the pattern. When the room is
scaled, the pattern slides across the fixed ⅓-octave bands, and a coincidence that was
harmless in a crowded band can land in a thin one.

**Challenge.** Apply Sepmeyer A at $H = 2.4$, 2.7, 3.0 and 3.5 m. Find that it passes
Bonello at every height but 3.0 m. There, modes 201 and 020 coincide at about 100.2 Hz in a
100 Hz band holding only four modes. Show by hand that this pair coincides at every size:
with $L = 1.39H$ and $W = 1.14H$, mode 201 sits at $\tfrac{c}{2H}\sqrt{(2/1.39)^2 + 1}
\approx 1.752\,\tfrac{c}{2H}$ and mode 020 at $\tfrac{c}{2H}(2/1.14) \approx 1.754\,
\tfrac{c}{2H}$, 0.1 % apart. Only the band it lands in decides whether it counts. Try 2.9 m
(it still fails, at 103.7 Hz) and 3.1 m (it passes).

## Since then

Sepmeyer's ratios entered every studio handbook, Everest's among them ([report
12](12-everest-1989-master-handbook.md)). His angular view had less influence. Most later
criteria, Louden's and Bonello's ([reports 4](04-louden-1971-dimension-ratios.md) and
[6](06-bonello-1979-room-mode-criterion.md)), judge frequency alone. Cox, D'Antonio and
Avis (*J. Audio Eng. Soc.* 2004) reviewed the published ratios and found that none is best
once the source and listener are placed. Diffuse-field studies today use measured or
simulated sound fields rather than mode angles.

## In this app

- [Modal Response, Favourable ratios](../03-modal-response.md#favourable-ratios);
  `js/acoustics/modalDistribution.js` `FAVOURABLE_RATIOS` (Sepmeyer A, B, C).
- [Modal Response, Room modes](../03-modal-response.md#room-modes);
  `js/acoustx/classic.js` `modeFreq`, `modeType`;
  `modalDistribution.js` `modeList`, `coincidentModes`, `bonello`, `ituBs1116`.
- [Engine chapter 5, Published ratios](../../acoustics/05-modes.md#54-published-ratios).
- [Engine chapter 14, The room library](../../acoustics/14-layouts-placement.md#145-the-room-library):
  a Sepmeyer A room, `js/acoustics/roomLibrary.js`.
- Modal Response, Data View: azimuth and elevation of every mode below 200 Hz in the mode
  table (Az°, El°); `js/acoustx/references.js` `modeAngles`.
- Modal Response, **Criteria** tab, *Mode Directions (Sepmeyer)*: the angular distribution,
  modes per 15° of elevation and of azimuth; `references.js` `angularDistribution`. It counts;
  it does not score a ratio by its spread in angle.
- 📖 in the app: the groups *Favourable Room Ratios* and *Mode Directions (Sepmeyer)* open
  this report from their pop-up.
