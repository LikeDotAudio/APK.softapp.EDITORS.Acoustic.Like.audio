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

import { ACOUSTX_SPEAKERS } from '../acoustx/database.js';

// The library. First the real boxes, by maker and model — `litres` is the
// cabinet's internal volume, which sets the size it is drawn (boxSize), and
// `driver` how it is built; a figure not read off the maker's datasheet is
// flagged `typical`. Then the generic classes, typical datasheet figures each,
// the watts chosen so each starts at the operating level it always had (94,
// 118, 120, 100 dB at 1 m). The first entry is what ＋ Speaker places.
export const SPEAKER_PRESETS = {
  // Tannoy DMT 12 (discontinued): 12" Dual Concentric — the tweeter fires through the woofer's throat, one point source — in a 44 L cabinet.
  // Its datasheet is not to hand: coverage, sensitivity, max SPL and range are a Tannoy 12" Dual Concentric's typical figures.
  dmt12: { label: 'Tannoy DMT 12 · 12" coaxial · 44 L', maker: 'Tannoy', driver: 'coaxial 12"', litres: 44, typical: true, pattern: 'horn', hCov: 90, vCov: 90, sensitivity: 93, watts: 4, maxSpl: 116, fLow: 45, fHigh: 20000, omniBelow: 300, lowpass: 0, color: '#e0b04a' },
  // Tannoy DMT 8: its 8" Dual Concentric sibling in a 22 L cabinet — the surrounds and heights round a pair of DMT 12s. Typical figures as above.
  dmt8: { label: 'Tannoy DMT 8 · 8" coaxial · 22 L', maker: 'Tannoy', driver: 'coaxial 8"', litres: 22, typical: true, pattern: 'horn', hCov: 90, vCov: 90, sensitivity: 90, watts: 4, maxSpl: 110, fLow: 55, fHigh: 20000, omniBelow: 400, lowpass: 0, color: '#d4a03c' },
  monitor: { label: 'Studio monitor', litres: 12, pattern: 'cardioid', hCov: 90, vCov: 60, sensitivity: 87, watts: 5, maxSpl: 112, fLow: 45, fHigh: 22000, omniBelow: 300, lowpass: 0, color: '#5aa9ff' },
  'horn-90x50': { label: 'Projection 90×50 horn', litres: 45, pattern: 'horn', hCov: 90, vCov: 50, sensitivity: 104, watts: 25, maxSpl: 133, fLow: 60, fHigh: 18000, omniBelow: 500, lowpass: 0, color: '#ffb347' },
  'horn-60x40': { label: 'Projection 60×40 horn', litres: 35, pattern: 'horn', hCov: 60, vCov: 40, sensitivity: 107, watts: 20, maxSpl: 135, fLow: 65, fHigh: 18000, omniBelow: 600, lowpass: 0, color: '#ff8c42' },
  sub: { label: 'Subwoofer', litres: 60, pattern: 'omni', hCov: 360, vCov: 360, sensitivity: 100, watts: 1, maxSpl: 128, fLow: 30, fHigh: 0, omniBelow: 0, lowpass: 100, color: '#b388ff' },
};

/** Acoustic X classic studio reference monitor presets (Genelec, Dynaudio, Meyer Sound). */
export const ACOUSTX_SPEAKER_PRESETS = Object.fromEntries(
  ACOUSTX_SPEAKERS.flatMap((s) => {
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const preset = {
      label: s.label,
      name: s.name,
      maker: s.maker,
      driver: `${s.maker} monitor`,
      w: s.w,
      d: s.d,
      h: s.h,
      centerHeight: s.centerHeight,
      wooferHeight: s.wooferHeight,
      sensitivity: s.sensitivity || 88,
      watts: 4,
      maxSpl: 112,
      fLow: s.fLow,
      fHigh: s.fHigh,
      fCross: s.fCross,
      nearField: s.nearField,
      midField: s.midField,
      mainMonitor: s.mainMonitor,
      metric: s.metric,
      tag: s.tag,
      pattern: 'cardioid',
      hCov: 90,
      vCov: 60,
      omniBelow: 300,
      lowpass: 0,
      color: s.mainMonitor ? '#e0b04a' : s.midField ? '#38bdf8' : '#5aa9ff',
      litres: +(s.w * s.d * s.h * 600).toFixed(1),
    };
    return [
      [s.key, preset],
      [slug, preset],
      [s.id, preset],
    ];
  }),
);

export const ALL_SPEAKER_PRESETS = { ...SPEAKER_PRESETS, ...ACOUSTX_SPEAKER_PRESETS };

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
  'metric',
  'tag',
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

export function makeSpeaker(kind, at, extra = {}) {
  const p = SPEAKER_PRESETS[kind] ?? ACOUSTX_SPEAKER_PRESETS[kind] ?? SPEAKER_PRESETS.monitor;
  const spec = Object.fromEntries(SPEAKER_SPEC.map((k) => [k, p[k]]));
  return {
    id: newId('s'),
    name: extra.name ?? p.label,
    kind,
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
  const demand = power ? spk.sensitivity + 10 * Math.log10(Math.max(spk.watts, 1e-3)) : spk.level;
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
