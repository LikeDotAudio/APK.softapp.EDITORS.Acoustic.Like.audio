// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ELEVATION_FACES, ELEVATION_LAYER, heightsAtXY } from '../acoustics/elevations.js';
import { DEG } from '../acoustics/geometry.js';
import { FLOOR_BUILDS, WALL_BUILDS, wallTl } from '../acoustics/isolation.js';
import { LAYOUTS, layoutPositions } from '../acoustics/layouts.js';
import { lookup, material } from '../acoustics/materials.js';
import { elevationOrigin } from '../acoustics/patches.js';
import { reflectionPanels } from '../acoustics/reflectionPanels.js';
import { fromFrame } from '../acoustics/room.js';

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
 *   cutaways     the room in three cut-away axonometric views beside the
 *                drawing: plan, ceiling and the four elevations together, the
 *                walls nearest the eye taken away, panels, desk and speakers in
 *                place. Line work in a block, so it never becomes a wall.
 *   sections     the wall build and the floor build as sections, layer by
 *                layer, drawn five times true size so the layers read.
 *   arrangement  the speaker layout's reference lines from the mix seat — the
 *                stereo triangle, the 5.1 ring at ±30° and ±110°, every
 *                preset's angles — with their tolerance windows.
 *
 * Everything here works in sheet METRES; `toCad` scales to drawing units last.
 */

export const MARK_KEYS = ['labels', 'panels', 'cutaways', 'sections', 'arrangement'];

const LAYOUT_LAYER = 'Speaker layout';
const CUTAWAY_LAYER = '3-D cut-aways';
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

/** Every set of marks for this room: { key: items } in drawing units. */
export function buildMarks({ room, state, planLayer, sheetBounds, k, layers }) {
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
  const b = sheetBounds ?? bboxOf(room.poly);
  if (on.cutaways) out.cutaways = toCad(cutawayMarks(room, state, b, has));
  if (on.sections) out.sections = toCad(sectionMarks(settings, b));
  return out;
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
    items.push({ kind: 'text', layer: ELEVATION_LAYER[face], at: [origin.x, origin.y + top + size * 0.8], text: `${face.toUpperCase()} WALL · ${span.toFixed(2)} × ${top.toFixed(2)} m · ${mat.name}`, height: size });
  }
  const b = bboxOf(room.poly);
  items.push({ kind: 'text', layer: planLayer ?? '0', at: [b.x0, b.y1 + size * 0.8], text: `PLAN · ${room.L.toFixed(2)} × ${room.W.toFixed(2)} m · ceiling ${room.H.toFixed(2)} m · ${room.area.toFixed(1)} m² · ${room.V.toFixed(1)} m³`, height: size });
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
  const seat = mix ?? { ...fromFrame(room, 0.38 * room.L, 0.5 * room.W), z: 1.2 };
  const radius = settings.layout.radius ?? 2;
  const ref = layoutPositions(settings.layout.preset, { x: seat.x, y: seat.y, z: seat.z ?? 1.2 }, settings.frontDeg, radius, 99);
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
      const az = (s.az > 0 ? deg : -deg) + settings.frontDeg;
      const r0 = radius * 0.8;
      const r1 = radius * 1.05;
      lines.push([r3(r0 * Math.cos(az * DEG)), r3(r0 * Math.sin(az * DEG)), r3(r1 * Math.cos(az * DEG)), r3(r1 * Math.sin(az * DEG))]);
    }
  }
  texts.push({ text: `${layout.label} · r ${radius.toFixed(1)} m`, x: r3(-radius * 0.5), y: r3(-radius - 0.15), height: 0.06 });
  return [{ kind: 'drawing', layer: LAYOUT_LAYER, layerColor: '#fde047', name: 'arrangement', at: [seat.x, seat.y], lines, texts }];
}

function azOf(p, seat, settings) {
  let az = Math.atan2(p.y - seat.y, p.x - seat.x) / DEG - settings.frontDeg;
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

function cutawayMarks(room, state, b, has) {
  const items = [];
  const gap = Math.max(1, 0.2 * Math.max(room.L, room.W));
  let x = b.x1 + gap * 1.5;
  for (const v of VIEWS) {
    const d = cutaway(room, state, (state.settings.frontDeg + v.az) * DEG, has);
    if (!d.lines.length) continue;
    const w = d.x1 - d.x0;
    // base point = the view's bottom-left, so the views sit in a row along the top of the drawing
    const at = [r3(x - d.x0), r3(b.y1 - d.y0 - (d.y1 - d.y0))];
    d.texts.push({ text: v.title, x: d.x0, y: r3(d.y1 + 0.15), height: Math.max(0.06, r3(w / 60)) });
    items.push({ kind: 'drawing', layer: CUTAWAY_LAYER, layerColor: '#94a3b8', name: v.name, at, lines: d.lines, texts: d.texts });
    x += w + gap;
  }
  return items;
}

/** One axonometric cut-away: lines [x1, y1, x2, y2, layer] in view metres, and its extent. */
function cutaway(room, state, camAz, has) {
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
    const c = 0.14;
    const box = [
      { x: s.x - c, y: s.y - c },
      { x: s.x + c, y: s.y - c },
      { x: s.x + c, y: s.y + c },
      { x: s.x - c, y: s.y + c },
    ];
    const layer = layerOr(LAYOUT_LAYER);
    for (let i = 0; i < 4; i++) {
      const a = box[i];
      const b = box[(i + 1) % 4];
      seg(a, s.z - c, b, s.z - c, layer);
      seg(a, s.z + c, b, s.z + c, layer);
      seg(a, s.z - c, a, s.z + c, layer);
    }
    const p = P(s, s.z + c);
    texts.push({ text: s.role || s.name, x: r3(p.X), y: r3(p.Y + 0.05), height: 0.05 });
  }
  for (const m of state.mics) {
    const p = P(m, m.z);
    const c = 0.12;
    lines.push([r3(p.X - c), r3(p.Y), r3(p.X + c), r3(p.Y)], [r3(p.X), r3(p.Y - c), r3(p.X), r3(p.Y + c)]);
    if (m.mix) texts.push({ text: 'MIX', x: r3(p.X + c), y: r3(p.Y + c), height: 0.05 });
  }
  const xs = lines.flatMap((l) => [l[0], l[2]]);
  const ys = lines.flatMap((l) => [l[1], l[3]]);
  return { lines, texts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function furnitureHeight(paletteId) {
  const id = String(paletteId ?? '');
  for (const [k, h] of Object.entries(FURNITURE_HEIGHT)) if (id.startsWith(k)) return h;
  return lookup(id)?.category === 'Furniture' ? 0.8 : 0;
}

// ------------------------------------------------------------------ construction sections

const EXAGGERATE = 5;
const TEXT = 0.04;

function sectionMarks(settings, b) {
  const iso = settings.isolation ?? {};
  const items = [];
  const wall = WALL_BUILDS[iso.walls];
  const floor = FLOOR_BUILDS[iso.floor];
  // below everything on the sheet, wall first, the floor beside it
  const top = b.y0 - 1.0;
  let x = b.x0;
  if (wall?.layers) {
    const tl = wallTl(iso);
    const d = section(wall.layers, 'wall', `WALL BUILD · ${wall.label} · TL ${tl[2]} dB at 500 Hz · drawn ×${EXAGGERATE}`);
    items.push({ kind: 'drawing', layer: SECTION_LAYER, layerColor: '#cbd5e1', name: 'wall', at: [r3(x), r3(top - d.height)], lines: d.lines, texts: d.texts });
    x += d.width + 0.6;
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
  };
}

