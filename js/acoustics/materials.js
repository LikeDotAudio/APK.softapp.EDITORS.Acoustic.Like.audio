// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
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

const SHAPE = {
  flat: [1, 1, 1, 1, 1, 1],
  rough: [0.5, 0.6, 0.8, 1, 1.1, 1.2],
  qrd: [0.15, 0.45, 1, 1, 1, 1],
};

/** How a category draws in the CAD: a hatch tells a finish apart at a glance even in monochrome. */
const HATCH = { Masonry: 'ANSI31', Absorber: 'GRID', Diffuser: 'GRID', Resonator: 'GRID' };

const clamp = (x, hi) => Math.max(0, Math.min(hi, x));

const m = (id, name, category, alpha, tl, s, shape, color) => ({
  id,
  name,
  category,
  alpha: alpha.map((a) => clamp(a, 0.99)),
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
  // glass — blues
  m('glass-window', 'Glass, ordinary window', 'Glass', [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], 28, 0.05, 'flat', '#7fb4d8'),
  m('glass-heavy', 'Plate glass, window pane', 'Glass', [0.18, 0.06, 0.04, 0.03, 0.02, 0.02], 35, 0.05, 'flat', '#4f8fc0'),
  // floors
  m('wood-floor', 'Wood floor', 'Floor', [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], 40, 0.1, 'flat', '#b5834c'),
  m('concrete-floor', 'Concrete / tile floor', 'Floor', [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], 50, 0.05, 'flat', '#8a8a86'),
  m('carpet-pad', 'Heavy carpet on foam rubber', 'Floor', [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], 50, 0.4, 'rough', '#8a3a4a'),
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
  m('bass-trap', 'Bass trap, deep corner', 'Absorber', [0.8, 0.95, 1, 1, 1, 1], 8, 0.3, 'rough', '#2d6e3a'),
  // resonators — olive: they absorb, but a band, not everything above one
  m('slat-resonator', 'Slat resonator, wood slats over wool', 'Resonator', [0.35, 0.65, 0.75, 0.45, 0.3, 0.2], 20, 0.4, 'rough', '#8a8a3a'),
  m('perforated-wood', 'Perforated wood panel over 50 mm wool', 'Resonator', [0.4, 0.9, 0.8, 0.5, 0.4, 0.3], 20, 0.15, 'flat', '#a39a4a'),
  m('membrane-trap', 'Membrane bass trap', 'Resonator', [0.65, 0.55, 0.35, 0.2, 0.15, 0.1], 25, 0.1, 'flat', '#6b6b2a'),
  // diffusers — golds
  m('diffuser', 'QRD diffuser, wooden wells', 'Diffuser', [0.45, 0.3, 0.15, 0.2, 0.3, 0.4], 20, 0.9, 'qrd', '#d4a52a'),
  // furniture — the desk is a hard reflector at ear height, the couch a big soft absorber
  m('desk-top', 'Desk / console top, laminate and metal', 'Furniture', [0.05, 0.04, 0.04, 0.04, 0.05, 0.05], 20, 0.25, 'rough', '#6b7280'),
  m('upholstered', 'Upholstered couch or chair', 'Furniture', [0.35, 0.5, 0.65, 0.75, 0.75, 0.7], 5, 0.6, 'rough', '#7c5a3a'),
  m('rack', 'Equipment rack, steel and gear', 'Furniture', [0.05, 0.05, 0.06, 0.08, 0.1, 0.1], 20, 0.5, 'rough', '#3f4652'),
  m('door-acoustic', 'Acoustic door, sealed, solid core', 'Wood', [0.12, 0.08, 0.05, 0.05, 0.05, 0.05], 45, 0.05, 'flat', '#5c3b1e'),
  // nothing there
  m('opening', 'Opening / void', 'Opening', [1, 1, 1, 1, 1, 1], 0, 0, 'flat', '#202020'),
];

/** Things that come in a size: [w, h] in metres, as the CAD block is drawn. Ids never collide with a material's. */
const p = (id, name, mat, size) => ({ id, name, material: mat, size });

export const PRODUCTS = [
  p('desk-1800x900', 'Producer desk 1800×900', 'desk-top', [1.8, 0.9]),
  p('console-2400x1000', 'Mixing console 2400×1000', 'desk-top', [2.4, 1.0]),
  p('console-3200x1200', 'Large-format console 3200×1200', 'desk-top', [3.2, 1.2]),
  p('couch-2000x900', 'Couch 2000×900', 'upholstered', [2.0, 0.9]),
  p('couch-2400x1000', 'Client couch 2400×1000', 'upholstered', [2.4, 1.0]),
  p('armchair-900', 'Armchair 900×900', 'upholstered', [0.9, 0.9]),
  p('rack-600x800', 'Equipment rack 600×800', 'rack', [0.6, 0.8]),
  p('qrd-600', 'QRD 600×600', 'diffuser', [0.6, 0.6]),
  p('qrd-1200x600', 'QRD 1200×600', 'diffuser', [1.2, 0.6]),
  p('skyline-600', 'Skyline diffuser 600×600', 'diffuser', [0.6, 0.6]),
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
const productById = new Map(PRODUCTS.map((x) => [x.id, x]));

/** A material by its id or a product's id; null when it is neither — for patches, where an unknown id must not quietly become drywall. */
export function lookup(id) {
  return byId.get(id) ?? byId.get(productById.get(id)?.material) ?? null;
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
    return { id: x.id, name: x.name, category: 'Products', color: mat.color, hatch: HATCH[mat.category] ?? 'SOLID', size: [...x.size], note: `${mat.name} · ${note(mat)}` };
  });
  const finishes = MATERIALS.map((mat) => ({ id: mat.id, name: mat.name, category: mat.category, color: mat.color, hatch: HATCH[mat.category] ?? 'SOLID', note: note(mat) }));
  return [...products, ...finishes];
}
