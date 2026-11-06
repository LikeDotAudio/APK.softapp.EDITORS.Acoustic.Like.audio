// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT YOU CAN PUT IN THE ROOM
 *
 * Two families of loudspeaker, because they are two jobs. A MONITOR reveals
 * the source: near-field, moderate dispersion, the listener inside critical
 * distance so the room is what they do not hear. A PROJECTION box distributes
 * energy: constant-directivity horn, high sensitivity, listeners far beyond
 * critical distance, the pattern doing the work of keeping sound off the walls.
 *
 * A box is specified the way a datasheet (and EASE) specifies it: SENSITIVITY,
 * dB SPL on axis at 1 m for 1 W; the AMPLIFIER power driving it; the MAX SPL
 * it can make before it limits; and its FREQUENCY RANGE, the −10 dB points at
 * each end. Driven by power, its level at 1 m is sensitivity + 10·log10(W),
 * held at max SPL — speakerLevel(). Or set `drive: 'spl'` and give `level`,
 * the on-axis SPL at 1 m, directly, as a designer setting a target does (and
 * as every speaker saved before power existed is read).
 *
 * The range shapes every method's band: a 4th-order high-pass at the bottom
 * (a vented box) and 2nd-order low-pass at the top, each corner placed so the
 * response is −10 dB exactly at the quoted frequency — responseGain(). 0 at
 * either end is unlimited. A sub's `lowpass` is its crossover, on top.
 *
 * MOUNTING is the solid angle the box radiates into. Free-standing is 4π.
 * Flush in a wall is 2π, a two-wall corner π, a trihedral corner π/2 — each a
 * further +6 dB of low-frequency pressure. The energy model applies that as a
 * number below `omniBelow`; the wave model gets it from the image sources,
 * which is the same physics done properly, and also why a free-standing box
 * shows its SBIR notch there and a flush one does not.
 */

import { SPEAKER_LIBRARY, SPEAKER_LOOK, SPEAKER_PARTS } from './speakerParts.js';
import { partSpec, specFromPart } from './speakerLibrary.js';

// THE SPEAKERS ARE THE BIM LIBRARY'S (ROAD-3598 answer 8). Every box the page
// can place is a library part (DATABASE.server.BIM SRC/library), its whole
// acoustic definition the part's APK_LoudspeakerType with its units —
// sensitivity, max SPL, range, coverage in degrees, the enclosure in litres,
// nominal ohms — and its cabinet in mm. The page reads them from the library
// only: live (speakerLibrary.js, GET /api/bim/parts/<id>) and, offline, from
// speakerParts.js, which the importer writes FROM the library. The old preset
// lists (speakerPresets.js) are the importer's source and nothing here reads them.
//
// What a box is drawn and driven with — its colour and the amplifier watts it
// starts at — is the page's own (SPEAKER_LOOK). A figure the part does not state
// (an Acoustic X monitor gives no coverage or max SPL) is the generic studio
// monitor's, a library part too; a cabinet given only by its sides holds 60 %
// of its outside volume.
const FILL_PART = 'generic/monitor';
const FILL_KEYS = ['sensitivity', 'maxSpl', 'pattern', 'hCov', 'vCov', 'omniBelow'];

/** A library part (its spec from speakerLibrary.specFromPart) as the box the page places. */
function boxOf(pid, spec = specFromPart(SPEAKER_LIBRARY[pid]) ?? {}) {
  const lib = SPEAKER_LIBRARY[pid] ?? {};
  const fill = specFromPart(SPEAKER_LIBRARY[FILL_PART]) ?? {};
  const box = { label: lib.description ?? lib.name ?? pid, name: lib.name ?? pid, ...spec };
  for (const k of FILL_KEYS) if (box[k] === undefined && fill[k] !== undefined) box[k] = fill[k];
  if (box.litres === undefined && box.w && box.h && box.d) box.litres = +(box.w * box.d * box.h * 600).toFixed(1);
  if (box.driver === undefined && box.maker) box.driver = `${box.maker} monitor`;
  box.lowpass ??= 0;
  box.typical = Boolean(lib.ifc?.psets?.APK_LoudspeakerType?.FiguresTypical);
  return { ...box, ...(SPEAKER_LOOK[pid] ?? {}) };
}

const boxes = (group) => Object.freeze(Object.fromEntries(
  Object.entries(SPEAKER_PARTS).filter(([, p]) => p.group === group).map(([k, p]) => [k, Object.freeze(boxOf(p.part))]),
));

/** The house boxes (two Tannoy monitors, the generic classes), by key: the first is what ＋ Speaker places. */
export const SPEAKER_PRESETS = boxes('house');

/** The Acoustic X studio reference monitors (Genelec, Dynaudio, Meyer Sound), each under its three keys. */
export const ACOUSTX_SPEAKER_PRESETS = boxes('acoustx');

export const ALL_SPEAKER_PRESETS = { ...SPEAKER_PRESETS, ...ACOUSTX_SPEAKER_PRESETS };

/** The Acoustic X monitors once each, [key, box] by their name key ('genelec-1032a'), in the database's order. */
export const ACOUSTX_MENU = Object.freeze((() => {
  const seen = new Set();
  return Object.entries(SPEAKER_PARTS)
    .filter(([k, p]) => p.group === 'acoustx' && /^[a-z]/.test(k) && !k.startsWith('acx-spk-') && !seen.has(p.part) && seen.add(p.part))
    .map(([k]) => [k, ACOUSTX_SPEAKER_PRESETS[k]]);
})());

/** The Acoustic X monitors once each, [key, box] by their database key ('acx-spk-5'). */
export const ACOUSTX_BY_ID = Object.freeze((() => {
  const seen = new Set();
  return Object.entries(SPEAKER_PARTS)
    .filter(([k, p]) => p.group === 'acoustx' && k.startsWith('acx-spk-') && !seen.has(p.part) && seen.add(p.part))
    .map(([k]) => [k, ACOUSTX_SPEAKER_PRESETS[k]]);
})());

/**
 * A box's outside size from its litres, metres { w, h, d }: a monitor stands
 * 1.6 tall to 1 wide to 1.2 deep, a sub is near a cube. If exact cabinet dimensions
 * { w, h, d } are specified on the speaker or preset, those are returned directly.
 */
export function boxSize(spk) {
  if (spk.w && spk.h && spk.d) return { w: spk.w, h: spk.h, d: spk.d };
  const p = SPEAKER_PRESETS[spk.kind] ?? ACOUSTX_SPEAKER_PRESETS[spk.kind];
  if (p?.w && p?.h && p?.d) return { w: p.w, h: p.h, d: p.d };
  const litres = spk.litres ?? p?.litres ?? 12;
  const [h, w, d] = spk.kind === 'sub' ? [1, 1.15, 1.1] : [1.6, 1, 1.2];
  const k = Math.cbrt(litres / 1000 / (h * w * d));
  return { w: w * k, h: h * k, d: d * k };
}

/** The fields a preset sets on a speaker — what choosing a preset copies. */
export const SPEAKER_SPEC = [
  'litres',
  'driver',
  'pattern',
  'hCov',
  'vCov',
  'sensitivity',
  'watts',
  'maxSpl',
  'fLow',
  'fHigh',
  'omniBelow',
  'lowpass',
  'color',
  'w',
  'd',
  'h',
  'centerHeight',
  'wooferHeight',
  'fCross',
  'nearField',
  'midField',
  'mainMonitor',
  'maker',
];

/**
 * Mics are mostly PEOPLE: the listening spots of the room, in tiers. The mixer
 * sits at the mix position and is what the room is tuned for; the producer
 * behind, the console client beside, the entourage on the couch at the back.
 * A tier's `weight` is how much that seat counts when the room is judged
 * across seats (the sub designer); each is an omni at ear height. The plain
 * measurement patterns are still here for measuring.
 */
export const LISTENER_TIERS = ['mixer', 'producer', 'client', 'entourage'];

export const MIC_PRESETS = {
  mixer: { label: 'Mixer', pattern: 'omni', tier: 1, weight: 3, colour: '#ff3b3b' },
  producer: { label: 'Producer', pattern: 'omni', tier: 2, weight: 2, colour: '#f59e0b' },
  client: { label: 'Console client', pattern: 'omni', tier: 3, weight: 1.5, colour: '#38bdf8' },
  entourage: { label: 'Entourage', pattern: 'omni', tier: 4, weight: 1, colour: '#a78bfa' },
  omni: { label: 'Measurement mic (omni)', pattern: 'omni' },
  cardioid: { label: 'Cardioid', pattern: 'cardioid' },
  supercardioid: { label: 'Supercardioid', pattern: 'supercardioid' },
  figure8: { label: 'Figure-8', pattern: 'figure8' },
};

export const MOUNTS = {
  free: { label: 'Free-standing (4π)', gainDb: 0 },
  flush: { label: 'Flush / soffit (2π)', gainDb: 6 },
  corner: { label: 'Two-wall corner (π)', gainDb: 12 },
  trihedral: { label: 'Trihedral corner (π/2)', gainDb: 18 },
};

let nextId = 1;
export function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`;
}

/**
 * The BIM part a box is (acoustics-3): speakerParts.js, which the importer writes from the
 * library, maps each key to it. null for a key that is no box.
 */
export function speakerPart(kind) {
  return SPEAKER_PARTS[kind] ?? null;
}

/** The key a BIM part id is placed from (the first key that maps to it), or null. */
export function presetForPart(partId) {
  if (!partId) return null;
  const id = String(partId).toLowerCase();
  return Object.keys(SPEAKER_PARTS).find((k) => SPEAKER_PARTS[k].part === id && k in ALL_SPEAKER_PRESETS) ?? null;
}

/**
 * The fields a box of this key / part is given (SPEAKER_SPEC), all from the library: the part as
 * the library answered this page (speakerLibrary.js loadSpeakerParts), else as speakerParts.js
 * holds it. `part` defaults to the key's part; a key that is no box falls back to the studio
 * monitor, and a part the page holds nothing of to the box of that key.
 */
export function speakerSpec(kind, part = undefined) {
  const own = SPEAKER_PARTS[kind] ? kind : 'monitor';
  const pid = part ?? SPEAKER_PARTS[own]?.part ?? null;
  const live = partSpec(pid);
  const base = SPEAKER_LIBRARY[pid] || live ? boxOf(pid, live ?? undefined) : ALL_SPEAKER_PRESETS[own];
  const look = SPEAKER_LOOK[pid] ?? SPEAKER_LOOK[SPEAKER_PARTS[own]?.part] ?? {};
  const box = { ...look, ...base };
  const spec = Object.fromEntries(SPEAKER_SPEC.map((k) => [k, box[k]]));
  // a cabinet is its three sides or none
  if (!(box.w && box.h && box.d)) Object.assign(spec, { w: undefined, h: undefined, d: undefined });
  const named = SPEAKER_PARTS[kind] && (!part || part === SPEAKER_PARTS[kind].part);
  return { spec, part: pid, label: named ? ALL_SPEAKER_PRESETS[kind].label : (live?.name ?? box.name ?? box.label) };
}

export function makeSpeaker(kind, at, extra = {}) {
  // placed by part id: the box IS the library part its preset became (its IFC type is part/<id>),
  // its figures the part's as the library gives them (the preset's offline)
  const { spec, part, label } = speakerSpec(kind, extra.part);
  return {
    id: newId('s'),
    name: extra.name ?? label,
    kind,
    ...(part ? { part } : {}),
    x: at.x,
    y: at.y,
    z: at.z ?? 1.2,
    aim: 90,
    tilt: 0,
    mount: 'free',
    delayMs: 0,
    ...spec,
    // A level given outright means SPL drive, unless the caller says otherwise.
    drive: 'level' in extra ? 'spl' : 'power',
    level: speakerLevel({ ...spec, drive: 'power' }).demand,
    ...extra,
  };
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * On-axis SPL at 1 m: { level, demand, limited, headroom, drive }. `demand` is
 * what was asked for (sensitivity + 10·log10 W, or the SPL set), `level` what
 * the box makes — demand held at max SPL — and headroom how far below max SPL
 * it runs (negative when it limits). A speaker with no sensitivity, as every
 * one saved before power existed, is SPL-driven at its `level`.
 */
export function speakerLevel(spk) {
  const power = spk.drive !== 'spl' && finite(spk.sensitivity) && finite(spk.watts);
  // the monitor controller's volume and trim (acoustics/monitor.js) ride on whatever drives the box
  const demand = (power ? spk.sensitivity + 10 * Math.log10(Math.max(spk.watts, 1e-3)) : spk.level) + (spk.gainDb ?? 0);
  const max = finite(spk.maxSpl) && spk.maxSpl > 0 ? spk.maxSpl : Infinity;
  return { level: Math.min(demand, max), demand, limited: demand > max, headroom: max - demand, drive: power ? 'power' : 'spl' };
}

/** Watts that drive the box to `spl` at 1 m (its sensitivity known). */
export function wattsFor(spk, spl) {
  return 10 ** ((spl - spk.sensitivity) / 10);
}

// Butterworth corners that sit −10 dB at the quoted frequency: |H|² = 1/(1 + x^2n) = 1/10 at x = 9^(1/2n).
const HP_ORDER = 4;
const LP_ORDER = 2;
const HP_K = 9 ** (1 / (2 * HP_ORDER));
const LP_K = 9 ** (1 / (2 * LP_ORDER));

/** The box's own band-pass at `freq` — its frequency range and any crossover — linear. */
export function responseGain(freq, spk) {
  let g = lowpassGain(freq, spk.lowpass);
  if (spk.fLow > 0) g /= Math.sqrt(1 + ((spk.fLow * HP_K) / freq) ** (2 * HP_ORDER));
  if (spk.fHigh > 0) g /= Math.sqrt(1 + (freq / (spk.fHigh / LP_K)) ** (2 * LP_ORDER));
  return g;
}

/** What the box radiates on axis at 1 m at `freq`, dB SPL: level shaped by its response. */
export function sourceDb(spk, freq) {
  return speakerLevel(spk).level + 20 * Math.log10(Math.max(responseGain(freq, spk), 1e-12));
}

export function makeMic(kind, at, extra = {}) {
  const p = MIC_PRESETS[kind] ?? MIC_PRESETS.omni;
  return {
    id: newId('m'),
    name: extra.name ?? p.label,
    kind,
    x: at.x,
    y: at.y,
    z: at.z ?? 1.2,
    aim: 90,
    tilt: 0,
    pattern: p.pattern,
    mix: false,
    ...(p.tier ? { tier: p.tier, weight: p.weight } : {}),
    ...extra,
  };
}

/** Is this mic a person (a listening tier) rather than a measurement mic? */
export const isListener = (m) => Boolean(MIC_PRESETS[m.kind]?.tier);

/** 4th-order low-pass magnitude (a sub's crossover), linear. */
export function lowpassGain(freq, fc) {
  return fc ? 1 / Math.sqrt(1 + (freq / fc) ** 8) : 1;
}
