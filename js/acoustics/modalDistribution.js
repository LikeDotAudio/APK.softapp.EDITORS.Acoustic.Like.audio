// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { allModes } from './room.js';

/**
 * HOW A ROOM'S MODES ARE SPREAD — THE CLASSIC "MODAL RESPONSE" VIEW
 *
 * A rigid box L × W × H rings at f = (c/2)·√((nx/L)² + (ny/W)² + (nz/H)²)
 * (room.js allModes). What a small room sounds like at the bottom end is less
 * about any one of those frequencies than about how evenly they fall:
 *
 *   THIRD-OCTAVE COUNTS. Group the modes into 1/3-octave bands (16 Hz …
 *   200 Hz). Bonello (1981) asked two things of a good room:
 *     1. the count per band never goes DOWN as frequency goes up, and
 *     2. no two modes share a frequency ("coincident") unless their band
 *        already holds five or more — then there are enough neighbours that
 *        one doubled mode does not stand out.
 *   "Share a frequency" here means within `tol` of each other, relative
 *   (0.5 % by default — closer than any room can be told apart by ear).
 *
 *   SPACING. Even with Bonello satisfied, modes bunched with gaps between
 *   them colour the bass. The optimiser scores the spread of the gaps between
 *   neighbouring modes — the standard deviation of the spacing divided by its
 *   mean (coefficient of variation), for the axial modes (the strongest) and
 *   for all of them. 0 would be perfectly even.
 *
 * Metres and hertz throughout. Dimensions are a plain { L, W, H } — anything
 * with those three numbers, a built room included.
 */

/** Nominal third-octave centre frequencies (IEC 61260), for labels. */
const NOMINAL = [10, 12.5, 16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000];

/**
 * Third-octave bands whose centre lies in [fMin, fMax]: [{ fc, lo, hi }].
 * fc is the nominal label; lo and hi are the exact base-2 edges around the
 * exact centre 1000·2^(k/3).
 */
export function thirdOctaveBands(fMin = 16, fMax = 200) {
  const out = [];
  for (let k = -20; k <= 0; k++) {
    const exact = 1000 * 2 ** (k / 3);
    if (exact < fMin * 0.97 || exact > fMax * 1.03) continue;
    const fc = NOMINAL.reduce((best, n) => (Math.abs(Math.log(n / exact)) < Math.abs(Math.log(best / exact)) ? n : best), NOMINAL[0]);
    out.push({ fc, lo: exact * 2 ** (-1 / 6), hi: exact * 2 ** (1 / 6) });
  }
  return out;
}

/** Every mode of the box up to fMax, lowest first: [{ f, nx, ny, nz, type }]. */
export function modeList(dims, fMax = 200) {
  const { L, W, H } = dims;
  if (!(L > 0 && W > 0 && H > 0)) return [];
  return allModes({ L, W, H }, fMax).map((m) => ({ f: m.f, nx: m.nx, ny: m.ny, nz: m.nz, type: m.type }));
}

/** Modes counted into each third-octave band up to fMax: [{ fc, lo, hi, count, modes }]. The top band is filled to its upper edge. */
export function thirdOctaveCounts(dims, fMax = 200) {
  const bands = thirdOctaveBands(16, fMax);
  const top = bands.length ? bands[bands.length - 1].hi : fMax;
  const modes = modeList(dims, top);
  return bands.map((b) => {
    const inBand = modes.filter((m) => m.f >= b.lo && m.f < b.hi);
    return { ...b, count: inBand.length, modes: inBand };
  });
}

/** Groups of modes within `tol` (relative) of each other: [{ f, modes }]. */
export function coincidentModes(modes, tol = 0.005) {
  const out = [];
  let group = [];
  const flush = () => {
    if (group.length > 1) out.push({ f: group.reduce((s, m) => s + m.f, 0) / group.length, modes: group });
    group = [];
  };
  for (const m of modes) {
    if (group.length && m.f - group[0].f > tol * group[0].f) flush();
    group.push(m);
  }
  flush();
  return out;
}

/**
 * Bonello's criterion (see the header): { ok, counts, warnings, coincident }.
 * `coincident` lists only the doublings that count against the room — the
 * ones in a band with fewer than five modes. `decreases` is how many bands
 * hold fewer modes than the one below them (from the first band with any).
 */
export function bonello(dims, fMax = 200, { tol = 0.005 } = {}) {
  const counts = thirdOctaveCounts(dims, fMax);
  const warnings = [];
  let decreases = 0;
  const first = counts.findIndex((b) => b.count > 0);
  if (first >= 0)
    for (let i = first + 1; i < counts.length; i++)
      if (counts[i].count < counts[i - 1].count) {
        decreases++;
        warnings.push(`${fmtHz(counts[i].fc)} band has ${counts[i].count} mode${counts[i].count === 1 ? '' : 's'}, fewer than the ${counts[i - 1].count} in ${fmtHz(counts[i - 1].fc)}`);
      }
  const coincident = [];
  for (const b of counts) {
    if (b.count >= 5) continue;
    for (const g of coincidentModes(b.modes, tol)) {
      coincident.push(g);
      warnings.push(`${g.modes.length} modes coincide at ${g.f.toFixed(1)} Hz (${g.modes.map((m) => `${m.nx}${m.ny}${m.nz}`).join(', ')}) in the ${fmtHz(b.fc)} band, which holds only ${b.count}`);
    }
  }
  return { ok: warnings.length === 0, counts, warnings, coincident, decreases };
}

const fmtHz = (f) => `${f} Hz`;

/** Coefficient of variation of the gaps between neighbouring frequencies; 0 = perfectly even. Fewer than three values: 1 (unknowable, treated as poor). */
export function spacingSpread(freqs) {
  if (freqs.length < 3) return 1;
  const gaps = [];
  for (let i = 1; i < freqs.length; i++) gaps.push(freqs[i] - freqs[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (!(mean > 0)) return 1;
  const v = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(v) / mean;
}

/**
 * One number for a box, lower is better:
 *
 *   score = 2 · (bands where the count drops)
 *         + 2 · (coincident groups in a band of fewer than five)
 *         + spread of the axial-mode spacing
 *         + spread of the all-mode spacing
 *
 * Bonello's failures dominate (each costs 2, more than any even spread can
 * win back); among the boxes that pass, the evenest spacing wins.
 */
export function scoreDimensions(dims, fMax = 200) {
  const b = bonello(dims, fMax);
  const modes = modeList(dims, fMax);
  const axial = modes.filter((m) => m.type === 'axial').map((m) => m.f);
  const spreadAxial = spacingSpread(axial);
  const spreadAll = spacingSpread(modes.map((m) => m.f));
  const score = 2 * b.decreases + 2 * b.coincident.length + spreadAxial + spreadAll;
  return { score, ok: b.ok, decreases: b.decreases, coincident: b.coincident.length, spreadAxial, spreadAll };
}

/** The values min, min+step, … ≤ max (max itself included when the step lands near it). */
export function steps([lo, hi], step) {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (!(step > 0) || b - a < 1e-9) return [a];
  const n = Math.floor((b - a) / step + 1e-6);
  return Array.from({ length: n + 1 }, (_, i) => +(a + i * step).toFixed(6));
}

/**
 * Search every L × W × H on a grid inside the given [min, max] ranges and
 * return the best `top`, best first: [{ L, W, H, score, ok }] (score as in
 * scoreDimensions). A grid of more than `maxCandidates` boxes is coarsened —
 * the step doubled until it fits — so a wide search still returns promptly.
 */
export function optimiseDimensions(ranges, { step = 0.05, fMax = 200, top = 10, maxCandidates = 40000 } = {}) {
  let s = step;
  let grid = dimensionGrid(ranges, s);
  while (grid.count > maxCandidates) grid = dimensionGrid(ranges, (s *= 2));
  const best = [];
  for (const L of grid.L)
    for (const W of grid.W)
      for (const H of grid.H) keepBest(best, { L, W, H, ...pick(scoreDimensions({ L, W, H }, fMax)) }, top);
  return best;
}

/** The three axes of the search grid and how many boxes they make. */
export function dimensionGrid(ranges, step) {
  const L = steps(ranges.L, step);
  const W = steps(ranges.W, step);
  const H = steps(ranges.H, step);
  return { L, W, H, step, count: L.length * W.length * H.length };
}

const pick = ({ score, ok }) => ({ score, ok });

/** Insert `cand` into the sorted `best` list, keeping at most `top`. */
export function keepBest(best, cand, top) {
  if (best.length >= top && cand.score >= best[best.length - 1].score) return best;
  let i = best.length;
  while (i > 0 && best[i - 1].score > cand.score) i--;
  best.splice(i, 0, cand);
  if (best.length > top) best.pop();
  return best;
}

/**
 * Room ratios published as favourable, height first (H : W : L), as they are
 * usually quoted. Sources are the classic ones as summarised by Cox, D'Antonio
 * & Avis (2004) and Everest's Master Handbook of Acoustics; ITU-R BS.1116 is
 * not a ratio but a band of them, so it carries `check` instead.
 */
export const FAVOURABLE_RATIOS = [
  { id: 'sepmeyer-a', name: 'Sepmeyer A', ratio: [1, 1.14, 1.39] },
  { id: 'sepmeyer-b', name: 'Sepmeyer B', ratio: [1, 1.28, 1.54] },
  { id: 'sepmeyer-c', name: 'Sepmeyer C', ratio: [1, 1.6, 2.33] },
  { id: 'louden', name: 'Louden', ratio: [1, 1.4, 1.9] },
  { id: 'bolt', name: 'Bolt (∛2 series)', ratio: [1, 1.26, 1.59] },
  { id: 'volkmann', name: 'Volkmann 2:3:5', ratio: [1, 1.5, 2.5] },
  { id: 'golden', name: 'Golden section', ratio: [1, 1.618, 2.618] },
  { id: 'itu-bs1116', name: 'ITU-R BS.1116 bounds', ratio: null, check: ituBs1116 },
];

/**
 * ITU-R BS.1116 listening-room proportions: 1.1·W/H ≤ L/H ≤ 4.5·W/H − 4,
 * L/H < 3 and W/H < 3. { ok, notes }.
 */
export function ituBs1116({ L, W, H }) {
  const l = L / H;
  const w = W / H;
  const notes = [];
  if (l < 1.1 * w) notes.push(`L/H ${l.toFixed(2)} is below 1.1·W/H = ${(1.1 * w).toFixed(2)}`);
  if (l > 4.5 * w - 4) notes.push(`L/H ${l.toFixed(2)} is above 4.5·W/H − 4 = ${(4.5 * w - 4).toFixed(2)}`);
  if (l >= 3) notes.push(`L/H ${l.toFixed(2)} is not below 3`);
  if (w >= 3) notes.push(`W/H ${w.toFixed(2)} is not below 3`);
  return { ok: notes.length === 0, notes };
}
