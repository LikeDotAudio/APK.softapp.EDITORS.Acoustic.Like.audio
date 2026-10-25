// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { prepare, waveAt } from './field.js';
import { SUB_FREQS } from './subDesigner.js';

/**
 * SEVERAL SUBS, TUNED TOGETHER
 *
 * One sub can only be put where the modes hurt least (subDesigner.js). Two or
 * more — in several corners, at the wall midpoints — can be set against each
 * other so their modes cancel across the seats, which no single position and
 * no EQ can do: EQ changes every seat alike, and what differs between seats
 * is exactly what it cannot touch.
 *
 * The subs stay where the designer put them: a position is a decision, not an
 * optimisation (law 11). What is free is what the processor sets — each sub's
 * DELAY (0 … delayMax ms), GAIN (trimMin … 0 dB, never a boost) and POLARITY —
 * and, after them, one EQ shared by all the subs.
 *
 * The field is the wave method with phase (field.js waveAt), each sub heard
 * alone at every seat and frequency once, then recombined for every candidate
 * as Σ g·e^(−jωτ)·P — the delay is a phase turn, so nothing is recomputed.
 * The score is the sub crawl's: flat + even, the seats weighted by their tier
 * (subDesigner.js), lower is better. Coordinate descent, the first sub the
 * reference (0 ms, 0 dB, normal polarity), `passes` times over the others.
 *
 * THE SHARED EQ is cut-only peaking filters fitted to the weighted power mean
 * of the seats after the subs are set: the worst peak over the curve's own
 * power mean, cut by its excess, its Q from its width, up to `eqBands` times.
 * A null is never boosted — it is a cancellation, and more drive only feeds
 * both sides of it. One filter on every sub alike turns them all by the same
 * phase, so it changes the sum's magnitude and nothing between the subs: that
 * is why it may be applied to the sum afterwards, magnitude only.
 */

const DB = (re, im) => 10 * Math.log10(re * re + im * im + 1e-12);

/** Each sub alone at each seat and frequency, as { re, im } with its delay, gain and polarity taken out. */
function fields(room, subs, seats, freqs, maxOrder) {
  return subs.map((s) => {
    const prep = prepare(room, [{ ...s, delayMs: 0, gainDb: 0, invert: false }], { maxOrder });
    return seats.map((m) => freqs.map((f) => waveAt(prep, m, f, m)));
  });
}

/** The seats' curves, dB, for one setting of every sub: [seat][freq]. */
function curvesFor(P, setting, freqs) {
  const seats = P[0].length;
  const out = [];
  for (let i = 0; i < seats; i++) {
    const c = new Array(freqs.length);
    for (let j = 0; j < freqs.length; j++) {
      const w = 2 * Math.PI * freqs[j];
      let re = 0;
      let im = 0;
      for (let k = 0; k < P.length; k++) {
        const { delayMs, gainDb, invert } = setting[k];
        const g = (invert ? -1 : 1) * 10 ** (gainDb / 20);
        const ph = -w * (delayMs / 1000);
        const p = P[k][i][j];
        const cr = Math.cos(ph);
        const ci = Math.sin(ph);
        re += g * (p.re * cr - p.im * ci);
        im += g * (p.re * ci + p.im * cr);
      }
      c[j] = DB(re, im);
    }
    out.push(c);
  }
  return out;
}

/** flat + even (subDesigner.js scoreSub), for curves already computed. */
export function scoreCurves(curves, weights) {
  const wsum = weights.reduce((a, b) => a + b, 0);
  let flat = 0;
  curves.forEach((c, i) => {
    const mean = c.reduce((a, b) => a + b, 0) / c.length;
    flat += weights[i] * Math.sqrt(c.reduce((a, v) => a + (v - mean) ** 2, 0) / c.length);
  });
  flat /= wsum;
  let even = 0;
  if (curves.length > 1) {
    const n = curves[0].length;
    for (let j = 0; j < n; j++) {
      const at = curves.map((c) => c[j]);
      even += Math.max(...at) - Math.min(...at);
    }
    even /= n;
  }
  return { flat, even, score: flat + even };
}

/** The seats' weighted power mean per frequency, dB. */
export function powerMeanCurve(curves, weights) {
  const wsum = weights.reduce((a, b) => a + b, 0);
  return curves[0].map((_, j) => 10 * Math.log10(curves.reduce((s, c, i) => s + weights[i] * 10 ** (c[j] / 10), 0) / wsum));
}

/** An RBJ peaking filter's magnitude at f, dB (fs 48 kHz): f0, gain dB, Q. */
export function peakingDb(f, { f: f0, gainDb, q }, fs = 48000) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const b = [1 + alpha * A, -2 * Math.cos(w0), 1 - alpha * A];
  const a = [1 + alpha / A, -2 * Math.cos(w0), 1 - alpha / A];
  const w = (2 * Math.PI * f) / fs;
  const mag = (c) => {
    const re = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w);
    const im = -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w));
    return re * re + im * im;
  };
  return 10 * Math.log10(mag(b) / mag(a));
}

/**
 * Cut-only peaking filters for a curve (see the header): [{ f, gainDb, q }],
 * the worst peak over the curve's own power mean first, until none is more
 * than `minDb` over it or `bands` are used.
 */
export function fitCutEq(freqs, curve, { bands = 4, minDb = 1, maxCut = 12 } = {}) {
  const eq = [];
  const target = 10 * Math.log10(curve.reduce((s, v) => s + 10 ** (v / 10), 0) / curve.length);
  const now = () => curve.map((v, j) => v + eq.reduce((s, e) => s + peakingDb(freqs[j], e), 0));
  for (let n = 0; n < bands; n++) {
    const c = now();
    let j = 0;
    for (let k = 1; k < c.length; k++) if (c[k] > c[j]) j = k;
    const excess = c[j] - target;
    if (excess < minDb) break;
    // the width where the peak stands half its excess over the target, in octaves → Q
    let lo = j;
    let hi = j;
    while (lo > 0 && c[lo - 1] - target > excess / 2) lo--;
    while (hi < c.length - 1 && c[hi + 1] - target > excess / 2) hi++;
    const bw = Math.max(1 / 12, Math.log2(freqs[hi] / freqs[lo]) + 1 / 12);
    const q = Math.min(20, Math.max(0.5, Math.sqrt(2 ** bw) / (2 ** bw - 1)));
    eq.push({ f: +freqs[j].toFixed(1), gainDb: -Math.min(maxCut, +excess.toFixed(1)), q: +q.toFixed(2) });
  }
  return eq;
}

/**
 * Tune `subs` (speakers, positions kept) for `seats` (mics; the listeners'
 * tiers weight them): { subs: [{ id, delayMs, gainDb, invert }], eq, before,
 * after, eqd } — `before` as they stand now, `after` with the subs set,
 * `eqd` with the shared EQ on as well; each { flat, even, score, curves }.
 */
export function optimiseSubs(room, subs, seats, { freqs = SUB_FREQS, maxOrder = 3, delayMax = 20, delayStep = 0.25, trimMin = -6, trimStep = 1, passes = 2, eqBands = 4 } = {}) {
  if (!subs.length || !seats.length) return null;
  const weights = seats.map((m) => Math.max(m.weight ?? 1, m.mix ? 2 : 1));
  const P = fields(room, subs, seats, freqs, maxOrder);
  const as = (s) => ({ delayMs: s.delayMs || 0, gainDb: s.gainDb ?? 0, invert: Boolean(s.invert) });
  const result = (setting) => {
    const curves = curvesFor(P, setting, freqs);
    return { ...scoreCurves(curves, weights), curves };
  };
  const before = result(subs.map(as));
  const setting = subs.map(() => ({ delayMs: 0, gainDb: 0, invert: false }));
  let best = result(setting).score;
  for (let pass = 0; pass < passes; pass++)
    for (let k = 1; k < subs.length; k++) {
      let keep = setting[k];
      for (let d = 0; d <= delayMax + 1e-9; d += delayStep)
        for (let g = trimMin; g <= 1e-9; g += trimStep)
          for (const invert of [false, true]) {
            setting[k] = { delayMs: +d.toFixed(3), gainDb: +g.toFixed(2), invert };
            const s = scoreCurves(curvesFor(P, setting, freqs), weights).score;
            if (s < best - 1e-9) {
              best = s;
              keep = setting[k];
            }
          }
      setting[k] = keep;
    }
  const after = result(setting);
  const mean = powerMeanCurve(after.curves, weights);
  const eq = fitCutEq(freqs, mean, { bands: eqBands });
  const eqDb = freqs.map((f) => eq.reduce((s, e) => s + peakingDb(f, e), 0));
  const eqCurves = after.curves.map((c) => c.map((v, j) => v + eqDb[j]));
  const eqd = { ...scoreCurves(eqCurves, weights), curves: eqCurves };
  return { freqs, subs: subs.map((s, k) => ({ id: s.id, name: s.role || s.name, ...setting[k] })), eq, before, after, eqd };
}
