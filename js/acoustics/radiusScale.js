// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { C } from './bands.js';
import { roomImages } from './images.js';
import { carryArray, isMain } from './layouts.js';
import { roomGrowth } from './roomFit.js';

/**
 * WHAT EACH ARRAY WIDTH MEANS, ALONG THE SLIDER
 *
 * The Width slider carries the arranged speakers out along their bearings
 * (layouts.js carryArray). This walks the same radii and, at each, reads three
 * things a scale under the slider can show:
 *
 *   fits     every carried speaker stays clear of the walls and ceiling
 *            (roomFit.js) — the room's footprint, along the slider
 *   direct   ms the main speakers' (L, C, R) sound takes to reach the mix seat
 *   gap      ms from that direct sound to the first reflection off a wall,
 *            floor or ceiling (first-order image sources) — the initial time
 *            delay gap; the earliest over the mains
 *
 * Marks are the radii where those cross round numbers: the direct sound at
 * 5, 10, 15, 20 ms, and the reflection gap falling through 20, 10 and 5 ms —
 * a widening array walks the speakers toward the walls, so the gap shrinks.
 */
export const DIRECT_MARKS_MS = [5, 10, 15, 20];
export const GAP_MARKS_MS = [20, 10, 5];

const ms = (m) => (m / C) * 1000;

/** One radius: { r, fits, direct, gap } — direct and gap NaN with no main speaker. */
function at(room, speakers, settings, mix, r) {
  const moved = new Map(carryArray(speakers, settings, mix, { ...settings.layout, radius: r }, room.H).map((m) => [m.id, m]));
  const carried = speakers.filter((s) => moved.has(s.id)).map((s) => ({ ...s, ...moved.get(s.id) }));
  const fits = !roomGrowth(room, carried).any;
  const ears = { x: mix.x, y: mix.y, z: mix.z ?? 1.2 };
  let direct = NaN;
  let gap = NaN;
  const mains = carried.filter((s) => isMain(s.role));
  const sum = { d: 0, n: 0 };
  for (const s of mains) {
    const d = Math.hypot(s.x - ears.x, s.y - ears.y, s.z - ears.z);
    sum.d += d;
    sum.n++;
    for (const img of roomImages(room, s, 1)) {
      if (img.order !== 1) continue;
      const g = ms(Math.hypot(img.x - ears.x, img.y - ears.y, img.z - ears.z) - d);
      if (!(g >= gap)) gap = g;
    }
  }
  if (sum.n) direct = ms(sum.d / sum.n);
  return { r, fits, direct, gap };
}

/** Every radius from `from` to `to` m, `step` apart: [{ r, fits, direct, gap }]. Empty with no mix seat or no arrangement. */
export function radiusLanes(room, speakers, mics, settings, { from = 0.8, to = 6, step = 0.05 } = {}) {
  const mix = mics.find((m) => m.mix);
  if (!room || !mix) return [];
  const out = [];
  for (let r = from; r <= to + 1e-9; r += step) out.push(at(room, speakers, settings, mix, +r.toFixed(3)));
  return out;
}

/** Where a lane's value crosses each target, interpolated: [{ r, ms }]. */
export function crossings(lanes, key, targets) {
  const out = [];
  for (const t of targets) {
    for (let i = 1; i < lanes.length; i++) {
      const [a, b] = [lanes[i - 1], lanes[i]];
      if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue;
      if ((a[key] - t) * (b[key] - t) > 0 || a[key] === b[key]) continue;
      out.push({ r: a.r + ((t - a[key]) / (b[key] - a[key])) * (b.r - a.r), ms: t });
      break;
    }
  }
  return out;
}
