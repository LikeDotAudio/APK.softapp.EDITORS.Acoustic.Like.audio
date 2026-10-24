// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { prepare, waveDb } from './field.js';
import { pointInPolygon } from './geometry.js';
import { heightsAtXY } from './elevations.js';
import { carryArray, soundingSpeakers } from './layouts.js';
import { powerMean, roomSeats, seatWeight } from '../compute/compute.js';

/**
 * THE BEST WIDTH
 *
 * Tries the array at every radius from `from` to `to` m, carrying the placed
 * speakers out along their bearings as the Width slider does, and scores the
 * low end the room hears: the spread (standard deviation, dB) of the seats'
 * power-averaged wave response, 1/12 octave from `lo` to `hi` Hz. Smaller is
 * flatter. A radius that puts a speaker outside the walls or through the
 * ceiling is skipped. The score is the image-source model's, as the chart's
 * wave curve is: a starting point for the room, not a measurement.
 */
export const LOW_END = { lo: 30, hi: 250 };

const lowFreqs = (lo, hi) => {
  const out = [];
  for (let f = lo; f <= hi; f *= 2 ** (1 / 12)) out.push(f);
  return out;
};

/** The spread of one arrangement's low end over the room's seats, dB. */
export function lowEndSpread(room, speakers, mics, settings, { lo, hi } = LOW_END) {
  const seats = roomSeats(mics);
  if (!seats.length || !speakers.length) return NaN;
  const prep = prepare(room, speakers, { maxOrder: settings.maxOrder });
  const weights = seats.map(seatWeight);
  const curve = lowFreqs(lo, hi).map((f) => powerMean(seats.map((m) => waveDb(prep, m, f, m)), weights));
  const mean = curve.reduce((a, d) => a + d, 0) / curve.length;
  return Math.sqrt(curve.reduce((a, d) => a + (d - mean) ** 2, 0) / curve.length);
}

/** One radius tried: the speakers carried there, or null when one would leave the room. */
function speakersAt(room, speakers, settings, mix, r) {
  const moved = new Map(carryArray(speakers, settings, mix, { ...settings.layout, radius: r }, room.H).map((m) => [m.id, m]));
  const next = speakers.map((s) => (moved.has(s.id) ? { ...s, ...moved.get(s.id) } : s));
  // through the ceiling right above it, not the room's mean height: a sloped ceiling is lower at one end
  const inside = [...moved.values()].every((m) => pointInPolygon(m.x, m.y, room.poly) && m.z < (room.frame ? heightsAtXY(room, m.x, m.y).ceiling : room.H));
  return inside ? soundingSpeakers(next, settings) : null;
}

/**
 * Score every radius, one per call of the returned step() so a page can keep
 * drawing between them. step() returns false when the sweep is done; then
 * `result` is { tried: [{ r, spread }], best: { r, spread } | null, now }.
 */
export function widthSweep(room, speakers, mics, settings, { from = 0.8, to = 6, step = 0.05 } = {}) {
  const mix = mics.find((m) => m.mix);
  const result = { tried: [], best: null, now: NaN, preset: settings.layout.preset };
  if (!mix) return { result, step: () => false, total: 0 };
  result.now = lowEndSpread(room, soundingSpeakers(speakers, settings), mics, settings);
  const radii = [];
  for (let r = from; r <= to + 1e-9; r += step) radii.push(+r.toFixed(2));
  let i = 0;
  return {
    result,
    total: radii.length,
    step() {
      if (i >= radii.length) return false;
      const r = radii[i++];
      const at = speakersAt(room, speakers, settings, mix, r);
      if (at) {
        const spread = lowEndSpread(room, at, mics, settings);
        result.tried.push({ r, spread });
        if (Number.isFinite(spread) && (!result.best || spread < result.best.spread)) result.best = { r, spread };
      }
      return i < radii.length;
    },
  };
}
