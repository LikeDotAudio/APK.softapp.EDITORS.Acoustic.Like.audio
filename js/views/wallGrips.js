// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * GRIPPING THE WALLS
 *
 * Walls mode works the room's own lines in the CAD from the plan here: a
 * round grip on every corner, a square one at every wall's middle. A corner
 * dragged takes every wall joined to it along; a middle moves its whole
 * wall, its neighbours stretching after it. The CAD does the editing (its
 * bridge's `walls` command, hostWalls.ts); this works out what was grabbed
 * and where it lands — all in DRAWING units, as the CAD reports and takes
 * them.
 *
 * Where it lands snaps, nearest first, within `reach`:
 *   onto another corner             exactly there — two walls meet
 *   square to a corner              its x or its y, held: the wall runs
 *                                   straight across or straight up the sheet
 *   the grid                        otherwise, every `grid` (10 mm)
 *
 * DRAG TO DRAW. A drag that starts on no grip (or Shift-drag from a corner)
 * draws a new wall from the press to the release, both ends snapped the same
 * way, joined to the corners they land on. A click draws nothing.
 *
 * JOIN AND PART. A corner dropped on another corner joins them (the CAD welds
 * the corners a drag moved); Alt-drag takes one wall's end away on its own.
 * The plan view (plan.js, startWallEdit) does the gestures.
 */

/**
 * The grips of a plan layer's walls: { corners, mids }. A corner is
 * { x, y, refs: [{ edgeId, end }] } — every wall end that meets there; a mid
 * { edgeId, x, y, a, b }. Arcs come over as many short pieces under one id
 * and are left alone, as the CAD's own grips leave them.
 */
export function gripsOf(geometry, layerId, eps = 1e-6) {
  const walls = (geometry?.walls ?? []).filter((w) => w.layerId === layerId);
  const count = new Map();
  for (const w of walls) count.set(w.edgeId, (count.get(w.edgeId) ?? 0) + 1);
  const lines = walls.filter((w) => count.get(w.edgeId) === 1);
  const corners = [];
  const cornerAt = (p) => {
    let c = corners.find((q) => Math.abs(q.x - p[0]) <= eps && Math.abs(q.y - p[1]) <= eps);
    if (!c) corners.push((c = { x: p[0], y: p[1], refs: [] }));
    return c;
  };
  for (const w of lines) {
    cornerAt(w.a).refs.push({ edgeId: w.edgeId, end: 'a' });
    cornerAt(w.b).refs.push({ edgeId: w.edgeId, end: 'b' });
  }
  const mids = lines.map((w) => ({ edgeId: w.edgeId, x: (w.a[0] + w.b[0]) / 2, y: (w.a[1] + w.b[1]) / 2, a: { x: w.a[0], y: w.a[1] }, b: { x: w.b[0], y: w.b[1] } }));
  return { corners, mids };
}

/** The grip under a point, within `reach`: { kind: 'corner' | 'mid', grip }, corners first, or null. */
export function gripAt(grips, p, reach) {
  const near = (g) => Math.hypot(g.x - p.x, g.y - p.y) <= reach;
  const corner = grips.corners.filter(near).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (corner) return { kind: 'corner', grip: corner };
  const mid = grips.mids.find(near);
  return mid ? { kind: 'mid', grip: mid } : null;
}

/**
 * Where a dragged point lands: { x, y, guides } — `guides` the lines it was
 * squared to, [{ x }] or [{ y }], and `onto` the corner it was dropped on.
 * `corners` are the ones it may meet or square to (never itself).
 */
export function snapPoint(p, corners, { reach, grid }) {
  let best = null;
  for (const c of corners) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= reach && (!best || d < best.d)) best = { c, d };
  }
  if (best) return { x: best.c.x, y: best.c.y, guides: [], onto: best.c };
  const nearest = (axis) => {
    let hit = null;
    for (const c of corners) {
      const d = Math.abs(c[axis] - p[axis]);
      if (d <= reach && (!hit || d < hit.d)) hit = { v: c[axis], d };
    }
    return hit;
  };
  const sx = nearest('x');
  const sy = nearest('y');
  const round = (v) => (grid > 0 ? Math.round(v / grid) * grid : v);
  return {
    x: sx ? sx.v : round(p.x),
    y: sy ? sy.v : round(p.y),
    guides: [...(sx ? [{ x: sx.v }] : []), ...(sy ? [{ y: sy.v }] : [])],
    onto: null,
  };
}

/** The corners a grabbed corner may snap to: every other one. A wall's middle snaps its own middle the same way. */
export const othersThan = (grips, corner) => grips.corners.filter((c) => c !== corner);
