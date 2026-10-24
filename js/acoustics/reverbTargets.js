// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { material } from './materials.js';

/**
 * REVERBERATION TIME — FOUR CLASSIC FORMULAS AND WHAT TO AIM FOR
 *
 * The classic way to size a room's treatment: six surfaces, an area and a
 * material each, and a reverberation time per octave from one of four
 * formulas, held against what that kind of room should have.
 *
 *   SABINE   T = 0.161·V / A,  A = Σ S·α. Right for a live room (ᾱ small).
 *   EYRING   T = 0.161·V / (−S·ln(1 − ᾱ)), ᾱ = A / S. Right for a dead one.
 *   FITZROY  For a room whose absorption is NOT even — a hard floor and
 *            ceiling under absorbent walls is the usual case — Sabine and
 *            Eyring both read too short. Fitzroy (1959) splits the room into
 *            its three pairs of opposite surfaces (left+right, front+back,
 *            floor+ceiling) and lets each decay on its own:
 *
 *              T = 0.161·V / S² · Σ_axes  S_axis / (−ln(1 − ᾱ_axis))   (Eyring-based)
 *              T = 0.161·V / S² · Σ_axes  S_axis / ᾱ_axis               (Sabine-based)
 *
 *            With the same ᾱ on every pair it collapses to Eyring (or Sabine).
 *
 * No air absorption: the classic program's formulas are the bare ones, and
 * below 4 kHz in a room this size air hardly matters (room.js keeps it).
 *
 * A room here is anything with { V, surfaces: [{ face, area, material }] } —
 * face one of floor, ceiling, front, back, left, right; material with a
 * six-band `alpha` (125 Hz … 4 kHz). A built room (room.js) is one.
 */

const AXES = { x: ['left', 'right'], y: ['front', 'back'], z: ['floor', 'ceiling'] };
const clampA = (a) => Math.min(0.99, Math.max(1e-4, a));
const K = 0.161;

/** Total area, total absorption and per-axis { S, A } in octave `band`. */
export function absorptionByAxis(room, band) {
  const axes = { x: { S: 0, A: 0 }, y: { S: 0, A: 0 }, z: { S: 0, A: 0 } };
  let S = 0;
  let A = 0;
  for (const s of room.surfaces) {
    const a = s.material.alpha[band];
    S += s.area;
    A += s.area * a;
    const ax = Object.keys(AXES).find((k) => AXES[k].includes(s.face));
    if (ax) {
      axes[ax].S += s.area;
      axes[ax].A += s.area * a;
    }
  }
  return { S, A, axes };
}

/** All four formulas, seconds, in octave `band`: { sabine, eyring, fitzroySabine, fitzroyEyring }. */
export function rtFormulas(room, band) {
  const { S, A, axes } = absorptionByAxis(room, band);
  const V = room.V;
  const abar = clampA(A / S);
  let fs = 0;
  let fe = 0;
  for (const { S: Sa, A: Aa } of Object.values(axes)) {
    if (!(Sa > 0)) continue;
    const a = clampA(Aa / Sa);
    fs += Sa / a;
    fe += Sa / -Math.log(1 - a);
  }
  return {
    sabine: (K * V) / Math.max(A, 1e-4 * S),
    eyring: (K * V) / (-S * Math.log(1 - abar)),
    fitzroySabine: ((K * V) / (S * S)) * fs,
    fitzroyEyring: ((K * V) / (S * S)) * fe,
  };
}

export const FORMULAS = [
  { id: 'sabine', label: 'Sabine' },
  { id: 'eyring', label: 'Eyring' },
  { id: 'fitzroySabine', label: 'Fitzroy (Sabine-based)' },
  { id: 'fitzroyEyring', label: 'Fitzroy (Eyring-based)' },
];

/**
 * What to aim for, by room type. Each `curve(V)` gives { rt, lo, hi } —
 * six octave values (125 Hz … 4 kHz), the target and its tolerance band.
 *
 *   CONTROL ROOM  EBU Tech 3276 (listening conditions for programme
 *                 assessment): Tm = 0.25·(V / 100 m³)^(1/3) s, flat from
 *                 200 Hz to 4 kHz within ±0.05 s; below 200 Hz the upper limit
 *                 may rise to +0.3 s at 63 Hz (≈ +0.15 s at 125 Hz).
 *   STUDIO        a general tracking room: about 0.4–0.6 s at mid
 *                 frequencies, flat or rising slightly in the bass. A
 *                 rule-of-thumb range, not a standard.
 *   ISOLATION     a vocal or instrument booth: about 0.2–0.3 s, as flat as
 *   BOOTH         can be had. Rule of thumb.
 *   DOLBY         a surround cinema: approximately the volume-dependent
 *   SURROUND      500 Hz curve of Dolby's published cinema design guidance
 *   CINEMA        (≈ 0.35 s at 500 m³, ≈ 0.55 s at 5000 m³), allowed to rise
 *                 toward the bass (×1.4 at 125 Hz) and fall slightly at
 *                 4 kHz, ±20 %. Design intent, not a certification figure.
 *   USER          a flat value of your own.
 */
export const RT_TARGETS = [
  {
    id: 'control',
    label: 'Control room',
    source: 'EBU Tech 3276',
    curve(V) {
      const tm = 0.25 * Math.cbrt(V / 100);
      return { rt: [tm, tm, tm, tm, tm, tm], lo: [tm - 0.05, tm - 0.05, tm - 0.05, tm - 0.05, tm - 0.05, tm - 0.05], hi: [tm + 0.15, tm + 0.05, tm + 0.05, tm + 0.05, tm + 0.05, tm + 0.05] };
    },
  },
  {
    id: 'studio',
    label: 'Studio',
    source: 'rule of thumb, 0.4–0.6 s',
    curve() {
      return { rt: [0.6, 0.55, 0.5, 0.5, 0.5, 0.45], lo: [0.4, 0.4, 0.4, 0.4, 0.4, 0.35], hi: [0.75, 0.65, 0.6, 0.6, 0.6, 0.6] };
    },
  },
  {
    id: 'booth',
    label: 'Isolation booth',
    source: 'rule of thumb, 0.2–0.3 s',
    curve() {
      return { rt: [0.3, 0.25, 0.25, 0.25, 0.25, 0.25], lo: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], hi: [0.35, 0.3, 0.3, 0.3, 0.3, 0.3] };
    },
  },
  {
    id: 'cinema',
    label: 'Dolby surround cinema',
    source: 'approx. Dolby cinema guidance',
    curve(V) {
      const t500 = Math.min(0.8, Math.max(0.25, -0.19 + 0.2 * Math.log10(Math.max(V, 50))));
      const shape = [1.4, 1.15, 1, 1, 0.95, 0.9];
      const rt = shape.map((k) => t500 * k);
      return { rt, lo: rt.map((t) => t * 0.8), hi: rt.map((t) => t * 1.2) };
    },
  },
  {
    id: 'user',
    label: 'User',
    source: 'your own flat target',
    curve(V, user = 0.4) {
      const rt = [0, 0, 0, 0, 0, 0].map(() => user);
      return { rt, lo: rt.map((t) => t * 0.9), hi: rt.map((t) => t * 1.1) };
    },
  },
];

export function rtTarget(id, V, user) {
  return (RT_TARGETS.find((t) => t.id === id) ?? RT_TARGETS[0]).curve(V, user);
}

/**
 * How many m² of `materialId` must REPLACE what is there now for the room's
 * Sabine RT in `band` to read `target` seconds. Replacing area a of a base
 * whose α is α₀ with a material of α₁ adds a·(α₁ − α₀) to A, so
 *
 *   a = (0.161·V / target − A) / (α₁ − α₀).
 *
 * α₀ is the area-weighted α of `face` (one surface) or, with no face, of the
 * whole room. { area, feasible, maxArea, needA, haveA }: `feasible` false when
 * the answer is negative (the room is already deader than the target and this
 * material cannot help), the material is no better than what it replaces, or
 * the area exceeds what is available — `area` is then clamped to [0, maxArea].
 */
export function absorberAreaFor(room, materialId, target, band, { face = null } = {}) {
  const mat = material(materialId);
  const pool = room.surfaces.filter((s) => !face || s.face === face);
  const maxArea = pool.reduce((s, x) => s + x.area, 0);
  const a0 = maxArea > 0 ? pool.reduce((s, x) => s + x.area * x.material.alpha[band], 0) / maxArea : 0;
  const { A } = absorptionByAxis(room, band);
  const needA = (K * room.V) / target;
  const gain = mat.alpha[band] - a0;
  const raw = Math.abs(gain) > 1e-9 ? (needA - A) / gain : Infinity;
  const feasible = Number.isFinite(raw) && raw >= 0 && raw <= maxArea;
  return { area: Number.isFinite(raw) ? Math.min(maxArea, Math.max(0, raw)) : 0, feasible, maxArea, needA, haveA: A };
}

/**
 * The room with `area` m² of `materialId` laid over `face` (or spread over
 * every surface in proportion to its area, with no face). Each touched
 * surface shrinks and a new surface of the material, on the same face, takes
 * its place — so the per-axis split Fitzroy reads stays right.
 */
export function applyAbsorber(room, materialId, area, { face = null } = {}) {
  const mat = material(materialId);
  const pool = room.surfaces.filter((s) => !face || s.face === face);
  const total = pool.reduce((s, x) => s + x.area, 0);
  if (!(total > 0) || !(area > 0)) return { ...room, surfaces: [...room.surfaces] };
  const k = Math.min(1, area / total);
  const surfaces = [];
  for (const s of room.surfaces) {
    if (!pool.includes(s)) {
      surfaces.push(s);
      continue;
    }
    surfaces.push({ ...s, area: s.area * (1 - k) });
    surfaces.push({ ...s, key: `${s.key ?? s.face}+${mat.id}`, area: s.area * k, material: mat });
  }
  return { ...room, surfaces };
}
