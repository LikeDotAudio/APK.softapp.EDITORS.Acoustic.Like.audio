// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from './bands.js';
import { mirrorPoint, pointInPolygon } from './geometry.js';
import { furnitureHeight } from './materials.js';

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
 *
 * SPECULAR ONLY. A surface with absorption α and scattering s splits what hits
 * it three ways (the model EASE, ODEON and CATT share): α is absorbed,
 * (1 − α)(1 − s) leaves as a mirror reflection, (1 − α)·s leaves diffusely.
 * An image source IS a mirror reflection, so it carries only the first kind:
 *
 *   refl[b]    = Π over its bounces of (1 − α_b)(1 − s_b)   specular energy
 *   reflAbs[b] = Π over its bounces of (1 − α_b)            what a mirror-hard
 *                                                           path would keep
 *   scatterLoss[b] = 1 − refl/reflAbs                       the share of the
 *                    path's surviving energy that was scattered off it instead
 *
 * The scattered share is not lost — absorption alone removes energy — so the
 * echogram (analysis.js) hands it back to the room as a diffuse tail. The wave
 * method only sees `amp` = √refl: behind a QRD the comb filtering and the
 * early reflection fade, which is exactly what a diffuser is bought for.
 * With s = 0 everywhere, refl is bit-for-bit the old Π(1 − α).
 *
 * THE CONSOLE BOUNCE. A console, desk or rack is not a floor finish: its top
 * is a hard horizontal mirror at its height, under the boxes and in front of
 * the ears — the reflection a designer finds with a mirror laid on the desk.
 * Each top (furnitureTops) adds one first-order image, the box mirrored in
 * the plane of the top, carrying the top's (1 − α)(1 − s): a loaded console's
 * knobs and faders scatter the highs (materials.js console-surface), its flat
 * metal and the low-mids it keeps. Unlike a wall, a top is an island, so the
 * image only reaches a point whose path to it crosses the top inside its
 * outline (imageReaches); and what stands on the floor shadows the floor
 * bounce under it. Only first order: the console's part is the early
 * reflection — comb filtering at the seat, and the low-mid dip of a boundary
 * this close to the source — not the tail.
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

/** Energy a surface keeps in the mirror direction, per band: (1 − α)(1 − s). A material without `scatter` is a mirror. */
export function specular(mat, b) {
  return (1 - mat.alpha[b]) * (1 - (mat.scatter?.[b] ?? 0));
}

/**
 * Every virtual source of `src` up to total order `maxOrder`, with per-band
 * specular energy `refl` (and `amp` = √refl, what the wave sum reads), the
 * absorption-only `reflAbs` and the scattered share `scatterLoss` — see the header.
 */
export function roomImages(room, src, maxOrder) {
  const plan = planImages(room, src, Math.min(maxOrder, planOrderCap(room)));
  const height = heightImages(src.z, room.zCeiling ?? room.H, maxOrder, room.zFloor ?? 0);
  const fSpec = BANDS.map((_, b) => specular(room.floor, b));
  const cSpec = BANDS.map((_, b) => specular(room.ceiling, b));
  const out = [];
  const tops = furnitureTops(room);
  for (const p of plan) {
    const wallAbs = BANDS.map((_, b) => p.walls.reduce((e, i) => e * (1 - room.walls[i].material.alpha[b]), 1));
    const wallSpec = BANDS.map((_, b) => p.walls.reduce((e, i) => e * specular(room.walls[i].material, b), 1));
    for (const h of height) {
      if (p.order + h.order > maxOrder) continue;
      const reflAbs = wallAbs.map(
        (e, b) => e * (1 - room.floor.alpha[b]) ** h.floor * (1 - room.ceiling.alpha[b]) ** h.ceiling,
      );
      const refl = wallSpec.map((e, b) => e * fSpec[b] ** h.floor * cSpec[b] ** h.ceiling);
      const scatterLoss = refl.map((e, b) => (reflAbs[b] > 0 ? Math.max(0, 1 - e / reflAbs[b]) : 0));
      const img = { x: p.x, y: p.y, z: h.z, M: p.M, zSign: h.sign, order: p.order + h.order, walls: p.walls, floor: h.floor, ceiling: h.ceiling, refl, reflAbs, scatterLoss, amp: refl.map(Math.sqrt) };
      // the floor bounce straight to the ears: what stands on the floor there takes it
      if (tops.length && img.order === 1 && img.floor === 1) img.shadows = { z: room.zFloor ?? 0, tops };
      out.push(img);
    }
  }
  if (maxOrder >= 1) for (const top of tops) {
    if (src.z <= top.z) continue;
    const refl = BANDS.map((_, b) => specular(top.material, b));
    const reflAbs = BANDS.map((_, b) => 1 - top.material.alpha[b]);
    const scatterLoss = refl.map((e, b) => (reflAbs[b] > 0 ? Math.max(0, 1 - e / reflAbs[b]) : 0));
    out.push({ x: src.x, y: src.y, z: 2 * top.z - src.z, M: [1, 0, 0, 1], zSign: -1, order: 1, walls: [], floor: 0, ceiling: 0, top, refl, reflAbs, scatterLoss, amp: refl.map(Math.sqrt) });
  }
  return out;
}

const topsCache = new WeakMap();

/**
 * The tops of what stands on the floor — a console, a desk, a rack, a couch:
 * { id, paletteId, z, poly, material } from the room's floor pieces that have
 * a height (materials.js furnitureHeight), z where the top is.
 */
export function furnitureTops(room) {
  if (!room?.patches) return [];
  if (topsCache.has(room)) return topsCache.get(room);
  const tops = room.patches
    .filter((p) => p.surface === 'floor' && p.material && furnitureHeight(p.paletteId) > 0)
    .map((p) => ({
      id: p.id,
      paletteId: p.paletteId,
      z: p.points3d.reduce((t, q) => t + (q.z ?? 0), 0) / p.points3d.length + furnitureHeight(p.paletteId),
      poly: p.points3d.map((q) => ({ x: q.x, y: q.y })),
      material: p.material,
    }));
  topsCache.set(room, tops);
  return tops;
}

/** Where the line from `pt` to an image crosses height z, in plan. */
function crossing(img, pt, z) {
  const u = (pt.z - z) / (pt.z - img.z);
  return { x: pt.x + (img.x - pt.x) * u, y: pt.y + (img.y - pt.y) * u, z };
}

/**
 * Whether an image is heard at `pt`: false for a top's image whose path misses
 * the top (or a point below it), and for the floor bounce when it lands under
 * something standing on the floor. Every other image always is.
 */
export function imageReaches(img, pt) {
  if (img.top) {
    if (pt.z <= img.top.z) return false;
    const at = crossing(img, pt, img.top.z);
    return pointInPolygon(at.x, at.y, img.top.poly);
  }
  if (img.shadows) {
    const at = crossing(img, pt, img.shadows.z);
    return !img.shadows.tops.some((t) => pointInPolygon(at.x, at.y, t.poly));
  }
  return true;
}

/** The bounce point of a top's image on its way to `pt`. */
export const topHit = (img, pt) => crossing(img, pt, img.top.z);

/** Plan images grow as walls^order; a tessellated curve has many walls, so it gets fewer orders. */
export function planOrderCap(room) {
  const n = room.walls.length;
  if (n <= 6) return 4;
  if (n <= 12) return 2;
  return 1;
}
