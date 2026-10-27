// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * WHAT A THING IS MADE OF, TO LOOK AT
 *
 * A product on the floor is heard as its footprint stood up to its height
 * (materials.js furnitureHeight, exposedArea): that is the acoustics, and it
 * does not change here. These are its PIECES, for the eye only — a kit's
 * drums and cymbals, a piano's case, a console's sloped surface, knobs and
 * meter bridge on its legs — so the room reads as the room it is.
 *
 * In the product's own frame, metres: x across its width (−w/2 … w/2), y
 * along its depth (−d/2 … d/2) with the player or operator at −y, z up from
 * the floor. Shapes:
 *
 *   box      { x, y, z0, w, d, h }            a block about (x, y), z0 its foot
 *   disc     { x, y, z0, z1, r }              a drum, a cymbal, a stool
 *   prism    { pts: [[x, y]…], z0, z1 }       a plan outline stood up
 *   extrude  { axis, a, b, pts: [[u, z]…] }   a side outline (u along the
 *            other horizontal) run along `axis` ('x' or 'y') from a to b
 *
 * each with its `colour`. Sizes are a typical instrument of the kind, from
 * the makers' published dimensions where one is named; the console's profile
 * is a drawing of the kind (a broadcast desk on a leg stand), not a survey of
 * any one desk.
 */

import { MASSONBERG, STICK_DIFFUSER, stickBalance } from './materials.js';
import { rackPieces } from './rack.js';

const BLACK = '#18181b';
const SHELL = '#b91c1c';
const HEAD = '#e7e5e4';
const BRASS = '#ca8a04';
const STEEL = '#9ca3af';
const IVORY = '#f5f5f4';
const WOOD = '#7c4a1e';
const GRILLE = '#3f3f46';

const disc = (x, y, z0, z1, r, colour) => ({ shape: 'disc', x, y, z0, z1, r, colour });
const box = (x, y, z0, w, d, h, colour) => ({ shape: 'box', x, y, z0, w, d, h, colour });
/** A drum: its shell, and a head on top. */
const drum = (x, y, z0, z1, r) => [disc(x, y, z0, z1 - 0.006, r, SHELL), disc(x, y, z1 - 0.006, z1, r, HEAD)];
/** A cymbal on its stand. */
const cymbal = (x, y, z, r) => [box(x, y, 0, 0.025, 0.025, z, STEEL), disc(x, y, z, z + 0.012, r, BRASS)];

/** A drum kit, 1.8 × 1.5 m: kick, snare, two rack toms, floor tom, hi-hat, crash, ride and the throne. */
function drumKit() {
  return [
    disc(0, -0.55, 0, 0.5, 0.18, BLACK),
    // the kick on its side, its heads facing front and back
    { shape: 'extrude', axis: 'y', a: 0.0, b: 0.46, pts: circle(0, 0.28, 0.28), colour: SHELL },
    { shape: 'extrude', axis: 'y', a: 0.46, b: 0.47, pts: circle(0, 0.28, 0.27), colour: HEAD },
    ...drum(-0.28, -0.18, 0.5, 0.66, 0.18),
    ...drum(-0.15, 0.2, 0.72, 0.92, 0.15),
    ...drum(0.18, 0.2, 0.72, 0.94, 0.16),
    ...drum(0.45, -0.2, 0.1, 0.56, 0.2),
    ...cymbal(-0.6, -0.12, 0.85, 0.18),
    disc(-0.6, -0.12, 0.87, 0.88, 0.18, BRASS),
    ...cymbal(-0.55, 0.45, 1.25, 0.23),
    ...cymbal(0.68, 0.25, 1.05, 0.25),
  ];
}

/** Points round a circle in (u, z), for an extrusion. */
function circle(u, z, r, n = 14) {
  return Array.from({ length: n }, (_, i) => [u + r * Math.cos((i / n) * 2 * Math.PI), z + r * Math.sin((i / n) * 2 * Math.PI)]);
}

/** A grand piano, 1.48 × 2.11 m (a 211 cm studio grand): the case, its keyboard at the front, three legs. */
function grandPiano() {
  const caseOutline = [[-0.74, -0.8], [0.74, -0.8], [0.74, -0.4], [0.6, -0.02], [0.32, 0.36], [0.16, 0.7], [0.06, 0.95], [-0.14, 1.055], [-0.5, 1.055], [-0.7, 0.95], [-0.74, 0.8]];
  return [
    box(-0.62, -0.7, 0, 0.1, 0.1, 0.62, BLACK),
    box(0.62, -0.7, 0, 0.1, 0.1, 0.62, BLACK),
    box(-0.4, 0.9, 0, 0.1, 0.1, 0.62, BLACK),
    { shape: 'prism', pts: caseOutline, z0: 0.62, z1: 1.0, colour: BLACK },
    box(0, -0.93, 0.66, 1.48, 0.26, 0.06, BLACK),
    box(0, -0.94, 0.72, 1.24, 0.15, 0.02, IVORY),
  ];
}

/** A Hammond B-3 with its pedals: 1.25 × 0.73 m, about 1 m tall — the body, two manuals, the pedalboard, four legs. */
function hammond() {
  return [
    ...[-0.56, 0.56].flatMap((x) => [box(x, 0.0, 0, 0.08, 0.08, 0.15, WOOD), box(x, 0.3, 0, 0.08, 0.08, 0.15, WOOD)]),
    box(0, 0.16, 0.15, 1.25, 0.42, 0.85, WOOD),
    box(0, -0.12, 0.72, 1.1, 0.14, 0.06, WOOD),
    box(0, -0.13, 0.78, 0.98, 0.12, 0.02, IVORY),
    box(0, -0.03, 0.83, 1.1, 0.1, 0.06, WOOD),
    box(0, -0.04, 0.89, 0.98, 0.09, 0.02, IVORY),
    box(0, -0.29, 0, 0.9, 0.16, 0.05, WOOD),
  ];
}

/** A Leslie 122 rotating speaker, about 0.84 × 0.55 m and 1.03 m tall: the cabinet and the louvres at the top front. */
function leslie() {
  return [box(0, 0, 0.04, 0.84, 0.55, 0.99, WOOD), box(0, -0.276, 0.66, 0.6, 0.01, 0.3, GRILLE), box(0, -0.276, 0.14, 0.6, 0.01, 0.3, GRILLE)];
}

/** A keyboard on an X-stand: the stand's legs, the instrument, its keys toward the player. */
function keyboard(w, d) {
  return [
    box(-w * 0.3, 0, 0, 0.04, d * 0.8, 0.72, STEEL),
    box(w * 0.3, 0, 0, 0.04, d * 0.8, 0.72, STEEL),
    box(0, 0, 0.72, w, d, 0.11, BLACK),
    box(0, -d * 0.18, 0.79, w * 0.86, d * 0.42, 0.045, IVORY),
  ];
}

/** An amp head: the box, its front panel and a row of knobs. */
function ampHead(w, d, z0 = 0) {
  return [box(0, 0, z0, w, d, 0.28, BLACK), box(0, -d / 2 - 0.004, z0 + 0.08, w * 0.9, 0.008, 0.12, STEEL), ...knobRow(-w * 0.38, w * 0.38, 10, -d / 2 - 0.016, z0 + 0.13)];
}
/** Knobs along a line on a vertical face. */
function knobRow(x0, x1, n, y, z) {
  return Array.from({ length: n }, (_, i) => box(x0 + ((x1 - x0) * i) / (n - 1), y, z, 0.025, 0.016, 0.025, BLACK));
}

/** A combo, or a half stack: the 4×12 and a head on it. */
const combo = () => [box(0, 0, 0, 0.6, 0.28, 0.48, BLACK), box(0, -0.142, 0.04, 0.54, 0.006, 0.32, GRILLE), box(0, -0.142, 0.39, 0.54, 0.006, 0.06, STEEL)];
const halfStack = () => [box(0, 0, 0, 0.76, 0.36, 0.98, BLACK), box(0, -0.182, 0.06, 0.7, 0.006, 0.86, GRILLE), ...ampHead(0.74, 0.3, 1.0)];

/**
 * A console on a leg stand, `w` × `d`: a rolled armrest, the work surface
 * sloping up and away from the operator, a meter bridge across the back with
 * a VU meter per strip, knobs in rows up each strip and a fader at its foot;
 * the stand a swept leg at each end. `strips` channels across.
 */
function console_(w, d, strips) {
  const y0 = -d / 2;
  // the side profile in (y, z), the operator at −y
  const profile = [[y0, 0.7], [y0 + 0.06, 0.78], [y0 + 0.62 * d, 0.95], [y0 + 0.66 * d, 0.95], [y0 + 0.66 * d, 1.2], [y0 + 0.92 * d, 1.2], [d / 2, 0.66], [y0 + 0.04, 0.66]];
  const cheek = 0.05;
  const leg = [[y0 + 0.12 * d, 0], [y0 + 0.24 * d, 0], [y0 + 0.5 * d, 0.66], [y0 + 0.88 * d, 0.66], [y0 + 0.86 * d, 0], [y0 + 0.74 * d, 0], [y0 + 0.66 * d, 0.5], [y0 + 0.4 * d, 0.5]];
  const out = [
    { shape: 'extrude', axis: 'x', a: -w / 2 + cheek, b: w / 2 - cheek, pts: profile, colour: '#4b5563' },
    { shape: 'extrude', axis: 'x', a: -w / 2, b: -w / 2 + cheek, pts: profile, colour: WOOD },
    { shape: 'extrude', axis: 'x', a: w / 2 - cheek, b: w / 2, pts: profile, colour: WOOD },
    { shape: 'extrude', axis: 'x', a: -w / 2 + 0.1, b: -w / 2 + 0.16, pts: leg, colour: BLACK },
    { shape: 'extrude', axis: 'x', a: w / 2 - 0.16, b: w / 2 - 0.1, pts: leg, colour: BLACK },
  ];
  // the slope, from the armrest's back edge up to the bridge: a strip's knobs ride it
  const [ya, za] = [y0 + 0.08, 0.78];
  const [yb, zb] = [y0 + 0.6 * d, 0.95];
  const on = (t) => [ya + (yb - ya) * t, za + (zb - za) * t];
  const pitch = (w - 2 * cheek - 0.1) / strips;
  for (let i = 0; i < strips; i++) {
    const x = -w / 2 + cheek + 0.05 + pitch * (i + 0.5);
    const [fy, fz] = on(0.1);
    out.push(box(x, fy, fz, 0.012, 0.12, 0.012, BLACK), box(x, fy - 0.02, fz + 0.012, 0.03, 0.02, 0.018, IVORY));
    for (const t of [0.4, 0.52, 0.64, 0.76, 0.88]) {
      const [ky, kz] = on(t);
      out.push(box(x, ky, kz, 0.022, 0.022, 0.02, t > 0.8 ? '#dc2626' : '#d4d4d8'));
    }
    out.push(box(x, y0 + 0.66 * d - 0.006, 1.03, pitch * 0.7, 0.012, 0.11, '#fef3c7'));
  }
  return out;
}

/**
 * The Massonberg stick diffuser: the board standing up the middle of its
 * sled, the sticks glued to its face reaching toward the room (−y), each its
 * own random length, and the steel that balances them on the sled behind
 * (materials.js stickBalance). Drawn in 4 in bundles of sixteen sticks, so
 * the view stays quick; the lengths are seeded, the same every time it is drawn.
 */
function massonberg() {
  const { w, h, base, board } = MASSONBERG;
  const { min, max } = STICK_DIFFUSER;
  const cell = 0.1016;
  const nx = Math.floor(w / cell);
  const nz = Math.floor(h / cell);
  let seed = 0x5eed;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const out = [box(0, board / 2, 0, w, board, h, '#a16207'), box(0, 0, 0, w, base, 0.04, BLACK)];
  const { plate } = stickBalance();
  out.push(box(0, board + (base / 2 - board) / 2, 0.04, w, base / 2 - board, plate, STEEL));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const len = min + (max - min) * random();
      const shade = ['#c08a3e', '#b07a32', '#d19a4e'][Math.floor(random() * 3)];
      out.push(box(-w / 2 + cell * (i + 0.5), -len / 2, 0.04 + cell * j, cell, len, cell, shade));
    }
  return out;
}

const PIECES = {
  'massonberg-2400x600': massonberg,
  'drum-kit-1800x1500': drumKit,
  'grand-piano-1480x2110': grandPiano,
  'hammond-b3-1250x730': hammond,
  'leslie-122-840x550': leslie,
  'keyboard-88-1350x380': () => keyboard(1.35, 0.38),
  'keyboard-61-1000x350': () => keyboard(1.0, 0.35),
  'amp-head-700x280': () => ampHead(0.7, 0.28),
  'guitar-amp-600x280': combo,
  'guitar-stack-760x360': halfStack,
  'console-2400x1000': () => console_(2.4, 1.0, 24),
  'console-3200x1200': () => console_(3.2, 1.2, 32),
  'console-broadcast-2000x1100': () => console_(2.0, 1.1, 20),
};
const cache = new Map();

/** The pieces a product is drawn with, or null when it is drawn as its footprint stood up. */
export function piecesOf(paletteId) {
  const make = PIECES[paletteId];
  if (!make) return null;
  if (!cache.has(paletteId)) cache.set(paletteId, make());
  return cache.get(paletteId);
}

/** A placed piece's pieces: a rack drawn from what it holds (rack.js, `patch.rack` from room.js), anything else from its kind. */
export function partsOf(patch) {
  if (!patch.at) return null;
  return patch.rack ? rackPieces(patch.rack, patch.paletteId) : piecesOf(patch.paletteId);
}

/** A piece's outline seen from above, in the product's frame: [[x, y]…]. */
export function pieceFootprint(pc) {
  if (pc.shape === 'box') return [[pc.x - pc.w / 2, pc.y - pc.d / 2], [pc.x + pc.w / 2, pc.y - pc.d / 2], [pc.x + pc.w / 2, pc.y + pc.d / 2], [pc.x - pc.w / 2, pc.y + pc.d / 2]];
  if (pc.shape === 'disc') return Array.from({ length: 16 }, (_, i) => [pc.x + pc.r * Math.cos((i / 16) * 2 * Math.PI), pc.y + pc.r * Math.sin((i / 16) * 2 * Math.PI)]);
  if (pc.shape === 'prism') return pc.pts;
  const us = pc.pts.map(([u]) => u);
  const [u0, u1] = [Math.min(...us), Math.max(...us)];
  return pc.axis === 'x' ? [[pc.a, u0], [pc.b, u0], [pc.b, u1], [pc.a, u1]] : [[u0, pc.a], [u1, pc.a], [u1, pc.b], [u0, pc.b]];
}

/** How high a piece reaches, metres. */
export const pieceTop = (pc) => (pc.shape === 'box' ? pc.z0 + pc.h : pc.shape === 'extrude' ? Math.max(...pc.pts.map(([, z]) => z)) : pc.z1);

/** A plan outline raised between z0 and z1, as faces: the bottom, the top and a side per edge. */
function raisedFaces(base, z0, z1) {
  const lo = base.map(([x, y]) => [x, y, z0]);
  const hi = base.map(([x, y]) => [x, y, z1]);
  return [lo, hi, ...base.map((_, i) => {
    const j = (i + 1) % base.length;
    return [lo[i], lo[j], hi[j], hi[i]];
  })];
}

/** A piece as faces in the product's frame: [[x, y, z]…] each. */
export function pieceFaces(pc) {
  if (pc.shape === 'extrude') {
    const P = (t, u, z) => (pc.axis === 'x' ? [t, u, z] : [u, t, z]);
    return [pc.pts.map(([u, z]) => P(pc.a, u, z)), pc.pts.map(([u, z]) => P(pc.b, u, z)), ...pc.pts.map(([u0, z0], i) => {
      const [u1, z1] = pc.pts[(i + 1) % pc.pts.length];
      return [P(pc.a, u0, z0), P(pc.a, u1, z1), P(pc.b, u1, z1), P(pc.b, u0, z0)];
    })];
  }
  const [z0, z1] = pc.shape === 'box' ? [pc.z0, pc.z0 + pc.h] : [pc.z0, pc.z1];
  return raisedFaces(pieceFootprint(pc), z0, z1);
}

/**
 * What stands on the floor, as solids in the room: for a floor patch with a
 * height, its pieces set where its block sits and turned with it, or — with
 * none, or no block — its footprint stood up to its height. Each solid
 * { colour, faces: [[{ x, y, z }…]…] }, for a view that draws them flat.
 */
export function floorSolids(patch, height) {
  const floor = patch.points3d?.[0]?.z ?? 0;
  const parts = partsOf(patch);
  if (!parts) {
    const base = patch.points3d.map((q) => [q.x, q.y]);
    return [{ colour: patch.material?.color ?? '#6b7280', faces: raisedFaces(base, floor, floor + height).map((f) => f.map(([x, y, z]) => ({ x, y, z }))) }];
  }
  const th = ((patch.rotation ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(th), Math.sin(th)];
  const W = ([x, y, z]) => ({ x: patch.at.x + x * c - y * s, y: patch.at.y + x * s + y * c, z: floor + z });
  return parts.map((pc) => ({ colour: pc.colour, faces: pieceFaces(pc).map((f) => f.map(W)) }));
}
