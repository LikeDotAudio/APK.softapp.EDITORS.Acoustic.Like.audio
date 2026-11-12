// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — slices, symmetry and windows: the room cut
 * into a layer per thing from the brass marker, the mirrored walls, the glass.
 * Lifted out of cad/marks.js (ROAD-3753).
 */
import { bboxOf, mm, r3 } from './common.js';
import { material, pieceHeight, PRODUCTS } from '../../acoustics/materials.js';
import { circleLines } from './finish.js';
import { DEG, pointInPolygon } from '../../acoustics/geometry.js';
import { ELEVATION_LAYER, elevationFaceOf, heightsAtXY } from '../../acoustics/elevations.js';
import { furnitureOf } from './blowup.js';
import { areaOf } from '../../acoustics/wallPlan.js';
import { elevationOrigin } from '../../acoustics/patches.js';
import { CASING_MATERIAL, makeWindow, windowOnSheet } from '../../acoustics/windows.js';

// ------------------------------------------------------------------ slices

export const BRASS_LAYER = 'Brass marker';

/** The brass marker: the middle of the room's plan, what every slice is measured from. */
export function brassMarker(room) {
  const b = bboxOf(room.poly);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

/** The layer a piece of furniture of this palette id is drawn on, and placed on: one per kind. */
export const furnitureLayer = (paletteId) => `Plan · ${PRODUCTS.find((x) => x.id === paletteId)?.name ?? paletteId}`;

/** A material that takes sound out of the room, for its own Absorption layer. */
const absorbs = (mat) => ['Absorber', 'Resonator', 'Ceiling', 'Soft furnishing', 'Seating'].includes(mat.category) || mat.alpha[2] >= 0.3;

function sliceMarks(room, state, patches) {
  const items = [];
  const c = brassMarker(room);
  const size = Math.max(0.04, Math.min(0.12, Math.max(room.L, room.W) / 90));
  const signed = (v) => (Math.round(v * 1000) > 0 ? `+${mm(v)}` : `${mm(v)}`);
  const xy = (p) => `x ${signed(p.x - c.x)} · y ${signed(p.y - c.y)}`;
  const cross = (lines, p, k = size) => lines.push([r3(p.x - k), r3(p.y), r3(p.x + k), r3(p.y)], [r3(p.x), r3(p.y - k), r3(p.x), r3(p.y + k)]);
  const outline = (lines, pts) => pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    lines.push([r3(p.x), r3(p.y), r3(q.x), r3(q.y)]);
  });
  const slice = (layer, color, name, lines, texts) => items.push({ kind: 'drawing', layer, layerColor: color, name, at: [0, 0], lines, texts });

  // the brass marker itself: a ringed cross, and the axes it measures along
  {
    const lines = [];
    cross(lines, c, size * 2.5);
    circleLines(lines, c.x, c.y, size * 1.2);
    slice(BRASS_LAYER, '#b08d57', 'brass', lines, [{ text: `BRASS MARKER · 0, 0 · every slice is measured from here, mm`, x: r3(c.x + size * 2), y: r3(c.y + size * 1.4), height: size }]);
  }
  // the ceiling plan and the floor-height plan: spot heights on a grid over the room
  const b = bboxOf(room.poly);
  const step = Math.max(0.5, Math.round(Math.max(room.L, room.W) / 8 * 2) / 2);
  for (const [layer, color, which, title] of [['Plan · Ceiling', '#93c5fd', 'ceiling', 'CEILING PLAN · ceiling height above the floor datum'], ['Plan · Floor heights', '#a3e635', 'floor', 'FLOOR HEIGHT PLAN · floor above its datum']]) {
    const lines = [];
    const texts = [];
    outline(lines, room.poly);
    for (let x = c.x - Math.floor((c.x - b.x0) / step) * step; x <= b.x1 + 1e-9; x += step)
      for (let y = c.y - Math.floor((c.y - b.y0) / step) * step; y <= b.y1 + 1e-9; y += step) {
        if (!pointInPolygon(x, y, room.poly)) continue;
        const h = heightsAtXY(room, x, y)[which];
        cross(lines, { x, y }, size * 0.4);
        texts.push({ text: `${mm(h)}`, x: r3(x + size * 0.3), y: r3(y + size * 0.3), height: size * 0.7 });
      }
    texts.push({ text: title, x: r3(b.x0), y: r3(b.y1 + size * 3), height: size });
    slice(layer, color, which, lines, texts);
  }
  // the speaker plan and the placement plan
  const devices = (list, layer, color, name, label) => {
    if (!list.length) return;
    const lines = [];
    const texts = [];
    for (const d of list) {
      cross(lines, d, size * 0.8);
      const aim = Number.isFinite(d.aim) ? d.aim * DEG : null;
      if (aim !== null) lines.push([r3(d.x), r3(d.y), r3(d.x + Math.cos(aim) * size * 2), r3(d.y + Math.sin(aim) * size * 2)]);
      texts.push({ text: `${label(d)} · ${xy(d)} · z ${mm(d.z ?? 0)}`, x: r3(d.x + size), y: r3(d.y + size * 0.4), height: size * 0.75 });
    }
    slice(layer, color, name, lines, texts);
  };
  devices(state.speakers, 'Plan · Speakers', '#facc15', 'speakers', (d) => d.role || d.name || d.kind);
  devices(state.mics, 'Plan · Placement', '#a78bfa', 'placement', (d) => `${d.mix ? 'MIX · ' : ''}${d.name || d.kind}`);
  // each kind of furniture on its own layer
  const pieces = [...furnitureOf(room).map((f) => ({ paletteId: f.paletteId, name: f.name, x: f.x, y: f.y, corners: f.corners }))];
  const kinds = new Map();
  for (const f of pieces) (kinds.get(f.paletteId) ?? kinds.set(f.paletteId, []).get(f.paletteId)).push(f);
  for (const [paletteId, list] of kinds) {
    const lines = [];
    const texts = [];
    for (const f of list) {
      outline(lines, f.corners);
      cross(lines, f, size * 0.6);
      texts.push({ text: `${f.name} · centre ${xy(f)}`, x: r3(f.x + size), y: r3(f.y + size * 0.4), height: size * 0.75 });
    }
    slice(furnitureLayer(paletteId), '#9ca3af', `furniture:${paletteId}`, lines, texts);
  }
  // each wall on its own layer
  room.walls.forEach((w, n) => {
    const lines = [[r3(w.a.x), r3(w.a.y), r3(w.b.x), r3(w.b.y)]];
    const m = { x: (w.a.x + w.b.x) / 2 + w.nIn.x * size * 1.5, y: (w.a.y + w.b.y) / 2 + w.nIn.y * size * 1.5 };
    const texts = [{ text: `WALL ${n + 1} · ${w.face.toUpperCase()} · ${mm(w.len)} long · from ${xy(w.a)} to ${xy(w.b)} · ${w.material.name}`, x: r3(m.x), y: r3(m.y), height: size * 0.75 }];
    slice(`Wall ${n + 1} · ${w.face.toUpperCase()}`, FACE_COLOURS_SLICE[w.face] ?? '#e5e7eb', `wall:${n}`, lines, texts);
  });
  // each absorbing material found, outlined wherever it is painted
  const byMat = new Map();
  for (const p of patches) {
    const mat = material(p.paletteId);
    if (!absorbs(mat) || pieceHeight(p) > 0) continue;
    (byMat.get(mat.id) ?? byMat.set(mat.id, { mat, list: [] }).get(mat.id)).list.push(p);
  }
  [...byMat.values()].forEach(({ mat, list }, row) => {
    const lines = [];
    const texts = [];
    let area = 0;
    for (const p of list) {
      outline(lines, p.poly);
      area += areaOf(p.poly);
      const pb = bboxOf(p.poly);
      texts.push({ text: `${mat.name.split(',')[0]} · ${p.layer}`, x: r3(pb.x0), y: r3(pb.y1 + size * 0.3), height: size * 0.6 });
    }
    texts.push({ text: `ABSORPTION · ${mat.name} · ${list.length} patch${list.length === 1 ? '' : 'es'} · ${area.toFixed(2)} m² · α125 ${mat.alpha[0].toFixed(2)} α500 ${mat.alpha[2].toFixed(2)} α2k ${mat.alpha[4].toFixed(2)}`, x: r3(b.x0), y: r3(b.y0 - size * (3 + 1.4 * row)), height: size * 0.85 });
    slice(`Absorption · ${mat.name}`, mat.color ?? '#3f8f4a', `absorption:${mat.id}`, lines, texts);
  });
  return items;
}

const FACE_COLOURS_SLICE = { front: '#f97316', back: '#38bdf8', left: '#a3e635', right: '#f472b6' };

// ------------------------------------------------------------------ symmetry

/** Which side of a symmetry is the master: 'left' or 'right' (as the wall's sheet shows it, for a front or back), or off. */
export const SYMMETRY_DEFAULT = { sides: 'off', front: 'off', back: 'off' };

/**
 * The mirrored copies the room's symmetry calls for, in sheet metres:
 *
 *   sides  'left' | 'right'  every region painted and every division line
 *          drawn on that side wall's elevation, onto the other side wall —
 *          the same distance from the front, the same height. On the sheets
 *          that is d → span − d: the left wall is drawn from its back end,
 *          the right from its front.
 *   front, back  'left' | 'right'  that wall's master half (as its sheet
 *          shows it) onto the other half, about the wall's centre line:
 *          d → span − d on the same sheet. What straddles the centre line is
 *          already its own mirror and is left alone.
 *
 * `patches` are the user's own (no host marks), `lines` the user's line work
 * on the elevation layers: [{ layer, a: {x, y}, b: {x, y} }].
 */
export function symmetryMarks(room, settings, patches, lines = []) {
  const sym = { ...SYMMETRY_DEFAULT, ...settings.symmetry };
  const items = [];
  const spanOf = (face) => (face === 'left' || face === 'right' ? room.L : room.W);
  const copy = (from, to, keep) => {
    const o = elevationOrigin(room, from);
    const t = elevationOrigin(room, to);
    if (!o || !t) return;
    const span = spanOf(from);
    const flip = (q) => [r3(t.x + span - (q.x - o.x)), r3(t.y + (q.y - o.y))];
    for (const p of patches) {
      if (elevationFaceOf(p.layer) !== from || !keep(p.poly.map((q) => q.x - o.x))) continue;
      items.push({ kind: 'fill', layer: ELEVATION_LAYER[to], paletteId: p.paletteId, points: p.poly.map(flip).reverse() });
    }
    // the division lines, not the wall's own outline: a line along the drawing's edge is that
    const top = room.Hmax ?? room.H;
    const e = 1e-3;
    const along = (u, v, at) => Math.abs(u - at) < e && Math.abs(v - at) < e;
    const outline = (l) => {
      const [ax, bx, ay, by] = [l.a.x - o.x, l.b.x - o.x, l.a.y - o.y, l.b.y - o.y];
      return along(ax, bx, 0) || along(ax, bx, span) || along(ay, by, 0) || along(ay, by, top);
    };
    const mine = lines.filter((l) => elevationFaceOf(l.layer) === from && !outline(l) && keep([l.a.x - o.x, l.b.x - o.x]));
    if (mine.length) {
      // drawn from the target's origin, so the drawing's own coordinates are the mirrored sheet offsets
      items.push({ kind: 'drawing', layer: ELEVATION_LAYER[to], name: `mirror-${from}-to-${to}`, at: [r3(t.x), r3(t.y)], lines: mine.map((l) => [r3(span - (l.a.x - o.x)), r3(l.a.y - o.y), r3(span - (l.b.x - o.x)), r3(l.b.y - o.y)]), texts: [] });
    }
  };
  const all = () => true;
  if (sym.sides === 'left') copy('left', 'right', all);
  else if (sym.sides === 'right') copy('right', 'left', all);
  for (const face of ['front', 'back']) {
    const side = sym[face];
    if (side !== 'left' && side !== 'right') continue;
    const half = spanOf(face) / 2;
    const eps = 1e-6;
    copy(face, face, (ds) => (side === 'left' ? Math.max(...ds) <= half + eps : Math.min(...ds) >= half - eps));
  }
  return items;
}

// ------------------------------------------------------------------ windows

function windowMarks(room, windows) {
  const items = [];
  const text = 0.04;
  windows.map(makeWindow).forEach((win, i) => {
    const at = windowOnSheet(room, win);
    if (!at) return;
    items.push({ kind: 'fill', layer: at.layer, paletteId: win.glass, points: at.glass });
    for (const points of at.casing) items.push({ kind: 'fill', layer: at.layer, paletteId: CASING_MATERIAL, points });
    items.push({ kind: 'text', layer: at.layer, at: [at.label[0], at.label[1] + text * 0.5], text: `GLASS-${i + 1} · ${mm(win.w)} × ${mm(win.h)} · sill ${mm(win.sill)} · casing ${mm(win.casing)}`, height: text });
  });
  return items;
}


export { sliceMarks, windowMarks };
