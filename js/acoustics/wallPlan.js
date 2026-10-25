// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from './bands.js';
import { alongLength, elevationFaceOf, seedOutline } from './elevations.js';
import { sharedFaces, WALL_BUILDS, wallTl } from './isolation.js';
import { PRODUCTS, material } from './materials.js';
import { elevationOrigin } from './patches.js';
import { windowOnSheet } from './windows.js';

/**
 * ONE WALL, PLANNED
 *
 * What the wall builder (views/wallBuilder.js) and the CAD's finish schedule
 * (cad/marks.js) both read off a wall's elevation: its regions — the finishes
 * and products painted into the bays between its division lines — tagged
 * left to right, top down (F1 … on the front, B, L, R on the others); its
 * division lines; the build behind each region for its detail; and the
 * numbers: what the wall soaks up and what it lets through.
 *
 * Everything is in the elevation's own metres: x from the drawing's left
 * edge, z up from the floor, as the drawing shows the wall from inside the
 * room. Positions are said from the wall's centre line — the brass marker's
 * line — the way the drawings dimension them.
 *
 * THE NUMBERS — estimates of design intent, from the textbook models, not a
 * test report:
 *
 *   absorption  A(b) = Σ Sᵢ·αᵢ(b) + S_rest·α_base(b), m² sabins per octave,
 *               and its share of the room's A, the way the room's RT60 is
 *               summed (acoustics/room.js).
 *   transmission
 *               the wall's TL is its build's (isolation.js WALL_BUILDS) per
 *               octave. Treatment on the room side adds next to nothing to
 *               it and is left out. A window is a weaker element in it: its
 *               glass's single-number TL is spread over the octaves on the
 *               STC reference contour, and the wall's composite TL is the
 *               area-weighted transmission
 *                   τ = Σ Sᵢ·10^(−TLᵢ/10) / S,   TL = −10·log10 τ
 *               rated by the highest contour it clears (octave bands, no
 *               band more than 8 dB under, no more than 10 dB under summed).
 *   the house   for a wall shared with the house (isolation.js setting), the
 *               level on the other side for a given level in the room:
 *                   L_house = L_room − TL + 10·log10(S / A_house)
 *               with A_house 10 m² sabins, a furnished room.
 */

const FACE_TAG = { front: 'F', back: 'B', left: 'L', right: 'R' };

/** The STC reference contour in octave bands, 125 Hz … 4 kHz, relative to its 500 Hz value. */
export const STC_CONTOUR = [-16, -7, 0, 3, 4, 4];

const A_HOUSE = 10;

export const areaOf = (pts) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2);

/** A palette id's name on a drawing: the product's, else the finish's. */
export const paletteName = (id) => PRODUCTS.find((x) => x.id === id)?.name ?? material(id).name;

/** How far across and how high this face's elevation is drawn, metres. */
export function wallSpan(room, face) {
  return { span: alongLength(face) ? room.L : room.W, top: room.Hmax ?? room.H };
}

/** The wall's outline on its elevation, in its own metres: the CAD's when it has one drawn, else the seed. */
export function wallOutline(room, face) {
  const origin = elevationOrigin(room, face);
  if (!origin) return [];
  const prof = room.profiles?.find((p) => p.face === face && p.origin && p.pts?.length >= 3);
  if (prof) {
    // the profile reads left and back from the far end (elevations.js profileFromLoop)
    const { span } = wallSpan(room, face);
    const flip = face === 'left' || face === 'back';
    return prof.pts.map((q) => ({ x: flip ? span - q.t : q.t, y: q.z }));
  }
  return seedOutline(room, face).map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
}

/**
 * The regions painted on a face's elevation: [{ p, pts, x0, x1, y0, y1,
 * area, tag, name, how }] in the wall's own metres, left to right, then top
 * down. `patches` as engine.patchesFromCad gives them (sheet metres), any
 * layer: only this face's elevation's are read.
 */
export function wallRegions(room, face, patches) {
  const origin = elevationOrigin(room, face);
  if (!origin) return [];
  const { span, top } = wallSpan(room, face);
  return patches
    .filter((p) => elevationFaceOf(p.layer) === face)
    .map((p) => {
      const pts = p.poly.map((q) => ({ x: q.x - origin.x, y: q.y - origin.y }));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      return { p, pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), area: areaOf(pts) };
    })
    // only what lies on this wall's drawing
    .filter((r) => r.x1 > 0 && r.x0 < span && r.y1 > 0 && r.y0 < top)
    .sort((a, b) => a.x0 - b.x0 || b.y1 - a.y1)
    .map((r, i) => ({
      ...r,
      tag: `${FACE_TAG[face]}${i + 1}`,
      name: paletteName(r.p.paletteId),
      how: r.p.host === 'symmetry' ? 'mirrored' : String(r.p.id).startsWith('block:') ? 'block' : PRODUCTS.some((x) => x.id === r.p.paletteId) ? 'fill' : 'finish',
    }));
}

/**
 * The division lines drawn on a face's elevation, clipped to the wall: the
 * x of each vertical one and the z of each horizontal one (sorted, metres),
 * and every line as drawn. `lines` are [{ layer, a, b }] in sheet metres.
 */
export function wallDivisions(room, face, lines) {
  const origin = elevationOrigin(room, face);
  if (!origin) return { xs: [], zs: [], lines: [] };
  const { span, top } = wallSpan(room, face);
  const eps = 1e-3;
  const mine = lines
    .filter((l) => elevationFaceOf(l.layer) === face)
    .map((l) => ({ a: { x: l.a.x - origin.x, y: l.a.y - origin.y }, b: { x: l.b.x - origin.x, y: l.b.y - origin.y } }))
    // the wall's own outline is not a division
    .filter((l) => {
      const onEdge = (v, lim) => Math.abs(v) < eps || Math.abs(v - lim) < eps;
      const vertical = Math.abs(l.a.x - l.b.x) < eps;
      const horizontal = Math.abs(l.a.y - l.b.y) < eps;
      if (vertical && onEdge(l.a.x, span)) return false;
      if (horizontal && onEdge(l.a.y, top)) return false;
      return Math.max(l.a.x, l.b.x) > -eps && Math.min(l.a.x, l.b.x) < span + eps;
    });
  const uniq = (vs) => [...new Set(vs.map((v) => Math.round(v * 1000)))].sort((a, b) => a - b).map((v) => v / 1000);
  return {
    xs: uniq(mine.filter((l) => Math.abs(l.a.x - l.b.x) < eps).map((l) => l.a.x)),
    zs: uniq(mine.filter((l) => Math.abs(l.a.y - l.b.y) < eps).map((l) => l.a.y)),
    lines: mine,
  };
}

/**
 * The divisions a wall offers, before any is drawn: the lines worth putting
 * a division on, in the wall's own metres — { xs: [{ v, why, kind }], zs }.
 * The centre line (the brass marker's); each first-reflection panel's edges
 * on this face (reflectionPanels.js, `panels` as it returns them); the
 * glass's edges (wallWindows); the ears' height at the mix seat; and the
 * board module — a sheet's width out each way from the centre line. The
 * ruler and the pencil settle on them (snapToGuide).
 */
export function wallGuides(room, face, { panels = [], windows = [], mix = null, module = 1.2 } = {}) {
  const origin = elevationOrigin(room, face);
  const { span, top } = wallSpan(room, face);
  const xs = [{ v: span / 2, why: 'centre line', kind: 'centre' }];
  const zs = [];
  if (origin) {
    for (const p of panels.filter((q) => q.kind === 'wall' && q.face === face)) {
      const px = p.sheet.map((c) => c.x - origin.x);
      const pz = p.sheet.map((c) => c.y - origin.y);
      const why = `${p.name} · ${p.speaker}’s first reflection`;
      xs.push({ v: Math.min(...px), why, kind: 'panel' }, { v: Math.max(...px), why, kind: 'panel' });
      zs.push({ v: Math.min(...pz), why, kind: 'panel' }, { v: Math.max(...pz), why, kind: 'panel' });
    }
  }
  for (const w of windows) {
    xs.push({ v: w.x0, why: 'window jamb', kind: 'window' }, { v: w.x1, why: 'window jamb', kind: 'window' });
    zs.push({ v: w.y0, why: 'window sill', kind: 'window' }, { v: w.y1, why: 'window head', kind: 'window' });
  }
  if (mix) zs.push({ v: mix.z ?? 1.2, why: 'ear height at the mix seat', kind: 'ears' });
  if (module > 0) {
    for (let d = module; d < span / 2 - 1e-3; d += module) {
      xs.push({ v: span / 2 - d, why: `${Math.round(module * 1000)} mm board module`, kind: 'module' }, { v: span / 2 + d, why: `${Math.round(module * 1000)} mm board module`, kind: 'module' });
    }
  }
  // on the wall, and one line per place (the first reason wins: a panel edge on the centre line is the centre line)
  const keep = (list, lim) => {
    const out = [];
    for (const g of list) if (g.v > 1e-3 && g.v < lim - 1e-3 && !out.some((o) => Math.abs(o.v - g.v) < 5e-4)) out.push({ ...g, v: Math.round(g.v * 1000) / 1000 });
    return out.sort((a, b) => a.v - b.v);
  };
  return { xs: keep(xs, span), zs: keep(zs, top) };
}

/**
 * A ruler or pencil position on one axis, settled: onto the nearest guide
 * within `reach` metres (its reason with it), else onto the `grid` (10 mm).
 * { v, guide } — guide null when it fell on the grid.
 */
export function snapToGuide(guides, v, reach, grid = 0.01) {
  let best = null;
  for (const g of guides) if (Math.abs(g.v - v) <= reach && (!best || Math.abs(g.v - v) < Math.abs(best.v - v))) best = g;
  return best ? { v: best.v, guide: best } : { v: Math.round(v / grid) * grid, guide: null };
}

/**
 * A ruler line right across the wall: where the line x = v (axis 'x') or
 * y = v (axis 'y') meets the wall's outline, [lo, hi] along the other axis —
 * floor to a sloping top, end to end of a stepped one — or null off the wall.
 */
export function acrossWall(outline, axis, v) {
  const other = axis === 'x' ? 'y' : 'x';
  const hits = [];
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    const [lo, hi] = [Math.min(p[axis], q[axis]), Math.max(p[axis], q[axis])];
    if (v < lo - 1e-9 || v > hi + 1e-9) return;
    if (hi - lo < 1e-9) hits.push(p[other], q[other]);
    else hits.push(p[other] + ((q[other] - p[other]) * (v - p[axis])) / (q[axis] - p[axis]));
  });
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

/**
 * What the wall's lines are in the CAD: an elevation line in the wall's own
 * metres → its two ends in CAD units on the sheet, for the CAD's walls `add`.
 */
export function wallLineToSheet(room, face, a, b, metresPerUnit = 1) {
  const origin = elevationOrigin(room, face);
  if (!origin) return null;
  const at = (p) => [+((origin.x + p.x) / metresPerUnit).toFixed(6), +((origin.y + p.y) / metresPerUnit).toFixed(6)];
  return { a: at(a), b: at(b) };
}

/**
 * What a palette id is built of, for its detail — { depth (m), infill, face }
 * — or null for a finish with no depth worth a section (plaster, glass, a
 * curtain). The depth is the product's or the material's own (…×100, 100 mm),
 * else what that kind of thing usually is.
 */
export function detailBuild(paletteId) {
  const mat = material(paletteId);
  const product = PRODUCTS.find((x) => x.id === paletteId);
  const KIND = { Absorber: { depth: 100, infill: 'insulation', face: 'fabric face' }, Diffuser: { depth: 200, infill: 'wells', face: 'wells, open to the room' }, Resonator: { depth: 150, infill: 'insulation', face: /slat/.test(mat.id) ? 'wood slats over the wool' : 'membrane panel' } };
  const kind = KIND[mat.category];
  if (!kind) return null;
  const named = Number((product?.name.match(/\d+×\d+×(\d+)/) ?? mat.name.match(/(\d+)\s*mm/) ?? [])[1]);
  const depth = (named >= 20 && named <= 1000 ? named : /trap/.test(mat.id) ? 300 : kind.depth) / 1000;
  return { ...kind, depth };
}

/** The details on a wall: one per build, numbered in the order its regions come, each listing its regions. */
export function wallDetails(regions) {
  const details = [];
  for (const r of regions) {
    const build = detailBuild(r.p.paletteId);
    if (!build) continue;
    let d = details.find((x) => x.paletteId === r.p.paletteId);
    if (!d) details.push((d = { paletteId: r.p.paletteId, n: details.length + 1, build, name: r.name, regions: [] }));
    d.regions.push(r);
  }
  return details;
}

/** The face's walls' area, m² — the true area, a splayed wall longer than its elevation shows. */
export const faceArea = (room, face) => room.walls.filter((w) => w.face === face).reduce((s, w) => s + (w.area ?? 0), 0);

/**
 * What the wall soaks up, per octave: { bands, rows, rest, total, share }.
 * Each region its area × α, the rest of the wall at its base finish, the
 * total, and its share of the room's whole absorption (room.perBand A).
 */
export function wallAbsorption(room, face, regions, baseId) {
  const base = material(baseId);
  const S = faceArea(room, face);
  const covered = regions.reduce((s, r) => s + r.area, 0);
  const rest = { name: base.name, area: Math.max(0, S - covered), alpha: base.alpha };
  const rows = regions.map((r) => {
    const mat = material(r.p.paletteId);
    return { tag: r.tag, name: r.name, area: r.area, alpha: mat.alpha, A: mat.alpha.map((a) => a * r.area) };
  });
  const restA = rest.alpha.map((a) => a * rest.area);
  const total = BANDS.map((_, b) => restA[b] + rows.reduce((s, r) => s + r.A[b], 0));
  const share = BANDS.map((_, b) => {
    const all = room.perBand?.[b] ? room.perBand[b].A + room.perBand[b].Aobj : NaN;
    return all > 0 ? total[b] / all : NaN;
  });
  return { bands: BANDS, rows, rest: { ...rest, A: restA }, total, share };
}

/** A single-number TL spread over the octaves on the STC contour: its 500 Hz value is the number. */
export const contourTl = (single) => STC_CONTOUR.map((c) => single + c);

/**
 * The rating a TL per octave clears: the highest contour (its 500 Hz value)
 * with no band more than 8 dB under it and no more than 10 dB under summed.
 */
export function stcRating(tl) {
  for (let r = 90; r > 0; r--) {
    const under = tl.map((v, b) => Math.max(0, r + STC_CONTOUR[b] - v));
    if (Math.max(...under) <= 8 && under.reduce((s, v) => s + v, 0) <= 10) return r;
  }
  return 0;
}

/**
 * The windows on this face, in the wall's own metres: [{ win, x0, x1, y0, y1, area, glass }]
 * — `windows` as settings.windows[planLayer] holds them.
 */
export function wallWindows(room, face, windows = []) {
  const origin = elevationOrigin(room, face);
  if (!origin) return [];
  return windows
    .filter((w) => w.face === face)
    .map((win) => {
      const on = windowOnSheet(room, win);
      if (!on) return null;
      const xs = on.glass.map(([x]) => x - origin.x);
      const ys = on.glass.map(([, y]) => y - origin.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      return { win, x0, x1, y0, y1, area: win.w * win.h, glass: material(win.glass) };
    })
    .filter(Boolean);
}

/**
 * What the wall lets through: { build, layers, parts, tl, rating, shared,
 * leak }. `parts` are the elements of the composite — the wall's build over
 * what is not glass, each window's glass — each with its area and TL per
 * octave; `tl` the composite and `rating` its single number. `shared` says
 * whether the house is on the other side; then `leak` is the level there per
 * octave for `roomDb` in the room.
 */
export function wallTransmission(room, face, iso, windows = [], roomDb = 100) {
  const S = faceArea(room, face);
  const build = WALL_BUILDS[iso.walls] ?? WALL_BUILDS['single-stud'];
  const wallBand = wallTl(iso);
  const glass = windows.map((w) => ({ name: `${w.win.id} · ${w.glass.name}`, area: w.area, tl: contourTl(w.glass.tl) }));
  const glassArea = glass.reduce((s, g) => s + g.area, 0);
  const parts = [{ name: build.label, area: Math.max(0, S - glassArea), tl: wallBand }, ...glass];
  const total = parts.reduce((s, p) => s + p.area, 0);
  const tl = BANDS.map((_, b) => {
    if (!(total > 0)) return wallBand[b];
    const tau = parts.reduce((s, p) => s + p.area * 10 ** (-p.tl[b] / 10), 0) / total;
    return -10 * Math.log10(tau);
  });
  const shared = sharedFaces(iso).includes(face);
  const level = Array.isArray(roomDb) ? roomDb : BANDS.map(() => roomDb);
  const leak = shared && S > 0 ? tl.map((v, b) => level[b] - v + 10 * Math.log10(S / A_HOUSE)) : null;
  return { build, layers: build.layers ?? [], parts, tl, rating: stcRating(tl), buildRating: stcRating(wallBand), area: S, shared, roomDb: level, leak };
}
