// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — the cut-aways: the room in three cut-away
 * axonometric views, its cabinets, their mounts, the people. Lifted out of
 * cad/marks.js (ROAD-3753).
 */
import { DEG, pointInPolygon } from '../../acoustics/geometry.js';
import { arrangedSpeakers, layoutCentre, soundingSpeakers } from '../../acoustics/layouts.js';
import { firstReflections, heatOf } from '../../acoustics/reflectionPanels.js';
import { BT, CUTAWAY_LAYER, LAYOUT_LAYER, mm, r3, REFLECTION_LAYER } from './common.js';
import { ELEVATION_LAYER, heightsAtXY } from '../../acoustics/elevations.js';
import { pieceHeight } from '../../acoustics/materials.js';
import { boxSize, isListener, MOUNTS } from '../../acoustics/devices.js';
import { turbo } from '../../views/paint.js';

// ------------------------------------------------------------------ cut-aways

/** Three cameras: behind on the left, behind on the right, and in front looking back. */
const VIEWS = [
  { name: 'behind-left', title: 'CUT-AWAY · from behind, left', az: 135 },
  { name: 'behind-right', title: 'CUT-AWAY · from behind, right', az: -135 },
  { name: 'front', title: 'CUT-AWAY · from the front, looking back', az: 0 },
];
const TILT = 30 * DEG;

/** The cut-aways in a column standing on `base`, read top to bottom in VIEWS order. */
function cutawayMarks(room, state, x0, base, has) {
  // only what stands in this room: a box or a seat left by another plan would stretch the view across the sheet to reach it
  const inside = (p) => pointInPolygon(p.x, p.y, room.poly);
  state = { ...state, speakers: soundingSpeakers(state.speakers, state.settings).filter(inside), mics: state.mics.filter(inside) };
  const items = [];
  const gap = Math.max(0.8, 0.1 * Math.max(room.L, room.W));
  let floor = base;
  const mix = state.mics.find((m) => m.mix);
  const rays = state.settings.cadMarks?.reflections !== false && mix ? firstReflections(room, arrangedSpeakers(state.speakers, state.settings), mix, state.settings.band ?? 2) : [];
  for (const v of [...VIEWS].reverse()) {
    const d = cutaway(room, state, (state.settings.frontDeg + v.az) * DEG, has, rays, mix);
    if (!d.lines.length) continue;
    const h = d.y1 - d.y0;
    // built from the bottom up: each view's bottom-left at (x0, floor), the title just above it
    const at = [r3(x0 - d.x0), r3(floor - d.y0)];
    d.texts.push({ text: v.title, x: d.x0, y: r3(d.y1 + 0.1), height: BT * 1.5 });
    // one block per view — walls, boxes, people, rays, labels and the heat spots together, so the set moves and selects as one
    const fills = d.spots.map((sp) => ({ points: sp.pts, color: sp.color, opacity: sp.opacity, ...(has(REFLECTION_LAYER) ? { layer: REFLECTION_LAYER } : {}) }));
    items.push({ kind: 'drawing', layer: CUTAWAY_LAYER, layerColor: '#94a3b8', name: v.name, at, lines: d.lines, texts: d.texts, fills });
    floor += h + 0.3 + gap;
  }
  return items;
}

/** One axonometric cut-away: lines [x1, y1, x2, y2, layer] in view metres, and its extent. */
function cutaway(room, state, camAz, has, rays = [], mix = null) {
  const v = { x: Math.cos(camAz), y: Math.sin(camAz) };
  const right = { x: -Math.sin(camAz), y: Math.cos(camAz) };
  const P = (p, z) => ({ X: p.x * right.x + p.y * right.y, Y: -(p.x * v.x + p.y * v.y) * Math.sin(TILT) + z * Math.cos(TILT) });
  const lines = [];
  const texts = [];
  const layerOr = (name) => (has(name) ? name : undefined);
  const seg = (a, za, b, zb, layer) => {
    const p = P(a, za);
    const q = P(b, zb);
    lines.push([r3(p.X), r3(p.Y), r3(q.X), r3(q.Y), layer]);
  };
  const poly3 = (pts, layer) => pts.forEach((p, i) => seg(p, p.z, pts[(i + 1) % pts.length], pts[(i + 1) % pts.length].z, layer));

  const cut = new Set();
  for (const w of room.walls) {
    const out = { x: -w.nIn.x, y: -w.nIn.y };
    if (out.x * v.x + out.y * v.y > 0.15) cut.add(w.i);
  }
  for (const w of room.walls) {
    const layer = layerOr(ELEVATION_LAYER[w.face]);
    const n = 6;
    const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: w.a.x + (w.b.x - w.a.x) * (i / n), y: w.a.y + (w.b.y - w.a.y) * (i / n) }));
    const hts = pts.map((p) => heightsAtXY(room, p.x, p.y));
    for (let i = 0; i < n; i++) seg(pts[i], hts[i].floor, pts[i + 1], hts[i + 1].floor, layer);
    if (cut.has(w.i)) continue;
    for (let i = 0; i < n; i++) seg(pts[i], hts[i].ceiling, pts[i + 1], hts[i + 1].ceiling, layer);
    seg(pts[0], hts[0].floor, pts[0], hts[0].ceiling, layer);
    seg(pts[n], hts[n].floor, pts[n], hts[n].ceiling, layer);
  }
  for (const p of room.patches ?? []) {
    if (p.surface === 'wall' && cut.has(p.wall)) continue;
    const layer = p.surface === 'wall' ? layerOr(ELEVATION_LAYER[p.face]) : p.surface === 'ceiling' ? layerOr('Ceiling') : undefined;
    const tall = p.surface === 'floor' ? pieceHeight(p) : 0;
    poly3(p.points3d, layer);
    if (tall) {
      const up = p.points3d.map((q) => ({ ...q, z: q.z + tall }));
      poly3(up, layer);
      p.points3d.forEach((q, i) => seg(q, q.z, up[i], up[i].z, layer));
    }
  }
  // the boxes alone, floating where they sound: stands and brackets would only tangle with the rays (the blow-up's elevations still show them)
  for (const s of state.speakers) {
    const z1 = cabinet(s, seg, layerOr(LAYOUT_LAYER));
    const p = P(s, z1);
    texts.push({ text: s.role || s.name, x: r3(p.X), y: r3(p.Y + 0.05), height: 0.05 });
  }
  // the arrangement round the listener: its ring at ear height, and a line from the ears to every box in it
  const arranged = arrangedSpeakers(state.speakers, state.settings).filter((s) => s.role);
  if (mix && arranged.length && state.settings.show?.arrangement !== false) {
    const layer = layerOr(LAYOUT_LAYER);
    const c = layoutCentre(mix, state.settings.frontDeg, state.settings.layout?.offset);
    const r = state.settings.layout?.radius ?? 2;
    const ring = Array.from({ length: 48 }, (_, i) => ({ x: c.x + r * Math.cos((i / 48) * Math.PI * 2), y: c.y + r * Math.sin((i / 48) * Math.PI * 2), z: c.z }));
    poly3(ring, layer);
    for (const s of arranged) seg(mix, mix.z, s, s.z, layer);
  }
  for (const m of state.mics) {
    if (isListener(m) || m.mix) {
      person(m, seg);
      const p = P(m, m.z + 0.25);
      texts.push({ text: m.mix ? 'MIX' : m.name, x: r3(p.X + 0.12), y: r3(p.Y), height: 0.05 });
      continue;
    }
    const p = P(m, m.z);
    const c = 0.12;
    lines.push([r3(p.X - c), r3(p.Y), r3(p.X + c), r3(p.Y)], [r3(p.X), r3(p.Y - c), r3(p.X), r3(p.Y + c)]);
  }
  const spots = [];
  for (const r of rays) {
    if (r.surface === 'wall' && cut.has(r.wall)) continue;
    seg(r.speaker, r.speaker.z, r.hit, r.hit.z, REFLECTION_LAYER);
    seg(r.hit, r.hit.z, mix, mix.z, REFLECTION_LAYER);
    // the spot lies in its surface: across the wall and up it, or flat for the ceiling and floor
    const w = r.surface === 'wall' ? room.walls[r.wall] : null;
    const along = w ? { x: w.t.x, y: w.t.y, z: 0 } : { x: 1, y: 0, z: 0 };
    const across = w ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    const [cr, cg, cb] = turbo(heatOf(r));
    const color = `#${[cr, cg, cb].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const radius = Math.min(1.2, r.zone);
    for (const k of [1, 0.6, 0.3]) {
      const pts = Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        const [ca, sa] = [Math.cos(a) * radius * k, Math.sin(a) * radius * k];
        const q = P({ x: r.hit.x + along.x * ca + across.x * sa, y: r.hit.y + along.y * ca + across.y * sa }, r.hit.z + along.z * ca + across.z * sa);
        return [r3(q.X), r3(q.Y)];
      });
      spots.push({ pts, color, opacity: 0.12 + 0.18 * heatOf(r) });
    }
    const h = P(r.hit, r.hit.z);
    texts.push({ text: `${r.name} · +${r.delayMs.toFixed(1)} ms · ${r.db.toFixed(0)} dB${r.treated ? ' · treated' : ''}`, x: r3(h.X + 0.05), y: r3(h.Y + 0.05), height: 0.04 });
  }
  const xs = lines.flatMap((l) => [l[0], l[2]]);
  const ys = lines.flatMap((l) => [l[1], l[3]]);
  return { lines, texts, spots, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * A speaker's cabinet in 3-D line work: its size (litres), turned to where it
 * aims, the acoustic centre in its middle, and what holds it up (mountOf).
 * Returns the top of the box.
 */
function cabinet(s, seg, layer, room = null) {
  const size = boxSize(s);
  const f = { x: Math.cos((s.aim ?? 0) * DEG), y: Math.sin((s.aim ?? 0) * DEG) };
  const rt = { x: f.y, y: -f.x };
  const corner = (a, b) => ({ x: s.x + rt.x * a * size.w / 2 + f.x * b * size.d / 2, y: s.y + rt.y * a * size.w / 2 + f.y * b * size.d / 2 });
  const box = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const [z0, z1] = [s.z - size.h / 2, s.z + size.h / 2];
  for (let i = 0; i < 4; i++) {
    const a = box[i];
    const b = box[(i + 1) % 4];
    seg(a, z0, b, z0, layer);
    seg(a, z1, b, z1, layer);
    seg(a, z0, a, z1, layer);
  }
  if (room) drawMount(s, mountOf(s, room), { size, f, z0, z1 }, seg, layer);
  return z1;
}

/** How near a wall must be for a high box to hang on it, and a ceiling for one to drop from it, metres. */
const BRACKET_REACH = 0.6;
const DROP_REACH = 1.0;
/** Below this its bottom is on the floor (a pad or a riser, not a stand); above HUNG_ABOVE too high for a stand: the box is hung. */
const ON_FLOOR_BELOW = 0.15;
const HUNG_ABOVE = 1.6;

/**
 * What holds a speaker up: { kind, label, wall?, foot?, floor, ceiling }.
 * A flush or corner mount is built into a SOFFIT; a free box whose bottom is
 * on the floor stands ON THE FLOOR; one hung high goes on a WALL BRACKET when
 * a wall is within reach behind or beside it, else on a CEILING MOUNT when the
 * ceiling is, else on a tall stand; anything between is on a FLOOR STAND.
 */
export function mountOf(s, room) {
  const size = boxSize(s);
  const z0 = s.z - size.h / 2;
  const z1 = s.z + size.h / 2;
  const { floor, ceiling } = heightsAtXY(room, s.x, s.y);
  if (s.mount && s.mount !== 'free') return { kind: 'soffit', label: `soffit · ${MOUNTS[s.mount]?.label ?? s.mount}`, floor, ceiling };
  if (z0 - floor < ON_FLOOR_BELOW) return { kind: 'floor', label: 'on the floor', floor, ceiling };
  if (z0 - floor > HUNG_ABOVE) {
    let best = null;
    for (const w of room.walls ?? []) {
      const off = { x: s.x - w.a.x, y: s.y - w.a.y };
      const along = off.x * w.t.x + off.y * w.t.y;
      const dist = off.x * w.nIn.x + off.y * w.nIn.y;
      if (along < 0 || along > w.len || dist < 0) continue;
      if (!best || dist < best.dist) best = { w, dist, foot: { x: w.a.x + w.t.x * along, y: w.a.y + w.t.y * along } };
    }
    if (best && best.dist <= BRACKET_REACH + size.d / 2) return { kind: 'bracket', label: 'wall bracket', wall: best.w, foot: best.foot, floor, ceiling };
    if (ceiling - z1 <= DROP_REACH) return { kind: 'ceiling', label: 'ceiling mount', floor, ceiling };
  }
  return { kind: 'stand', label: `floor stand · ${mm(z0 - floor)} mm`, floor, ceiling };
}

/** The mount's line work under, behind or over the box. */
function drawMount(s, m, { size, f, z0, z1 }, seg, layer) {
  const c = { x: s.x, y: s.y };
  const at = (fwd, side) => ({ x: s.x + f.x * fwd + f.y * side, y: s.y + f.y * fwd - f.x * side });
  if (m.kind === 'stand') {
    // a pole from the box's bottom to a tripod, its feet a stand's spread apart
    const knee = m.floor + Math.min(0.35, (z0 - m.floor) / 2);
    seg(c, z0, c, knee, layer);
    for (const a of [0, 120, 240]) {
      const r = (a * Math.PI) / 180;
      seg(c, knee, at(0.3 * Math.cos(r), 0.3 * Math.sin(r)), m.floor, layer);
    }
    // the top plate the box sits on
    const plate = [at(-0.1, -0.1), at(-0.1, 0.1), at(0.1, 0.1), at(0.1, -0.1)];
    plate.forEach((p, i) => seg(p, z0, plate[(i + 1) % 4], z0, layer));
  } else if (m.kind === 'bracket') {
    // an arm from the wall plate to the box's back, braced from below
    const back = at(-size.d / 2, 0);
    const n = { x: m.wall.t.x, y: m.wall.t.y };
    const plate = [-0.12, 0.12].map((k) => ({ x: m.foot.x + n.x * k, y: m.foot.y + n.y * k }));
    for (const z of [s.z + 0.15, z0 - 0.25]) seg(plate[0], z, plate[1], z, layer);
    for (const p of plate) seg(p, s.z + 0.15, p, z0 - 0.25, layer);
    seg(m.foot, s.z, back, s.z, layer);
    seg(m.foot, z0 - 0.25, back, z0, layer);
  } else if (m.kind === 'ceiling') {
    // a drop rod from the box's top to a plate on the ceiling
    seg(c, z1, c, m.ceiling, layer);
    const plate = [at(-0.12, -0.12), at(-0.12, 0.12), at(0.12, 0.12), at(0.12, -0.12)];
    plate.forEach((p, i) => seg(p, m.ceiling, plate[(i + 1) % 4], m.ceiling, layer));
  } else if (m.kind === 'soffit') {
    // the baffle the box is built into: its front face, a hand's width round the box
    const e = 0.15;
    const face = [at(size.d / 2, -size.w / 2 - e), at(size.d / 2, size.w / 2 + e)];
    const [b0, b1] = [Math.max(m.floor, z0 - e), Math.min(m.ceiling, z1 + e)];
    seg(face[0], b0, face[1], b0, layer);
    seg(face[0], b1, face[1], b1, layer);
    seg(face[0], b0, face[0], b1, layer);
    seg(face[1], b0, face[1], b1, layer);
  }
}

/**
 * A seated listener in 3-D line work, ears at `m.z`, facing `m.aim`: the head
 * a ring round the ears, a nose to show which way, the spine down to the
 * seat, shoulders across, thighs forward and shins to the floor.
 */
function person(m, seg) {
  const face = ((m.aim ?? 90) * Math.PI) / 180;
  const f = { x: Math.cos(face), y: Math.sin(face) };
  const rt = { x: f.y, y: -f.x };
  const at = (fwd, side, z) => ({ x: m.x + f.x * fwd + rt.x * side, y: m.y + f.y * fwd + rt.y * side, z });
  const ears = m.z;
  const head = 0.1;
  const ring = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return at(Math.cos(a) * head, Math.sin(a) * head, ears);
  });
  ring.forEach((p, i) => seg(p, p.z, ring[(i + 1) % 12], ring[(i + 1) % 12].z));
  seg(at(head, 0, ears), ears, at(head + 0.05, 0, ears - 0.03), ears - 0.03);
  const neck = ears - 0.15;
  const shoulder = ears - 0.22;
  const hip = Math.max(0.45, ears - 0.75);
  seg(at(0, 0, neck), neck, at(-0.05, 0, hip), hip);
  seg(at(0, -0.2, shoulder), shoulder, at(0, 0.2, shoulder), shoulder);
  for (const side of [-0.1, 0.1]) {
    seg(at(-0.05, side, hip), hip, at(0.4, side, hip), hip);
    seg(at(0.4, side, hip), hip, at(0.45, side, 0), 0);
  }
}


export { cutawayMarks, cabinet, person };
