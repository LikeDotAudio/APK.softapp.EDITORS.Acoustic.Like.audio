// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ACOUSTX_ABSORBERS } from '../acoustx/database.js';
import { SYMBOLS, symbolOf } from './symbols.js';

/**
 * SURFACES
 *
 * Octave-band absorption α (125 Hz … 4 kHz), octave-band scattering s, a
 * single-number transmission loss and a colour for what a CAD layer — or a
 * patch painted onto a wall in the CAD — can stand for. Values are typical
 * published textbook figures, rounded — good for design intent, not a test
 * report. The categories follow the way AcousticRooms (facebookresearch,
 * CC BY 4.0) groups its 332-material library, so a material picked here has an
 * obvious home there.
 *
 * α is capped at 0.99: Eyring takes ln(1 − α) and a perfect absorber would
 * make every room anechoic by division.
 *
 * SCATTERING FROM ONE NUMBER. Most tables (ours included) publish a single s
 * per material. We read it as the value at 1 kHz — the band ISO 17497-1 random-
 * incidence data is usually quoted near — and give it a shape across the six
 * bands, because scattering is a size-to-wavelength effect:
 *
 *   FLAT  smooth, hard, flat surfaces (paint, glass, board, a door): nothing
 *         on them is comparable to any wavelength, so s stays where it is.
 *   ROUGH rough, porous or textured surfaces (brick, wool, carpet, people):
 *         the features are centimetres, so they only begin to matter as the
 *         wavelength shrinks — s rises with frequency, ×0.5 at 125 Hz to ×1.2
 *         at 4 kHz around the published value.
 *   QRD   a well diffuser is designed for a band: well below its design
 *         frequency (≈500 Hz for a 600 mm wooden QRD) the wells are too
 *         shallow to matter and it reflects like a flat board; above it, it
 *         scatters at its rated s. So it ramps ×0.15 → ×0.45 → ×1 across
 *         125–500 Hz and holds.
 *
 * Every s is clamped to [0, 0.99] — s = 1 would mean no specular reflection
 * at all, which no real surface manages and which the image-source tail would
 * read as silence.
 *
 * PRODUCTS are things that come in a size — a 600 × 600 QRD, a 1200 × 600 panel,
 * a door. Each points at a material here, and the CAD places it as a fixed-size
 * block; a material on its own is a FINISH, painted over any area. Both go to
 * the CAD as one palette (paletteItems), and both come back as patches that
 * room.js lays onto the surfaces.
 */

/** The felt under a listening room's carpet, kg/m² (40 oz/sq yd). */
export const CARPET_UNDERLAY = 1.36;

/** A Massonberg stick diffuser: 1 in sticks, cut to random lengths between `min` and `max`, m; `density` the wood's, kg/m³. */
export const STICK_DIFFUSER = { stick: 0.0254, min: 0.025, max: 0.3, density: 500 };

/**
 * What a stick wall weighs, kg per m² of wall: the sticks packed side by side,
 * each its mean length deep. Random lengths are uniform between min and max,
 * so the mean is halfway — a foot of maple-ish sticks is ≈80 kg/m², a ton
 * over a 3 × 4 m wall; `count` the sticks on a square metre.
 */
export function stickMass({ stick, min, max, density } = STICK_DIFFUSER) {
  const count = Math.floor(1 / stick) ** 2;
  return { count, kgPerM2: count * stick * stick * ((min + max) / 2) * density };
}

/** The Massonberg as a piece of furniture: `w` wide, `h` tall, standing on a sled `base` deep; the board the sticks are glued to, and the steel that balances them. */
export const MASSONBERG = { w: 2.4, h: 2.4, base: 0.6, board: 0.025, boardKgPerM2: 15, steel: 7850 };

/**
 * A freestanding stick wall leans forward: every stick hangs its weight in
 * front of the board, at half its length — a quarter of (min + max) on
 * average. Steel on the sled behind the board, centred `back` metres behind
 * it, brings the whole thing's centre of mass back over the board, the
 * middle of its sled. { sticks, board, counterweight, total } in kg, and
 * `plate` the steel's thickness laid across the sled behind the board, m.
 */
export function stickBalance(spec = MASSONBERG, sticks = STICK_DIFFUSER) {
  const area = spec.w * spec.h;
  const mSticks = stickMass(sticks).kgPerM2 * area;
  const mBoard = spec.boardKgPerM2 * area;
  const back = (spec.base / 2 - spec.board) / 2 + spec.board;
  const lean = mSticks * ((sticks.min + sticks.max) / 4) - mBoard * (spec.board / 2);
  const counterweight = Math.max(0, lean / back);
  const plate = counterweight / spec.steel / (spec.w * (spec.base / 2 - spec.board));
  return { sticks: mSticks, board: mBoard, counterweight, total: mSticks + mBoard + counterweight, plate };
}

/** The thinnest porous absorber that works across the spectrum, m (3 in): thinner takes the top and leaves the low mids. */
export const MIN_ABSORBER_DEPTH = 0.076;

const SHAPE = {
  flat: [1, 1, 1, 1, 1, 1],
  rough: [0.5, 0.6, 0.8, 1, 1.1, 1.2],
  qrd: [0.15, 0.45, 1, 1, 1, 1],
  // knobs, faders, buttons and patch fields: millimetres to centimetres, so a mirror below 1 kHz and a scatterer above
  gear: [0.1, 0.15, 0.3, 0.6, 0.85, 1],
  // a wall of sticks cut to random lengths up to a foot: no design band like a QRD's, the deepest sticks
  // reach down a little further (a quarter wave at 300 mm is ≈290 Hz), the 1 in faces scatter to the top
  sticks: [0.25, 0.55, 0.9, 1, 1, 1],
};

/** How a category draws in the CAD: a hatch tells a finish apart at a glance even in monochrome. */
const HATCH = { Masonry: 'ANSI31', Absorber: 'GRID', Diffuser: 'GRID', Resonator: 'GRID' };

const clamp = (x, hi) => Math.max(0, Math.min(hi, x));

/** `alpha9`, when given, is the 31 Hz … 8 kHz series (bands.js BANDS_9) — for a material whose low end is not simply its 125 Hz figure. */
const m = (id, name, category, alpha, tl, s, shape, color, alpha9) => ({
  id,
  name,
  category,
  alpha: alpha.map((a) => clamp(a, 0.99)),
  ...(alpha9 ? { alpha9: alpha9.map((a) => clamp(a, 0.99)) } : {}),
  scatter: SHAPE[shape].map((k) => +clamp(s * k, 0.99).toFixed(3)),
  tl,
  color,
});

export const MATERIALS = [
  // masonry — greys
  m('concrete-painted', 'Concrete, bare or painted', 'Masonry', [0.01, 0.01, 0.02, 0.02, 0.05, 0.05], 50, 0.1, 'flat', '#9a9a9a'),
  m('brick', 'Brick wall, unpainted', 'Masonry', [0.03, 0.03, 0.03, 0.04, 0.05, 0.07], 45, 0.3, 'rough', '#8c6f64'),
  m('block-painted', 'Concrete block, painted', 'Masonry', [0.1, 0.05, 0.06, 0.07, 0.09, 0.08], 45, 0.15, 'rough', '#7d8085'),
  // plaster and board — pale greys
  m('plaster', 'Plaster on masonry', 'Plaster & board', [0.01, 0.02, 0.02, 0.03, 0.04, 0.05], 45, 0.05, 'flat', '#c9c6bf'),
  m('gypsum', 'Drywall, gypsum board on studs', 'Plaster & board', [0.29, 0.1, 0.05, 0.04, 0.07, 0.09], 35, 0.1, 'flat', '#d8d8d2'),
  // wood — browns
  m('wood-panel', 'Plywood panelling, 1/4 in', 'Wood', [0.28, 0.22, 0.17, 0.09, 0.1, 0.11], 25, 0.2, 'flat', '#a0703c'),
  m('door-wood', 'Door, solid wood', 'Wood', [0.14, 0.1, 0.06, 0.08, 0.1, 0.1], 25, 0.05, 'flat', '#7a4e26'),
  m('casing-wood', 'Window casing, painted wood trim', 'Wood', [0.14, 0.1, 0.06, 0.08, 0.1, 0.1], 25, 0.1, 'flat', '#e8e2d4'),
  // glass — blues
  m('glass-window', 'Glass, ordinary window', 'Glass', [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], 28, 0.05, 'flat', '#7fb4d8'),
  m('glass-heavy', 'Plate glass, window pane', 'Glass', [0.18, 0.06, 0.04, 0.03, 0.02, 0.02], 35, 0.05, 'flat', '#4f8fc0'),
  // a screen: an LED wall or a big TV, a hard glossy face on a rigid frame — more a mirror than a pane, its low end an estimate (law 7)
  m('led-wall', 'LED wall or large TV, hard glossy face', 'Glass', [0.1, 0.04, 0.03, 0.02, 0.02, 0.02], 30, 0.05, 'flat', '#1e293b'),
  // floors
  m('wood-floor', 'Wood floor', 'Floor', [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], 40, 0.1, 'flat', '#b5834c'),
  m('concrete-floor', 'Concrete / tile floor', 'Floor', [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], 50, 0.05, 'flat', '#8a8a86'),
  m('carpet-pad', 'Heavy carpet on foam rubber', 'Floor', [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], 50, 0.4, 'rough', '#8a3a4a'),
  // the floor the literature asks of a listening room: the textbook row "heavy carpet on 40 oz hairfelt or foam rubber" is one row, so the same α
  m('carpet-felt', `Clipped-pile carpet, wall to wall, on ${CARPET_UNDERLAY} kg/m² felt`, 'Floor', [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], 50, 0.4, 'rough', '#7a3444'),
  // a rug laid on a hard floor: the textbook "carpet on concrete" row — it takes the top, not the bottom
  m('rug', 'Rug, wool pile, laid on the floor', 'Floor', [0.02, 0.06, 0.14, 0.37, 0.6, 0.65], 40, 0.3, 'rough', '#9a3b3b'),
  // ceilings
  m('acoustic-tile', 'Acoustic ceiling tile', 'Ceiling', [0.7, 0.66, 0.72, 0.92, 0.88, 0.75], 20, 0.2, 'rough', '#cfd9c4'),
  m('ceiling-cloud', 'Ceiling cloud, 100 mm suspended', 'Ceiling', [0.55, 0.9, 0.99, 0.99, 0.99, 0.95], 6, 0.2, 'rough', '#8fbf8a'),
  // soft furnishings — reds and purples
  m('drapes', 'Heavy curtain, pleated', 'Soft furnishing', [0.14, 0.35, 0.55, 0.72, 0.7, 0.65], 5, 0.4, 'rough', '#7a2f4f'),
  m('curtain-velour', 'Velour curtain, hung flat', 'Soft furnishing', [0.03, 0.04, 0.11, 0.17, 0.24, 0.35], 5, 0.1, 'flat', '#9a4a78'),
  m('audience', 'Audience, upholstered seats, occupied', 'Seating', [0.6, 0.74, 0.88, 0.96, 0.93, 0.85], 5, 0.7, 'rough', '#6a3a8a'),
  // absorbers — greens
  m('mineral-wool-50', 'Acoustic mineral wool, 50 mm (2 in)', 'Absorber', [0.2, 0.6, 0.95, 0.95, 0.95, 0.9], 6, 0.3, 'rough', '#5fa35a'),
  m('absorber-50', 'Porous absorber, 50 mm', 'Absorber', [0.15, 0.55, 0.95, 1, 1, 1], 6, 0.2, 'rough', '#74b86a'),
  m('absorber-100', 'Porous absorber, 100 mm', 'Absorber', [0.45, 0.9, 1, 1, 1, 1], 8, 0.2, 'rough', '#3f8f4a'),
  // TRAPS RATED BELOW 125 Hz. A bass trap is bought for the bottom octaves, so it carries them (alpha9, 31 … 8 kHz): a deep
  // porous corner fill falls off an octave lower than a panel, a membrane has its hump at 50–100 Hz. Estimates in the shape
  // those absorbers have, like the furniture's below — the maker's measured figures replace them (law 7).
  m('bass-trap', 'Bass trap, deep corner', 'Absorber', [0.8, 0.95, 1, 1, 1, 1], 8, 0.3, 'rough', '#2d6e3a', [0.2, 0.5, 0.8, 0.95, 1, 1, 1, 1, 1]),
  // resonators — olive: they absorb, but a band, not everything above one
  m('slat-resonator', 'Slat resonator, wood slats over wool', 'Resonator', [0.35, 0.65, 0.75, 0.45, 0.3, 0.2], 20, 0.4, 'rough', '#8a8a3a'),
  m('perforated-wood', 'Perforated wood panel over 50 mm wool', 'Resonator', [0.4, 0.9, 0.8, 0.5, 0.4, 0.3], 20, 0.15, 'flat', '#a39a4a'),
  m('membrane-trap', 'Membrane bass trap', 'Resonator', [0.65, 0.55, 0.35, 0.2, 0.15, 0.1], 25, 0.1, 'flat', '#6b6b2a', [0.25, 0.6, 0.65, 0.55, 0.35, 0.2, 0.15, 0.1, 0.1]),
  // diffusers — golds
  m('diffuser', 'QRD diffuser, wooden wells', 'Diffuser', [0.45, 0.3, 0.15, 0.2, 0.3, 0.4], 20, 0.9, 'qrd', '#d4a52a'),
  // MASSONBERG DIFFUSER: a mammoth wall of hundreds of 1 × 1 in (25.4 mm) wooden sticks, end grain out, each cut to a
  // random length (STICK_DIFFUSER) — a 2-D skyline with no sequence, so no lobes. Packed solid it is heavy (stickMass), and
  // that mass is why its TL is a wall's. α and s are design estimates in a wooden skyline's shape, not a test report.
  m('stick-diffuser', 'Massonberg diffuser, hundreds of 1×1 in sticks, random lengths', 'Diffuser', [0.2, 0.18, 0.15, 0.18, 0.22, 0.28], 40, 0.85, 'sticks', '#c08a3e'),
  // furniture — the desk is a hard reflector at ear height, the couch a big soft absorber
  m('desk-top', 'Desk top, laminate', 'Furniture', [0.05, 0.04, 0.04, 0.04, 0.05, 0.05], 20, 0.1, 'flat', '#6b7280'),
  // a console reflects, it does not absorb: a hard specular top under the boxes (the console bounce, images.js), its controls scattering the highs
  m('console-surface', 'Console surface: metal frame, faders, knobs, meter bridge', 'Furniture', [0.04, 0.04, 0.04, 0.05, 0.06, 0.06], 25, 0.5, 'gear', '#4b5563'),
  // FURNITURE AS BASS TRAPS. A couch is a deep porous absorber — foam, batting and fibre behind fabric, a frame
  // and springs that flex — so it keeps working an octave or two under 125 Hz where a thin panel has stopped; a
  // heavy table top is a limp mass that flexes, a panel absorber with its hump in the bottom octaves. Both low
  // ends are estimates in the shape those absorbers have, not a test report.
  m('upholstered', 'Upholstered couch or chair', 'Furniture', [0.35, 0.5, 0.65, 0.75, 0.75, 0.7], 5, 0.6, 'rough', '#7c5a3a', [0.12, 0.22, 0.35, 0.5, 0.65, 0.75, 0.75, 0.7, 0.65]),
  m('table-heavy', 'Heavy table, thick hardwood or stone top', 'Furniture', [0.18, 0.1, 0.06, 0.05, 0.05, 0.05], 30, 0.2, 'flat', '#8b5a2b', [0.12, 0.22, 0.18, 0.1, 0.06, 0.05, 0.05, 0.05, 0.05]),
  m('rack', 'Equipment rack, steel and gear', 'Furniture', [0.05, 0.05, 0.06, 0.08, 0.1, 0.1], 20, 0.5, 'rough', '#3f4652'),
  m('drum-kit', 'Drum kit: shells, heads and cymbals', 'Instruments', [0.12, 0.15, 0.12, 0.1, 0.08, 0.08], 5, 0.6, 'rough', '#b91c1c'),
  m('guitar-amp', 'Guitar amp: wooden cabinet, grille cloth', 'Instruments', [0.12, 0.1, 0.08, 0.08, 0.1, 0.12], 15, 0.3, 'rough', '#27272a'),
  // the keyboards: a grand's case and lid are a hard reflector over a soundboard that takes some low end; an
  // organ is a wooden cabinet; a stage keyboard a hard plastic top on a stand — design estimates, not test reports
  m('grand-piano', 'Grand piano: lacquered case, lid, soundboard', 'Instruments', [0.15, 0.12, 0.08, 0.06, 0.06, 0.06], 20, 0.3, 'rough', '#18181b'),
  m('organ-cabinet', 'Organ or rotating-speaker cabinet, wood', 'Instruments', [0.15, 0.12, 0.08, 0.07, 0.07, 0.08], 20, 0.3, 'rough', '#7c4a1e'),
  m('keyboard', 'Keyboard on a stand: hard top, keys', 'Instruments', [0.04, 0.04, 0.05, 0.05, 0.06, 0.06], 10, 0.3, 'rough', '#27272a'),
  m('door-acoustic', 'Acoustic door, sealed, solid core', 'Wood', [0.12, 0.08, 0.05, 0.05, 0.05, 0.05], 45, 0.05, 'flat', '#5c3b1e'),
  // nothing there
  m('opening', 'Opening / void', 'Opening', [1, 1, 1, 1, 1, 1], 0, 0, 'flat', '#202020'),
  // Acoustic X classic room treatment absorbers & materials
  ...ACOUSTX_ABSORBERS,
];

/** Things that come in a size: [w, h] in metres, as the CAD block is drawn. Ids never collide with a material's. */
const p = (id, name, mat, size) => ({ id, name, material: mat, size });

export const PRODUCTS = [
  p('desk-1800x900', 'Desk 1800×900', 'desk-top', [1.8, 0.9]),
  p('producer-desk-1800x600', 'Producer desk 1800×600', 'desk-top', [1.8, 0.6]),
  p('console-2400x1000', 'Mixing console 2400×1000', 'console-surface', [2.4, 1.0]),
  p('console-3200x1200', 'Large-format console 3200×1200', 'console-surface', [3.2, 1.2]),
  p('console-broadcast-2000x1100', 'Broadcast console on a leg stand, 20 strips, 2000×1100', 'console-surface', [2.0, 1.1]),
  p('table-heavy-2400x1000', 'Heavy table 2400×1000, hardwood', 'table-heavy', [2.4, 1.0]),
  p('couch-2000x900', 'Couch 2000×900', 'upholstered', [2.0, 0.9]),
  p('couch-2400x1000', 'Client couch 2400×1000', 'upholstered', [2.4, 1.0]),
  p('armchair-900', 'Armchair 900×900', 'upholstered', [0.9, 0.9]),
  // a 19-inch floor rack: its U, rails and what is in it are the rack's own (rack.js); 24 U stands the 1200 mm it always did
  p('rack-600x800', 'Equipment rack 600×800', 'rack', [0.6, 0.8]),
  p('rack-600x1000', 'Equipment rack 600×1000, deep', 'rack', [0.6, 1.0]),
  p('rack-800x1000', 'Equipment rack 800×1000, wide for cabling', 'rack', [0.8, 1.0]),
  p('drum-kit-1800x1500', 'Drum kit 1800×1500, with its throne', 'drum-kit', [1.8, 1.5]),
  p('guitar-amp-600x280', 'Guitar combo amp 600×280', 'guitar-amp', [0.6, 0.28]),
  p('guitar-stack-760x360', 'Guitar half stack, 4×12 and head, 760×360', 'guitar-amp', [0.76, 0.36]),
  p('amp-head-700x280', 'Amplifier head 700×280, on its own', 'guitar-amp', [0.7, 0.28]),
  p('keyboard-88-1350x380', 'Stage piano, 88 keys, on a stand 1350×380', 'keyboard', [1.35, 0.38]),
  p('keyboard-61-1000x350', 'Synth, 61 keys, on a stand 1000×350', 'keyboard', [1.0, 0.35]),
  p('hammond-b3-1250x730', 'Hammond B-3 organ with pedals 1250×730', 'organ-cabinet', [1.25, 0.73]),
  p('leslie-122-840x550', 'Leslie 122 rotating speaker 840×550', 'organ-cabinet', [0.84, 0.55]),
  p('grand-piano-1480x2110', 'Grand piano 1480×2110 (211 cm)', 'grand-piano', [1.48, 2.11]),
  p('qrd-600', 'QRD 600×600', 'diffuser', [0.6, 0.6]),
  p('qrd-1200x600', 'QRD 1200×600', 'diffuser', [1.2, 0.6]),
  p('skyline-600', 'Skyline diffuser 600×600', 'diffuser', [0.6, 0.6]),
  // freestanding: 2400 wide on its 600 deep sled, 2400 tall (FURNITURE_HEIGHT), the sticks facing the room (−y)
  p('massonberg-2400x600', 'Massonberg stick diffuser 2400×600, 2.4 m tall', 'stick-diffuser', [2.4, 0.6]),
  p('rug-2400x1700', 'Rug 2400×1700', 'rug', [2.4, 1.7]),
  p('rug-3000x2000', 'Rug 3000×2000', 'rug', [3.0, 2.0]),
  p('rug-4000x3000', 'Rug 4000×3000', 'rug', [4.0, 3.0]),
  p('panel-600x600x50', 'Absorber panel 600×600×50', 'mineral-wool-50', [0.6, 0.6]),
  p('panel-1200x1200x100', 'Absorber panel 1200×1200×100', 'absorber-100', [1.2, 1.2]),
  p('superchunk-600', 'Superchunk corner trap 600×600', 'bass-trap', [0.6, 0.6]),
  p('panel-1200x600x50', 'Absorber panel 1200×600×50', 'mineral-wool-50', [1.2, 0.6]),
  p('panel-1200x600x100', 'Absorber panel 1200×600×100', 'absorber-100', [1.2, 0.6]),
  p('bass-trap-600x1200', 'Bass trap 600×1200 corner', 'bass-trap', [0.6, 1.2]),
  p('membrane-trap-1200x600', 'Membrane bass trap 1200×600', 'membrane-trap', [1.2, 0.6]),
  p('slat-1200x600', 'Slat resonator 1200×600', 'slat-resonator', [1.2, 0.6]),
  p('cloud-1200', 'Ceiling cloud 1200×1200', 'ceiling-cloud', [1.2, 1.2]),
  p('cloud-1200x600', 'Ceiling cloud 1200×600', 'ceiling-cloud', [1.2, 0.6]),
  p('window-1200x1000', 'Window 1200×1000', 'glass-heavy', [1.2, 1.0]),
  p('window-1800x1200', 'Control-room glass 1800×1200', 'glass-heavy', [1.8, 1.2]),
  p('door-900x2100', 'Door 900×2100', 'door-wood', [0.9, 2.1]),
  p('door-acoustic-1000x2100', 'Acoustic door 1000×2100', 'door-acoustic', [1.0, 2.1]),
  p('sliding-glass-1800x2100', 'Sliding glass door 1800×2100', 'glass-heavy', [1.8, 2.1]),
];

export const DEFAULT_WALL = 'gypsum';

const byId = new Map(MATERIALS.map((x) => [x.id, x]));
for (const a of ACOUSTX_ABSORBERS) {
  byId.set(a.id1, a);
  byId.set(a.name.toLowerCase(), a);
}
const productById = new Map(PRODUCTS.map((x) => [x.id, x]));

/** A material by its id or a product's id; null when it is neither — for patches, where an unknown id must not quietly become drywall. */
export function lookup(id) {
  return byId.get(id) ?? byId.get(productById.get(id)?.material) ?? null;
}

const FURNITURE_HEIGHT = { table: 0.75, desk: 0.75, 'producer-desk': 0.8, console: 0.85, couch: 0.8, armchair: 0.8, rack: 1.2, 'drum-kit': 1.1, 'guitar-amp': 0.55, 'guitar-stack': 1.3, 'amp-head': 0.28, keyboard: 0.85, hammond: 1.0, leslie: 1.03, 'grand-piano': 1.0, massonberg: 2.4 };

/** How tall a thing laid on the floor stands, metres: 0 for a finish (a rug, a floor build), a height for furniture and instruments. */
export function furnitureHeight(paletteId) {
  const id = String(paletteId ?? '');
  for (const [k, h] of Object.entries(FURNITURE_HEIGHT)) if (id.startsWith(k)) return h;
  return lookup(id)?.category === 'Furniture' ? 0.8 : 0;
}

/** How tall a placed piece stands, metres: its own height when it has one (a rack, from its U — room.js), else its kind's. */
export const pieceHeight = (p) => p.height ?? furnitureHeight(p.paletteId);

/** Tables, desks and keyboards on their stands stand on legs: a top, open underneath. Everything else on the floor is a solid. */
const ON_LEGS = /^(table|desk|producer-desk|keyboard)-/;

/**
 * The surface a piece of furniture shows the room beyond the footprint that
 * is already mixed into the floor, m²: a solid's sides (perimeter × height),
 * or a table's underside (its footprint again) — the faces that make it an
 * object in the room (ISO 354), absorbing in the air rather than lying on it.
 */
export function exposedArea(paletteId, footprint, perimeter, height = furnitureHeight(paletteId)) {
  const h = height;
  if (!h) return 0;
  return ON_LEGS.test(String(paletteId ?? '')) ? footprint : perimeter * h;
}

/** A material by its id or a product's id, falling back to the default wall so a stale saved id still builds a room. */
export function material(id) {
  return lookup(id) ?? byId.get(DEFAULT_WALL);
}

const note = (mat) => `α500 ${mat.alpha[2].toFixed(2)} · s ${mat.scatter[3].toFixed(2)}`;

/**
 * Everything the CAD can place, as the host bridge's `palette` message carries
 * it: the products first (fixed-size blocks), then every finish (area fills).
 */
export function paletteItems() {
  const products = PRODUCTS.map((x) => {
    const mat = byId.get(x.material);
    return { id: x.id, name: x.name, category: 'Products', color: mat.color, hatch: HATCH[mat.category] ?? 'SOLID', size: [...x.size], note: `${mat.name} · ${note(mat)}`, ...illustration(mat, x) };
  });
  const finishes = MATERIALS.map((mat) => ({ id: mat.id, name: mat.name, category: mat.category, color: mat.color, hatch: HATCH[mat.category] ?? 'SOLID', note: note(mat), ...illustration(mat) }));
  return [...products, ...finishes];
}

/** How thick a thing is, metres, when its name says: …×100, 100 mm, 2", 1-1/2" — else null. */
export function depthOf(mat, product = null) {
  const name = `${product?.name ?? ''} ${mat.name}`;
  const triple = name.match(/\d+×\d+×(\d+)/);
  if (triple) return Number(triple[1]) / 1000;
  const mm = name.match(/(\d+(?:\.\d+)?)\s*mm\b/);
  if (mm) return Number(mm[1]) / 1000;
  const inch = name.match(/(?:(\d+)-)?(\d+)(?:\/(\d+))?\s*(?:"|”|in\b)/);
  if (inch) {
    const whole = inch[1] ? Number(inch[1]) : 0;
    const v = inch[3] ? whole + Number(inch[2]) / Number(inch[3]) : whole + Number(inch[2]);
    if (v > 0 && v < 40) return +(v * 0.0254).toFixed(4);
  }
  return null;
}

/** How thick a palette item is, m — a product by its own name first, then its material's — or null when neither says. */
export function depthOfId(paletteId) {
  const mat = lookup(paletteId);
  return mat ? depthOf(mat, productById.get(paletteId) ?? null) : null;
}

/**
 * What the CAD's palette preview draws an item with: its drafting symbol
 * (acoustics/symbols.js — the standard's name and the acad.pat hatch ride
 * along, so the CAD can say what it is drawing), α per octave 125 Hz … 4 kHz,
 * and its depth when its name gives one.
 */
function illustration(mat, product = null) {
  const symbol = symbolOf(mat, product);
  const depth = depthOf(mat, product);
  return { symbol, symbolName: SYMBOLS[symbol].name, ...(SYMBOLS[symbol].acad ? { acad: SYMBOLS[symbol].acad } : {}), alpha: mat.alpha.map((a) => +a.toFixed(2)), ...(depth ? { depth } : {}) };
}

/**
 * A porous absorber — what a thickness rule is about: the Absorber category,
 * or a ceiling product or catalogue absorber that soaks up most of 1 kHz. A
 * resonator, a diffuser or a curtain works some other way and is not one.
 */
export function isPorousAbsorber(mat) {
  if (!mat) return false;
  if (mat.category === 'Absorber') return true;
  if (mat.category === 'Resonator' || mat.category === 'Diffuser' || /diffus/i.test(`${mat.name} ${mat.material ?? ''}`)) return false;
  return (mat.category === 'Ceiling' || Boolean(mat.id1)) && mat.alpha[3] >= 0.5;
}

/** Is a material rated below 125 Hz — does it carry its own 31 and 63 Hz figures, rather than the 125 Hz one stretched down? */
export const ratedLow = (mat) => Boolean(mat?.alpha9) && mat.alpha9[1] > 0;

