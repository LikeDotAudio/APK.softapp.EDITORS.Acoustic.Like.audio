// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { mirrorPoint, segmentCross } from './geometry.js';
import { elevationOrigin, faceCoords } from './patches.js';
import { heightsAtXY } from './elevations.js';

/**
 * WHERE THE PANELS GO
 *
 * The first thing a room is treated for: the first reflections. For every
 * speaker (subs excepted — below 120 Hz a panel does nothing) and the mix
 * position, the point on each wall where the mirror path lands — the image of
 * the speaker in that wall, joined to the seat, crosses the wall there — and
 * the point on the ceiling the same way. A panel centred on each is what a
 * designer puts up first ("the mirror trick").
 *
 * The height on a wall: the path rises or falls evenly from the box to the
 * ears, so the hit sits at the fraction of the plan path already travelled.
 * A panel is clamped onto its wall — whole, between the floor and the ceiling.
 *
 * Each panel comes back twice over: where it is in the room (`at`, metres,
 * plan; `z`), and where it is drawn in the CAD (`sheet`, the four corners on
 * the wall's elevation in sheet metres — the frame patches.js reads painted
 * patches in, so a panel drawn there lands back where it was computed; or in
 * plan for the ceiling). Named per face, left to right as the elevation shows
 * it: LEFT-1, LEFT-2 …, and labelled with the speaker it answers.
 */

export function reflectionPanels(room, speakers, mix, { w = 0.6, h = 1.2, cw = 1.2, ch = 1.2, ceiling = true } = {}) {
  if (!room || !mix) return [];
  const out = [];
  for (const s of speakers) {
    if (s.kind === 'sub') continue;
    for (const wall of room.walls) {
      const side = (s.x - wall.a.x) * wall.nIn.x + (s.y - wall.a.y) * wall.nIn.y;
      if (side <= 0) continue;
      const img = mirrorPoint(s, wall.a, wall.nIn);
      const hit = segmentCross(img, mix, wall.a, wall.b);
      if (!hit) continue;
      const at = { x: wall.a.x + (wall.b.x - wall.a.x) * hit.u, y: wall.a.y + (wall.b.y - wall.a.y) * hit.u };
      const q = Math.hypot(at.x - img.x, at.y - img.y) / Math.hypot(mix.x - img.x, mix.y - img.y);
      const hts = heightsAtXY(room, at.x, at.y);
      const z = Math.max(hts.floor + h / 2, Math.min(hts.ceiling - h / 2, s.z + (mix.z - s.z) * q));
      const sheet = onElevation(room, wall, at, z, w, h);
      if (sheet) out.push({ kind: 'wall', face: wall.face, wall: wall.i, speaker: s.role || s.name, at, z, sheet });
    }
    if (!ceiling) continue;
    const top = heightsAtXY(room, mix.x, mix.y).ceiling;
    const up = top - s.z + (top - mix.z);
    if (up <= 0) continue;
    const q = (top - s.z) / up;
    const at = { x: s.x + (mix.x - s.x) * q, y: s.y + (mix.y - s.y) * q };
    const { f, r } = room.frame;
    // a cloud is laid square to the room
    const corner = (a, b) => ({ x: at.x + r.x * a + f.x * b, y: at.y + r.y * a + f.y * b });
    out.push({ kind: 'ceiling', face: 'ceiling', wall: null, speaker: s.role || s.name, at, z: top, sheet: [corner(-cw / 2, -ch / 2), corner(cw / 2, -ch / 2), corner(cw / 2, ch / 2), corner(-cw / 2, ch / 2)] });
  }
  // names: per face, in the order the elevation reads left to right
  const byFace = new Map();
  for (const p of out) {
    if (!byFace.has(p.face)) byFace.set(p.face, []);
    byFace.get(p.face).push(p);
  }
  for (const [face, list] of byFace) {
    list.sort((a, b) => Math.min(...a.sheet.map((c) => c.x)) - Math.min(...b.sheet.map((c) => c.x)));
    list.forEach((p, i) => (p.name = `${face.toUpperCase()}-${i + 1}`));
  }
  return out;
}

/** A panel w × h centred at `at`, z on `wall`, as its four corners on that face's elevation (sheet metres). */
function onElevation(room, wall, at, z, w, h) {
  const origin = elevationOrigin(room, wall.face);
  if (!origin) return null;
  const tOf = faceCoords(room, wall.face);
  const span = wall.face === 'left' || wall.face === 'right' ? room.L : room.W;
  // where along the wall the panel's two edges are, kept on the wall
  const half = Math.min(w / 2, wall.len / 2);
  const u = Math.max(half, Math.min(wall.len - half, (at.x - wall.a.x) * wall.t.x + (at.y - wall.a.y) * wall.t.y));
  const edge = (k) => ({ x: wall.a.x + wall.t.x * (u + k), y: wall.a.y + wall.t.y * (u + k) });
  // sheet x from the face's span t: the inverse of wallPieces' d → t
  const sx = (p) => {
    const t = tOf(p).t;
    const d = wall.face === 'left' || wall.face === 'back' ? span - t : t;
    return origin.x + d;
  };
  const x0 = sx(edge(-half));
  const x1 = sx(edge(half));
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (hi - lo < 1e-6) return null;
  const y0 = origin.y + z - h / 2;
  const y1 = origin.y + z + h / 2;
  return [{ x: lo, y: y0 }, { x: hi, y: y0 }, { x: hi, y: y1 }, { x: lo, y: y1 }];
}
