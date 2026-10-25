// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from './bands.js';

/**
 * WHAT THE ROOM IS BUILT ON, AND WHAT IT IS BUILT INTO
 *
 * Three choices a builder makes before any treatment goes up, and what each
 * means for the sound — estimates of design intent, from the textbook models,
 * not a test report:
 *
 *   FLOOR   what the room stands on. A slab on grade is tied to the building;
 *           a floating floor or a room on isolators is a mass on a spring,
 *           natural frequency f0. Above √2·f0 it isolates (single degree of
 *           freedom, damping ζ = 0.1): about 12 dB per octave just above,
 *           settling toward 6 dB per octave higher up, where the damping
 *           carries force across the spring; AT f0 it amplifies. That is
 *           the structure-borne insertion loss: the kick drum through the
 *           floor into the house, the lorry outside into the room. A
 *           sprung wood floor is also a membrane: it absorbs a little
 *           around its resonance, which the room's floor α picks up.
 *
 *   WALLS   how they are built. Sound transmission loss per octave band for
 *           the common builds (typical published figures for each assembly,
 *           rounded). A light wall is a panel on a cavity: it absorbs a
 *           little bass, again added to the walls' α.
 *
 *   SETTING where the room is. Detached, nothing of the house is touched; a
 *           room attached to a house shares the walls ticked as shared; a
 *           room inside a house shares them all. For each shared wall, the
 *           level on the house side is estimated from the room's level, the
 *           wall's TL and the wall's area against the receiving room's
 *           absorption (taken as 10 m² sabins — a furnished room):
 *               L_house = L_room − TL + 10·log10(S / A_house)
 *           A room-in-room adds the decoupling of its second leaf.
 *
 * Every build lists its `layers`, room side first — [name, thickness mm,
 * kind] — so the construction can be drawn as a section (cad/marks.js) and
 * listed in the inspector. `kind` picks the hatch: board, stud, insulation,
 * air, masonry, concrete, isolator, wood.
 */

export const FLOOR_BUILDS = {
  slab: { label: 'Slab on grade', f0: null, note: 'tied to the ground: no isolation, no give', layers: [['Finish floor', 15, 'wood'], ['Concrete slab', 150, 'concrete'], ['Vapour barrier + hardcore', 150, 'masonry']] },
  'timber-joist': { label: 'Timber joists (house floor)', f0: null, note: 'tied to the house; a light floor that drums', lfAlpha: [0.15, 0.1, 0, 0, 0, 0], layers: [['Floorboards', 22, 'wood'], ['Joists 200 mm, insulated', 200, 'stud'], ['Ceiling below, drywall', 13, 'board']] },
  'floating-wood': { label: 'Floating wood floor on pads', f0: 22, note: 'plywood layers on neoprene pads', lfAlpha: [0.12, 0.06, 0, 0, 0, 0], layers: [['2 × 19 mm plywood, glued', 38, 'wood'], ['Sleepers on neoprene pads', 75, 'isolator'], ['Insulation in the gap', 50, 'insulation'], ['Structural slab', 150, 'concrete']] },
  'floating-slab': { label: 'Floating concrete slab', f0: 12, note: '100 mm slab on rubber isolators', layers: [['Finish floor', 15, 'wood'], ['Floating slab', 100, 'concrete'], ['Rubber isolators, 50 mm gap', 50, 'isolator'], ['Structural slab', 150, 'concrete']] },
  isolators: { label: 'Room-in-room on spring isolators', f0: 6, note: 'the whole inner room on springs', layers: [['Finish floor', 15, 'wood'], ['Inner-room slab', 125, 'concrete'], ['Spring isolators, 100 mm air', 100, 'isolator'], ['Structural slab', 200, 'concrete']] },
};

/** TL per octave band (125 Hz … 4 kHz), dB, and the bass a panel wall soaks up. */
export const WALL_BUILDS = {
  unset: { label: 'Not set — walls as faced, single-stud TL assumed', tl: [17, 31, 40, 46, 39, 43] },
  'single-stud': { label: 'Single stud, 1 layer drywall each side', tl: [17, 31, 40, 46, 39, 43], lfAlpha: [0.15, 0.05, 0, 0, 0, 0], layers: [['Drywall', 13, 'board'], ['Stud 90 mm, empty', 90, 'stud'], ['Drywall', 13, 'board']] },
  'single-stud-2x': { label: 'Single stud, 2 layers each side, insulated', tl: [26, 38, 47, 53, 52, 58], lfAlpha: [0.1, 0.04, 0, 0, 0, 0], layers: [['2 × drywall', 26, 'board'], ['Stud 90 mm + insulation', 90, 'insulation'], ['2 × drywall', 26, 'board']] },
  'resilient-channel': { label: 'Stud on resilient channel, insulated', tl: [30, 44, 53, 58, 55, 60], lfAlpha: [0.12, 0.05, 0, 0, 0, 0], layers: [['2 × drywall', 26, 'board'], ['Resilient channel', 13, 'air'], ['Stud 90 mm + insulation', 90, 'insulation'], ['Drywall', 13, 'board']] },
  'staggered-stud': { label: 'Staggered stud, 2 layers, insulated', tl: [33, 46, 55, 60, 58, 63], lfAlpha: [0.1, 0.04, 0, 0, 0, 0], layers: [['2 × drywall', 26, 'board'], ['Staggered studs on 140 mm plate + insulation', 140, 'insulation'], ['2 × drywall', 26, 'board']] },
  'double-stud': { label: 'Double stud, 2 layers each side, insulated', tl: [38, 52, 61, 67, 66, 70], lfAlpha: [0.08, 0.03, 0, 0, 0, 0], layers: [['2 × drywall', 26, 'board'], ['Stud 90 mm + insulation', 90, 'insulation'], ['Air gap', 25, 'air'], ['Stud 90 mm + insulation', 90, 'insulation'], ['2 × drywall', 26, 'board']] },
  'concrete-block': { label: 'Concrete block 200 mm, plastered', tl: [37, 41, 45, 51, 57, 62], layers: [['Plaster', 13, 'board'], ['Concrete block, filled', 200, 'masonry'], ['Plaster', 13, 'board']] },
  'block-plus-stud': { label: 'Block wall plus independent stud wall', tl: [45, 55, 64, 72, 75, 78], lfAlpha: [0.06, 0.02, 0, 0, 0, 0], layers: [['2 × drywall', 26, 'board'], ['Stud 90 mm + insulation', 90, 'insulation'], ['Air gap', 50, 'air'], ['Concrete block, filled', 200, 'masonry']] },
};

export const SETTINGS_BUILDS = {
  detached: 'Detached — nothing shared',
  attached: 'Attached to a house — some walls shared',
  inside: 'Inside a house — every wall shared',
};

export const DEFAULT_ISOLATION = {
  setting: 'detached',
  floor: 'slab',
  f0: null,
  walls: 'unset',
  shared: { front: false, back: false, left: false, right: false },
};

const ZETA = 0.1;
const A_HOUSE = 10;

/** Transmissibility of a mass on a damped spring at f, for natural frequency f0: >1 amplifies, <1 isolates. */
export function transmissibility(f, f0, zeta = ZETA) {
  if (!f0) return 1;
  const r = f / f0;
  const d = 2 * zeta * r;
  return Math.sqrt((1 + d * d) / ((1 - r * r) ** 2 + d * d));
}

/** Insertion loss of the floor at f, dB: positive isolates, negative amplifies. */
export const floorLoss = (f, f0) => -20 * Math.log10(transmissibility(f, f0));

/** The floor's natural frequency: the build's, unless the user set one. */
export function floorF0(iso) {
  return iso.f0 ?? FLOOR_BUILDS[iso.floor]?.f0 ?? null;
}

/** Which faces are shared with the house. */
export function sharedFaces(iso) {
  if (iso.setting === 'inside') return ['front', 'back', 'left', 'right'];
  if (iso.setting !== 'attached') return [];
  return Object.entries(iso.shared ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/** A wall's TL per band: its build, plus a second decoupled leaf when the room floats on springs. */
export function wallTl(iso) {
  const tl = WALL_BUILDS[iso.walls]?.tl ?? WALL_BUILDS['single-stud'].tl;
  const extra = iso.floor === 'isolators' ? [10, 14, 16, 18, 18, 18] : [0, 0, 0, 0, 0, 0];
  return tl.map((v, b) => v + extra[b]);
}

/** Bass absorption the build adds to a surface, per band: { walls, floor }. */
export function buildAlpha(iso) {
  const zero = BANDS.map(() => 0);
  return {
    walls: WALL_BUILDS[iso.walls]?.lfAlpha ?? zero,
    floor: FLOOR_BUILDS[iso.floor]?.lfAlpha ?? zero,
  };
}

/**
 * The house side of each shared wall: [{ face, area, tl, leak }] with `leak`
 * the estimated level per band in the house for `roomDb` per band in the room.
 */
export function houseLeak(room, iso, roomDb) {
  const tl = wallTl(iso);
  return sharedFaces(iso).map((face) => {
    const area = room.walls.filter((w) => w.face === face).reduce((s, w) => s + w.area, 0);
    const leak = roomDb.map((L, b) => (area > 0 ? L - tl[b] + 10 * Math.log10(area / A_HOUSE) : NaN));
    return { face, area, tl, leak };
  });
}

/**
 * BELOW 125 Hz: WHAT A SUB PUTS THROUGH THE WALL
 *
 * A single-number rating (STC, and the NRC that goes with it) is fitted from
 * 125 Hz up — built for speech in offices and schools — and says nothing about
 * the octaves a subwoofer lives in. So the two below are carried too, 31 and
 * 63 Hz (bands.js BANDS_9). No build here was rated there, so each is the
 * 125 Hz figure carried down the mass law, 6 dB per octave: AT BEST, since a
 * double leaf falls faster under its mass–air–mass resonance. An estimate
 * that says it is one, not a test report.
 */
export const LOW_BANDS = [31, 63];
export const LOW_SLOPE_DB = 6;

/** A wall's TL at 31 and 63 Hz, dB (see above). */
export function lowWallTl(iso) {
  const at125 = wallTl(iso)[0];
  return LOW_BANDS.map((_, i) => Math.max(0, at125 - LOW_SLOPE_DB * (LOW_BANDS.length - i)));
}

/** The house side of each shared wall at 31 and 63 Hz for `roomDb` = [L31, L63] in the room: [{ face, area, tl, leak }]. */
export function lowHouseLeak(room, iso, roomDb) {
  const tl = lowWallTl(iso);
  return sharedFaces(iso).map((face) => {
    const area = room.walls.filter((w) => w.face === face).reduce((s, w) => s + w.area, 0);
    return { face, area, tl, leak: roomDb.map((L, b) => (area > 0 ? L - tl[b] + 10 * Math.log10(area / A_HOUSE) : NaN)) };
  });
}

