// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — the blow-up: every room laid out surface by
 * surface above its plan, and the figures in it. Lifted out of cad/marks.js (ROAD-3753).
 */
import { pointInPolygon } from '../../acoustics/geometry.js';
import { soundingSpeakers } from '../../acoustics/layouts.js';
import { isListener } from '../../acoustics/devices.js';
import { bboxOf, BLOWUP_LAYER, BT, mm, r3 } from './common.js';
import { ELEVATION_LAYER, heightsAtXY } from '../../acoustics/elevations.js';
import { pieceHeight, PRODUCTS } from '../../acoustics/materials.js';
import { cabinet, mountOf, person } from './cutaway.js';

// ------------------------------------------------------------------ blow-up



/**
 * One room, surface by surface, laid out above its plan: ceiling layers on
 * top, then the floor, then the walls in rows — every drawing at true size,
 * outlined, with its treatments drawn on it and named, and a title line.
 */
/** One room's blow-up: { items, top } — `top` where the tower ends, for what stands on it. */
function blowupMarks(room, name, has, state = null) {
  if (!room) return { items: [], top: 0 };
  // who and what stands in this room: drawn into the floor plan and every wall's elevation, each its own block
  const inside = (d) => pointInPolygon(d.x, d.y, room.poly);
  const furniture = furnitureOf(room).map((d) => ({ d, kind: 'furniture' }));
  const figs = [...(state ? [...soundingSpeakers(state.speakers, state.settings).filter(inside).map((d) => ({ d, kind: 'speaker' })), ...state.mics.filter(inside).map((d) => ({ d, kind: isListener(d) || d.mix ? 'listener' : 'mic' }))] : []), ...furniture];
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
  drawings.push({ row: drawings.length, ...planDrawing(`FLOOR · ${room.floor?.name ?? ''}`, floorPieces, room.floorArea ?? room.area, undefined), title: 'FLOOR', proj: (p) => [p.x - plan.x0, p.y - plan.y0] });

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
    // seen from inside: only what stands in front of this wall's length
    const along = (p) => (p.x - w.a.x) * w.t.x + (p.y - w.a.y) * w.t.y;
    drawings.push({ wall: true, lines, texts, w: w.len, h: top + 0.3, title: `WALL ${n + 1} · ${label}`, proj: (p, z) => [X(along(p)), z], shows: (d) => along(d) >= 0 && along(d) <= w.len });
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
      // the floor drawing has the furniture's outlines already, among its pieces
      if (d.proj) for (const f of figs) if ((!d.shows || d.shows(f.d)) && !(f.kind === 'furniture' && !d.wall)) items.push(figureMark(f, d.proj, [r3(x), r3(y)], `${name}:${r}:${x.toFixed(2)}`, d.title, room));
      x += d.w + gap;
    }
    y += h + gap;
  }
  if (name) items.push({ kind: 'text', layer: BLOWUP_LAYER, layerColor: '#e2e8f0', at: [r3(plan.x0), r3(y)], text: `BLOW-UP · ${name} · top to bottom: ceiling, floor, walls`, height: BT * 1.5 });
  return { items, top: y + BT * 1.5 + 1.2 };
}

const FIGURE_LAYERS = { speaker: ['Speakers', '#facc15'], listener: ['Listeners', '#a78bfa'], mic: ['Mics', '#34d399'], furniture: ['Furniture', '#9ca3af'] };

/**
 * The furniture standing in a room — desks, consoles, the producer desk,
 * racks, couches, instruments: its floor pieces that have a height, each
 * { id, paletteId, name, x, y, z: 0, h, corners } at its centre.
 */
export function furnitureOf(room) {
  return (room?.patches ?? [])
    .filter((p) => p.surface === 'floor' && pieceHeight(p) > 0)
    .map((p) => {
      const c = centre(p.points3d);
      const name = String(PRODUCTS.find((x) => x.id === p.paletteId)?.name ?? p.paletteId).split(/[,(]/)[0].trim();
      return { id: p.id, paletteId: p.paletteId, name, x: c.x, y: c.y, z: 0, h: pieceHeight(p), corners: p.points3d };
    });
}

/**
 * One speaker, listener or mic drawn into a blow-up drawing, through `proj`
 * ((x, y), z) → that drawing's [x, y]: a block of its own on its layer
 * (Speakers / Listeners / Mics), its attributes naming the object it is —
 * id, role, where it stands — so the CAD can say what each one is.
 */
function figureMark({ d, kind }, proj, at, drawing, title, room = null) {
  const lines = [];
  const seg = (a, za, b, zb) => lines.push([...proj(a, za), ...proj(b, zb)].map(r3));
  let label = d.name;
  let top = d.z;
  let mount = null;
  if (kind === 'speaker') {
    top = cabinet(d, seg, undefined, room);
    label = d.role || d.name;
    if (room) mount = mountOf(d, room).label;
  } else if (kind === 'furniture') {
    // a box from its floor outline up to its height
    const pts = d.corners;
    const floorAt = (p) => p.z ?? 0;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      seg(p, floorAt(p), q, floorAt(q));
      seg(p, floorAt(p) + d.h, q, floorAt(q) + d.h);
      seg(p, floorAt(p), p, floorAt(p) + d.h);
    });
    top = d.h;
  } else if (kind === 'listener') {
    person(d, seg);
    top = d.z + 0.15;
    if (d.mix) label = 'MIX';
  } else {
    const c = 0.08;
    seg({ x: d.x - c, y: d.y }, d.z - c, { x: d.x + c, y: d.y }, d.z + c);
    seg({ x: d.x - c, y: d.y }, d.z + c, { x: d.x + c, y: d.y }, d.z - c);
  }
  const [lx, ly] = proj(d, top);
  const [layer, layerColor] = FIGURE_LAYERS[kind];
  const attributes = {
    object: kind,
    id: String(d.id),
    name: String(d.name ?? ''),
    ...(d.role ? { role: d.role } : {}),
    ...(d.kind ? { type: String(d.kind) } : {}),
    position: `${mm(d.x)}, ${mm(d.y)}, ${mm(d.z)} mm`,
    ...(d.aim != null ? { aim: `${Math.round(d.aim)}°` } : {}),
    ...(mount ? { mount } : {}),
    ...(d.paletteId ? { product: String(d.paletteId), height: `${mm(d.h)} mm` } : {}),
    drawing: title,
  };
  return { kind: 'drawing', layer, layerColor, name: `${drawing}:${kind}:${d.id}`, at, lines, texts: [{ text: label, x: r3(lx), y: r3(ly + 0.05), height: BT * 0.8 }], attributes };
}

const centre = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });

/** A treatment's name on a drawing: the product's name, short. */
function pieceName(pc) {
  return String(pc.material?.name ?? pc.paletteId).split(/[,(]/)[0].trim().slice(0, 24);
}


export { blowupMarks };
