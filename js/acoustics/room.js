// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { buildAlpha, DEFAULT_ISOLATION } from './isolation.js';
import { BANDS, BANDS_9, C, airM, airM9, FREQ_3RD, FREQ_OCTAVE } from './bands.js';
import { DEG, angleDiff, ensureCCW, isConvex, signedArea, simplifyPolygon } from './geometry.js';
import { measureSection, profileFromLoop } from './elevations.js';
import { material } from './materials.js';
import { layPatches } from './patches.js';
import { openingsOn, wallKey } from './wallChains.js';

/**
 * THE ROOM: A PLAN, EXTRUDED
 *
 * The CAD gives a closed loop; this gives it a height and a front, and from
 * those the six faces a designer talks about — FLOOR, CEILING and the FRONT,
 * BACK, LEFT and RIGHT walls. A wall belongs to the face its outward normal
 * points at, within 45°, so a Dolby-style trapezoid still has exactly one
 * front and its splayed sides are still LEFT and RIGHT.
 *
 * "Working space" length and width are measured in the front frame, the way
 * the Dolby Room Design Tool measures them: L front-to-back, W left-to-right.
 *
 * Elevations drawn in the CAD (elevations.js) cut the extrusion: a sloped
 * ceiling, a raked floor. Then V, S and every surface's area are integrated
 * over the real shape, and H is the MEAN height (zCeiling − zFloor) — the box
 * the image sources and the modal sum stand in with — while Hmax bounds the
 * drawings. With no elevation drawn, H = Hmax = the ceiling height setting.
 *
 * Patches painted in the CAD (patches.js) — a panel on the left wall, a cloud
 * on the ceiling, carpet on part of the floor — make each surface a MIX. Every
 * surface's material becomes the effective one: α area-weighted, so A rises by
 * exactly area · (α_patch − α_base); s weighted by the energy each part
 * reflects, area · (1 − α), because s is a fraction of the REFLECTED energy
 * and an absorber's scattering hardly reaches the room; TL weighted as
 * transmission coefficients, so one open door dominates a wall. Overlapping
 * patches are not unioned: a surface's patched area is simply capped at its
 * own area, scaling every patch on it down alike — good enough for design
 * intent, and it never counts a wall twice.
 *
 * A wall can be told what it is (settings.walls, keyed by wallKey): its own
 * finish instead of its face's, and a note in the user's words. A plan of wall
 * pieces with gaps (wallChains.js) brings its OPENINGS: each lies on a wall
 * and is mixed in like a patch of 'opening', all but α 1 — sound leaves by
 * it (0.99, the cap on every material, so Eyring's ln(1 − α) stays finite).
 */

export const FACES = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];
export const WALL_FACES = ['front', 'back', 'left', 'right'];

export function faceOf(outwardDeg, frontDeg) {
  const d = angleDiff(outwardDeg, frontDeg);
  if (Math.abs(d) <= 45) return 'front';
  if (d > 45 && d <= 135) return 'left';
  if (d < -45 && d >= -135) return 'right';
  return 'back';
}

/** Axes of the front frame: f points at the front wall, r to the listener's right. */
export function frontFrame(frontDeg) {
  const f = { x: Math.cos(frontDeg * DEG), y: Math.sin(frontDeg * DEG) };
  return { f, r: { x: f.y, y: -f.x } };
}

/**
 * `loops`: the elevations drawn in the CAD, [{ face, poly }] in sheet metres.
 * `patches`: what is painted on the surfaces, [{ id, paletteId, layer, poly }]
 * in sheet metres (engine.js patchesFromCad).
 */
export function buildRoom(polyMetres, settings, loops = [], patches = [], openings = []) {
  const poly = ensureCCW(simplifyPolygon(polyMetres));
  const Hbase = settings.roomHeight;
  const { f, r } = frontFrame(settings.frontDeg);
  const mats = settings.faceMaterials;
  // What the walls and floor are BUILT of adds a little bass absorption to what they are faced with (isolation.js).
  const built = buildAlpha({ ...DEFAULT_ISOLATION, ...settings.isolation });
  const withBuild = (mat, add) => (add.some((x) => x > 0) ? { ...mat, alpha: mat.alpha.map((a, b) => Math.min(0.99, a + add[b] * (1 - a))) } : mat);

  const walls = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const nIn = { x: -t.y, y: t.x };
    const outwardDeg = Math.atan2(-nIn.y, -nIn.x) / DEG;
    const face = faceOf(outwardDeg, settings.frontDeg);
    const key = wallKey({ a, b });
    const told = settings.walls?.[key] ?? {};
    const w = { i, a, b, len, t, nIn, face, key, note: told.note ?? '', told: Boolean(told.material), material: withBuild(material(told.material ?? mats[face]), built.walls) };
    w.openings = openingsOn(w, openings);
    return w;
  });

  const area = signedArea(poly);

  const projF = poly.map((p) => p.x * f.x + p.y * f.y);
  const projR = poly.map((p) => p.x * r.x + p.y * r.y);
  const frame = {
    f,
    r,
    front: Math.max(...projF),
    back: Math.min(...projF),
    left: Math.min(...projR),
    right: Math.max(...projR),
  };
  const L = frame.front - frame.back;
  const W = frame.right - frame.left;

  const room = { poly, walls, frame, L, W, area, Hbase, profiles: loops.map((l) => profileFromLoop(l.face, l.poly, L, W)) };
  const m = room.profiles.length
    ? measureSection(room)
    : { V: area * Hbase, floorArea: area, ceilingArea: area, zFloor: 0, zCeiling: Hbase, Hmax: Hbase, wallAreas: walls.map((w) => w.len * Hbase) };
  walls.forEach((w, i) => (w.area = m.wallAreas[i]));
  const H = m.zCeiling - m.zFloor;
  const V = m.V;

  const laid = layPatches(room, patches);
  const on = (surface, wall = null) => laid.pieces.filter((p) => p.surface === surface && p.wall === wall);
  const floor = effective(withBuild(material(mats.floor), built.floor), m.floorArea, on('floor'));
  const ceiling = effective(material(mats.ceiling), m.ceilingArea, on('ceiling'));
  const gaps = (w) => w.openings.map((o) => ({ material: material('opening'), paletteId: 'opening', area: o.width * (w.area / w.len) }));
  walls.forEach((w) => (w.material = effective(w.material, w.area, [...on('wall', w.i), ...gaps(w)])));
  const surfaces = [
    { key: 'floor', face: 'floor', area: m.floorArea, material: floor },
    { key: 'ceiling', face: 'ceiling', area: m.ceilingArea, material: ceiling },
    ...walls.map((w) => ({ key: `wall:${w.i}`, face: w.face, area: w.area, material: w.material })),
  ];

  // summed in the same order as ever, so a room with no patches gives the same numbers to the last bit
  const perBand = BANDS.map((_, band) => {
    let S = 0;
    let A = 0;
    for (const s of surfaces) {
      S += s.area;
      A += s.area * s.material.alpha[band];
    }
    const abar = Math.min(A / S, 0.99);
    const m4V = 4 * airM(band) * V;
    return {
      S,
      A,
      abar,
      sabine: (0.161 * V) / (A + m4V),
      eyring: (0.161 * V) / (-S * Math.log(1 - abar) + m4V),
      R: (S * abar) / (1 - abar),
    };
  });

  // Extended 9-band octave series (31 Hz … 8 kHz)
  const perBand9 = BANDS_9.map((f, band) => {
    let S = 0;
    let A = 0;
    for (const s of surfaces) {
      S += s.area;
      const alphaVal = s.material.alpha9
        ? s.material.alpha9[band]
        : s.material.alpha[band <= 1 ? 0 : band >= 7 ? 5 : band - 2];
      A += s.area * Math.min(0.99, Math.max(0, alphaVal));
    }
    const abar = Math.min(A / S, 0.99);
    const m4V = 4 * airM9(band) * V;
    return {
      f,
      S,
      A,
      abar,
      sabine: (0.161 * V) / (A + m4V),
      eyring: (0.161 * V) / (-S * Math.log(1 - abar) + m4V),
      R: (S * abar) / (1 - abar),
    };
  });

  return {
    poly,
    H,
    Hbase,
    Hmax: m.Hmax,
    zFloor: m.zFloor,
    zCeiling: m.zCeiling,
    profiles: room.profiles,
    sloped: room.profiles.length > 0,
    walls,
    openings,
    floor,
    ceiling,
    surfaces,
    patches: laid.pieces,
    patchWarnings: laid.warnings,
    area,
    V,
    perBand,
    perBand9,
    bands: BANDS,
    bands9: BANDS_9,
    freq3rd: FREQ_3RD,
    freqOctave: FREQ_OCTAVE,
    frame,
    L,
    W,
    convex: isConvex(poly),
    rect: isRectangle(poly),
  };
}

/**
 * A surface's material with its patches mixed in (see the header). Plain data:
 * { id, name, category, color, alpha, scatter, tl, base, patched } — `base` the
 * catalogue id underneath, `patched` the m² the patches cover (after the cap).
 */
function effective(base, area, pieces) {
  const raw = pieces.reduce((s, p) => s + p.area, 0);
  if (!(raw > 0) || !(area > 0)) {
    return {
      ...base,
      alpha: [...base.alpha],
      alpha9: base.alpha9 ? [...base.alpha9] : undefined,
      scatter: [...base.scatter],
      base: base.id,
      patched: 0,
    };
  }
  const k = raw > area ? area / raw : 1;
  const patched = raw * k;
  const bare = area - patched;
  const parts = [{ mat: base, a: bare }, ...pieces.map((p) => ({ mat: p.material, a: p.area * k }))];
  const alpha = base.alpha.map((_, b) => parts.reduce((s, x) => s + x.a * x.mat.alpha[b], 0) / area);
  const baseAlpha9 = base.alpha9 ?? BANDS_9.map((_, b) => base.alpha[b <= 1 ? 0 : b >= 7 ? 5 : b - 2]);
  const alpha9 = baseAlpha9.map((_, b) => parts.reduce((s, x) => s + x.a * ((x.mat.alpha9 ? x.mat.alpha9[b] : x.mat.alpha[b <= 1 ? 0 : b >= 7 ? 5 : b - 2]) ?? 0), 0) / area);
  const scatter = base.scatter.map((_, b) => {
    const reflected = parts.reduce((s, x) => s + x.a * (1 - x.mat.alpha[b]), 0);
    if (reflected <= 1e-12) return parts.reduce((s, x) => s + x.a * x.mat.scatter[b], 0) / area;
    return parts.reduce((s, x) => s + x.a * (1 - x.mat.alpha[b]) * x.mat.scatter[b], 0) / reflected;
  });
  const tau = parts.reduce((s, x) => s + x.a * 10 ** (-x.mat.tl / 10), 0) / area;
  const kinds = new Set(pieces.map((p) => p.paletteId)).size;
  return {
    ...base,
    id: `${base.id}+patches`,
    name: `${base.name} + ${kinds} patch${kinds === 1 ? '' : 'es'}`,
    alpha,
    alpha9,
    scatter,
    tl: +(-10 * Math.log10(tau)).toFixed(1),
    base: base.id,
    patched,
  };
}

function isRectangle(poly) {
  if (poly.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const c = poly[(i + 2) % 4];
    const d1 = { x: b.x - a.x, y: b.y - a.y };
    const d2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
    if (Math.abs(cos) > 0.035) return false;
  }
  return true;
}

/** A point's place in the front frame: distance from the front wall, from the left wall, height. */
export function inFrame(room, p) {
  const { f, r } = room.frame;
  return {
    fromFront: room.frame.front - (p.x * f.x + p.y * f.y),
    fromLeft: p.x * r.x + p.y * r.y - room.frame.left,
  };
}

/** The inverse of inFrame, at height z. */
export function fromFrame(room, fromFront, fromLeft) {
  const { f, r } = room.frame;
  const s = room.frame.front - fromFront;
  const q = room.frame.left + fromLeft;
  return { x: s * f.x + q * r.x, y: s * f.y + q * r.y };
}

/**
 * Axial modes of the working-space box, n = 1 … nMax per dimension. Exact for
 * a rectangle; for any other plan it is the bounding box in the front frame,
 * and `room.rect` says which.
 */
export function axialModes(room, nMax = 4) {
  const out = [];
  for (const [axis, len] of [['L', room.L], ['W', room.W], ['H', room.H]]) {
    for (let n = 1; n <= nMax; n++) out.push({ axis, n, f: (C * n) / (2 * len) });
  }
  return out.sort((a, b) => a.f - b.f);
}

/** Where mode n of a dimension has its pressure nulls, as fractions of it: (2k − 1) / 2n. */
export function nullFractions(n) {
  return Array.from({ length: n }, (_, k) => (2 * k + 1) / (2 * n));
}

/** Schroeder frequency, Hz: below it the room is modes, above it a diffuse field. */
export function schroeder(room, band = 2) {
  return 2000 * Math.sqrt(room.perBand[band].eyring / room.V);
}

/**
 * Every mode of the working-space box up to fMax, classified the way the
 * rigid-walled-room literature does it (axial, tangential, oblique) —
 * f = (c/2)·√((nx/L)² + (ny/W)² + (nz/H)²). The analytic benchmark that
 * Tronci's Computational Acoustics series validates FEM against; here it is
 * also what the modal method sums.
 */
export function allModes(room, fMax) {
  const out = [];
  const max = (len) => Math.floor((2 * len * fMax) / C);
  for (let nx = 0; nx <= max(room.L); nx++)
    for (let ny = 0; ny <= max(room.W); ny++)
      for (let nz = 0; nz <= max(room.H); nz++) {
        const zeros = (nx === 0) + (ny === 0) + (nz === 0);
        if (zeros === 3) continue;
        const f = (C / 2) * Math.hypot(nx / room.L, ny / room.W, nz / room.H);
        if (f <= fMax) out.push({ nx, ny, nz, f, type: zeros === 2 ? 'axial' : zeros === 1 ? 'tangential' : 'oblique' });
      }
  return out.sort((a, b) => a.f - b.f);
}
