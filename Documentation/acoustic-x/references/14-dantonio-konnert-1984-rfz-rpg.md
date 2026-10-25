# 14 · D'Antonio & Konnert 1984 — The RFZ/RPG Approach to Control Room Monitoring

> D'Antonio, P. and Konnert, J. H., "The RFZ/RPG Approach to Control Room Monitoring",
> 76th Convention of the Audio Engineering Society, New York, October 1984, Preprint 2156.
> Some later bibliographies give the number as 2157. We could not check it, so the manual's
> number is kept.

**Kind:** convention paper. **Read it for:** the control-room layout that the SBIR window's
listening window and specular absorbers are built to check.

## What it is

Peter D'Antonio and John Konnert were diffraction scientists who turned to room acoustics
and founded RPG Diffusor Systems in 1983. This paper puts two ideas together into one
control-room design. The front of the room is shaped so that no early reflection reaches
the mix position: the **reflection-free zone** (RFZ). The back of the room is covered with
**reflection phase gratings** (RPG), Schroeder-type diffusers that send a dense, diffuse
field back to the listener a little later. The paper answered the LEDE (live end, dead end)
rooms of the Davises, which reached a similar result with absorption at the front. This
report keeps to the ideas the paper is known for, not its section detail.

## Big ideas

### 1. Keep the first 20 ms clean at the seat

**Summary.** A reflection that arrives within a few milliseconds of the direct sound combs
the response and blurs the stereo image. If no strong reflection arrives in that window,
the engineer hears the loudspeaker and the recording, not the room. The RFZ is the volume
around the mix position where that holds. Its usual numbers are no reflection louder than
about −20 dB, relative to the direct sound, inside the first 15–20 ms. The app's test uses
20 ms and −20 dB.

**Challenge.** A side-wall reflection travels 2 m direct and 3 m reflected. Spreading alone
puts it at $20\log_{10}(2/3) = -3.5$ dB. Find how long the reflected path would need to be
for spreading alone to reach −20 dB (ten times the direct path, 20 m), and so why a small
room must redirect or absorb the reflection instead. Then load the room library's *RFZ
trapezoid control room* in the main app and read the advisor's reflection-free-zone line.

### 2. Redirect the early reflections, don't only absorb them

**Summary.** LEDE killed the early reflections with absorption on the front half of the
room. The RFZ room tilts and splays the front walls and ceiling instead, so the specular
reflections from the monitors pass behind or around the listener. The mirror construction
decides it: if the image of the speaker in a surface, joined to the listener, does not
cross that surface, the surface sends no first reflection to the seat. Less of the room has
to be dead, and the treatment that remains does a narrower job.

**Challenge.** Open Speaker Boundary Interference on a $6 \times 4.2 \times 2.8$ m box with
the default listening window. Note the side-wall and ceiling absorber areas it reports.
Widen the window from 1 m to 1.5 m and find how much each absorber grows. In a splayed RFZ
plan those panels would not be needed: the walls themselves turn the reflection aside.

### 3. Monitors in the front wall

**Summary.** RFZ rooms put the main monitors flush in the front wall, so the wall becomes
the loudspeaker's baffle. There is then no wall behind the box to reflect its rear and
side radiation, and the boundary notch of [report 16](16-berger-1984-sbir.md) moves far
above the range that matters. The front of the room becomes one hard, shaped surface with
the speakers set into it.

**Challenge.** In Speaker Boundary Interference, put Speaker 1 0.5 m from the front wall
and note the notch near $c/4d = 172$ Hz. Move it to 0.05 m. Find where $c/4d$ goes now
(1715 Hz, far above the 300 Hz the window scores), and what happens to the deviation below
300 Hz.

### 4. A diffuse field from the back, after a gap

**Summary.** A room with no reflections at all sounds dead and tiring. The RFZ room gives
back the energy it removed, but later and from many directions. The rear wall's diffusers
return sound after the direct sound has passed and the gap has closed, spread in time and
angle, so it reads as ambience, not as an echo or a comb. The delay between direct sound
and the first strong return plays the part of the initial time-delay gap of a concert hall
(Beranek, [report 9](09-beranek-1962-music-acoustics-architecture.md)).

**Challenge.** The listener sits 2.5 m from the rear wall. The return from the back
travels about twice that, 5 m, further than the direct sound. Find its delay ($5/343 =
14.6$ ms) and decide whether it lies inside or outside the 20 ms window. Then run Ray
Tracing with the listener at that distance and look for the rear-wall arrival on the
energy-time chart and in the polar plot.

### 5. Judge the room by its energy–time curve

**Summary.** RPG's papers of this period argued from measured energy–time curves, not from
reverberation time. RT60 says how long a room rings. It cannot say whether the first 20 ms
at the seat are clean. The design is right when the curve at the mix position shows the
direct sound, a quiet gap, and then a dense, smoothly decaying return.

**Challenge.** In the main app, place a pair of monitors and a mix seat in a bare
rectangular room and read the echogram (engine chapter 9). Find the earliest specular
arrival and its level. Add absorber panels at the mirror points (the automatic reflection panels) and find
which arrival is now the worst. If it is the floor bounce, explain why wall panels cannot
remove it.

## Since then

Cox and D'Antonio's *Acoustic Absorbers and Diffusers* (2004, later editions) gives the
diffuser theory behind the RPG half in full. Listening-room standards adopted a milder
form of the RFZ rule: ITU-R BS.1116 asks that early reflections in the first 15 ms be at
least 10 dB below the direct sound. The debate continues on how much early lateral energy
a listener actually dislikes. Toole and others found some lateral reflections harmless or
preferred, while the non-environment school removes almost everything. The RFZ shape
itself, a splayed front with flush monitors, is still one of the standard control-room
plans.

## In this app

- [Engine chapter 9.7, The reflection-free zone](../../acoustics/09-echogram-iso3382.md#97-the-reflection-free-zone);
  `js/acoustics/analysis.js` `reflectionFreeZone` (20 ms, −20 dB), reported by the advisor
  (`advisor.js`).
- [SBIR, The valid listening window and the specular absorbers](../04-sbir.md#the-valid-listening-window-and-the-specular-absorbers);
  `js/acoustx/classic.js` `specularAbsorbers`.
- [Engine chapter 11, First reflections and panel placement](../../acoustics/11-first-reflections.md);
  `js/acoustics/reflectionPanels.js` `firstReflections`, `reflectionPanels`.
- [Engine chapter 14.5, The room library](../../acoustics/14-layouts-placement.md#145-the-room-library):
  `roomLibrary.js` carries an RFZ trapezoid and a LEDE control room.
- Ray Tracing, **Time** tab, *Precedence & Echo (Haas)*: the initial-time-delay gap and the
  reflections that fuse with the direct sound at the seat; `js/acoustx/references.js`
  `haasCheck`.
- Calculator, **QRD** tab, *QRD Diffuser*: the well depths and working band of the rear-wall
  diffuser; `references.js` `qrd`.
- The app has no direct model of the rear-wall diffuse return as a designed field. The
  echogram's diffuse rain (engine chapter 9.1) is the nearest thing.
- 📖 in the app: the groups *Valid Listening Window*, *Specular Absorbers*, *Precedence & Echo
  (Haas)* and *QRD Diffuser* open this report from their pop-up.
