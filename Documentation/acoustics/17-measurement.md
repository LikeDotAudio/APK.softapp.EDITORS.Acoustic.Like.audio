# 17. A measured impulse response

Module: `js/acoustics/measure.js`.

The model predicts; a measurement says (Room Acoustics law 7). This module
reads a room's impulse response the way room-measurement software does. It
returns the same kinds of numbers the model makes, so the two can be laid side
by side. Nothing is fitted to the measurement.

## 17.1 Reading the file

`parseWav(buffer)` reads a RIFF/WAVE `ArrayBuffer`: PCM 16, 24 and 32-bit
integer, 32 and 64-bit float, and `WAVE_FORMAT_EXTENSIBLE` of those. It
returns `{ fs, channels: [Float64Array] }`, integers scaled to ±1. Any other
format throws with its reason.

## 17.2 `analyseIR(ir, fs, { gateMs = 5, perOctave = 24, fMin = 20, fMax, fModes = 300 })`

* **Peak.** The sample of largest magnitude is the direct sound (`peakS`).
* **ETC.** The squared response summed into `ECHO_DT` (0.5 ms) bins, the
  echogram's own grid, as dB under its loudest bin. `params` is
  `analysis.js` `iso3382` read from it with $t_D$ at the peak: EDT, T20, T30,
  C50, C80, D50 and Ts from the measured decay (chapter 9).
* **Per octave** (`bands`). The same figures for each of the model's bands,
  125 Hz … 4 kHz. `octaveBand(x, fs, fc)` filters with an RBJ band-pass, 0 dB
  at $f_c$, $Q = \sqrt2$ (an octave), run twice forward and twice backward, so
  it is zero phase and smears nothing ahead of the peak. **Limit.** The filter
  rings for about $Q/\pi f_c$ (4 ms at 125 Hz), and its skirts let a strong
  mode an octave or more away into a band. A low octave's decay is read with
  that in mind.
* **Response.** `spectrumDb` takes one FFT of the whole response, zero-padded
  to a power of two (`fft`, radix-2). Each centre of `fractionalFreqs(fMin, fMax, perOctave)`
  is the power mean of the bins within $1/\text{perOctave}$ octave around it,
  or the nearest bin when the band holds none. The default is 1/24 octave.
  1/3-octave smoothing averages a sharp, high-Q mode into a mild bump.
* **Gated** (pseudo-anechoic). 1 ms before the peak to `gateMs` after it, the
  last quarter faded by a half-Hann. A window that short cannot know anything
  slower than itself, so every point under $f_{\text{gate}} = 1000/\text{gateMs}$ Hz
  is `null`: a gap, not a guess.
* **Resonances.** The response under `fModes` read upside down by `nulls.js`
  `findNulls` with depth 3 dB: every peak standing 3 dB or more over its own
  third-octave neighbourhood, `{ f, height, q }`, with
  $Q = f/(f_{\text{hi}} - f_{\text{lo}})$ across the span still more than half
  its height up.

Example: one second at 48 kHz of a unit impulse at 10 ms followed by white
noise decaying to $T$ = 0.5 s. It reads T30 0.50 s broadband and
0.47–0.52 s in the octaves from 250 Hz up, $f_{\text{gate}}$ = 200 Hz. Adding a
50 Hz mode of Q 25 puts the strongest resonance at 50.4 Hz, +9.1 dB, Q 17.
The 125 Hz octave then reads 0.97 s, the mode let in through the filter's
skirt *(Node.)*.

The inspector's Advisor tab loads a WAV, measured at the mix seat, and shows
these figures beside the model's RT60 per band.
