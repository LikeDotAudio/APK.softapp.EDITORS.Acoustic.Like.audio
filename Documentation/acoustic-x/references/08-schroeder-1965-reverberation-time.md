# 8 · Schroeder 1965 — New Method of Measuring Reverberation Time

> Schroeder, M. R., "New Method of Measuring Reverberation Time", *J. Acoust. Soc. Am.*,
> Vol. 37, No. 3, March 1965, pp. 409–412.

**Kind:** journal paper, 4 pages. **Read it for:** the decay curve behind every EDT, T20 and
T30 this app reads, from the model or from a measurement.

## What it is

Manfred Schroeder, a physicist at Bell Telephone Laboratories, wrote this short paper to fix
a nuisance in room measurement. Reverberation time was then measured by playing band-limited
noise into a room, cutting it off, and recording the level as it fell. Every decay came out
different, because the noise was different each time, so engineers averaged many of them.
Schroeder showed that the average of infinitely many such decays can be had in one go, from a
single impulse response, by squaring it and integrating it backwards in time. The result is
the "Schroeder curve", and room acoustics has read its decay times from it ever since.
Acoustic-X listed the paper because its Reverb Time window predicts the number that this
method measures.

## Big ideas

### 1. One impulse response holds the average of all noise decays

**Summary.** Let $h(t)$ be the room's impulse response, filtered to one band. Schroeder proved
that the ensemble average of the squared noise decay, over every possible noise signal, is
proportional to the energy left in the impulse response after time $t$:

$$\langle s^2(t)\rangle \propto \int_t^{\infty} h^2(\tau)\,d\tau$$

Nothing random is left on the right-hand side. One measurement gives the curve that used to
take dozens of averaged decays, and it is smooth.

**Challenge.** By hand, take an ideal exponential decay $h^2(t) = e^{-kt}$ with
$k = 6\ln 10 / T$ and $T = 0.5$ s, so $k = 27.63\ \text{s}^{-1}$. Integrate it from $t$ to
infinity and normalise by the value at $t = 0$. Show that the backward integral is again
$e^{-kt}$, so its level at $t = 0.1$ s is $-12.0$ dB and its slope is $-120$ dB/s, a 60 dB
decay in 0.5 s. For a single exponential the integral changes nothing; it matters when the
decay is noisy or bent.

### 2. Integrate backwards, from the end of the record

**Summary.** The integral runs from $t$ to the end, so it is easiest to compute in reverse:
start at the tail and accumulate toward the direct sound. Schroeder did this with analogue
equipment, running the recorded response in reverse through a squarer and an integrator.
Today it is one cumulative sum over a reversed array. The curve is then plotted in dB under
its starting value:

$$D(t) = 10\log_{10}\frac{\int_t^{\infty} h^2\,d\tau}{\int_0^{\infty} h^2\,d\tau}$$

**Challenge.** In the main app, put a microphone in the room and open its report. The EDT,
T20 and T30 there come from exactly this sum over the echogram's 0.5 ms bins
([chapter 9 §9.2](../../acoustics/09-echogram-iso3382.md#92-iso-3382-1-parameters)). Change
the room's finishes and watch T20 and T30 follow the Eyring time of the band, as §9.2's
worked example says they should.

### 3. The end of the record is the weak point

**Summary.** "To infinity" really means "to the end of the recording", and the end of a real
recording is background noise, not decay. Noise adds energy to the tail, so the integrated
curve flattens and the decay time reads long. Cutting the integral off too early bends the
curve the other way. Where to stop, and what to do with the noise, is the main practical
question the paper leaves to the user.

**Challenge.** Model a 0.5 s decay with a steady noise floor 50 dB under the start of the
decay: $h^2(t) = e^{-kt} + 10^{-5}$. Integrate it backwards from $t = 1.0$ s and fit T30
(−5 to −35 dB). Then stop the integral at $t = 0.6$ s instead, a little after the decay meets
the floor at about 0.42 s. Find that T30 reads about 0.54 s with the long record and about
0.51 s with the short one, while T20 and EDT stay within 2 % of 0.5 s. Noise hurts the
deepest fit most.

### 4. The curve shows the shape of the decay, not just its slope

**Summary.** A noise decay is too ragged to see whether it is one straight line. The
integrated curve is smooth enough to show it. A room with absorbent walls and a hard floor and
ceiling decays fast at first and slowly later, and the Schroeder curve bends. A single
"reverberation time" then depends on which part of the curve is fitted. This is why later
practice reads several: EDT from the first 10 dB, T20 and T30 from deeper ranges.

**Challenge.** Model a bent decay as two exponentials in the backward integral:
$0.9\,e^{-k_1 t} + 0.1\,e^{-k_2 t}$, with $T_1 = 0.3$ s and $T_2 = 1.5$ s. Find where the
slow part takes over (at about 60 ms, near −9.4 dB), and fit EDT, T20 and T30. Find that EDT
reads about 0.39 s, T20 about 1.21 s and T30 about 1.38 s. Then open Reverb Time on the
$6 \times 4.2 \times 2.8$ m room with 100 mm absorber on the side walls
([chapter 6](../06-reverb-time.md#the-formulas)): Sabine gives 0.31 s and Fitzroy 1.49 s at
500 Hz. A measurement of that room would show both, as a bent curve.

### 5. A measurement and a prediction meet on the same curve

**Summary.** Because the method needs only an impulse response, the same arithmetic serves a
measured response and a computed one. A model that produces an echogram can be read with the
same EDT, T20 and T30 as the room it predicts, and the two can be laid side by side.

**Challenge.** Measure an impulse response at the mix seat of a real room (any measurement
program that saves a WAV will do). Load it in the main app's Advisor tab and compare the
measured T30 per octave with the model's RT60
([chapter 17](../../acoustics/17-measurement.md)). Find the band where they disagree most,
and check whether the 125 Hz octave reads long because a strong mode leaks in, as chapter 17
warns.

## Since then

The method became the standard. Jordan (1970) proposed the early decay time from the first
10 dB of the curve, and ISO 3382 (1997, now ISO 3382-1 and -2) fixed EDT, T20 and T30 on
Schroeder's integral. The noise problem drew most of the later work: Chu (1978) subtracted the
noise floor, and Lundeby and others (1995) gave an iterative rule for where to truncate.
Schroeder himself (1979) showed how to get the impulse response from noise-like sequences,
which led to MLS measurement, and Farina (2000) introduced the exponential sine sweep that
most measurement software now uses. None of these changed the integral; they changed how
clean an $h(t)$ goes into it.

## In this app

- [Engine chapter 9 §9.2, ISO 3382-1 parameters](../../acoustics/09-echogram-iso3382.md#92-iso-3382-1-parameters):
  `js/acoustics/analysis.js` `iso3382` builds the backward integral, and its internal
  `regressionT` fits EDT, T20 and T30.
- [Engine chapter 17, A measured impulse response](../../acoustics/17-measurement.md):
  `js/acoustics/measure.js` `analyseIR` reads a measured WAV through the same `iso3382`,
  per octave.
- [Reverb Time, a measured empty room](../06-reverb-time.md#a-measured-empty-room):
  `js/acoustx/classic.js` `rtFromMeasured` takes a measured $T_0$ per band as the basis, but
  you type the numbers; the window does not read an impulse response.
- The model's late tail decays at one Eyring rate per band
  ([chapter 9 §9.1](../../acoustics/09-echogram-iso3382.md#91-the-echogram)), so a modelled
  Schroeder curve does not bend the way idea 4 describes. Only a measurement shows that. The
  Ray Tracing window does not integrate its arrivals into a decay curve.
