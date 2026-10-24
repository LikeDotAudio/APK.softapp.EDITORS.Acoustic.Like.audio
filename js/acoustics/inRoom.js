// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { pointInPolygon, segmentCross } from './geometry.js';

/**
 * A DEVICE LOST OUTSIDE THE ROOM & IN-ROOM CLAMPING
 *
 * A speaker or mic can end up outside the walls — a plan redrawn smaller, a
 * room swapped, a number typed wrong — where no view shows it to grab. Touch
 * it anywhere it is still listed or drawn (double-click it, or start to drag
 * it) and it comes back inside the room, at a height that fits.
 *
 * All placements actively clamp and bring devices into the room, keeping
 * clearance from the boundaries.
 */

export const EDGE = 0.1;
export const CLEAR_M = 0.3;

/** True when `d` is outside the plan, sitting on/through a wall, or above the ceiling / below the floor. */
export function outside(room, d, margin = 0.05) {
  if (!room) return false;
  const H = room.Hmax ?? room.H ?? 3;
  if (d.z < 0 || d.z > H) return true;
  if (!pointInPolygon(d.x, d.y, room.poly)) return true;
  for (const w of room.walls ?? []) {
    const inside = (d.x - w.a.x) * w.nIn.x + (d.y - w.a.y) * w.nIn.y;
    if (inside < margin) return true;
  }
  return false;
}

/** The middle of the room: the plan's centroid, or the mix seat when a re-entrant plan puts the centroid outside. */
export function middleOf(room, mix = null) {
  const poly = room.poly;
  let a = 0;
  let cx = 0;
  let cy = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const k = p.x * q.y - q.x * p.y;
    a += k;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  });
  const c = Math.abs(a) > 1e-9 ? { x: cx / (3 * a), y: cy / (3 * a) } : poly[0];
  if (pointInPolygon(c.x, c.y, poly)) return c;
  return mix && pointInPolygon(mix.x, mix.y, poly) ? { x: mix.x, y: mix.y } : c;
}

/**
 * Clamp a position to stay safely inside the room walls and ceiling/floor.
 * Any point outside the room or closer to a wall than `margin` is pushed and
 * brought inside along the wall normals or ray from the centre/mix.
 */
export function clampInside(room, p, margin = CLEAR_M, mix = null) {
  if (!room?.walls?.length) return p;
  const poly = room.poly;
  let x = p.x;
  let y = p.y;
  const m = Math.min(margin, (room.W ?? 5) / 4, (room.L ?? 7) / 4);

  // Push inside from all walls where the point is on, through, or closer than margin
  for (let iter = 0; iter < 2; iter++) {
    for (const w of room.walls) {
      const inside = (x - w.a.x) * w.nIn.x + (y - w.a.y) * w.nIn.y;
      if (inside < m) {
        const push = m - inside;
        x += w.nIn.x * push;
        y += w.nIn.y * push;
      }
    }
  }

  // If still outside the polygon (e.g. concave corner or irregular plan), pull along ray from inside
  if (!pointInPolygon(x, y, poly)) {
    const c = middleOf(room, mix);
    let minT = 1;
    for (const w of room.walls) {
      const hit = segmentCross(c, { x, y }, w.a, w.b);
      if (hit && hit.t > 1e-6 && hit.t < minT) minT = hit.t;
    }
    const totalD = Math.hypot(x - c.x, y - c.y) || 1;
    const safeD = Math.max(0, minT * totalD - m);
    x = c.x + (x - c.x) * (safeD / totalD);
    y = c.y + (y - c.y) * (safeD / totalD);
  }

  const H = room.Hmax ?? room.H ?? 3;
  const fallbackZ = p.kind === 'sub' ? 0.3 : 1.2;
  const curZ = p.z ?? fallbackZ;
  const minZ = p.kind === 'sub' ? 0.3 : 0.1;
  const maxZ = Math.max(minZ, H - 0.15);
  const z = Math.max(minZ, Math.min(curZ, maxZ));
  return { ...p, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) };
}

/** Where `d` goes to come back in: { x, y, z } — the middle, its height kept if it fits, else a sensible one. */
export function intoRoom(room, d, kind, mix = null) {
  const c = middleOf(room, mix);
  const H = room.Hmax ?? room.H;
  const fallback = d.kind === 'sub' ? 0.3 : kind === 'mic' ? Math.min(1.2, H * 0.4) : Math.min(1.2, H - 0.3);
  const z = d.z >= EDGE && d.z <= H - EDGE ? d.z : fallback;
  return { x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +z.toFixed(3) };
}
