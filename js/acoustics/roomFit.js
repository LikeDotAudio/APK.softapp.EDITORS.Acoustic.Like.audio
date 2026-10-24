// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { WALL_FACES } from './room.js';
import { heightsAtXY } from './elevations.js';

/**
 * HOW MUCH BIGGER THE ROOM WOULD HAVE TO BE
 *
 * The array is sized for the listener, not for the walls: widen it and a
 * speaker can end up through a wall or the ceiling. Rather than refuse, this
 * says what the room would need: for every speaker outside the room, or
 * closer to a wall than `clear` (the box's own depth and a hand behind it),
 * the wall nearest it has to move out by the difference. Each face of the
 * room (front, back, left, right, as room.js names its walls) moves out by
 * the most any of its walls must; the ceiling goes up by however far a box,
 * plus `headroom`, rises past the ceiling right above it (a sloped ceiling is
 * lower at one end than its mean).
 *
 * Returns { front, back, left, right, up, wider, deeper, any } in metres,
 * `wider` = left + right and `deeper` = front + back. Plain data, cheap: the
 * plan and the toolbar call it on every draw.
 */
export const CLEAR_M = 0.3;
export const HEADROOM_M = 0.2;

export function roomGrowth(room, speakers, { clear = CLEAR_M, headroom = HEADROOM_M } = {}) {
  const grow = { front: 0, back: 0, left: 0, right: 0, up: 0 };
  if (!room?.walls?.length) return { ...grow, wider: 0, deeper: 0, any: false };
  for (const s of speakers) {
    const near = nearestWall(room, s);
    if (near && near.inside < clear && WALL_FACES.includes(near.wall.face)) {
      grow[near.wall.face] = Math.max(grow[near.wall.face], clear - near.inside);
    }
    if (Number.isFinite(s.z)) grow.up = Math.max(grow.up, s.z + headroom - ceilingAt(room, s));
  }
  for (const k of Object.keys(grow)) grow[k] = Math.round(Math.max(0, grow[k]) * 100) / 100;
  const wider = +(grow.left + grow.right).toFixed(2);
  const deeper = +(grow.front + grow.back).toFixed(2);
  return { ...grow, wider, deeper, any: wider > 0 || deeper > 0 || grow.up > 0 };
}

/** The ceiling height right above a point: the drawn elevations' where there are any, the room's height where not. */
const ceilingAt = (room, p) => (room.frame ? heightsAtXY(room, p.x, p.y).ceiling : room.H);

/** The wall closest to p, and how far p is inside it (negative: through it). */
function nearestWall(room, p) {
  let best = null;
  for (const w of room.walls) {
    const s = Math.max(0, Math.min(w.len, (p.x - w.a.x) * w.t.x + (p.y - w.a.y) * w.t.y));
    const dist = Math.hypot(p.x - (w.a.x + w.t.x * s), p.y - (w.a.y + w.t.y * s));
    if (!best || dist < best.dist) best = { wall: w, dist, inside: (p.x - w.a.x) * w.nIn.x + (p.y - w.a.y) * w.nIn.y };
  }
  return best;
}

/** The growth in a line: "+0.62 m wide · +0.40 m deep · +0.10 m higher", or ''. */
export function growthText(g) {
  if (!g?.any) return '';
  const m = (v) => `+${v.toFixed(2)} m`;
  return [g.wider ? `${m(g.wider)} wide` : '', g.deeper ? `${m(g.deeper)} deep` : '', g.up ? `${m(g.up)} higher` : ''].filter(Boolean).join(' · ');
}

/** Which walls move and by how much, for a tooltip: "left wall out 0.31 m, right wall out 0.31 m". */
export function growthDetail(g) {
  if (!g?.any) return '';
  const parts = ['front', 'back', 'left', 'right'].filter((f) => g[f]).map((f) => `${f} wall out ${g[f].toFixed(2)} m`);
  if (g.up) parts.push(`ceiling up ${g.up.toFixed(2)} m`);
  return parts.join(', ');
}
