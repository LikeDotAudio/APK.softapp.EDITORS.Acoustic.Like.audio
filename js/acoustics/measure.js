// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ECHO_DT, iso3382 } from './analysis.js';
import { BANDS } from './bands.js';
import { findNulls } from './nulls.js';

/**
 * A MEASURED IMPULSE RESPONSE, READ
 *
 * The model predicts; a measurement says (law 7). This reads a room's impulse
 * response — a sweep deconvolved by whatever measured it, saved as a WAV — the
 * way room-measurement software does, and hands back the same kinds of
 * numbers the model makes, so the two can be laid side by side:
 *
 *   etc        the energy–time curve: the squared response in ECHO_DT bins,
 *              the echogram's own grid, dB under its peak; and through it
 *              the ISO 3382-1 figures (analysis.js iso3382 — EDT, T20, T30,
 *              C50, C80, D50, Ts), read from the measured decay itself.
 *   gated      the pseudo-anechoic response: the direct sound windowed off
 *              before the first reflection arrives (`gateMs` after the peak,
 *              a half-Hann fade over its last quarter). A window that short
 *              cannot know anything slower than itself, so every point under
 *              1 / gate is null — not a guess, a gap.
 *   response   the whole response, the room in it: fine fractional-octave
 *              resolution, 1/`perOctave` (24 unless asked), because 1/3-octave
 *              smoothing averages a sharp, high-Q mode into a mild bump.
 *   bands      the same ISO 3382-1 figures per octave, 125 Hz … 4 kHz (the
 *              model's BANDS), the response filtered to each octave by a
 *              band-pass an octave wide run forward and backward (zero
 *              phase). A filter rings for about Q/πfc — 4 ms at 125 Hz —
 *              so a decay shorter than a few times that, in the lowest
 *              octave, reads the filter and not the room.
 *   resonances the peaks in the response under `fModes` (300 Hz) standing 3 dB
 *              or more over their own third-octave neighbourhood — the room's
 *              modes as measured — each with its Q, f over its width at half
 *              its height (nulls.js, read upside down).
 *
 * Plain data in and out; no DOM. parseWav takes the file's ArrayBuffer.
 */

/** A RIFF/WAVE file's samples: { fs, channels: [Float64Array] }. PCM 16/24/32-bit integer or 32/64-bit float. */
export function parseWav(buffer) {
  const v = new DataView(buffer);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file (no RIFF/WAVE header)');
  let fmt = null;
  let o = 12;
  while (o + 8 <= v.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') fmt = { format: v.getUint16(body, true), channels: v.getUint16(body + 2, true), fs: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') {
      if (!fmt) throw new Error('WAV data before its fmt chunk');
      const format = fmt.format === 0xfffe ? (fmt.bits === 32 || fmt.bits === 64 ? 3 : 1) : fmt.format;
      if (format !== 1 && format !== 3) throw new Error(`WAV format ${fmt.format} is not PCM or float`);
      const bytes = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, v.byteLength - body) / (bytes * fmt.channels));
      const channels = Array.from({ length: fmt.channels }, () => new Float64Array(frames));
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < fmt.channels; c++) {
          const p = body + (i * fmt.channels + c) * bytes;
          let x;
          if (format === 3) x = bytes === 4 ? v.getFloat32(p, true) : v.getFloat64(p, true);
          else if (bytes === 2) x = v.getInt16(p, true) / 32768;
          else if (bytes === 3) x = (((v.getUint8(p + 2) << 24) | (v.getUint8(p + 1) << 16) | (v.getUint8(p) << 8)) >> 8) / 8388608;
          else if (bytes === 4) x = v.getInt32(p, true) / 2147483648;
          else throw new Error(`${fmt.bits}-bit PCM is not read`);
          channels[c][i] = x;
        }
      return { fs: fmt.fs, channels };
    }
    o = body + size + (size & 1);
  }
  throw new Error('WAV file has no data chunk');
}

/** In-place radix-2 FFT of re/im (length a power of two). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k;
        const q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci;
        const ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr;
        im[q] = im[p] - ti;
        re[p] += tr;
        im[p] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Log-spaced centres, `perOctave` to the octave, fMin … fMax. */
export function fractionalFreqs(fMin = 20, fMax = 20000, perOctave = 24) {
  const n = Math.floor(Math.log2(fMax / fMin) * perOctave + 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => fMin * 2 ** (i / perOctave));
}

/**
 * The magnitude of `x` (fs) at each centre, dB: the power mean of the FFT bins
 * within 1/perOctave around it (the nearest bin where the band holds none).
 */
export function spectrumDb(x, fs, freqs, perOctave = 24) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  const df = fs / n;
  const half = 2 ** (1 / (2 * perOctave));
  return freqs.map((f) => {
    const a = Math.max(1, Math.ceil(f / half / df));
    const b = Math.min(n / 2, Math.floor((f * half) / df));
    let e = 0;
    let k = 0;
    for (let i = a; i <= b; i++) {
      e += re[i] * re[i] + im[i] * im[i];
      k++;
    }
    if (!k) {
      const i = Math.min(n / 2, Math.max(1, Math.round(f / df)));
      e = re[i] * re[i] + im[i] * im[i];
      k = 1;
    }
    return 10 * Math.log10(e / k + 1e-30);
  });
}

/** `x` filtered to the octave around fc (see the header), same length. */
export function octaveBand(x, fs, fc) {
  // RBJ band-pass, 0 dB at fc, Q √2 — an octave wide — run twice forward and twice backward: zero phase, nothing smeared ahead of the peak
  const w0 = (2 * Math.PI * fc) / fs;
  const alpha = Math.sin(w0) / (2 * Math.SQRT2);
  const a0 = 1 + alpha;
  const b = [alpha / a0, 0, -alpha / a0];
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  const pass = (y) => {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      const out = b[0] * v + b[2] * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = v;
      y2 = y1;
      y1 = out;
      y[i] = out;
    }
  };
  const y = Float64Array.from(x);
  for (let k = 0; k < 2; k++) {
    pass(y);
    y.reverse();
    pass(y);
    y.reverse();
  }
  return y;
}

/** ISO 3382-1 figures of `x` from its peak on: the squared response in ECHO_DT bins. */
function decayOf(x, fs, peak) {
  const per = Math.max(1, Math.round(ECHO_DT * fs));
  const bins = new Float64Array(Math.ceil(x.length / per));
  for (let i = 0; i < x.length; i++) bins[Math.floor(i / per)] += x[i] * x[i];
  return { bins, params: iso3382({ bins, tD: Math.floor(peak / per) * ECHO_DT, dt: ECHO_DT }) };
}

/** Read one impulse response (see the header). */
export function analyseIR(ir, fs, { gateMs = 5, perOctave = 24, fMin = 20, fMax = Math.min(20000, fs / 2.2), fModes = 300 } = {}) {
  let peak = 0;
  for (let i = 1; i < ir.length; i++) if (Math.abs(ir[i]) > Math.abs(ir[peak])) peak = i;
  // the ETC on the echogram's grid, so iso3382 reads it as it reads the model's
  const dt = ECHO_DT;
  const { bins, params } = decayOf(ir, fs, peak);
  let top = 1e-30;
  for (const e of bins) if (e > top) top = e;
  const etc = Array.from(bins, (e) => 10 * Math.log10(e / top + 1e-30));
  const bands = BANDS.map((fc) => ({ f: fc, ...decayOf(octaveBand(ir, fs, fc), fs, peak).params }));

  const freqs = fractionalFreqs(fMin, fMax, perOctave);
  const response = spectrumDb(ir, fs, freqs, perOctave);

  // the gate: 1 ms of run-up before the peak, gateMs after it, the last quarter faded
  const pre = Math.round(0.001 * fs);
  const len = Math.round((gateMs / 1000) * fs);
  const g = new Float64Array(pre + len);
  const fade = Math.max(1, Math.round(len / 4));
  for (let i = 0; i < g.length; i++) {
    const s = peak - pre + i;
    if (s < 0 || s >= ir.length) continue;
    const k = i - (g.length - fade);
    g[i] = ir[s] * (k > 0 ? 0.5 * (1 + Math.cos((Math.PI * k) / fade)) : 1);
  }
  const fGate = 1000 / gateMs;
  const gatedRaw = spectrumDb(g, fs, freqs, perOctave);
  const gated = gatedRaw.map((v, i) => (freqs[i] >= fGate ? v : null));

  const low = freqs.map((f, i) => [f, response[i]]).filter(([f]) => f <= fModes);
  const resonances = findNulls(
    low.map(([f]) => f),
    low.map(([, v]) => -v),
    { depth: 3, max: 12 },
  ).map((r) => ({ f: r.f, height: r.depth, q: r.hi > r.lo ? r.f / (r.hi - r.lo) : Infinity }));

  return { fs, peakS: peak / fs, etc, dt, params, bands, freqs, response, gated, gateMs, fGate, resonances, perOctave };
}
