// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { material } from './materials.js';
import { rtTarget } from './reverbTargets.js';

/**
 * SPEECH INTELLIGIBILITY FROM THE ROOM'S FINISHES
 *
 * What the walls are covered in decides how long the room rings, and how long
 * it rings decides how much of a word survives into the next one. The wizard's
 * wall step holds the coverings against that, live:
 *
 *   RT        Sabine per octave, 125 Hz … 4 kHz (reverbTargets.js does the
 *             same sum; here a face's covering can be swapped in before it is
 *             chosen, to try it).
 *   STI       the Speech Transmission Index of a diffuse field, IEC 60268-16:
 *             each octave's modulation transfer at the 14 modulation
 *             frequencies 0.63 … 12.5 Hz is m(F) = 1 / √(1 + (2πF·T/13.8)²),
 *             read as an apparent S/N, clipped to ±15 dB, scaled to 0 … 1 and
 *             averaged; the octaves weighed with the male-speech α and β
 *             (redundancy) factors. Reverberation only: no background noise,
 *             no direct sound — a figure for the room's finishes, not a seat.
 *             8 kHz takes the 4 kHz RT.
 *   SPEECH    a target for talking in: ANSI/ASA S12.60 (classrooms) — 0.6 s
 *             up to 283 m³, 0.7 s above, nothing to be gained below 0.3 s.
 */

const K = 0.161;
const MOD_F = [0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5];
const ALPHA = [0.085, 0.127, 0.23, 0.233, 0.309, 0.224, 0.173];
const BETA = [0.085, 0.078, 0.065, 0.011, 0.047, 0.095];

/** The ratings IEC 60268-16 gives the STI scale, worst to best. */
export const STI_RATINGS = [
  { min: 0, label: 'bad' },
  { min: 0.3, label: 'poor' },
  { min: 0.45, label: 'fair' },
  { min: 0.6, label: 'good' },
  { min: 0.75, label: 'excellent' },
];

export const stiRating = (sti) => STI_RATINGS.filter((r) => sti >= r.min).at(-1).label;

/** The modulation transfer a diffuse field of reverberation time T passes, at each modulation frequency. */
export const mtfOfRt = (T) => MOD_F.map((F) => 1 / Math.sqrt(1 + ((2 * Math.PI * F * Math.max(T, 0)) / 13.8) ** 2));

/**
 * The modulation transfer of an energy impulse response, Schroeder's formula
 * (IEC 60268-16 indirect method): m(F) = |Σ e(t)·e^(−j2πFt)| / Σ e(t), `e`
 * the energy in each bin of `dt` seconds — direct sound, reflections and tail
 * alike, so a talker close by is understood better than the room alone says.
 */
export function mtfOfEnergy(e, dt) {
  let total = 0;
  for (const v of e) total += v;
  return MOD_F.map((F) => {
    if (!(total > 0)) return 0;
    const w = 2 * Math.PI * F * dt;
    let re = 0;
    let im = 0;
    for (let i = 0; i < e.length; i++) {
      if (!e[i]) continue;
      re += e[i] * Math.cos(w * i);
      im -= e[i] * Math.sin(w * i);
    }
    return Math.hypot(re, im) / total;
  });
}

/** STI from six octaves' modulation transfer (125 Hz … 4 kHz), each at the 14 modulation frequencies; 8 kHz takes 4 kHz's. */
export function stiFromMtf(mtf) {
  const mti = [...mtf.slice(0, 6), mtf[5]].map((ms) => {
    const ti = ms.map((m) => {
      const snr = m >= 1 ? 15 : Math.min(15, Math.max(-15, 10 * Math.log10(m / (1 - m))));
      return (snr + 15) / 30;
    });
    return ti.reduce((s, x) => s + x, 0) / ti.length;
  });
  let sti = 0;
  for (let k = 0; k < 7; k++) sti += ALPHA[k] * mti[k];
  for (let k = 0; k < 6; k++) sti -= BETA[k] * Math.sqrt(mti[k] * mti[k + 1]);
  return Math.min(1, Math.max(0, sti));
}

/** STI from six octave RTs (125 Hz … 4 kHz), seconds. */
export const stiFromRt = (rt) => stiFromMtf(rt.slice(0, 6).map(mtfOfRt));

/** Sabine RT per octave with `faceMats` ({ face: materialId }) laid over those faces in place of what is there. */
export function rtWith(room, faceMats = {}) {
  return [0, 1, 2, 3, 4, 5].map((b) => {
    let A = 0;
    for (const s of room.surfaces) A += s.area * (faceMats[s.face] ? material(faceMats[s.face]).alpha[b] : s.material.alpha[b]);
    return (K * room.V) / Math.max(A, 1e-3);
  });
}

/** Each face's area, m². */
export function faceAreas(room) {
  const out = {};
  for (const s of room.surfaces) out[s.face] = (out[s.face] ?? 0) + s.area;
  return out;
}

/** What to aim for: the speech target first, then the room kinds of reverbTargets.js. */
export const AIMS = [
  { id: 'speech', label: 'Speech — talk, teach, meet', source: 'ANSI/ASA S12.60' },
  { id: 'control', label: 'Control room', source: 'EBU Tech 3276' },
  { id: 'studio', label: 'Studio', source: 'rule of thumb, 0.4–0.6 s' },
  { id: 'booth', label: 'Isolation booth', source: 'rule of thumb, 0.2–0.3 s' },
  { id: 'cinema', label: 'Dolby surround cinema', source: 'approx. Dolby cinema guidance' },
];

/** { rt, lo, hi } for an aim, six octaves. */
export function aimCurve(id, V) {
  if (id !== 'speech') return rtTarget(id, V);
  const t = V <= 283 ? 0.6 : 0.7;
  return { rt: Array(6).fill(t), lo: Array(6).fill(0.3), hi: Array(6).fill(t) };
}

/** The aim a library room starts with, by its group. */
export function aimFor(entry) {
  if (!entry) return 'speech';
  if (/booth|iso/.test(entry.id)) return 'booth';
  if (entry.id === 'podcast' || entry.id === 'radio') return 'speech';
  if (entry.group === 'Control rooms') return 'control';
  if (entry.group === 'Immersive & film') return 'cinema';
  if (entry.group === 'Live rooms' || entry.live) return 'studio';
  return 'speech';
}

/** How far six RTs are from an aim: the squared miss outside its band, the speech octaves (250 Hz … 4 kHz) counted. */
export function miss(rt, curve) {
  let e = 0;
  for (let b = 1; b < 6; b++) {
    const over = rt[b] - curve.hi[b];
    const under = curve.lo[b] - rt[b];
    e += Math.max(0, over, under) ** 2 + 0.05 * (rt[b] - curve.rt[b]) ** 2;
  }
  return e;
}

/**
 * Coverings that bring the room to its aim: a face at a time, the choice from
 * `options[face]` that misses least, round the faces twice. A face keeps what
 * it has unless something else does clearly better. { face: materialId }.
 */
export function suggestCoverings(room, curve, options, start = {}) {
  const pick = { ...start };
  const faces = Object.keys(options);
  for (let pass = 0; pass < 2; pass++)
    for (const face of faces) {
      let best = pick[face];
      let bestE = miss(rtWith(room, pick), curve) - 1e-4;
      for (const id of options[face]) {
        const e = miss(rtWith(room, { ...pick, [face]: id }), curve);
        if (e < bestE) [best, bestE] = [id, e];
      }
      if (best) pick[face] = best;
    }
  return pick;
}
