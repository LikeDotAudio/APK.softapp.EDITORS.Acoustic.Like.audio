// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * WALLS WITH GAPS IN THEM
 *
 * A plan drawn as wall pieces with a doorway left open never closes, so the
 * CAD has no room loop to give us. Here the loose pieces are joined end to end
 * into runs, and the runs joined across the gaps between them into one loop:
 * each gap is an OPENING — a door frame, a pass-through — sound leaves by, as
 * wide as the space to the next piece of wall. A gap wider than `maxGap` is
 * not a doorway but a room still being drawn, and nothing is closed.
 *
 * Plain data: segments { a: {x, y}, b: {x, y} } in metres in, { poly,
 * openings: [{ a, b, width }] } out, or null.
 */

const SNAP = 0.005;

export function planFromWalls(segments, maxGap = 4) {
  const segs = segments.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > SNAP);
  if (segs.length < 2) return null;

  // endpoints within SNAP of each other are one node
  const nodes = [];
  const nodeOf = (p) => {
    let n = nodes.find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= SNAP);
    if (!n) nodes.push((n = { x: p.x, y: p.y, edges: [] }));
    return n;
  };
  const edges = segs.map((s) => {
    const e = { a: nodeOf(s.a), b: nodeOf(s.b), used: false };
    e.a.edges.push(e);
    e.b.edges.push(e);
    return e;
  });

  // the runs: walk from every loose end (then from anywhere, for what is left) until the run stops
  const runs = [];
  const walk = (start) => {
    const pts = [start];
    let at = start;
    for (;;) {
      const e = at.edges.find((x) => !x.used);
      if (!e) break;
      e.used = true;
      at = e.a === at ? e.b : e.a;
      pts.push(at);
    }
    return pts;
  };
  for (const n of nodes) if (n.edges.length === 1 && !n.edges[0].used) runs.push(walk(n));
  for (const n of nodes) while (n.edges.some((e) => !e.used)) runs.push(walk(n));
  const length = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

  // from the longest run, hop to the nearest loose end of another, each hop an opening, then back to the start
  const left = runs.sort((a, b) => length(b) - length(a)).slice(1);
  const loop = [...runs[0]];
  const openings = [];
  const gap = (a, b) => {
    const width = Math.hypot(b.x - a.x, b.y - a.y);
    if (width > SNAP) openings.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, width });
    return width;
  };
  while (left.length) {
    const end = loop[loop.length - 1];
    let best = null;
    left.forEach((r, i) => {
      for (const rev of [false, true]) {
        const p = rev ? r[r.length - 1] : r[0];
        const d = Math.hypot(p.x - end.x, p.y - end.y);
        if (!best || d < best.d) best = { i, rev, d };
      }
    });
    if (best.d > maxGap) return null;
    const run = left.splice(best.i, 1)[0];
    const next = best.rev ? [...run].reverse() : run;
    gap(end, next[0]);
    loop.push(...next.slice(next[0] === end ? 1 : 0));
  }
  const [first, last] = [loop[0], loop[loop.length - 1]];
  if (first === last) loop.pop();
  else if (gap(last, first) > maxGap) return null;
  if (loop.length < 3) return null;
  return { poly: loop.map((p) => ({ x: p.x, y: p.y })), openings };
}

/**
 * The openings that lie along a wall, as spans { from, to, width } in metres
 * from its start `a` — a gap in a straight wall is folded into that wall when
 * the plan is simplified, so it is found again by where it is.
 */
export function openingsOn(wall, openings = []) {
  const out = [];
  for (const o of openings) {
    const along = (p) => (p.x - wall.a.x) * wall.t.x + (p.y - wall.a.y) * wall.t.y;
    const off = (p) => Math.abs((p.x - wall.a.x) * wall.nIn.x + (p.y - wall.a.y) * wall.nIn.y);
    if (off(o.a) > 0.02 || off(o.b) > 0.02) continue;
    const [s0, s1] = [along(o.a), along(o.b)].sort((x, y) => x - y);
    if (s1 < -0.02 || s0 > wall.len + 0.02) continue;
    out.push({ from: Math.max(0, s0), to: Math.min(wall.len, s1), width: o.width });
  }
  return out;
}

/** A wall's name for what the user says about it: its midpoint to the centimetre, so it survives the plan being re-read. */
export const wallKey = (w) => `${Math.round(((w.a.x + w.b.x) / 2) * 100)},${Math.round(((w.a.y + w.b.y) / 2) * 100)}`;
