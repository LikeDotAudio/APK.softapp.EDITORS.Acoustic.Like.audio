// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SURFACES
 *
 * Octave-band absorption α (125 Hz … 4 kHz) and a single-number transmission
 * loss for what a CAD layer can stand for. Values are typical published
 * textbook figures, rounded — good for design intent, not a test report. The
 * categories follow the way AcousticRooms (facebookresearch, CC BY 4.0) groups
 * its 332-material library, so a material picked here has an obvious home there.
 *
 * α is capped at 0.99: Eyring takes ln(1 − α) and a perfect absorber would
 * make every room anechoic by division.
 */

const m = (id, name, category, alpha, tl) => ({ id, name, category, alpha: alpha.map((a) => Math.min(a, 0.99)), tl });

export const MATERIALS = [
  m('concrete-painted', 'Concrete, painted', 'Masonry', [0.01, 0.01, 0.01, 0.02, 0.02, 0.02], 50),
  m('brick', 'Brick, unglazed', 'Masonry', [0.03, 0.03, 0.03, 0.04, 0.05, 0.07], 45),
  m('block-painted', 'Concrete block, painted', 'Masonry', [0.1, 0.05, 0.06, 0.07, 0.09, 0.08], 45),
  m('plaster', 'Plaster on masonry', 'Plaster & board', [0.01, 0.02, 0.02, 0.03, 0.04, 0.05], 45),
  m('gypsum', 'Gypsum board on studs', 'Plaster & board', [0.29, 0.1, 0.05, 0.04, 0.07, 0.09], 35),
  m('wood-panel', 'Plywood panelling', 'Wood', [0.28, 0.22, 0.17, 0.09, 0.1, 0.11], 25),
  m('door-wood', 'Solid wood door', 'Wood', [0.14, 0.1, 0.06, 0.08, 0.1, 0.1], 25),
  m('glass-window', 'Glass, ordinary window', 'Glass', [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], 28),
  m('glass-heavy', 'Glass, heavy plate', 'Glass', [0.18, 0.06, 0.04, 0.03, 0.02, 0.02], 35),
  m('wood-floor', 'Wood floor', 'Floor', [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], 40),
  m('concrete-floor', 'Concrete / tile floor', 'Floor', [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], 50),
  m('carpet-pad', 'Carpet on pad', 'Floor', [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], 50),
  m('acoustic-tile', 'Acoustic ceiling tile', 'Ceiling', [0.7, 0.66, 0.72, 0.92, 0.88, 0.75], 20),
  m('drapes', 'Heavy drapes, pleated', 'Soft furnishing', [0.14, 0.35, 0.55, 0.72, 0.7, 0.65], 5),
  m('audience', 'Audience, upholstered seats', 'Seating', [0.39, 0.57, 0.8, 0.94, 0.92, 0.87], 5),
  m('absorber-50', 'Porous absorber, 50 mm', 'Absorber', [0.15, 0.55, 0.95, 1, 1, 1], 6),
  m('absorber-100', 'Porous absorber, 100 mm', 'Absorber', [0.45, 0.9, 1, 1, 1, 1], 8),
  m('bass-trap', 'Bass trap, deep corner', 'Absorber', [0.8, 0.95, 1, 1, 1, 1], 8),
  m('diffuser', 'QRD diffuser', 'Diffuser', [0.15, 0.2, 0.25, 0.3, 0.3, 0.3], 20),
  m('opening', 'Opening / void', 'Opening', [1, 1, 1, 1, 1, 1], 0),
];

export const DEFAULT_WALL = 'gypsum';

const byId = new Map(MATERIALS.map((x) => [x.id, x]));

export function material(id) {
  return byId.get(id) ?? byId.get(DEFAULT_WALL);
}
