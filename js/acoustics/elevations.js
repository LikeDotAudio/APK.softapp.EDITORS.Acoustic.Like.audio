// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { pointInPolygon } from './geometry.js';

/**
 * THE WALLS, DRAWN IN THE CAD TOO
 *
 * The plan is one closed loop in the CAD; each of the four elevations can be
 * another, in the same file, on its own layer (ELEVATION_LAYER). A side
 * elevation is the room's long section — a raked floor, a sloped or stepped
 * ceiling — and a front or back elevation its cross section — a vault, a
 * pitched roof. The room is the plan extruded and cut by every elevation drawn:
 * at any point, the ceiling is the lowest any elevation allows there and the
 * floor the highest. An elevation not drawn cuts nothing; with none drawn the
 * room is the plan at the inspector's ceiling height, as it always was.
 *
 * An elevation is read the way its tile shows it — from inside the room, its
 * left edge at the left of the view — anchored at its own bottom-left: the
 * lowest point is z = 0, the leftmost is where the room begins in that view.
 * So it can sit anywhere on the sheet, and its size is the room's size.
 *
 * Everything here is plain data in, plain data out: the room travels to the
 * field worker by structured clone, and these are what it samples heights with
 * there.
 */

export const ELEVATION_FACES = ['front', 'back', 'left', 'right'];

export const ELEVATION_LAYER = { front: 'Elevation Front', back: 'Elevation Back', left: 'Elevation Left', right: 'Elevation Right' };

export function elevationFaceOf(layerName) {
  return ELEVATION_FACES.find((f) => ELEVATION_LAYER[f].toLowerCase() === String(layerName ?? '').trim().toLowerCase()) ?? null;
}

/** Sides run along the length (fromFront, 0…L); front and back across the width (fromLeft, 0…W). */
export const alongLength = (face) => face === 'left' || face === 'right';

/**
 * A CAD loop (metres, sheet frame) → the face's profile: points { t, z } with t
 * measured in the front frame (fromFront for a side, fromLeft for front/back).
 */
export function profileFromLoop(face, poly, L, W) {
  const minX = Math.min(...poly.map((p) => p.x));
  const minY = Math.min(...poly.map((p) => p.y));
  const pts = poly.map((p) => {
    const d = p.x - minX;
    const t = face === 'left' ? L - d : face === 'back' ? W - d : d;
    return { t, z: p.y - minY };
  });
  return { face, along: alongLength(face) ? 'L' : 'W', pts };
}

/** The vertical span of a profile at t: { lo, hi }, or null when it has no area. Clamped to its ends. */
export function spanAt(pts, t) {
  const ts = pts.map((p) => p.t);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  if (t1 - t0 < 1e-9) return null;
  const at = Math.min(t1 - 1e-6, Math.max(t0 + 1e-6, t));
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a.t <= at && b.t >= at) || (b.t <= at && a.t >= at)) {
      const dt = b.t - a.t;
      const z = Math.abs(dt) < 1e-12 ? Math.max(a.z, b.z) : a.z + ((at - a.t) / dt) * (b.z - a.z);
      if (Math.abs(dt) < 1e-12) lo = Math.min(lo, a.z, b.z);
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  }
  return hi > lo ? { lo, hi } : null;
}

/** Floor and ceiling at a point given in the front frame. */
export function heightsAt(room, fromFront, fromLeft) {
  if (!room.profiles?.length) return { floor: 0, ceiling: room.Hbase };
  let floor = -Infinity;
  let ceiling = Infinity;
  for (const p of room.profiles) {
    const s = spanAt(p.pts, p.along === 'L' ? fromFront : fromLeft);
    if (!s) continue;
    floor = Math.max(floor, s.lo);
    ceiling = Math.min(ceiling, s.hi);
  }
  if (!Number.isFinite(floor)) return { floor: 0, ceiling: room.Hbase };
  return { floor, ceiling: Math.max(floor, ceiling) };
}

/** Floor and ceiling at a point on the sheet (metres). */
export function heightsAtXY(room, x, y) {
  const { f, r } = room.frame;
  return heightsAt(room, room.frame.front - (x * f.x + y * f.y), x * r.x + y * r.y - room.frame.left);
}

/**
 * The shape of the room as it integrates: volume, the true areas of the floor
 * and ceiling (a slope is bigger than its plan), each wall's area, and the
 * mean floor and ceiling heights that the box-shaped methods stand in with.
 */
export function measureSection(room, n = 48) {
  const { L, W } = room;
  const ds = L / n;
  const dq = W / n;
  const cell = ds * dq;
  const c = [];
  for (let i = 0; i < n; i++) {
    c.push([]);
    for (let j = 0; j < n; j++) {
      const s = (i + 0.5) * ds;
      const q = (j + 0.5) * dq;
      const { f, r } = room.frame;
      const a = room.frame.front - s;
      const b = room.frame.left + q;
      const inside = pointInPolygon(a * f.x + b * r.x, a * f.y + b * r.y, room.poly);
      c[i].push(inside ? heightsAt(room, s, q) : null);
    }
  }
  let V = 0;
  let planArea = 0;
  let floorArea = 0;
  let ceilingArea = 0;
  let floorSum = 0;
  let ceilSum = 0;
  let Hmax = 0;
  const grad = (i, j, key) => {
    const v = c[i][j][key];
    const di = c[Math.min(n - 1, i + 1)][j] ?? c[i][j];
    const dj = c[i][Math.min(n - 1, j + 1)] ?? c[i][j];
    return Math.hypot((di[key] - v) / ds, (dj[key] - v) / dq);
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const h = c[i][j];
      if (!h) continue;
      planArea += cell;
      V += (h.ceiling - h.floor) * cell;
      floorSum += h.floor * cell;
      ceilSum += h.ceiling * cell;
      Hmax = Math.max(Hmax, h.ceiling);
      floorArea += cell * Math.sqrt(1 + grad(i, j, 'floor') ** 2);
      ceilingArea += cell * Math.sqrt(1 + grad(i, j, 'ceiling') ** 2);
    }
  // The sampled plan area drifts from the exact one by the cells on the edge;
  // scale the sums to the exact area so a flat room gives exactly area × H.
  const k = planArea ? room.area / planArea : 1;
  const wallAreas = room.walls.map((w) => {
    const m = Math.max(4, Math.ceil(w.len / Math.min(ds, dq)));
    let A = 0;
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      const h = heightsAtXY(room, w.a.x + (w.b.x - w.a.x) * t, w.a.y + (w.b.y - w.a.y) * t);
      A += (h.ceiling - h.floor) * (w.len / m);
      Hmax = Math.max(Hmax, h.ceiling);
    }
    return A;
  });
  return {
    V: V * k,
    floorArea: floorArea * k,
    ceilingArea: ceilingArea * k,
    zFloor: planArea ? floorSum / planArea : 0,
    zCeiling: planArea ? ceilSum / planArea : room.Hbase,
    Hmax,
    wallAreas,
  };
}

/**
 * The room as one face's elevation shows it: for each step along the view,
 * the highest ceiling and lowest floor anywhere behind it. `u` is the view's
 * horizontal coordinate (the same one faceView projects with), so the outline
 * drops straight onto the tile — and, offset, onto the CAD sheet as a seed.
 */
export function silhouette(room, face, n = 64) {
  const along = alongLength(face);
  const span = along ? room.L : room.W;
  const across = along ? room.W : room.L;
  const { f, r } = room.frame;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * span;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= 24; j++) {
      const o = (j / 24) * across;
      const s = along ? t : o;
      const q = along ? o : t;
      const a = room.frame.front - s;
      const b = room.frame.left + q;
      const x = a * f.x + b * r.x;
      const y = a * f.y + b * r.y;
      if (j > 0 && j < 24 && !pointInPolygon(x, y, room.poly)) continue;
      const h = heightsAt(room, s, q);
      lo = Math.min(lo, h.floor);
      hi = Math.max(hi, h.ceiling);
    }
    if (!Number.isFinite(lo)) continue;
    // u as faceView's rightAxis projects: see rightAxis there.
    const u = face === 'left' ? room.frame.front - t : face === 'right' ? t - room.frame.front : face === 'front' ? room.frame.left + t : -(room.frame.left + t);
    out.push({ u, lo, hi });
  }
  return out.sort((a, b) => a.u - b.u);
}

/** A silhouette as one closed outline in (u, z): along the ceiling, back along the floor. */
export function silhouetteLoop(sil) {
  const top = sil.map((p) => ({ u: p.u, z: p.hi }));
  const bottom = [...sil].reverse().map((p) => ({ u: p.u, z: p.lo }));
  return simplifyChain([...top, ...bottom]);
}

function simplifyChain(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    if (a && Math.abs((b.u - a.u) * (c.z - a.z) - (b.z - a.z) * (c.u - a.u)) < 1e-6) continue;
    out.push(b);
  }
  return out;
}

/**
 * Where on the sheet a face's elevation is drawn when the CAD has none yet: a
 * row under the plan, front · back · left · right, a gap between each.
 * Returns the outline in sheet metres.
 */
export function seedOutline(room, face) {
  const xs = room.poly.map((p) => p.x);
  const ys = room.poly.map((p) => p.y);
  const gap = Math.max(1, 0.25 * Math.max(room.L, room.W));
  let x = Math.min(...xs);
  const top = Math.min(...ys) - gap;
  for (const g of ELEVATION_FACES) {
    const loop = silhouetteLoop(silhouette(room, g, 16));
    const u0 = Math.min(...loop.map((p) => p.u));
    const u1 = Math.max(...loop.map((p) => p.u));
    const z1 = Math.max(...loop.map((p) => p.z));
    if (g === face) return loop.map((p) => ({ x: x + p.u - u0, y: top - z1 + p.z }));
    x += u1 - u0 + gap;
  }
  return [];
}
