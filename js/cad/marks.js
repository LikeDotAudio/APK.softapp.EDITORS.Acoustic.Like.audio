// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ELEVATION_FACES, ELEVATION_LAYER, heightsAtXY } from '../acoustics/elevations.js';
import { boxSize, isListener } from '../acoustics/devices.js';
import { DEG } from '../acoustics/geometry.js';
import { FLOOR_BUILDS, WALL_BUILDS, wallTl } from '../acoustics/isolation.js';
import { arrangedSpeakers, arrayFront, LAYOUTS, layoutCentre, layoutPositions } from '../acoustics/layouts.js';
import { lookup, material } from '../acoustics/materials.js';
import { elevationOrigin } from '../acoustics/patches.js';
import { firstReflections, heatOf, reflectionPanels } from '../acoustics/reflectionPanels.js';
import { fromFrame } from '../acoustics/room.js';
import { turbo } from '../views/paint.js';

/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE
 *
 * Over the bridge's `marks` (CAD hostMarks.ts): sets of things the CAD keeps
 * under a key and this app keeps current. Each set is recomputed from the
 * room after every change and sent only when its hash differs from the one
 * the CAD reports on the sheet, so nothing is redrawn that has not moved.
 *
 *   labels       every wall's elevation and the plan named, with its size and
 *                what it is faced with
 *   panels       an absorber at every first-reflection point — on each wall's
 *                elevation, and clouds on the ceiling — named LEFT-1 … and
 *                labelled with the speaker each answers. They are painted with
 *                a palette product, so they come back as treatments and the
 *                room hears them.
 *   cutaways     the room in three cut-away axonometric views on top of its
 *                blow-up tower: plan, ceiling and the four elevations together, the
 *                walls nearest the eye taken away, panels, desk and speakers in
 *                place. Line work in a block, so it never becomes a wall.
 *                With a mix seat, each speaker's first reflections too: the
 *                ray box → bounce → seat on the "Reflections" layer, and where
 *                it lands a heat spot — the first Fresnel zone, the patch of
 *                surface doing the reflecting, coloured by how loud the bounce
 *                arrives against the direct sound (hot = a panel goes here),
 *                labelled with its delay and level.
 *   sections     the wall build and the floor build as sections, layer by
 *                layer, drawn five times true size so the layers read.
 *   arrangement  the speaker layout's reference lines from the mix seat — the
 *                stereo triangle, the 5.1 ring at ±30° and ±110°, every
 *                preset's angles — with their tolerance windows.
 *   blowup       EVERY room on the sheet laid out surface by surface above its
 *                plan, read top to bottom: the ceiling (and each further
 *                ceiling layer — a soffit, a cloud layer — on its own), the
 *                floor, then every wall at its true length and height, special
 *                walls (a splay, a short return) each their own drawing; each
 *                with its treatments, size, finish and how much is treated.
 *
 * Where they go: one column per room, at the plan's left edge. Above each plan
 * its tower — the blow-up, and on top of the room being designed its
 * cut-aways, one over another; under that room its elevations (seeded there,
 * elevations.js), then the sections — never past the far end of a sheet of
 * many rooms. Labels give lengths in millimetres.
 *
 * Everything here works in sheet METRES; `toCad` scales to drawing units last.
 */

export const MARK_KEYS = ['labels', 'panels', 'cutaways', 'sections', 'arrangement', 'blowup'];

const LAYOUT_LAYER = 'Speaker layout';
const CUTAWAY_LAYER = '3-D cut-aways';
const REFLECTION_LAYER = 'Reflections';
const SECTION_LAYER = 'Construction';
const FURNITURE_HEIGHT = { desk: 0.75, console: 0.85, couch: 0.8, armchair: 0.8, rack: 1.2 };

/** A string hash: what the CAD compares to say "already on the sheet". */
export function hashOf(value) {
  const s = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
/** A length on a drawing's label: whole millimetres. */
const mm = (v) => Math.round(v * 1000);

/** Every set of marks for this room: { key: items } in drawing units. */
export function buildMarks({ room, state, planLayer, sheetBounds, k, layers, rooms = [] }) {
  const out = Object.fromEntries(MARK_KEYS.map((key) => [key, []]));
  if (!room) return out;
  const { settings } = state;
  const on = settings.cadMarks ?? {};
  const mix = state.mics.find((m) => m.mix) ?? null;
  const has = (name) => layers.has(name);
  const toCad = (items) => items.map((it) => scaleItem(it, k));

  if (on.labels) out.labels = toCad(labelMarks(room, settings, planLayer));
  if (on.panels && mix) out.panels = toCad(panelMarks(room, state, mix));
  if (on.arrangement) out.arrangement = toCad(arrangementMarks(room, settings, mix));
  // the tower over each plan: its blow-up, and on top of the room being designed the cut-aways
  const towers = on.blowup ? rooms.map((r) => ({ room: r.room, ...blowupMarks(r.room, r.name, has) })) : [];
  if (on.blowup) out.blowup = toCad(towers.flatMap((t) => t.items));
  const plan = bboxOf(room.poly);
  if (on.cutaways) out.cutaways = toCad(cutawayMarks(room, state, plan.x0, towers.find((t) => t.room === room)?.top ?? plan.y1 + 1.2, has));
  // under the room being designed and its elevations: the sections
  const b = localBounds(room);
  if (on.sections) out.sections = toCad(sectionMarks(settings, b.x0, b.y0 - Math.max(1, 0.15 * Math.max(room.L, room.W))));
  return out;
}

/** The room's plan and every elevation drawn (or that would be seeded) for it. */
function localBounds(room) {
  const b = bboxOf(room.poly);
  for (const face of ELEVATION_FACES) {
    const o = elevationOrigin(room, face);
    if (!o) continue;
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    b.x0 = Math.min(b.x0, o.x);
    b.x1 = Math.max(b.x1, o.x + span);
    b.y0 = Math.min(b.y0, o.y);
    b.y1 = Math.max(b.y1, o.y + (room.Hmax ?? room.H));
  }
  return b;
}

// ------------------------------------------------------------------ labels

function labelMarks(room, settings, planLayer) {
  const items = [];
  const size = Math.max(0.05, Math.min(0.25, Math.max(room.L, room.W) / 60));
  for (const face of ELEVATION_FACES) {
    const prof = room.profiles?.find((p) => p.face === face);
    if (!prof) continue;
    const origin = elevationOrigin(room, face);
    const top = Math.max(...prof.pts.map((p) => p.z));
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    const mat = material(settings.faceMaterials[face]);
    items.push({ kind: 'text', layer: ELEVATION_LAYER[face], at: [origin.x, origin.y + top + size * 0.8], text: `${face.toUpperCase()} WALL · ${mm(span)} × ${mm(top)} mm · ${mat.name}`, height: size });
  }
  const b = bboxOf(room.poly);
  items.push({ kind: 'text', layer: planLayer ?? '0', at: [b.x0, b.y1 + size * 0.8], text: `PLAN · ${mm(room.L)} × ${mm(room.W)} mm · ceiling ${mm(room.H)} mm · ${room.area.toFixed(1)} m² · ${room.V.toFixed(1)} m³`, height: size });
  return items;
}

// ------------------------------------------------------------------ panels

function panelMarks(room, state, mix) {
  const ap = state.settings.autoPanels ?? {};
  const ceilingOn = state.settings.cadMarks?.ceilingPanels !== false;
  const panels = reflectionPanels(room, state.speakers, mix, { w: ap.w ?? 0.6, h: ap.h ?? 1.2, ceiling: ceilingOn });
  const items = [];
  const text = 0.04;
  for (const p of panels) {
    const layer = p.kind === 'ceiling' ? 'Ceiling' : ELEVATION_LAYER[p.face];
    const paletteId = p.kind === 'ceiling' ? ap.ceiling ?? 'cloud-1200' : ap.wall ?? 'panel-1200x600x100';
    items.push({ kind: 'fill', layer, paletteId, points: p.sheet.map((c) => [c.x, c.y]) });
    const x0 = Math.min(...p.sheet.map((c) => c.x));
    const y1 = Math.max(...p.sheet.map((c) => c.y));
    items.push({ kind: 'text', layer, at: [x0, y1 + text * 0.5], text: `${p.name} · ${p.speaker}`, height: text });
  }
  return items;
}

// ------------------------------------------------------------------ arrangement

function arrangementMarks(room, settings, mix) {
  const layout = LAYOUTS[settings.layout?.preset];
  if (!layout) return [];
  const seat = layoutCentre(mix ?? { ...fromFrame(room, 0.38 * room.L, 0.5 * room.W), z: 1.2 }, arrayFront(settings), settings.layout.offset);
  const radius = settings.layout.radius ?? 2;
  const ref = layoutPositions(settings.layout.preset, { x: seat.x, y: seat.y, z: seat.z ?? 1.2 }, arrayFront(settings), radius, 99);
  const lines = [];
  const texts = [];
  const rel = (p) => [r3(p.x - seat.x), r3(p.y - seat.y)];
  const bedRefs = layout.speakers.filter((s) => s.el === 0);
  // the ring at ear height, in azimuth order: the triangle for stereo, the circle's polygon for 5.1 and up
  const bed = ref.filter((p) => !p.sub && bedRefs.some((s) => s.name === p.role)).sort((a, b) => azOf(a, seat, settings) - azOf(b, seat, settings));
  for (const p of ref) {
    if (p.sub) continue;
    const [x, y] = rel(p);
    lines.push([0, 0, x, y]);
    texts.push({ text: `${p.role} ${Math.round(azOf(p, seat, settings))}°`, x: r3(x * 1.08), y: r3(y * 1.08), height: 0.06 });
  }
  if (bed.length === 2) {
    // stereo: the equilateral triangle, seat to L to R
    const [a, b] = bed.map(rel);
    lines.push([a[0], a[1], b[0], b[1]]);
  } else for (let i = 0; i < bed.length; i++) {
    const [a, b] = [rel(bed[i]), rel(bed[(i + 1) % bed.length])];
    lines.push([a[0], a[1], b[0], b[1]]);
  }
  // each reference's tolerance window, as two short spokes at its limits
  for (const s of layout.speakers) {
    if (s.side === 'C' || s.top) continue;
    for (const deg of s.range) {
      const az = (s.az > 0 ? deg : -deg) + arrayFront(settings);
      const r0 = radius * 0.8;
      const r1 = radius * 1.05;
      lines.push([r3(r0 * Math.cos(az * DEG)), r3(r0 * Math.sin(az * DEG)), r3(r1 * Math.cos(az * DEG)), r3(r1 * Math.sin(az * DEG))]);
    }
  }
  texts.push({ text: `${layout.label} · r ${mm(radius)} mm`, x: r3(-radius * 0.5), y: r3(-radius - 0.15), height: 0.06 });
  return [{ kind: 'drawing', layer: LAYOUT_LAYER, layerColor: '#fde047', name: 'arrangement', at: [seat.x, seat.y], lines, texts }];
}

function azOf(p, seat, settings) {
  let az = Math.atan2(p.y - seat.y, p.x - seat.x) / DEG - arrayFront(settings);
  az = ((az + 540) % 360) - 180;
  return az;
}

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
    const tall = p.surface === 'floor' ? furnitureHeight(p.paletteId) : 0;
    poly3(p.points3d, layer);
    if (tall) {
      const up = p.points3d.map((q) => ({ ...q, z: q.z + tall }));
      poly3(up, layer);
      p.points3d.forEach((q, i) => seg(q, q.z, up[i], up[i].z, layer));
    }
  }
  for (const s of state.speakers) {
    // the cabinet at its size (litres), turned to where it aims, the acoustic centre in its middle
    const size = boxSize(s);
    const f = { x: Math.cos((s.aim ?? 0) * DEG), y: Math.sin((s.aim ?? 0) * DEG) };
    const rt = { x: f.y, y: -f.x };
    const corner = (a, b) => ({ x: s.x + rt.x * a * size.w / 2 + f.x * b * size.d / 2, y: s.y + rt.y * a * size.w / 2 + f.y * b * size.d / 2 });
    const box = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const [z0, z1] = [s.z - size.h / 2, s.z + size.h / 2];
    const layer = layerOr(LAYOUT_LAYER);
    for (let i = 0; i < 4; i++) {
      const a = box[i];
      const b = box[(i + 1) % 4];
      seg(a, z0, b, z0, layer);
      seg(a, z1, b, z1, layer);
      seg(a, z0, a, z1, layer);
    }
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

function furnitureHeight(paletteId) {
  const id = String(paletteId ?? '');
  for (const [k, h] of Object.entries(FURNITURE_HEIGHT)) if (id.startsWith(k)) return h;
  return lookup(id)?.category === 'Furniture' ? 0.8 : 0;
}

// ------------------------------------------------------------------ blow-up

const BLOWUP_LAYER = 'Blow-up';
const BT = 0.07;

/**
 * One room, surface by surface, laid out above its plan: ceiling layers on
 * top, then the floor, then the walls in rows — every drawing at true size,
 * outlined, with its treatments drawn on it and named, and a title line.
 */
/** One room's blow-up: { items, top } — `top` where the tower ends, for what stands on it. */
function blowupMarks(room, name, has) {
  if (!room) return { items: [], top: 0 };
  const plan = bboxOf(room.poly);
  const width = Math.max(plan.x1 - plan.x0, 6);
  const gap = 0.6;
  const drawings = [];

  const treated = (pieces, area) => {
    const a = pieces.reduce((t, p) => t + p.area, 0);
    return pieces.length ? ` · ${pieces.length} treatment${pieces.length > 1 ? 's' : ''}, ${a.toFixed(1)} m² (${Math.round((100 * a) / Math.max(area, 1e-9))} %)` : ' · untreated';
  };
  // a top-down drawing of the plan with these pieces on it, (x, y) as they are
  const planDrawing = (title, pieces, area, layer) => {
    const lines = [];
    const texts = [];
    room.poly.forEach((p, i) => {
      const q = room.poly[(i + 1) % room.poly.length];
      lines.push([p.x - plan.x0, p.y - plan.y0, q.x - plan.x0, q.y - plan.y0, layer]);
    });
    for (const pc of pieces) {
      pc.points3d.forEach((p, i) => {
        const q = pc.points3d[(i + 1) % pc.points3d.length];
        lines.push([p.x - plan.x0, p.y - plan.y0, q.x - plan.x0, q.y - plan.y0, layer]);
      });
      const c = centre(pc.points3d);
      texts.push({ text: pieceName(pc), x: c.x - plan.x0, y: c.y - plan.y0, height: BT * 0.7 });
    }
    texts.push({ text: `${title} · ${area.toFixed(1)} m²${treated(pieces, area)}`, x: 0, y: plan.y1 - plan.y0 + 0.12, height: BT });
    return { lines, texts, w: plan.x1 - plan.x0, h: plan.y1 - plan.y0 + 0.3 };
  };

  // the ceiling, and each further layer a ceiling is built in, on its own
  const ceilingPieces = (room.patches ?? []).filter((p) => p.surface === 'ceiling');
  const ceilingLayers = [...new Set(ceilingPieces.map((p) => p.layer ?? 'Ceiling'))].sort((a, b) => (a === 'Ceiling' ? -1 : b === 'Ceiling' ? 1 : a.localeCompare(b)));
  if (!ceilingLayers.length) ceilingLayers.push('Ceiling');
  for (const layer of ceilingLayers) {
    const pcs = ceilingPieces.filter((p) => (p.layer ?? 'Ceiling') === layer);
    const title = layer === 'Ceiling' ? `CEILING · ${room.ceiling?.name ?? ''} · ${mm(room.H)} mm` : `CEILING LAYER “${layer}”`;
    drawings.push({ row: drawings.length, ...planDrawing(title, pcs, room.ceilingArea ?? room.area, has(layer) ? layer : undefined) });
  }
  const floorPieces = (room.patches ?? []).filter((p) => p.surface === 'floor');
  drawings.push({ row: drawings.length, ...planDrawing(`FLOOR · ${room.floor?.name ?? ''}`, floorPieces, room.floorArea ?? room.area, undefined) });

  // every wall, as seen from inside the room: a→b runs right to left
  room.walls.forEach((w, n) => {
    const steps = 8;
    const at = (s) => ({ x: w.a.x + w.t.x * s, y: w.a.y + w.t.y * s });
    const hts = Array.from({ length: steps + 1 }, (_, i) => heightsAtXY(room, at((w.len * i) / steps).x, at((w.len * i) / steps).y));
    const X = (s) => w.len - s;
    const layer = has(ELEVATION_LAYER[w.face]) ? ELEVATION_LAYER[w.face] : undefined;
    const lines = [];
    for (let i = 0; i < steps; i++) {
      const s0 = (w.len * i) / steps;
      const s1 = (w.len * (i + 1)) / steps;
      lines.push([X(s0), hts[i].floor, X(s1), hts[i + 1].floor, layer], [X(s0), hts[i].ceiling, X(s1), hts[i + 1].ceiling, layer]);
    }
    lines.push([X(0), hts[0].floor, X(0), hts[0].ceiling, layer], [X(w.len), hts[steps].floor, X(w.len), hts[steps].ceiling, layer]);
    const texts = [];
    const pcs = (room.patches ?? []).filter((p) => p.surface === 'wall' && p.wall === w.i);
    for (const pc of pcs) {
      const pts = pc.points3d.map((p) => ({ x: X((p.x - w.a.x) * w.t.x + (p.y - w.a.y) * w.t.y), y: p.z }));
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        lines.push([p.x, p.y, q.x, q.y, layer]);
      });
      const c = centre(pts);
      texts.push({ text: pieceName(pc), x: c.x, y: c.y, height: BT * 0.7 });
    }
    const top = Math.max(...hts.map((h) => h.ceiling));
    const same = room.walls.filter((x) => x.face === w.face);
    const label = same.length > 1 ? `${w.face.toUpperCase()} ${same.indexOf(w) + 1}` : w.face.toUpperCase();
    texts.push({ text: `WALL ${n + 1} · ${label} · ${mm(w.len)} × ${mm(top)} mm · ${w.material?.name ?? ''}${treated(pcs, w.area)}`, x: 0, y: top + 0.12, height: BT });
    drawings.push({ wall: true, lines, texts, w: w.len, h: top + 0.3 });
  });

  // stack: ceiling layers and the floor one per row, the walls in rows `width` wide; bottom row just above the plan
  const rows = [];
  for (const d of drawings) {
    if (!d.wall) rows.push([d]);
    else {
      const last = rows[rows.length - 1];
      const used = last?.[0]?.wall ? last.reduce((t, x) => t + x.w + gap, 0) : Infinity;
      if (last && last[0].wall && used + d.w <= width + 1e-9) last.push(d);
      else rows.push([d]);
    }
  }
  const items = [];
  let y = plan.y1 + 1.2 + (name ? 0.3 : 0);
  for (let r = rows.length - 1; r >= 0; r--) {
    let x = plan.x0;
    const h = Math.max(...rows[r].map((d) => d.h));
    for (const d of rows[r]) {
      items.push({ kind: 'drawing', layer: BLOWUP_LAYER, layerColor: '#e2e8f0', name: `${name}:${r}:${x.toFixed(2)}`, at: [r3(x), r3(y)], lines: d.lines.map((l) => l.map((v) => (typeof v === 'number' ? r3(v) : v))), texts: d.texts.map((t) => ({ ...t, x: r3(t.x), y: r3(t.y) })) });
      x += d.w + gap;
    }
    y += h + gap;
  }
  if (name) items.push({ kind: 'text', layer: BLOWUP_LAYER, layerColor: '#e2e8f0', at: [r3(plan.x0), r3(y)], text: `BLOW-UP · ${name} · top to bottom: ceiling, floor, walls`, height: BT * 1.5 });
  return { items, top: y + BT * 1.5 + 1.2 };
}

const centre = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });

/** A treatment's name on a drawing: the product's name, short. */
function pieceName(pc) {
  return String(pc.material?.name ?? pc.paletteId).split(/[,(]/)[0].trim().slice(0, 24);
}

// ------------------------------------------------------------------ construction sections

const EXAGGERATE = 5;
const TEXT = 0.04;

function sectionMarks(settings, x0, top0) {
  const iso = settings.isolation ?? {};
  const items = [];
  const wall = WALL_BUILDS[iso.walls];
  const floor = FLOOR_BUILDS[iso.floor];
  // wall first, the floor under it: the bottom of the drawing's column
  let top = top0;
  const x = x0;
  if (wall?.layers) {
    const tl = wallTl(iso);
    const d = section(wall.layers, 'wall', `WALL BUILD · ${wall.label} · TL ${tl[2]} dB at 500 Hz · drawn ×${EXAGGERATE}`);
    items.push({ kind: 'drawing', layer: SECTION_LAYER, layerColor: '#cbd5e1', name: 'wall', at: [r3(x), r3(top - d.height)], lines: d.lines, texts: d.texts });
    top -= d.height + 0.6;
  }
  if (floor?.layers) {
    const d = section(floor.layers, 'floor', `FLOOR BUILD · ${floor.label}${floor.f0 || iso.f0 ? ` · f0 ${iso.f0 ?? floor.f0} Hz` : ''} · drawn ×${EXAGGERATE}`);
    items.push({ kind: 'drawing', layer: SECTION_LAYER, layerColor: '#cbd5e1', name: 'floor', at: [r3(x), r3(top - d.height)], lines: d.lines, texts: d.texts });
  }
  return items;
}

/**
 * A build as a section: a wall's layers side by side (room on the left), a
 * floor's stacked (room on top). Each layer outlined and hatched by kind,
 * and listed beside it with its thickness.
 */
function section(layers, orient, title) {
  const lines = [];
  const texts = [];
  const LEN = 1.0;
  const rectLines = (x0, y0, x1, y1) => {
    lines.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
  };
  let pos = 0;
  const total = layers.reduce((s, [, mm]) => s + (mm / 1000) * EXAGGERATE, 0);
  layers.forEach(([name, mm, kind], i) => {
    const t = (mm / 1000) * EXAGGERATE;
    const [x0, y0, x1, y1] = orient === 'wall' ? [pos, 0, pos + t, LEN] : [0, total - pos - t, LEN, total - pos];
    rectLines(r3(x0), r3(y0), r3(x1), r3(y1));
    hatch(lines, kind, x0, y0, x1, y1);
    const label = `${i + 1}. ${name} — ${mm} mm`;
    if (orient === 'wall') texts.push({ text: label, x: r3(total + 0.1), y: r3(LEN - 0.07 * (i + 1)), height: TEXT });
    else texts.push({ text: label, x: r3(LEN + 0.1), y: r3(y0 + (y1 - y0) / 2 - TEXT / 2), height: TEXT });
    pos += t;
  });
  texts.push({ text: title, x: 0, y: r3((orient === 'wall' ? LEN : total) + 0.08), height: TEXT * 1.3 });
  texts.push({ text: orient === 'wall' ? 'ROOM ←' : 'ROOM ↑', x: orient === 'wall' ? -0.3 : LEN + 0.1, y: orient === 'wall' ? r3(LEN / 2) : r3(total + 0.02), height: TEXT });
  // the labels run off to the right: about 0.6 of the text height per character of the longest
  const longest = Math.max(...layers.map(([name, mm], i) => `${i + 1}. ${name} — ${mm} mm`.length));
  const width = Math.max((orient === 'wall' ? total : LEN) + 0.1 + longest * TEXT * 0.6, title.length * TEXT * 1.3 * 0.6);
  return { lines, texts, height: orient === 'wall' ? LEN : total, width };
}

function hatch(lines, kind, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const add = (a, b, c, d) => lines.push([r3(a), r3(b), r3(c), r3(d)]);
  if (kind === 'stud') {
    add(x0, y0, x1, y1);
    add(x0, y1, x1, y0);
  } else if (kind === 'insulation') {
    // a zig-zag along the long side, the way insulation is drawn
    const long = Math.max(w, h);
    const n = Math.max(4, Math.round(long / 0.08));
    for (let i = 0; i < n; i++) {
      if (h >= w) add(i % 2 ? x1 : x0, y0 + (h * i) / n, i % 2 ? x0 : x1, y0 + (h * (i + 1)) / n);
      else add(x0 + (w * i) / n, i % 2 ? y1 : y0, x0 + (w * (i + 1)) / n, i % 2 ? y0 : y1);
    }
  } else if (kind === 'masonry' || kind === 'concrete') {
    const step = 0.08;
    for (let s = -h; s < w; s += step) {
      const a = Math.max(0, s);
      const b = Math.min(w, s + h);
      if (b > a) add(x0 + a, y0 + (a - s), x0 + b, y0 + (b - s));
    }
    if (kind === 'concrete') for (let s = 0; s < w + h; s += step * 2) {
      const a = Math.max(0, s - h);
      const b = Math.min(w, s);
      if (b > a) add(x0 + a, y1 - (s - a), x0 + b, y1 - (s - b));
    }
  } else if (kind === 'isolator') {
    const n = Math.max(2, Math.round(Math.max(w, h) / 0.25));
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n;
      if (h >= w) add(x0, y0 + h * c, x1, y0 + h * c);
      else add(x0 + w * c, y0, x0 + w * c, y1);
    }
  } else if (kind === 'wood') {
    if (h >= w) add(x0 + w / 2, y0, x0 + w / 2, y1);
    else add(x0, y0 + h / 2, x1, y0 + h / 2);
  }
}

// ------------------------------------------------------------------ units

function bboxOf(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** A mark in sheet metres → the same in drawing units. */
function scaleItem(it, k) {
  const s = (v) => +(v / k).toFixed(4);
  if (it.kind === 'fill') return { ...it, points: it.points.map(([x, y]) => [s(x), s(y)]) };
  if (it.kind === 'text') return { ...it, at: it.at.map(s), height: s(it.height) };
  return {
    ...it,
    at: it.at.map(s),
    lines: it.lines.map(([a, b, c, d, layer]) => (layer ? [s(a), s(b), s(c), s(d), layer] : [s(a), s(b), s(c), s(d)])),
    texts: (it.texts ?? []).map((t) => ({ ...t, x: s(t.x), y: s(t.y), height: s(t.height) })),
    ...(it.fills ? { fills: it.fills.map((f) => ({ ...f, points: f.points.map(([x, y]) => [s(x), s(y)]) })) } : {}),
  };
}

