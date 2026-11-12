// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ELEVATION_FACES, ELEVATION_LAYER, elevationFaceOf } from '../acoustics/elevations.js';
import { elevationOrigin } from '../acoustics/patches.js';
import { schematicDrawing } from './schematic.js';
import {
  scaleItem,
  bboxOf,
  localBounds,
  SCHEMATIC_LAYER,
  r3,
  mm,
  CUTAWAY_LAYER,
  SECTION_LAYER,
} from './marks/common.js';
import { labelMarks, panelMarks, finishMarks } from './marks/finish.js';
import { symmetryMarks, sliceMarks, windowMarks } from './marks/slice.js';
import { arrangementMarks } from './marks/arrangement.js';
import { blowupMarks } from './marks/blowup.js';
import { cutawayMarks } from './marks/cutaway.js';
import { sectionMarks } from './marks/sections.js';
export { BRASS_LAYER, brassMarker, furnitureLayer, SYMMETRY_DEFAULT, symmetryMarks } from './marks/slice.js';
export { arrangementMarks } from './marks/arrangement.js';
export { mountOf } from './marks/cutaway.js';
export { furnitureOf } from './marks/blowup.js';

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
 *   schematic    the system's signal flow (cad/schematic.js): sources, the
 *                monitor controller, a channel strip and a box per speaker set
 *                by set, the measurement mics, and every rack U by U — to the
 *                right of everything else on the sheet, its top level with the
 *                plan's.
 *
 * Where they go: one column per room, at the plan's left edge. Above each plan
 * its tower — the blow-up, and on top of the room being designed its
 * cut-aways, one over another; under that room its elevations (seeded there,
 * elevations.js), then the sections — never past the far end of a sheet of
 * many rooms. Labels give lengths in millimetres.
 *
 * Everything here works in sheet METRES; `toCad` scales to drawing units last.
 */

export const MARK_KEYS = ['labels', 'panels', 'finishes', 'symmetry', 'slices', 'windows', 'cutaways', 'sections', 'arrangement', 'blowup', 'schematic'];

/** A string hash: what the CAD compares to say "already on the sheet". */
export function hashOf(value) {
  const s = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

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
  if (on.schematic !== false) {
    // clear of everything else drawn: past the right of every set and every room, level with this plan's top
    const drawn = itemsBounds(MARK_KEYS.filter((key) => key !== 'schematic').flatMap((key) => out[key]));
    const right = Math.max(b.x1, ...rooms.map((r) => localBounds(r.room).x1), drawn ? drawn.x1 * k : -Infinity);
    const d = schematicDrawing(state, room.patches);
    out.schematic = toCad([{ kind: 'drawing', layer: SCHEMATIC_LAYER, layerColor: '#7dd3fc', name: 'schematic', at: [r3(right + gap), r3(plan.y1 - d.h)], lines: d.lines, texts: d.texts }]);
  }
  return out;
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
  add('schematic', 'Schematic', 'signal flow: sources, controller, sets, speakers · the racks U by U', itemsBounds(sets.schematic));
  return out;
}
