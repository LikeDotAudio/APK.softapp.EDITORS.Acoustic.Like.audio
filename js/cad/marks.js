// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ELEVATION_FACES, ELEVATION_LAYER, elevationFaceOf, heightsAtXY } from '../acoustics/elevations.js';
import { boxSize, isListener, MOUNTS } from '../acoustics/devices.js';
import { DEG, pointInPolygon } from '../acoustics/geometry.js';
import { FLOOR_BUILDS, WALL_BUILDS, wallTl } from '../acoustics/isolation.js';
import { arrangedSpeakers, arrayFront, LAYOUTS, layoutCentre, layoutPositions, soundingSpeakers } from '../acoustics/layouts.js';
import { PRODUCTS, furnitureHeight, material } from '../acoustics/materials.js';
import { elevationOrigin } from '../acoustics/patches.js';
import { areaOf, detailBuild, wallRegions } from '../acoustics/wallPlan.js';
import { firstReflections, heatOf, panelOptions, panelProduct, reflectionPanels } from '../acoustics/reflectionPanels.js';
import { fromFrame } from '../acoustics/room.js';
import { turbo } from '../views/paint.js';
import { CASING_MATERIAL, makeWindow, windowOnSheet } from '../acoustics/windows.js';

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
 *   windows      the room's glass (acoustics/windows.js) on its elevations:
 *                each pane painted with its glass and its casing round it in
 *                wood, so the room hears both, named GLASS-1 … with its size.
 *   finishes     what the user painted on each wall (a finish or a product
 *                filling the bay between division lines, or blocks tiled
 *                there): every region tagged on its elevation — F1, F2 … on
 *                the front, B, L, R on the others — and beside it a FINISH
 *                SCHEDULE: tag, what it is, how it was laid, its size, its
 *                stretch from the wall's centre line, area, α at 125 / 500 /
 *                2k and s, and the wall's base finish over what is left.
 *                Every region with depth to it (an absorber, a trap, a
 *                diffuser, a resonator) is cut by a section line ending in a
 *                callout bubble — n over Dn — and DETAIL Dn is drawn under the
 *                schedule: the section through that bay, true size, wall,
 *                frame at its division lines, the build and its face, its
 *                width and depth in mm and its edges from the centre line.
 *   symmetry     the room's symmetry as the user defines it (settings.symmetry):
 *                the side walls matched — what is painted and divided on the
 *                master side drawn mirrored onto the other, the same distance
 *                from the front, the same height — and the front and back
 *                walls each mirrored about their own centre line, the master
 *                half onto the other. The copies are palette fills, so the
 *                room hears them, and the finish schedule lists them.
 *   slices       the room cut into one layer per thing, so each can be shown,
 *                hidden and edited on its own, every position in mm from the
 *                BRASS MARKER (the room's centre, on its own layer): the
 *                ceiling plan and the floor-height plan as spot heights, the
 *                speaker plan, the placement plan (mics and seats), each kind
 *                of furniture (`Plan · Producer desk 1800×600` — what is added
 *                from the toolbar lands on that layer too), each wall
 *                (`Wall 3 · LEFT`) and each absorbing material found
 *                (`Absorption · Porous absorber, 100 mm`), outlined where it is.
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

export const MARK_KEYS = ['labels', 'panels', 'finishes', 'symmetry', 'slices', 'windows', 'cutaways', 'sections', 'arrangement', 'blowup'];

const LAYOUT_LAYER = 'Speaker layout';
const CUTAWAY_LAYER = '3-D cut-aways';
const REFLECTION_LAYER = 'Reflections';
const SECTION_LAYER = 'Construction';

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
export function buildMarks({ room, state, planLayer, sheetBounds, k, layers, rooms = [], wallPatches = [], wallLines = [], patches = [] }) {
  const out = Object.fromEntries(MARK_KEYS.map((key) => [key, []]));
  if (!room) return out;
  const { settings } = state;
  const on = settings.cadMarks ?? {};
  const mix = state.mics.find((m) => m.mix) ?? null;
  const has = (name) => layers.has(name);
  const toCad = (items) => items.map((it) => scaleItem(it, k));

  if (on.labels) out.labels = toCad(labelMarks(room, settings, planLayer));
  const panels = on.panels && mix ? panelMarks(room, state, mix) : [];
  out.panels = toCad(panels);
  // symmetry first: its copies come back as patches, but the schedule can name them now
  const mirrored = symmetryMarks(room, state.settings, wallPatches.filter((p) => !p.host), wallLines);
  out.symmetry = toCad(mirrored);
  const finishes = on.finishes !== false ? finishMarks(room, state.settings, wallPatches, panels) : [];
  out.finishes = toCad(finishes);
  if (on.slices !== false) out.slices = toCad(sliceMarks(room, state, patches));
  if (on.windows !== false) out.windows = toCad(windowMarks(room, settings.windows?.[planLayer] ?? []));
  if (on.arrangement) out.arrangement = toCad(arrangementMarks(room, settings, mix, state));
  // the tower over each plan: its blow-up, and on top of the room being designed the cut-aways
  const towers = on.blowup ? rooms.map((r) => ({ room: r.room, ...blowupMarks(r.room, r.name, has, state) })) : [];
  if (on.blowup) out.blowup = toCad(towers.flatMap((t) => t.items));
  const plan = bboxOf(room.poly);
  if (on.cutaways) out.cutaways = toCad(cutawayMarks(room, state, plan.x0, towers.find((t) => t.room === room)?.top ?? plan.y1 + 1.2, has));
  // under the room being designed and its elevations: the sections
  const b = localBounds(room);
  const gap = Math.max(1, 0.15 * Math.max(room.L, room.W));
  // the floor's section goes under the left and right walls' schedules and details, which run down past their elevations
  const sides = itemsBounds([...panels, ...finishes].filter((it) => /-(left|right)$/.test(it.name ?? '')));
  if (on.sections) out.sections = toCad(sectionMarks(settings, b.x0, b.y0 - gap, sides ? sides.y0 - gap : Infinity));
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
  const panels = reflectionPanels(room, state.speakers, mix, panelOptions(ap, ceilingOn));
  const items = [];
  const text = 0.04;
  for (const p of panels) {
    const layer = p.kind === 'ceiling' ? 'Ceiling' : ELEVATION_LAYER[p.face];
    const paletteId = panelProduct(p, ap);
    items.push({ kind: 'fill', layer, paletteId, points: p.sheet.map((c) => [c.x, c.y]) });
    const x0 = Math.min(...p.sheet.map((c) => c.x));
    const y1 = Math.max(...p.sheet.map((c) => c.y));
    items.push({ kind: 'text', layer, at: [x0, y1 + text * 0.5], text: `${p.name} · ${p.speaker}`, height: text });
  }
  for (const face of ELEVATION_FACES) {
    const mine = panels.filter((p) => p.face === face);
    if (mine.length) items.push(panelDetails(room, face, mine, (p) => PRODUCTS.find((x) => x.id === panelProduct(p, ap))?.name ?? panelProduct(p, ap)));
  }
  return items;
}

/**
 * A wall's panels set out for whoever hangs them, on its elevation: every
 * panel's two edges dimensioned from the wall's left corner along a baseline
 * below the floor (staggered in rows so the figures never sit on each other),
 * each one's centre marked and its bottom's height written in it, and beside
 * the elevation a schedule — name, the speaker it answers, its size, where its
 * left edge and its bottom are, what it is (`product(panel)`, its name). All in mm.
 */
function panelDetails(room, face, panels, product) {
  const origin = elevationOrigin(room, face);
  const span = face === 'left' || face === 'right' ? room.L : room.W;
  const size = Math.max(0.035, Math.min(0.15, Math.max(room.L, room.W) / 100));
  const lines = [];
  const texts = [];
  const rows = 3;
  const base = -size * 2;
  lines.push([0, base, r3(span), base]);
  lines.push([0, 0, 0, r3(base - size * 0.6)]);
  const sorted = [...panels].sort((a, b) => Math.min(...a.sheet.map((c) => c.x)) - Math.min(...b.sheet.map((c) => c.x)));
  const rel = (p) => {
    const xs = p.sheet.map((c) => c.x - origin.x);
    const ys = p.sheet.map((c) => c.y - origin.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  sorted.forEach((p, i) => {
    const b = rel(p);
    const y = base - size * 1.6 * (i % rows);
    // the two edges dropped to the baseline, and their distance from the corner
    for (const x of [b.x0, b.x1]) lines.push([r3(x), r3(b.y0), r3(x), r3(y - size * 0.4)]);
    texts.push({ text: `${p.name.split('-')[1]}: ${mm(b.x0)}–${mm(b.x1)}`, x: r3(b.x0), y: r3(y - size * 1.3), height: size * 0.8 });
    // the centre, crossed
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const k = Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.15;
    lines.push([r3(cx - k), r3(cy), r3(cx + k), r3(cy)], [r3(cx), r3(cy - k), r3(cx), r3(cy + k)]);
    texts.push({ text: `↑ ${mm(b.y0)}`, x: r3(b.x0 + size * 0.3), y: r3(b.y0 + size * 0.3), height: size * 0.7 });
  });
  // the schedule beside the elevation, top down — the column of drawings above and below leaves no room under it
  const sx = r3(span + size * 4);
  let y = (room.Hmax ?? room.H) - size * 1.1;
  texts.push({ text: `PANEL SCHEDULE · ${face.toUpperCase()} WALL · ${sorted.length} panel${sorted.length === 1 ? '' : 's'} · from the left corner and the floor, mm`, x: sx, y: r3(y), height: size * 1.1 });
  for (const p of sorted) {
    const b = rel(p);
    y -= size * 1.5;
    texts.push({ text: `${p.name} · ${p.behind ? 'behind' : 'answers'} ${p.speaker} · ${p.treatment ?? 'absorber'} · ${mm(b.x1 - b.x0)} × ${mm(b.y1 - b.y0)} · left edge ${mm(b.x0)} · bottom ${mm(b.y0)} · centre ${mm((b.x0 + b.x1) / 2)} / ${mm((b.y0 + b.y1) / 2)} · ${product(p)}`, x: sx, y: r3(y), height: size * 0.85 });
  }
  return { kind: 'drawing', layer: ELEVATION_LAYER[face], name: `panel-details-${face}`, at: [r3(origin.x), r3(origin.y)], lines, texts };
}

// ------------------------------------------------------------------ finishes

/**
 * Every wall's regions as the user finished them, on its elevation: a tag in
 * each — its code and what it is, boxed — and beside the elevation, under the
 * panel schedule when there is one, the FINISH SCHEDULE. `patches` are the
 * user's own on the elevation layers (not this app's marks), in sheet metres.
 */
function finishMarks(room, settings, patches, panelItems) {
  const items = [];
  const size = Math.max(0.035, Math.min(0.15, Math.max(room.L, room.W) / 100));
  for (const face of ELEVATION_FACES) {
    const origin = elevationOrigin(room, face);
    if (!origin) continue;
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    const top = room.Hmax ?? room.H;
    // tagged left to right, then top down (acoustics/wallPlan.js, which the wall builder reads too)
    const regions = wallRegions(room, face, patches);
    if (!regions.length) continue;
    const lines = [];
    const texts = [];
    regions.forEach((r) => {
      const short = r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name;
      const w = Math.max(r.tag.length, short.length) * size * 0.62 + size;
      const h = size * 2.4;
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      const bx = cx - w / 2;
      const by = cy - h / 2;
      lines.push([r3(bx), r3(by), r3(bx + w), r3(by)], [r3(bx + w), r3(by), r3(bx + w), r3(by + h)], [r3(bx + w), r3(by + h), r3(bx), r3(by + h)], [r3(bx), r3(by + h), r3(bx), r3(by)]);
      texts.push({ text: r.tag, x: r3(bx + size * 0.5), y: r3(by + h - size * 1.05), height: size * 0.85 });
      texts.push({ text: short, x: r3(bx + size * 0.5), y: r3(by + size * 0.35), height: size * 0.7 });
    });
    // beside the elevation, under the panel schedule if this wall has one
    const panelRows = panelItems.find((it) => it.kind === 'drawing' && it.name === `panel-details-${face}`)?.texts.filter((t) => / · answers /.test(t.text)).length ?? 0;
    const sx = r3(span + size * 4);
    let y = top - size * 1.1 - (panelRows ? (panelRows + 1) * size * 1.5 + size * 2 : 0);
    texts.push({ text: `FINISH SCHEDULE · ${face.toUpperCase()} WALL · ${regions.length} region${regions.length === 1 ? '' : 's'} · x from the wall's centre line, z from the floor, mm`, x: sx, y: r3(y), height: size * 1.1 });
    const mid = span / 2;
    const signed = (v) => (v > 0 ? `+${mm(v)}` : `${mm(v)}`);
    for (const r of regions) {
      const mat = material(r.p.paletteId);
      y -= size * 1.5;
      texts.push({ text: `${r.tag} · ${r.name} · ${r.how} · ${mm(r.x1 - r.x0)} × ${mm(r.y1 - r.y0)} · x ${signed(r.x0 - mid)} → ${signed(r.x1 - mid)} · z ${mm(r.y0)} → ${mm(r.y1)} · ${r.area.toFixed(2)} m² · α125 ${mat.alpha[0].toFixed(2)} α500 ${mat.alpha[2].toFixed(2)} α2k ${mat.alpha[4].toFixed(2)} · s ${mat.scatter[3].toFixed(2)}`, x: sx, y: r3(y), height: size * 0.85 });
    }
    const wallArea = room.walls.filter((w) => w.face === face).reduce((s, w) => s + (w.area ?? 0), 0);
    const left = Math.max(0, wallArea - regions.reduce((s, r) => s + r.area, 0));
    y -= size * 1.5;
    texts.push({ text: `BASE · ${material(settings.faceMaterials[face]).name} · the rest of the wall · ${left.toFixed(2)} m²`, x: sx, y: r3(y), height: size * 0.85 });
    // the details: one per build on this wall, each region of it called out
    const details = [];
    regions.forEach((r, i) => {
      const build = detailBuild(r.p.paletteId);
      if (!build) return;
      let d = details.find((x) => x.paletteId === r.p.paletteId);
      if (!d) details.push((d = { paletteId: r.p.paletteId, n: details.length + 1, build, name: r.name, regions: [] }));
      d.regions.push(r);
      calloutBubble(lines, texts, r, d.n, i, size);
    });
    y -= size * 3;
    for (const d of details) y = detailDrawing(lines, texts, d, sx, y, mid, size);
    items.push({ kind: 'drawing', layer: ELEVATION_LAYER[face], name: `finish-schedule-${face}`, at: [r3(origin.x), r3(origin.y)], lines, texts });
  }
  return items;
}

/** A circle as line segments, for a drawing that is lines and words. */
function circleLines(lines, cx, cy, rad, n = 20) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const b = ((i + 1) / n) * 2 * Math.PI;
    lines.push([r3(cx + rad * Math.cos(a)), r3(cy + rad * Math.sin(a)), r3(cx + rad * Math.cos(b)), r3(cy + rad * Math.sin(b))]);
  }
}

/**
 * A region's section callout on its elevation: a dashed cut across it a
 * quarter of the way up (clear of its tag), arrowheads at both ends, and a
 * leader out past the wall's left edge to a bubble — the detail's number over
 * D and the number. Bubbles alternate between two columns so neighbours clear.
 */
function calloutBubble(lines, texts, r, n, i, size) {
  const y = r.y0 + (r.y1 - r.y0) * 0.25;
  const x0 = r.x0 + size * 0.3;
  const x1 = r.x1 - size * 0.3;
  const dash = size * 0.9;
  for (let x = x0; x < x1; x += dash * 1.5) lines.push([r3(x), r3(y), r3(Math.min(x1, x + dash)), r3(y)]);
  for (const [x, dir] of [[x0, 1], [x1, -1]]) lines.push([r3(x), r3(y), r3(x + dir * size * 0.5), r3(y + size * 0.35)], [r3(x), r3(y), r3(x + dir * size * 0.5), r3(y - size * 0.35)]);
  const rad = size * 1.2;
  const bx = -size * (3 + (i % 2) * 3);
  lines.push([r3(bx + rad), r3(y), r3(x0), r3(y)]);
  circleLines(lines, bx, y, rad);
  lines.push([r3(bx - rad), r3(y), r3(bx + rad), r3(y)]);
  texts.push({ text: String(n), x: r3(bx - size * 0.3), y: r3(y + size * 0.2), height: size * 0.75 });
  texts.push({ text: `D${n}`, x: r3(bx - size * 0.45), y: r3(y - size * 0.85), height: size * 0.55 });
}

/**
 * DETAIL Dn under the schedule, its top at `top`: the section through the
 * first bay of that build, true size — the wall behind (masonry), a 45 mm
 * frame member at each division line, the build between them hatched, its
 * face — labelled beside, the width and depth dimensioned in mm, and each
 * edge's place from the wall's centre line. Returns where the next one starts.
 */
function detailDrawing(lines, texts, d, x, top, mid, size) {
  const r = d.regions[0];
  const W = r.x1 - r.x0;
  const D = d.build.depth;
  const wall = 0.1;
  const frame = Math.min(0.045, W / 6);
  const y0 = top - size * 2 - wall - D;
  const rect = (a, b, c, e) => lines.push([r3(a), r3(b), r3(c), r3(b)], [r3(c), r3(b), r3(c), r3(e)], [r3(c), r3(e), r3(a), r3(e)], [r3(a), r3(e), r3(a), r3(b)]);
  const signed = (v) => (v > 0 ? `+${mm(v)}` : `${mm(v)}`);
  texts.push({ text: `DETAIL D${d.n} · section through ${d.regions.map((q) => q.tag).join(', ')} · ${d.name} · plan section, true size, mm`, x: r3(x), y: r3(top - size * 1.1), height: size * 0.95 });
  // the wall behind, the frame at each division line, the build between, the face
  rect(x - 0.05, y0 + D, x + W + 0.05, y0 + D + wall);
  hatch(lines, 'masonry', x - 0.05, y0 + D, x + W + 0.05, y0 + D + wall);
  for (const fx of [x, x + W - frame]) {
    rect(fx, y0, fx + frame, y0 + D);
    hatch(lines, 'stud', fx, y0, fx + frame, y0 + D);
  }
  if (d.build.infill === 'wells') {
    const n = Math.max(2, Math.round((W - 2 * frame) / 0.05));
    const step = (W - 2 * frame) / n;
    for (let k = 0; k <= n; k++) lines.push([r3(x + frame + k * step), r3(y0), r3(x + frame + k * step), r3(y0 + D)]);
    for (let k = 0; k < n; k++) {
      const depth = D * (0.25 + 0.75 * (((k * k) % 7) / 6));
      lines.push([r3(x + frame + k * step), r3(y0 + D - depth), r3(x + frame + (k + 1) * step), r3(y0 + D - depth)]);
    }
  } else hatch(lines, d.build.infill, x + frame, y0, x + W - frame, y0 + D);
  lines.push([r3(x), r3(y0), r3(x + W), r3(y0)]);
  // what each layer is, beside it
  const lx = x + W + 0.12;
  const label = (text, ly) => {
    lines.push([r3(x + W + 0.02), r3(ly), r3(lx - 0.02), r3(ly)]);
    texts.push({ text, x: r3(lx), y: r3(ly - size * 0.3), height: size * 0.7 });
  };
  label('wall behind', y0 + D + wall / 2);
  label(`${d.name} · ${mm(D)} deep`, y0 + D / 2);
  label(d.build.face, y0);
  texts.push({ text: `frame ${mm(frame)} × ${mm(D)} at the division lines`, x: r3(x), y: r3(y0 + D + wall + size * 0.3), height: size * 0.6 });
  // the width under it, ticked at the division lines, each edge from the centre line
  const dy = y0 - size * 1.4;
  lines.push([r3(x), r3(dy), r3(x + W), r3(dy)]);
  for (const ex of [x, x + W]) lines.push([r3(ex), r3(dy - size * 0.4), r3(ex), r3(y0)]);
  texts.push({ text: `${mm(W)}`, x: r3(x + W / 2 - size), y: r3(dy + size * 0.2), height: size * 0.7 });
  texts.push({ text: signed(r.x0 - mid), x: r3(x - size * 0.5), y: r3(dy - size * 1.3), height: size * 0.65 });
  texts.push({ text: signed(r.x1 - mid), x: r3(x + W - size * 0.5), y: r3(dy - size * 1.3), height: size * 0.65 });
  return dy - size * 3;
}

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
    if (!absorbs(mat) || furnitureHeight(p.paletteId) > 0) continue;
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

// ------------------------------------------------------------------ arrangement

export function arrangementMarks(room, settings, mix, state = null) {
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

  // Room perimeter outline on the layout layer so CAD shows room alignment
  if (room?.poly?.length) {
    for (let i = 0; i < room.poly.length; i++) {
      const p1 = room.poly[i];
      const p2 = room.poly[(i + 1) % room.poly.length];
      lines.push([r3(p1.x - seat.x), r3(p1.y - seat.y), r3(p2.x - seat.x), r3(p2.y - seat.y)]);
    }
  }

  // the arrangement's own boxes (mains, surrounds, heights, subs) with their size and aim — not the muted ones
  for (const s of state ? soundingSpeakers(state.speakers, settings) : []) {
    const dx = s.x - seat.x;
    const dy = s.y - seat.y;
    const sz = boxSize(s);
    const w = sz.w || 0.35;
    const d = sz.d || 0.3;
    const aimRad = (s.aim ?? 90) * DEG;
    const fx = Math.cos(aimRad);
    const fy = Math.sin(aimRad);
    const rx = fy;
    const ry = -fx;
    const hw = w / 2;
    const hd = d / 2;
    const c1 = [dx - hw * rx - hd * fx, dy - hw * ry - hd * fy];
    const c2 = [dx + hw * rx - hd * fx, dy + hw * ry - hd * fy];
    const c3 = [dx + hw * rx + hd * fx, dy + hw * ry + hd * fy];
    const c4 = [dx - hw * rx + hd * fx, dy - hw * ry + hd * fy];
    lines.push([r3(c1[0]), r3(c1[1]), r3(c2[0]), r3(c2[1])]);
    lines.push([r3(c2[0]), r3(c2[1]), r3(c3[0]), r3(c3[1])]);
    lines.push([r3(c3[0]), r3(c3[1]), r3(c4[0]), r3(c4[1])]);
    lines.push([r3(c4[0]), r3(c4[1]), r3(c1[0]), r3(c1[1])]);
    // Aim pointer
    lines.push([r3(dx + hd * fx), r3(dy + hd * fy), r3(dx + (hd + 0.16) * fx), r3(dy + (hd + 0.16) * fy)]);
    const label = s.role || s.name || 'SPK';
    texts.push({ text: label, x: r3(dx - 0.08), y: r3(dy - 0.02), height: 0.07 });
  }

  // Listener seats (MIX, producer P, client C, entourage)
  for (const m of state?.mics ?? []) {
    const dx = m.x - seat.x;
    const dy = m.y - seat.y;
    const k = 0.12;
    lines.push([r3(dx - k), r3(dy), r3(dx + k), r3(dy)]);
    lines.push([r3(dx), r3(dy - k), r3(dx), r3(dy + k)]);
    const tag = m.mix ? 'MIX' : (m.kind === 'producer' ? 'P' : m.kind === 'client' ? 'C' : m.name || 'M');
    texts.push({ text: tag, x: r3(dx - 0.08), y: r3(dy + 0.16), height: 0.07 });
  }

  // Placed furniture (desks, consoles, racks, couches)
  for (const f of state?.furniture ?? []) {
    const prod = PRODUCTS.find((p) => p.id === f.paletteId);
    const [w, d] = prod?.size ?? [1.8, 0.9];
    const dx = f.x - seat.x;
    const dy = f.y - seat.y;
    const rotRad = (f.rotation ?? 0) * DEG;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const hw = w / 2;
    const hd = d / 2;
    const p1 = [dx - hw * cos + hd * sin, dy - hw * sin - hd * cos];
    const p2 = [dx + hw * cos + hd * sin, dy + hw * sin - hd * cos];
    const p3 = [dx + hw * cos - hd * sin, dy + hw * sin + hd * cos];
    const p4 = [dx - hw * cos - hd * sin, dy - hw * sin + hd * cos];
    lines.push([r3(p1[0]), r3(p1[1]), r3(p2[0]), r3(p2[1])]);
    lines.push([r3(p2[0]), r3(p2[1]), r3(p3[0]), r3(p3[1])]);
    lines.push([r3(p3[0]), r3(p3[1]), r3(p4[0]), r3(p4[1])]);
    lines.push([r3(p4[0]), r3(p4[1]), r3(p1[0]), r3(p1[1])]);
    const label = prod?.name?.split(/[,(]/)[0]?.trim() ?? 'Desk';
    texts.push({ text: label, x: r3(dx - 0.2), y: r3(dy), height: 0.07 });
  }
  // and what the CAD has placed — the furnished room's desks, the producer desk, couch and rack — that is not one of those
  for (const f of furnitureOf(room)) {
    if ((state?.furniture ?? []).some((g) => g.cadId === f.id)) continue;
    f.corners.forEach((p, i) => {
      const q = f.corners[(i + 1) % f.corners.length];
      lines.push([r3(p.x - seat.x), r3(p.y - seat.y), r3(q.x - seat.x), r3(q.y - seat.y)]);
    });
    texts.push({ text: f.name, x: r3(f.x - seat.x - 0.2), y: r3(f.y - seat.y), height: 0.07 });
  }

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
    const tall = p.surface === 'floor' ? furnitureHeight(p.paletteId) : 0;
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

// ------------------------------------------------------------------ blow-up

const BLOWUP_LAYER = 'Blow-up';
const BT = 0.07;

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
    .filter((p) => p.surface === 'floor' && furnitureHeight(p.paletteId) > 0)
    .map((p) => {
      const c = centre(p.points3d);
      const name = String(PRODUCTS.find((x) => x.id === p.paletteId)?.name ?? p.paletteId).split(/[,(]/)[0].trim();
      return { id: p.id, paletteId: p.paletteId, name, x: c.x, y: c.y, z: 0, h: furnitureHeight(p.paletteId), corners: p.points3d };
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

// ------------------------------------------------------------------ construction sections

const EXAGGERATE = 5;
const TEXT = 0.04;

function sectionMarks(settings, x0, top0, floorTop = Infinity) {
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
  top = Math.min(top, floorTop);
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


// ------------------------------------------------------------------ spaces

/** Where a set of marks (drawing units, as buildMarks returns them) lies: { x0, x1, y0, y1 }, or null when empty. */
function itemsBounds(items = []) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
  };
  for (const it of items) {
    if (it.kind === 'fill') for (const [x, y] of it.points) add(x, y);
    else if (it.kind === 'text') {
      add(it.at[0], it.at[1]);
      add(it.at[0] + String(it.text).length * it.height * 0.6, it.at[1] + it.height);
    } else if (it.at) {
      const [ox, oy] = it.at;
      for (const [a, c, d, e] of it.lines ?? []) {
        add(ox + a, oy + c);
        add(ox + d, oy + e);
      }
      for (const t of it.texts ?? []) {
        add(ox + t.x, oy + t.y);
        add(ox + t.x + String(t.text).length * t.height * 0.6, oy + t.y + t.height);
      }
      for (const f of it.fills ?? []) for (const [x, y] of f.points) add(ox + x, oy + y);
    }
  }
  return b.x0 <= b.x1 ? b : null;
}

const unionB = (...bs) => {
  const real = bs.filter(Boolean);
  if (!real.length) return null;
  return { x0: Math.min(...real.map((b) => b.x0)), x1: Math.max(...real.map((b) => b.x1)), y0: Math.min(...real.map((b) => b.y0)), y1: Math.max(...real.map((b) => b.y1)) };
};

/**
 * THE MODEL SPACES: every drawing this app keeps on the sheet as a named
 * window onto it — the plan, each wall's elevation with its schedule and
 * details, the blow-up tower, the cut-aways, the construction sections —
 * for the CAD's tabs (bridge `spaces`), where each opens at one scale for all
 * of them, so a metre is the same size whichever you are looking at. Bounds
 * are where the marks were drawn (`sets`, drawing units, as buildMarks
 * returns them) and, for the plan and the walls, the room's own outline;
 * every one is measured, like the slices, from the brass marker.
 */
export function spacesOf(room, sets, k = 1) {
  const u = (v) => v / k;
  const pad = (b) => {
    const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.06;
    return [+(b.x0 - m).toFixed(3), +(b.y0 - m).toFixed(3), +(b.x1 + m).toFixed(3), +(b.y1 + m).toFixed(3)];
  };
  const out = [];
  const add = (id, name, subtitle, b) => b && out.push({ id: `host:${id}`, name, subtitle, bounds: pad(b) });
  const p = bboxOf(room.poly);
  const plan = { x0: u(p.x0), x1: u(p.x1), y0: u(p.y0), y1: u(p.y1) };
  const onLayer = (key, layer) => itemsBounds((sets[key] ?? []).filter((it) => it.layer === layer));
  add('plan', 'Plan', `${mm(room.L)} × ${mm(room.W)} mm`, unionB(plan, ...['labels', 'slices', 'arrangement'].map((key) => itemsBounds((sets[key] ?? []).filter((it) => !elevationFaceOf(it.layer) && it.layer !== CUTAWAY_LAYER && it.layer !== SECTION_LAYER)))));
  for (const face of ELEVATION_FACES) {
    const o = elevationOrigin(room, face);
    if (!o) continue;
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    const top = room.Hmax ?? room.H;
    const wall = { x0: u(o.x), x1: u(o.x + span), y0: u(o.y), y1: u(o.y + top) };
    const layer = ELEVATION_LAYER[face];
    add(`elevation-${face}`, `${face[0].toUpperCase()}${face.slice(1)} elevation`, `${mm(span)} × ${mm(top)} mm`, unionB(wall, ...['labels', 'panels', 'finishes', 'symmetry', 'windows'].map((key) => onLayer(key, layer))));
  }
  add('blowup', 'Blow-up', 'the room’s surfaces laid out round its plan', itemsBounds(sets.blowup));
  add('cutaways', 'Cut-aways', 'the room in 3-D, three ways', itemsBounds(sets.cutaways));
  add('sections', 'Construction', 'wall and floor builds', itemsBounds(sets.sections));
  return out;
}
