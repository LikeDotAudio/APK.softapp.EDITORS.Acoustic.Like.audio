// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from './bands.js';
import { mirrorPoint, pointInPolygon } from './geometry.js';

/**
 * SPEAKER BOUNDARY INTERFERENCE — THE CLASSIC "SBIR" VIEW
 *
 * A loudspeaker near a wall is heard twice: straight, and again off the wall
 * a moment later. Where the second arrival is half a wavelength late it
 * cancels the first — a speaker d from a hard wall, with the listener out in
 * front, notches near c / 4d (0.5 m → about 172 Hz). The classic SBIR
 * calculators draw exactly that, so this does too:
 *
 *   the speaker is a POINT SOURCE (no directivity — below ~300 Hz, where SBIR
 *   matters, a box is all but omni), and it is heard through the DIRECT path
 *   plus the SIX FIRST-ORDER IMAGES: one per wall of the plan (room.walls,
 *   only where the reflection lands on the wall itself), the floor at
 *   zFloor (0 for a flat room) and the ceiling at zCeiling (H). Each image
 *   keeps (1 − α) of its energy, α from the octave band nearest the frequency
 *   (125 Hz stands in below 125 Hz), so its pressure is √(1 − α) / r.
 *
 *   deviation(f) = 20·log10 |Σ paths| − 20·log10 |direct|, dB.
 *   0 dB means the room adds nothing; −20 dB is a deep notch.
 *
 *   ABSOLUTE DEVIATION is the mean of |deviation| over the frequencies at or
 *   below 300 Hz — the region where boundary interference is a placement
 *   problem rather than something absorption fixes. The position search
 *   minimises it.
 *
 * Positions are metres in the room's own sheet frame, { x, y, z }.
 */

/** Log-spaced frequencies, `perOctave` per octave, from fMin up to and including fMax. */
export function sbirFreqs(fMin = 16, fMax = 1000, perOctave = 12) {
  const n = Math.floor(Math.log2(fMax / fMin) * perOctave + 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => fMin * 2 ** (i / perOctave));
}

/** The upper limit of what "absolute deviation" averages over, Hz. */
export const ABS_DEV_MAX_HZ = 300;

/** Octave band index for a frequency: the nearest of BANDS, 125 Hz below it. */
export function bandFor(freq) {
  let best = 0;
  for (let i = 1; i < BANDS.length; i++) if (Math.abs(Math.log(freq / BANDS[i])) < Math.abs(Math.log(freq / BANDS[best]))) best = i;
  return best;
}

/**
 * The first-order image paths of one source to one listener: the direct path
 * and one per surface that can reflect it. [{ surface, image, point, r, alpha }]
 * — `alpha` the surface's six-band absorption, `point` where the ray meets the
 * surface, `r` the path length. surface is 'direct', a wall's face
 * ('front' | 'back' | 'left' | 'right'), 'floor' or 'ceiling'.
 */
export function firstOrderPaths(room, src, mic) {
  const z0 = room.zFloor ?? 0;
  const z1 = room.zCeiling ?? room.H;
  const out = [{ surface: 'direct', image: { ...src }, point: null, r: dist(src, mic), alpha: null }];
  for (const w of room.walls) {
    const ds = (src.x - w.a.x) * w.nIn.x + (src.y - w.a.y) * w.nIn.y;
    const dm = (mic.x - w.a.x) * w.nIn.x + (mic.y - w.a.y) * w.nIn.y;
    if (ds <= 1e-9 || dm <= 1e-9) continue;
    const img = { ...mirrorPoint(src, w.a, w.nIn), z: src.z };
    const t = ds / (ds + dm);
    const point = { x: img.x + t * (mic.x - img.x), y: img.y + t * (mic.y - img.y), z: img.z + t * (mic.z - img.z) };
    const u = ((point.x - w.a.x) * w.t.x + (point.y - w.a.y) * w.t.y) / w.len;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    out.push({ surface: w.face, wall: w.i, image: img, point, r: dist(img, mic), alpha: w.material.alpha });
  }
  for (const [surface, zs, mat] of [
    ['floor', z0, room.floor],
    ['ceiling', z1, room.ceiling],
  ]) {
    const ds = Math.abs(src.z - zs);
    const dm = Math.abs(mic.z - zs);
    if (ds <= 1e-9 || dm <= 1e-9) continue;
    const img = { x: src.x, y: src.y, z: 2 * zs - src.z };
    const t = ds / (ds + dm);
    const point = { x: img.x + t * (mic.x - img.x), y: img.y + t * (mic.y - img.y), z: zs };
    if (room.poly && !pointInPolygon(point.x, point.y, room.poly)) continue;
    out.push({ surface, image: img, point, r: dist(img, mic), alpha: mat.alpha });
  }
  return out;
}

const dist = (a, b) => Math.max(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), 0.01);

/** Deviation in dB at each frequency, and its absolute mean below ABS_DEV_MAX_HZ: { freqs, dev, absDev }. */
export function sbirDeviation(room, speaker, mic, freqs = sbirFreqs()) {
  const paths = firstOrderPaths(room, speaker, mic);
  const r0 = paths[0].r;
  const dev = freqs.map((f) => {
    const k = (2 * Math.PI * f) / C;
    const b = bandFor(f);
    let re = 0;
    let im = 0;
    for (const p of paths) {
      const a = (p.alpha ? Math.sqrt(Math.max(0, 1 - p.alpha[b])) : 1) / p.r;
      re += a * Math.cos(-k * p.r);
      im += a * Math.sin(-k * p.r);
    }
    return 20 * Math.log10(Math.max(Math.hypot(re, im) * r0, 1e-6));
  });
  return { freqs, dev, absDev: absDeviation(freqs, dev) };
}

/** Mean |dev| over the frequencies ≤ ABS_DEV_MAX_HZ (all of them if none are). */
export function absDeviation(freqs, dev) {
  let s = 0;
  let n = 0;
  freqs.forEach((f, i) => {
    if (f <= ABS_DEV_MAX_HZ) {
      s += Math.abs(dev[i]);
      n++;
    }
  });
  if (!n) return dev.reduce((t, d) => t + Math.abs(d), 0) / (dev.length || 1);
  return s / n;
}

/**
 * Every first-order reflection of every speaker at the listener, earliest
 * first: [{ surface, speaker, delayMs, lagMs, levelDb, point, r }].
 * `speaker` is the index into `speakers`; `delayMs` the arrival time after
 * the speaker fires (r / c); `lagMs` how far behind that speaker's direct
 * sound; `levelDb` relative to that speaker's direct sound — spreading loss
 * 20·log10(r0 / r) plus 10·log10(1 − α) in octave band `band` (default 1 kHz).
 */
export function reflectionsBySurface(room, speakers, mic, { band = 3 } = {}) {
  const out = [];
  speakers.forEach((spk, i) => {
    const paths = firstOrderPaths(room, spk, mic);
    const r0 = paths[0].r;
    for (const p of paths.slice(1)) {
      const keep = Math.max(1e-6, 1 - p.alpha[band]);
      out.push({
        surface: p.surface,
        speaker: i,
        delayMs: (p.r / C) * 1000,
        lagMs: ((p.r - r0) / C) * 1000,
        levelDb: 20 * Math.log10(r0 / p.r) + 10 * Math.log10(keep),
        point: p.point,
        r: p.r,
      });
    }
  });
  return out.sort((a, b) => a.delayMs - b.delayMs);
}

/** The direct arrival of each speaker: [{ speaker, delayMs, r }]. */
export function directArrivals(speakers, mic) {
  return speakers.map((s, i) => {
    const r = dist(s, mic);
    return { speaker: i, r, delayMs: (r / C) * 1000 };
  });
}

/**
 * Try every position on a grid in the given ranges (sheet metres; a range of
 * one value pins that axis) and return the `top` with the least absolute
 * deviation, best first: [{ x, y, z, absDev }]. Positions outside the plan,
 * or closer than 5 cm to the floor or ceiling, are skipped. Only frequencies
 * up to ABS_DEV_MAX_HZ are evaluated by default — the rest do not count.
 */
export function searchPositions(room, speaker, mic, ranges, { step = 0.1, freqs = sbirFreqs(16, ABS_DEV_MAX_HZ, 12), top = 8 } = {}) {
  const axis = (r, v) => {
    if (!r) return [v];
    const a = Math.min(r[0], r[1]);
    const b = Math.max(r[0], r[1]);
    const n = Math.floor((b - a) / step + 1e-6);
    return Array.from({ length: n + 1 }, (_, i) => +(a + i * step).toFixed(6));
  };
  const z0 = room.zFloor ?? 0;
  const z1 = room.zCeiling ?? room.H;
  const best = [];
  for (const x of axis(ranges.x, speaker.x))
    for (const y of axis(ranges.y, speaker.y)) {
      if (room.poly && !pointInPolygon(x, y, room.poly)) continue;
      for (const z of axis(ranges.z, speaker.z)) {
        if (z < z0 + 0.05 || z > z1 - 0.05) continue;
        const { absDev } = sbirDeviation(room, { ...speaker, x, y, z }, mic, freqs);
        if (best.length >= top && absDev >= best[best.length - 1].absDev) continue;
        let i = best.length;
        while (i > 0 && best[i - 1].absDev > absDev) i--;
        best.splice(i, 0, { x, y, z, absDev });
        if (best.length > top) best.pop();
      }
    }
  return best;
}
