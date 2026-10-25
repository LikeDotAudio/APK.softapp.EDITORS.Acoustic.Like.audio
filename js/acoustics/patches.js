// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ensureCCW, isConvex } from './geometry.js';
import { elevationFaceOf, heightsAtXY, seedOutline } from './elevations.js';
import { lookup } from './materials.js';

/**
 * WHAT IS PAINTED ON THE WALLS
 *
 * In the CAD the designer fills an area with a finish or drops a product block
 * (a QRD, a panel, a door) from the palette this app sent it. Each comes back
 * as a PATCH: a polygon on a layer, naming a palette id. Which surface it lands
 * on is the layer's business, the same way the elevations are:
 *
 *   'Elevation Left' (etc.)  the walls of that face. The patch is read in the
 *        elevation's own frame — anchored at the bottom-left of the elevation
 *        loop drawn on that layer, exactly as profileFromLoop reads the loop —
 *        so a panel drawn 1 m up the left elevation is 1 m up the left wall.
 *        With no loop drawn there yet, it is anchored where seedOutline would
 *        put that loop: the CAD seeds it there the moment the wall is opened,
 *        so a patch drawn against the seed means what it shows.
 *   'Ceiling'                the ceiling, read in plan.
 *   anything else            the plan: the floor.
 *
 * An elevation is a projection. A face can have several walls — a splayed
 * plan, a curve tessellated into facets — and each owns the stretch of the
 * face's span axis t (fromFront for a side, fromLeft for front and back) that
 * it covers; where two overlap in t (a recess), the outermost one owns it,
 * because that is the one the elevation draws. A patch is cut along t at the
 * wall boundaries, clipped between that wall's floor and ceiling, and its
 * projected width is stretched back onto the wall: a wall at θ to the face
 * axis is 1/|cos θ| wider than its elevation shows.
 *
 * Everything is integrated in vertical strips, the way measureSection and the
 * silhouette work: at each step along t the patch's crossings give its spans,
 * clipped to the wall's floor…ceiling there. That is exact for any polygon
 * and any slope between steps; the outline handed back (points3d) is the
 * strip envelope, exact for the rectangles and blocks the CAD places.
 *
 * Plain data in, plain data out — the result rides on the room to the worker.
 */

const STEPS = 48;

/**
 * Is this layer the ceiling? 'Ceiling' itself, or any layer named for a part
 * of it — 'Ceiling 2', 'Ceiling – soffit', 'Ceiling clouds' — so a ceiling
 * built in layers is read as one. Case and spaces don't matter.
 */
export const isCeilingLayer = (name) => /^ceiling\b/.test(String(name ?? '').trim().toLowerCase());

/**
 * Lay every patch onto the room. `room` needs poly, walls (with area), frame,
 * L, W, profiles, Hbase. `patches`: [{ id, paletteId, layer, poly: [{x, y}] }]
 * in sheet metres. Returns { pieces, warnings } — one piece per run of a patch
 * on one surface, its material the full catalogue entry.
 */
export function layPatches(room, patches = []) {
  const pieces = [];
  const warnings = [];
  for (const patch of patches) {
    const mat = lookup(patch.paletteId);
    if (!mat) {
      warnings.push(`unknown palette id “${patch.paletteId}” (${patch.id})`);
      continue;
    }
    if (!patch.poly || patch.poly.length < 3) continue;
    const layer = patch.layer ?? patch.layerId;
    const face = elevationFaceOf(layer);
    // a placed block keeps where it sits and its turn: the views draw its pieces there (pieces.js)
    const base = { id: patch.id, paletteId: patch.paletteId, material: mat, layer, ...(patch.at ? { at: patch.at, rotation: patch.rotation ?? 0 } : {}) };
    let got;
    if (face) got = wallPieces(room, face, patch.poly).map((p) => ({ ...base, surface: 'wall', wall: p.wall, face, area: p.area, points3d: p.points3d }));
    else {
      const surface = isCeilingLayer(layer) ? 'ceiling' : 'floor';
      got = planPieces(room, surface, patch.poly).map((p) => ({ ...base, surface, wall: null, face: surface, area: p.area, points3d: p.points3d }));
    }
    if (!got.length) warnings.push(`${patch.id} (${patch.paletteId}) lies on no surface of this room`);
    pieces.push(...got);
  }
  return { pieces, warnings };
}

// ------------------------------------------------------------------ strips

/** Where a vertical line at t crosses a polygon of { t, z }: its spans, as [lo, hi] pairs. Half-open edges, so a vertex counts once. */
function spans(poly, t) {
  const zs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.t <= t && b.t > t) || (b.t <= t && a.t > t)) zs.push(a.z + ((t - a.t) / (b.t - a.t)) * (b.z - a.z));
  }
  zs.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < zs.length; i += 2) out.push([zs[i], zs[i + 1]]);
  return out;
}

const clipSpans = (list, lo, hi) => list.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a);

function intersectSpans(as, bs) {
  const out = [];
  for (const [a0, a1] of as) for (const [b0, b1] of bs) if (Math.min(a1, b1) > Math.max(a0, b0)) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return out;
}

const total = (list) => list.reduce((s, [a, b]) => s + b - a, 0);

/** Sorted, de-duplicated breakpoints inside [lo, hi], with STEPS even steps between. */
function breakpoints(extra, lo, hi) {
  const ts = [...extra];
  for (let i = 0; i <= STEPS; i++) ts.push(lo + ((hi - lo) * i) / STEPS);
  return ts
    .filter((t) => t >= lo - 1e-12 && t <= hi + 1e-12)
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1] > 1e-9);
}

// ------------------------------------------------------------------ walls

/** The face's span axis t and depth d (bigger = further out through that face) of a point on the sheet. */
export function faceCoords(room, face) {
  const { f, r } = room.frame;
  return (p) => {
    const fromFront = room.frame.front - (p.x * f.x + p.y * f.y);
    const fromLeft = p.x * r.x + p.y * r.y - room.frame.left;
    if (face === 'left') return { t: fromFront, d: -fromLeft };
    if (face === 'right') return { t: fromFront, d: fromLeft };
    if (face === 'front') return { t: fromLeft, d: -fromFront };
    return { t: fromLeft, d: fromFront };
  };
}

/**
 * Where an elevation's frame sits on the sheet: the bottom-left of the loop
 * drawn on its layer (profile.origin), or of the seed the CAD would draw.
 */
export function elevationOrigin(room, face) {
  const prof = room.profiles?.find((p) => p.face === face && p.origin);
  if (prof) return prof.origin;
  const seed = seedOutline(room, face);
  if (!seed.length) return null;
  return { x: Math.min(...seed.map((p) => p.x)), y: Math.min(...seed.map((p) => p.y)) };
}

/** A patch on an elevation layer → pieces on the walls of that face: [{ wall, area, points3d }]. */
export function wallPieces(room, face, sheetPoly) {
  const origin = elevationOrigin(room, face);
  if (!origin) return [];
  const span = face === 'left' || face === 'right' ? room.L : room.W;
  // sheet → (t, z), the same d/z mapping as profileFromLoop
  const poly = sheetPoly.map((p) => {
    const d = p.x - origin.x;
    return { t: face === 'left' || face === 'back' ? span - d : d, z: p.y - origin.y };
  });
  const at = faceCoords(room, face);
  const walls = room.walls
    .filter((w) => w.face === face)
    .map((w) => {
      const A = at(w.a);
      const B = at(w.b);
      return { w, tA: A.t, tB: B.t, dA: A.d, dB: B.d, lo: Math.min(A.t, B.t), hi: Math.max(A.t, B.t) };
    })
    .filter((x) => x.hi - x.lo > 1e-6);
  if (!walls.length) return [];

  const pt = poly.map((p) => p.t);
  const lo = Math.max(Math.min(...pt), Math.min(...walls.map((x) => x.lo)));
  const hi = Math.min(Math.max(...pt), Math.max(...walls.map((x) => x.hi)));
  if (hi - lo < 1e-9) return [];
  const profileTs = (room.profiles ?? []).filter((p) => (p.along === 'L') === (face === 'left' || face === 'right')).flatMap((p) => p.pts.map((q) => q.t));
  const ts = breakpoints([...pt, ...walls.flatMap((x) => [x.tA, x.tB]), ...profileTs], lo, hi);

  const owner = (t) => {
    let best = null;
    let bestD = -Infinity;
    for (const x of walls) {
      if (t < x.lo || t > x.hi) continue;
      const d = x.dA + ((t - x.tA) / (x.tB - x.tA)) * (x.dB - x.dA);
      if (d > bestD) (best = x), (bestD = d);
    }
    return best;
  };
  const onWall = (x, t) => {
    const s = (t - x.tA) / (x.tB - x.tA);
    return { x: x.w.a.x + (x.w.b.x - x.w.a.x) * s, y: x.w.a.y + (x.w.b.y - x.w.a.y) * s };
  };
  const clipped = (x, t) => {
    const xy = onWall(x, t);
    const h = heightsAtXY(room, xy.x, xy.y);
    return { xy, list: clipSpans(spans(poly, t), h.floor, h.ceiling) };
  };

  // strips → runs of one wall
  const runs = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    const x = owner((t0 + t1) / 2);
    if (!x) continue;
    const len = total(clipped(x, (t0 + t1) / 2).list);
    if (len <= 1e-12) continue;
    // a strip dt wide on the face is dt / |cos θ| along the wall
    const area = len * (t1 - t0) * (x.w.len / (x.hi - x.lo));
    const run = runs[runs.length - 1];
    if (run && run.x === x && Math.abs(run.t1 - t0) < 1e-9) {
      run.t1 = t1;
      run.area += area;
      run.strips.push([t0, t1]);
    } else runs.push({ x, t1, area, strips: [[t0, t1]] });
  }

  return runs.map((run) => {
    const top = [];
    const bottom = [];
    for (const [t0, t1] of run.strips) {
      const e = Math.min(1e-6, (t1 - t0) / 4);
      for (const t of [t0 + e, t1 - e]) {
        const { xy, list } = clipped(run.x, t);
        if (!list.length) continue;
        top.push({ x: xy.x, y: xy.y, z: Math.max(...list.map((s) => s[1])) });
        bottom.push({ x: xy.x, y: xy.y, z: Math.min(...list.map((s) => s[0])) });
      }
    }
    return { wall: run.x.w.i, area: run.area, points3d: simplify3d([...top, ...bottom.reverse()]) };
  });
}

// ------------------------------------------------------------------ floor and ceiling

/** A patch in plan → its piece on the floor or ceiling: [{ area, points3d }] (empty when it misses the room). */
export function planPieces(room, surface, sheetPoly) {
  const P = sheetPoly.map((p) => ({ t: p.x, z: p.y }));
  const R = room.poly.map((p) => ({ t: p.x, z: p.y }));
  const px = P.map((p) => p.t);
  const lo = Math.max(Math.min(...px), Math.min(...R.map((p) => p.t)));
  const hi = Math.min(Math.max(...px), Math.max(...R.map((p) => p.t)));
  if (hi - lo < 1e-9) return [];
  const ts = breakpoints([...px, ...R.map((p) => p.t)], lo, hi);
  const sloped = room.profiles?.length > 0;
  const cell = Math.max(room.L, room.W) / 32;
  const height = (x, y) => heightsAtXY(room, x, y)[surface];
  // a sloped surface is bigger than its plan: √(1 + |∇h|²), as measureSection integrates it
  const stretch = (x, y) => {
    const h = 0.02;
    const gx = (height(x + h, y) - height(x - h, y)) / (2 * h);
    const gy = (height(x, y + h) - height(x, y - h)) / (2 * h);
    return Math.sqrt(1 + gx * gx + gy * gy);
  };
  let area = 0;
  for (let i = 0; i + 1 < ts.length; i++) {
    const x = (ts[i] + ts[i + 1]) / 2;
    const dx = ts[i + 1] - ts[i];
    for (const [y0, y1] of intersectSpans(spans(P, x), spans(R, x))) {
      if (!sloped) {
        area += (y1 - y0) * dx;
        continue;
      }
      const k = Math.max(1, Math.ceil((y1 - y0) / cell));
      for (let j = 0; j < k; j++) area += ((y1 - y0) / k) * dx * stretch(x, y0 + ((j + 0.5) * (y1 - y0)) / k);
    }
  }
  if (area <= 1e-12) return [];
  const outline = densify(clipPolygon(sheetPoly, room.poly), sloped ? 0.25 : Infinity);
  return [{ area, points3d: outline.map((p) => ({ x: p.x, y: p.y, z: height(p.x, p.y) })) }];
}

/**
 * The patch ∩ the room as one outline, Sutherland–Hodgman: it needs a convex
 * clip, so whichever of the two is convex clips the other. Both concave (rare:
 * an L-shaped fill in an L-shaped room) keeps the patch as drawn — the area
 * above is still exact; only the drawn outline overhangs.
 */
function clipPolygon(patch, room) {
  if (isConvex(room)) return sutherlandHodgman(patch, ensureCCW(room));
  if (isConvex(patch)) return sutherlandHodgman(room, ensureCCW(patch));
  return patch;
}

function sutherlandHodgman(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const k = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
      }
    }
  }
  return out;
}

function densify(poly, step) {
  if (!Number.isFinite(step)) return poly.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  return out;
}

/** Drop points that sit on the line through their neighbours, and repeats. */
function simplify3d(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    if (a) {
      const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const cross = Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
      if (cross < 1e-9) continue;
    }
    out.push(b);
  }
  return out;
}

