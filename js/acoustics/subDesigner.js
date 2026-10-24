// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { makeSpeaker } from './devices.js';
import { prepare, waveDb } from './field.js';
import { pointInPolygon } from './geometry.js';

/**
 * WHERE THE SUB GOES
 *
 * The "sub crawl", done by the model instead of on hands and knees: put a
 * subwoofer at every point of a floor grid, and at each one hear 20–120 Hz at
 * every listening seat (every mic; the mix seat counts double, it is where
 * the mix is made). Two things make a position good:
 *
 *   FLAT   the response at a seat deviates little from its own mean — no
 *          mode piling up, no null swallowing a note (the standard deviation
 *          of the 1/12-octave levels, dB);
 *   EVEN   the seats agree with each other — the couch hears what the chair
 *          hears (the mean, over frequency, of the spread between seats, dB).
 *
 * score = flat + even; lower is better. The field is the app's own wave
 * method (image sources with phase, the same as the response graph), with
 * the existing speakers left out: this finds the best place for ONE sub in
 * this room, before the mains are blended in.
 *
 * Plain data in and out; `step` sets the grid and with it the time it takes.
 */

export const SUB_FREQS = Array.from({ length: 31 }, (_, i) => 20 * 2 ** (i / 12)).filter((f) => f <= 120);

/** One candidate: { flat, even, score, curves } for a sub at `at` heard at `seats`. */
export function scoreSub(room, at, seats, { maxOrder = 3, freqs = SUB_FREQS } = {}) {
  const sub = makeSpeaker('sub', { x: at.x, y: at.y, z: at.z ?? 0.3 }, { aim: 0, lowpass: 0 });
  const prep = prepare(room, [sub], { maxOrder });
  const curves = seats.map((m) => freqs.map((f) => waveDb(prep, m, f, m)));
  // a listener counts by its tier (mixer 3 … entourage 1); a bare measurement mic 1, the mix seat at least 2
  const weights = seats.map((m) => Math.max(m.weight ?? 1, m.mix ? 2 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  let flat = 0;
  curves.forEach((c, i) => {
    const mean = c.reduce((a, b) => a + b, 0) / c.length;
    flat += weights[i] * Math.sqrt(c.reduce((a, v) => a + (v - mean) ** 2, 0) / c.length);
  });
  flat /= wsum;
  let even = 0;
  if (seats.length > 1) {
    for (let j = 0; j < freqs.length; j++) {
      const at = curves.map((c) => c[j]);
      even += Math.max(...at) - Math.min(...at);
    }
    even /= freqs.length;
  }
  return { flat, even, score: flat + even, curves };
}

/** Every grid point inside the plan, kept `margin` off the walls. */
export function subGrid(room, step = 0.25, margin = 0.2) {
  const xs = room.poly.map((p) => p.x);
  const ys = room.poly.map((p) => p.y);
  const pts = [];
  for (let x = Math.min(...xs) + margin; x <= Math.max(...xs) - margin + 1e-9; x += step)
    for (let y = Math.min(...ys) + margin; y <= Math.max(...ys) - margin + 1e-9; y += step) if (pointInPolygon(x, y, room.poly)) pts.push({ x, y, z: 0.3 });
  return pts;
}

/**
 * The whole crawl, a few points at a time so the page keeps drawing:
 * resolves with { cells: [{ x, y, flat, even, score }], best: top `top` }.
 * `onProgress(done, total)` after each slice; `signal.aborted` stops it.
 */
export function subCrawl(room, seats, { step = 0.25, top = 5, onProgress = () => {}, signal = {} } = {}) {
  const grid = subGrid(room, step);
  const cells = [];
  return new Promise((resolve) => {
    let i = 0;
    const slice = () => {
      if (signal.aborted) return resolve(null);
      const end = Math.min(grid.length, i + 12);
      for (; i < end; i++) {
        const { flat, even, score } = scoreSub(room, grid[i], seats);
        cells.push({ ...grid[i], flat, even, score });
      }
      onProgress(i, grid.length);
      if (i < grid.length) setTimeout(slice, 0);
      else resolve({ step, cells, best: [...cells].sort((a, b) => a.score - b.score).slice(0, top) });
    };
    slice();
  });
}
