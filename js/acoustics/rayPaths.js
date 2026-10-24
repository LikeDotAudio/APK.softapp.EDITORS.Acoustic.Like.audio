// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { C } from './bands.js';
import { nearestBand } from './field.js';
import { segmentCross } from './geometry.js';
import { roomImages } from './images.js';
import { deviceGain } from './patterns.js';

/**
 * RAY TRACING — EVERY SPECULAR PATH FROM A BOX TO THE SEAT
 *
 * The image sources the field is summed from (images.js), turned back into
 * the paths sound actually takes: each image is a straight line to the seat in
 * the room unfolded across its mirrors, so walking that line back from the
 * seat finds each bounce where it crosses its wall, and folding its height
 * into floor-to-ceiling finds the floor and ceiling bounces. A wall crossing
 * that misses the wall's extent is a path the room cannot produce — dropped,
 * which also prunes what the convex-room rule let through for a re-entrant plan.
 *
 * Each path's level is at ONE frequency, relative to the direct sound:
 *
 *   dB = gain toward its first leg − gain toward the seat   the box's pattern
 *      + 20·log10(direct / path)                             spreading
 *      + 10·log10(refl[band])                                (1 − α)(1 − s) per bounce
 *
 * the band being the octave nearest the frequency asked for, so sweeping it
 * shows the low end ring round the room and the treatments take the top off.
 */

/** Every path up to `maxOrder` bounces from each speaker to `mix`, at `freq`, loudest last. */
export function rayPaths(room, speakers, mix, freq, maxOrder = 3) {
  if (!room || !mix) return [];
  const band = nearestBand(freq);
  const z0 = room.zFloor ?? 0;
  const z1 = room.zCeiling ?? room.H;
  const out = [];
  for (const s of speakers) {
    const direct = Math.hypot(s.x - mix.x, s.y - mix.y, s.z - mix.z);
    if (direct < 1e-6) continue;
    const toSeat = deviceGain(s, [mix.x - s.x, mix.y - s.y, mix.z - s.z], freq);
    for (const img of roomImages(room, s, maxOrder)) {
      const pts = unfold(room, s, img, mix, z0, z1);
      if (!pts) continue;
      const path = Math.hypot(img.x - mix.x, img.y - mix.y, img.z - mix.z);
      const first = pts[1];
      const keep = img.order ? Math.max(1e-9, img.refl[band]) : 1;
      const db = deviceGain(s, [first.x - s.x, first.y - s.y, first.z - s.z], freq) - toSeat + 20 * Math.log10(direct / path) + 10 * Math.log10(keep);
      out.push({ speaker: s, order: img.order, pts, path, delayMs: ((path - direct) / C) * 1000, db });
    }
  }
  return out.sort((a, b) => a.db - b.db);
}

/**
 * The 3-D path of one image, box first and seat last, or null when one of its
 * wall bounces falls off the wall. `t` runs 0 at the seat to 1 at the image
 * along the unfolded line; every folded leg is that line's piece, unchanged in
 * length, so plan position and height both go linearly in `t` between bounces.
 */
function unfold(room, s, img, mix, z0, z1) {
  // the plan images in the order they were made: s, mirrored by walls[0], then walls[1] …
  const chain = [{ x: s.x, y: s.y }];
  for (const wi of img.walls) {
    const w = room.walls[wi];
    const p = chain[chain.length - 1];
    const d = (p.x - w.a.x) * w.nIn.x + (p.y - w.a.y) * w.nIn.y;
    chain.push({ x: p.x - 2 * d * w.nIn.x, y: p.y - 2 * d * w.nIn.y });
  }
  // walk back from the seat: toward the last image, across the last wall, then on toward the one before
  const plan = [{ t: 0, x: mix.x, y: mix.y }];
  let from = plan[0];
  for (let k = img.walls.length - 1; k >= 0; k--) {
    const w = room.walls[img.walls[k]];
    const hit = segmentCross(from, chain[k + 1], w.a, w.b);
    if (!hit) return null;
    const at = { t: from.t + (1 - from.t) * hit.t, x: w.a.x + (w.b.x - w.a.x) * hit.u, y: w.a.y + (w.b.y - w.a.y) * hit.u };
    plan.push(at);
    from = at;
  }
  plan.push({ t: 1, x: s.x, y: s.y });

  // height: the unfolded z runs straight from the seat to the image; each floor or ceiling it crosses is a bounce
  const zu = (t) => mix.z + (img.z - mix.z) * t;
  const H = z1 - z0;
  const fold = (z) => {
    const m = (((z - z0) % (2 * H)) + 2 * H) % (2 * H);
    return z0 + (m <= H ? m : 2 * H - m);
  };
  const ts = plan.map((p) => p.t);
  const [lo, hi] = [Math.min(mix.z, img.z), Math.max(mix.z, img.z)];
  for (let k = Math.ceil((lo - z0) / H); z0 + k * H < hi; k++) {
    const level = z0 + k * H;
    if (level <= lo) continue;
    ts.push((level - mix.z) / (img.z - mix.z));
  }
  ts.sort((a, b) => a - b);
  const xyAt = (t) => {
    let i = 1;
    while (i < plan.length - 1 && plan[i].t < t) i++;
    const a = plan[i - 1];
    const b = plan[i];
    const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const pts = ts.map((t) => ({ ...xyAt(t), z: fold(zu(t)) })).reverse();
  // the ends exactly where the box and the seat are, not where the arithmetic lands
  pts[0] = { x: s.x, y: s.y, z: s.z };
  pts[pts.length - 1] = { x: mix.x, y: mix.y, z: mix.z };
  return pts;
}
