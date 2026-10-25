# 7 · Haas 1972 — The Influence of a Single Echo on the Audibility of Speech

> Haas, H., "The Influence of a Single Echo on the Audibility of Speech", *J. Audio Eng.
> Soc.*, Vol. 20, No. 2, March 1972, pp. 146–159. English translation of "Über den Einfluss
> eines Einfachechos auf die Hörsamkeit von Sprache", *Acustica*, Vol. 1, 1951, pp. 49–58.
> The manual prints the author's name as "Hass"; it is Haas.

**Kind:** journal paper (a translated dissertation paper), 14 pages. **Read it for:** the
"Haas effect": why an early reflection is heard as part of the direct sound, and how late
and how loud it may be before it is heard as an echo.

## What it is

Helmut Haas did this work for his doctorate at Göttingen, under Erwin Meyer, and published
it in German in 1951. Listeners heard speech from two loudspeakers, one carrying the direct
sound and one a delayed copy, and judged where the sound came from, how loud the echo
seemed, and whether it disturbed them. The results became the basis of sound
reinforcement with delayed loudspeakers, and of the reflection-free time window used in
control-room design. The *Journal of the Audio Engineering Society* printed the English
translation in 1972, which is why Acoustic-X cites that year. This report covers the
paper's main results rather than its data in detail.

## Big ideas

### 1. The first arrival sets the direction

**Summary.** When the same sound reaches a listener twice, a short time apart, it is heard
as one sound, and it seems to come from the direction of the first arrival. Haas found that
for speech this fusion holds for delays up to about 30 ms. The delayed sound adds loudness
and a sense of fullness, but not a second source. This is the precedence effect, also
called the law of the first wavefront. Below about 1 ms the two arrivals instead pull the
image between them, which is how stereo panning works.

**Challenge.** Convert the two limits to path differences with $c = 343$ m/s: 1 ms is about
0.34 m and 30 ms about 10.3 m. In the Ray Tracing window, put the listener 2 m from a
speaker in a $6 \times 4.2 \times 2.8$ m room, run the trace and step through the arrivals
with **Next**. Find the last first-order reflection and read its arrival time: is it inside
30 ms? In a room of this size, find whether any first-order reflection can be later than
30 ms.

### 2. The echo may be louder than the direct sound

**Summary.** Within the fusion window the delayed sound can be made stronger than the
direct sound before the listener judges it the louder of the two. Haas found that, for
delays of roughly 10 to 30 ms, the echo could be up to about 10 dB above the direct sound
before the two seemed equally loud. That is the result sound reinforcement rests on: delay
a loudspeaker so the talker's own voice arrives first, and the loudspeaker can be the louder
source while the audience still hears the voice coming from the talker.

**Challenge.** A listener sits 12 m from a talker and 4 m from a reinforcement loudspeaker.
Work out the two arrival times: about 35.0 ms from the talker and 11.7 ms from the
loudspeaker. Find the delay that makes them equal (about 23.3 ms), then add 10 ms so the
talker leads: about 33.3 ms. In the main app, the layout alignment
([chapter 14](../../acoustics/14-layouts-placement.md#checking-a-layout)) delays nearer
speakers to arrive *with* the farthest. Say why that is the right aim for a monitoring
array and the wrong one for speech reinforcement.

### 3. Longer delays are heard as echoes, and disturb

**Summary.** As the delay grows past the fusion window, the second arrival is heard as a
separate echo, and the proportion of listeners it disturbs rises with both its delay and
its level. Haas found that the tolerable delay depends on the speech: fast speech fills the
gaps an echo would otherwise sit in, so it tolerates less. Reverberation in the listening
room also masks an echo and makes it less disturbing. The figure often quoted from this
work is about 50 ms, beyond which a strong single reflection is likely to be heard as an
echo in speech.

**Challenge.** In a hall, a listener sits 3 m from the talker, and the back wall is 20 m
behind the listener. Compute the extra path of the back-wall reflection: 40 m, so it
arrives about 117 ms after the direct sound. Name two treatments: absorb the back wall, or
tilt it to send the reflection into the audience near the wall, where the extra path is
short. The app has no echo-disturbance check of this kind. The nearest measures are $C_{50}$
and $D_{50}$ in the echogram, which count energy before and after 50 ms.

### 4. In a small room the problem is colour, not echo

**Summary.** In a control room every early reflection arrives well inside Haas's fusion
window. None is heard as an echo. What remains is that each strong reflection, added to the
direct sound, makes a comb filter that colours the sound and blurs the stereo image. Later
control-room designs used Haas's window as a design target: keep the first 15 to 20 ms free
of strong reflections, so that the first reflections the ear hears come late and from the
room as a whole. That is the reflection-free zone of D'Antonio and Konnert ([report
14](14-dantonio-konnert-1984-rfz-rpg.md)).

**Challenge.** In the Calculator's Comb tab, enter a reflection 5 ms late. Find the first
three nulls (100, 300 and 500 Hz) and the spacing (200 Hz). Then in the Ray Tracing window,
read the Energy / Time chart and its 10 dB window, and count the arrivals in the first 20 ms
that sit less than 10 dB under the direct sound. In the main app, read the advisor's
*Reflection-free zone* line for the same seat.

## Since then

Wallach, Newman and Rosenzweig (1949) had described the precedence effect a little earlier
in the United States, and later reviews (Litovsky and others, *J. Acoust. Soc. Am.* 1999)
showed that the echo threshold depends strongly on the signal: a few milliseconds for
clicks, tens of milliseconds for speech and music. The "Haas effect" is still the working
rule for delayed loudspeakers. The 50 ms boundary entered room acoustics as the split in
Thiele's *Deutlichkeit* $D_{50}$ and in $C_{50}$, both now in ISO 3382-1.

## In this app

- [Ray Tracing, The charts](../05-ray-tracing.md#the-charts): the 10 dB window and the
  15–20 ms aim; `js/acoustx/classic.js` `traceRays`.
- [Calculator, Comb](../07-calculator.md#comb--comb-filter-nulls); `classic.js`
  `combNulls`.
- [Engine chapter 9, The reflection-free zone](../../acoustics/09-echogram-iso3382.md#97-the-reflection-free-zone):
  20 ms window, −20 dB; `js/acoustics/analysis.js` `reflectionFreeZone`.
- [Engine chapter 9, ISO 3382-1 parameters](../../acoustics/09-echogram-iso3382.md#92-iso-3382-1-parameters):
  $C_{50}$, $D_{50}$; `analysis.js` `iso3382`. The mic report's ITDG is the delay of the
  first reflection (`micReport`).
- [Engine chapter 6, Talkers](../../acoustics/06-sources-receivers.md#67-talkers--every-person-speaks-every-person-hears):
  speech intelligibility (STI) between seats.
- A speaker's `delayMs` ([engine chapter 6](../../acoustics/06-sources-receivers.md#62-frequency-response))
  shifts its arrivals in the wave sum and the echogram ($\tau_s$), so idea 2's delayed
  loudspeaker can be set by hand.
- The app has no model of the precedence effect itself and no echo-disturbance criterion.
  Nothing tells you where a sound will be localised.
