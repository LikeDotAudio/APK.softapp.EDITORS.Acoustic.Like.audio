// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { DEG } from './geometry.js';

/**
 * DIRECTIVITY
 *
 * A pattern is a gain in dB for a direction, relative to the aim. Microphones
 * use the same shapes in reverse: gain is pickup for sound arriving FROM that
 * direction, and Q is how much of a diffuse field the capsule rejects.
 *
 * First-order shapes are a + (1 − a)·cos θ. A horn is the one that is not:
 * nearly flat across its rated coverage (−0.4 dB halfway out), −6 dB at the
 * edge the datasheet quotes and falling fast past it (−30 dB at 1.5× the
 * coverage) — −6·r⁴, r the angle as a fraction of the half-coverage — with
 * horizontal and vertical coverage separate (90×50, 60×40) because that is how
 * projection boxes are specified.
 *
 * No real box holds its pattern at low frequency: the wavelength outgrows the
 * baffle and it wraps around the cabinet. `omniBelow` is where that happens;
 * an octave under it the pattern is gone and the box is a point source. That
 * one fact is why a flush-mounted monitor gains +6 dB in the bass here
 * without a special case — the wall's image sits on top of it and, omni, the
 * two add in phase.
 */

export const FIRST_ORDER = {
  omni: 1,
  subcardioid: 0.7,
  cardioid: 0.5,
  supercardioid: 0.37,
  hypercardioid: 0.25,
  figure8: 0,
};

export const SPEAKER_PATTERNS = ['omni', 'cardioid', 'horn'];
export const MIC_PATTERNS = Object.keys(FIRST_ORDER);

const FLOOR_DB = -30;

/** Forward, right and up unit vectors for an aim bearing (deg CCW from +x) and tilt (deg, up +). */
export function frame(aimDeg, tiltDeg = 0) {
  const a = aimDeg * DEG;
  const t = tiltDeg * DEG;
  const f = [Math.cos(a) * Math.cos(t), Math.sin(a) * Math.cos(t), Math.sin(t)];
  const r = [Math.sin(a), -Math.cos(a), 0];
  const u = [-Math.cos(a) * Math.sin(t), -Math.sin(a) * Math.sin(t), Math.cos(t)];
  return { f, r, u };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Pattern gain, dB, for direction `dir` (any length) against frame `fr`. */
export function shapeGain(pattern, fr, dir, hCov = 90, vCov = 60) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const df = dot(fr.f, dir) / len;
  if (pattern === 'horn') {
    const ph = Math.atan2(dot(fr.r, dir) / len, df);
    const pv = Math.atan2(dot(fr.u, dir) / len, df);
    const r2 = (ph / ((Math.max(hCov, 10) / 2) * DEG)) ** 2 + (pv / ((Math.max(vCov, 10) / 2) * DEG)) ** 2;
    const g = -6 * r2 * r2;
    return Math.max(FLOOR_DB, g);
  }
  const a = FIRST_ORDER[pattern] ?? 1;
  const g = Math.abs(a + (1 - a) * df);
  return Math.max(FLOOR_DB, 20 * Math.log10(Math.max(g, 1e-6)));
}

/** 0 well below `omniBelow` (pattern gone), 1 an octave above it, smooth in log-frequency. */
export function patternWeight(freq, omniBelow) {
  if (!omniBelow) return 1;
  const x = Math.log2(freq / omniBelow);
  const t = Math.max(0, Math.min(1, (x + 1) / 2));
  return t * t * (3 - 2 * t);
}

/** Gain of a speaker or mic toward `dir` at `freq`, dB. */
export function deviceGain(dev, dir, freq) {
  const fr = dev._frame ?? frame(dev.aim ?? 0, dev.tilt ?? 0);
  return shapeGain(dev.pattern, fr, dir, dev.hCov, dev.vCov) * patternWeight(freq, dev.omniBelow);
}

const SPHERE = (() => {
  const n = 1500;
  const pts = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    pts.push([Math.cos(g * i) * r, Math.sin(g * i) * r, z]);
  }
  return pts;
})();

/** Directivity factor Q at `freq`: on-axis intensity over the mean across the sphere. */
export function directivityQ(dev, freq) {
  const fr = frame(0, 0);
  const probe = { ...dev, _frame: fr };
  let s = 0;
  for (const d of SPHERE) s += 10 ** (deviceGain(probe, d, freq) / 10);
  return SPHERE.length / s;
}
