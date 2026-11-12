// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X 1997 CLASSIC DATABASE
 *
 * The original acoustic and transducer databases from Pilchner-Schoustal's
 * 1997 Acoustic-X Release 1.0 software:
 *
 *   1. ABSORBERS: 148 materials and commercial acoustic treatments (CISCA,
 *      ACRI, AIMA, Architect's Handbook, RPG Diffusor Systems, Decoustics,
 *      Pilchner Schoustal Inc., PSI, IAS-Akustik-Module) with 9-band
 *      absorption (31 Hz … 8 kHz), comments, and suitability flags for
 *      Wall, Floor, Ceiling and Space.
 *
 *   2. SPEAKERS: 29 studio reference monitors from Genelec, Dynaudio, and
 *      Meyer Sound, with metric/imperial dimensions, acoustic center height,
 *      woofer height, sensitivity, LF/HF cut-offs, LF crossover, and field
 *      classification (Near Field, Mid Field, Main Monitor).
 *
 *   3. FREQUENCY BANDS:
 *      - 1/3 Octave: 16 bands (16 Hz … 500 Hz) with exact lower/upper limits,
 *        A-weighting offset, and bandwidth.
 *      - Octave: 7 bands (16 Hz … 1 kHz) with exact lower/upper limits,
 *        A-weighting offset, and bandwidth.
 */

import { ABSORBERS } from './data/absorbers.js';
import { SPEAKERS } from './data/speakers.js';
import { FREQ_3RD, FREQ_OCTAVE } from './data/bands.js';

const clamp = (v, min = 0, max = 0.99) => Math.max(min, Math.min(max, v));

/** The four tables, raw (js/acoustx/data/): every field a string, as the original stored it. */
export const RAW_DATA = {
  absorbers: ABSORBERS,
  speakers: SPEAKERS,
  freq3rd: FREQ_3RD,
  freqOctave: FREQ_OCTAVE,
};

// ── Speakers ──────────────────────────────────────────────────────────────

export const ACOUSTX_SPEAKERS = RAW_DATA.speakers.map((s) => {
  const metric = s.Metric === '1';
  const scale = metric ? 0.001 : 0.0254;
  const name = s.Name.trim();
  const maker = name.split(' ')[0];
  const depth = +(parseFloat(s['Speaker Depth']) * scale).toFixed(4);
  const width = +(parseFloat(s['Speaker Width']) * scale).toFixed(4);
  const height = +(parseFloat(s['Speaker Height']) * scale).toFixed(4);
  const centerHeight = +(parseFloat(s['Center Height']) * scale).toFixed(4);
  const wooferHeight = +(parseFloat(s['Woofer Height']) * scale).toFixed(4);
  const fLow = parseFloat(s['LF Cut-off']) || 0;
  const fHigh = parseFloat(s['HF Cut-off']) || 0;
  const fCross = parseFloat(s['LF Cross-Over']) || 0;
  const sensitivity = parseFloat(s.Sensitivity) || 0;
  const main = s['Main Monitor'] === '1';
  const mid = s['Mid Field'] === '1';
  const near = s['Near Field'] === '1';
  const role = main ? 'Main' : mid ? 'Mid field' : 'Near field';

  return {
    id: s.ID,
    key: `acx-spk-${s.ID}`,
    name,
    maker,
    metric,
    w: width,
    d: depth,
    h: height,
    centerHeight,
    wooferHeight,
    sensitivity,
    fLow,
    fHigh,
    fCross,
    mainMonitor: main,
    midField: mid,
    nearField: near,
    role,
    tag: s.Tag,
    label: `${name} · ${role} · ${fLow}–${fHigh ? fHigh / 1000 + 'k' : ''} Hz`,
  };
});

const speakerById = new Map();
for (const spk of ACOUSTX_SPEAKERS) {
  speakerById.set(spk.id, spk);
  speakerById.set(spk.key, spk);
  speakerById.set(spk.name.toLowerCase(), spk);
}

export function findSpeaker(idOrName) {
  if (!idOrName) return null;
  const s = String(idOrName).trim();
  return speakerById.get(s) ?? speakerById.get(s.toLowerCase()) ?? null;
}

// ── Absorbers ─────────────────────────────────────────────────────────────

export const BANDS_9 = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000];

export const ACOUSTX_ABSORBERS = RAW_DATA.absorbers.map((a) => {
  const id1 = a.ID1.trim();
  const source = a.ID.trim();
  const name = a.NAME.trim();
  const material = a.MATERIAL.trim();
  const comments = a.Comments && a.Comments !== 'none' ? a.Comments.trim() : '';

  // 9 octave bands: 31 Hz to 8000 Hz
  const alpha9 = BANDS_9.map((f) => {
    const raw = a[`${f} hz`];
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : 0;
  });

  // Standard 6 bands: 125, 250, 500, 1000, 2000, 4000 Hz (clamped to 0.99 for Eyring)
  const alpha6 = [125, 250, 500, 1000, 2000, 4000].map((f) => {
    const val = parseFloat(a[`${f} hz`]);
    return Number.isFinite(val) ? clamp(val) : 0;
  });

  const wall = a.Wall === '1';
  const floor = a.Floor === '1';
  const ceiling = a.Ceiling === '1';
  const space = a.Space === '1';

  return {
    id: `acx-abs-${id1}`,
    id1,
    name,
    category: source || material || 'Absorber',
    source,
    material,
    comments,
    wall,
    floor,
    ceiling,
    space,
    alpha: alpha6,
    alpha9,
    bands9: BANDS_9,
    s: 0.1,
    scatter: [0.05, 0.06, 0.08, 0.1, 0.11, 0.12],
    tl: 30,
    color: '#38bdf8',
  };
});

const absorberById = new Map();
for (const abs of ACOUSTX_ABSORBERS) {
  absorberById.set(abs.id, abs);
  absorberById.set(abs.id1, abs);
  absorberById.set(abs.name.toLowerCase(), abs);
}

export function findAbsorber(idOrName) {
  if (!idOrName) return null;
  const s = String(idOrName).trim();
  return absorberById.get(s) ?? absorberById.get(s.toLowerCase()) ?? null;
}

// ── Frequency bands (1/3 octave & octave) ─────────────────────────────────

export const ACOUSTX_FREQ_3RD = RAW_DATA.freq3rd.map((f) => ({
  id: f.ID,
  center: parseFloat(f.Center),
  lower: parseFloat(f.LowerLimit),
  upper: parseFloat(f.UpperLimit),
  dbA: parseFloat(f.dbAincrease),
  bandwidth: parseFloat(f.BandWidth),
}));

export const ACOUSTX_FREQ_OCTAVE = RAW_DATA.freqOctave.map((f) => ({
  id: f.ID,
  center: parseFloat(f.Center),
  lower: parseFloat(f.LowerLimit),
  upper: parseFloat(f.UpperLimit),
  dbA: parseFloat(f.dBAincrease),
  bandwidth: parseFloat(f.BandWidth),
}));
