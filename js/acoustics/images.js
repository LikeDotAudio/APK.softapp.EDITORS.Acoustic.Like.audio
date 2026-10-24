// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from './bands.js';
import { mirrorPoint } from './geometry.js';

/**
 * IMAGE SOURCES FOR AN EXTRUDED ROOM
 *
 * Walls are vertical and floor and ceiling horizontal, so the two families are
 * independent (a sloped ceiling drawn in an elevation is stood in for by its
 * mean height — the image set of the equivalent flat room): a 2-D image of the plan (mirrored across walls) times a 1-D
 * image in height (mirrored across floor and ceiling). Each combination is one
 * virtual source; its order is the sum of the two.
 *
 * Pruning is the convex-room rule: a wall can only reflect an image that sits
 * in front of it. For a rectangle that makes the set exact; for another convex
 * plan it is the standard approximation; for a re-entrant plan some images are
 * ones the room could not produce, and the app says so rather than pretending.
 *
 * Each image carries the 2×2 mirror `M` that made it, so the field can turn
 * the direction it arrives from back into the direction the REAL box radiated
 * — a horn aimed at the audience must not light the wall behind it.
 */

export function planImages(room, src, maxOrder) {
  const out = [{ x: src.x, y: src.y, M: [1, 0, 0, 1], walls: [], order: 0 }];
  let frontier = out;
  for (let order = 1; order <= maxOrder; order++) {
    const next = [];
    for (const img of frontier) {
      const last = img.walls[img.walls.length - 1];
      for (const w of room.walls) {
        if (w.i === last) continue;
        const side = (img.x - w.a.x) * w.nIn.x + (img.y - w.a.y) * w.nIn.y;
        if (side <= 1e-9) continue;
        const p = mirrorPoint(img, w.a, w.nIn);
        const { x: nx, y: ny } = w.nIn;
        const R = [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny];
        const [a, b, c, d] = img.M;
        const M = [R[0] * a + R[1] * c, R[0] * b + R[1] * d, R[2] * a + R[3] * c, R[2] * b + R[3] * d];
        next.push({ x: p.x, y: p.y, M, walls: [...img.walls, w.i], order });
      }
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** Mirrors in the floor at z0 and the ceiling at z1 (a drawn section's mean floor and ceiling; 0 and H for a flat room). */
export function heightImages(z, z1, maxOrder, z0 = 0) {
  const out = [{ z, sign: 1, floor: 0, ceiling: 0, order: 0, last: '' }];
  let frontier = out;
  for (let order = 1; order <= maxOrder; order++) {
    const next = [];
    for (const img of frontier) {
      if (img.last !== 'floor') next.push({ z: 2 * z0 - img.z, sign: -img.sign, floor: img.floor + 1, ceiling: img.ceiling, order, last: 'floor' });
      if (img.last !== 'ceiling') next.push({ z: 2 * z1 - img.z, sign: -img.sign, floor: img.floor, ceiling: img.ceiling + 1, order, last: 'ceiling' });
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** Every virtual source of `src` up to total order `maxOrder`, with per-band energy reflection. */
export function roomImages(room, src, maxOrder) {
  const plan = planImages(room, src, Math.min(maxOrder, planOrderCap(room)));
  const height = heightImages(src.z, room.zCeiling ?? room.H, maxOrder, room.zFloor ?? 0);
  const out = [];
  for (const p of plan) {
    const wallLoss = BANDS.map((_, b) => p.walls.reduce((e, i) => e * (1 - room.walls[i].material.alpha[b]), 1));
    for (const h of height) {
      if (p.order + h.order > maxOrder) continue;
      const refl = wallLoss.map(
        (e, b) => e * (1 - room.floor.alpha[b]) ** h.floor * (1 - room.ceiling.alpha[b]) ** h.ceiling,
      );
      out.push({ x: p.x, y: p.y, z: h.z, M: p.M, zSign: h.sign, order: p.order + h.order, walls: p.walls, floor: h.floor, ceiling: h.ceiling, refl, amp: refl.map(Math.sqrt) });
    }
  }
  return out;
}

/** Plan images grow as walls^order; a tessellated curve has many walls, so it gets fewer orders. */
export function planOrderCap(room) {
  const n = room.walls.length;
  if (n <= 6) return 4;
  if (n <= 12) return 2;
  return 1;
}
