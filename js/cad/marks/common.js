// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — what every drawing shares: the layer names (the blow-up's line height too),
 * rounding to the millimetre, a room's local bounds, a bounding box and the scaling to
 * drawing units. Lifted out of cad/marks.js (ROAD-3753).
 */
import { ELEVATION_FACES } from '../../acoustics/elevations.js';
import { elevationOrigin } from '../../acoustics/patches.js';

const LAYOUT_LAYER = 'Speaker layout';
const CUTAWAY_LAYER = '3-D cut-aways';
const REFLECTION_LAYER = 'Reflections';
const SECTION_LAYER = 'Construction';
const SCHEMATIC_LAYER = 'Schematic';

const r3 = (v) => Math.round(v * 1000) / 1000;
/** A length on a drawing's label: whole millimetres. */
const mm = (v) => Math.round(v * 1000);

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

const BLOWUP_LAYER = 'Blow-up';
const BT = 0.07;

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



export { LAYOUT_LAYER, CUTAWAY_LAYER, REFLECTION_LAYER, SECTION_LAYER, SCHEMATIC_LAYER, r3, mm, localBounds, BLOWUP_LAYER, BT, bboxOf, scaleItem };
