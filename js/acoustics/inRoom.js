// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { distToSegment, pointInPolygon, segmentCross } from './geometry.js';

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
 *
 * Clearance is measured to each wall as the piece of wall it is, never the
 * line it lies on: in a room with an inward corner (an alcove, a notch) a
 * seat can be well inside yet behind the extension of that corner's walls,
 * and measuring to the line fenced it there.
 */

export const EDGE = 0.1;
export const CLEAR_M = 0.3;

/** True when `d` is outside the plan, sitting on/through a wall, or above the ceiling / below the floor. */
export function outside(room, d, margin = 0.05) {
  if (!room) return false;
  const H = room.Hmax ?? room.H ?? 3;
  if (d.z < 0 || d.z > H) return true;
  if (!pointInPolygon(d.x, d.y, room.poly)) return true;
  return (room.walls ?? []).some((w) => distToSegment(d, w.a, w.b) < margin);
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

  // outside the plan (or through a wall): pulled back along the ray from the middle, `m` short of the first wall it crosses
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

  // closer than `m` to a piece of wall: pushed off it — square off its face, or straight away from the corner at its end
  for (let iter = 0; iter < 3; iter++) {
    for (const w of room.walls) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / l2));
      const q = { x: w.a.x + t * dx, y: w.a.y + t * dy };
      const d = Math.hypot(x - q.x, y - q.y);
      if (d >= m) continue;
      const face = t > 0 && t < 1;
      const dir = face || d < 1e-9 ? w.nIn : { x: (x - q.x) / d, y: (y - q.y) / d };
      const push = face ? m - ((x - w.a.x) * w.nIn.x + (y - w.a.y) * w.nIn.y) : m - d;
      const nx = x + dir.x * push;
      const ny = y + dir.y * push;
      // never off one wall and through another: a gap narrower than 2m keeps the point where it was
      if (pointInPolygon(nx, ny, poly)) [x, y] = [nx, ny];
    }
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
