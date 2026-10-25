// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE SUGGESTED REFERENCES' ARITHMETIC
 *
 * The 1997 manual closes with 26 suggested references
 * (Documentation/acoustic-x/references/). classic.js holds what the
 * program itself computed; this file holds the rest of what those works
 * teach, so the windows can show it too. Plain data in and out, metres,
 * seconds, hertz, kg; the classic box as in classic.js.
 *
 *   MODES       per-mode decay from the walls each mode touches (Knudsen,
 *               Morse & Bolt); the direction each mode travels (Sepmeyer);
 *               the beating decay of a band; the scale-free spacing index
 *               (Louden); Everest's axial check; the ratio map (Bolt).
 *   TIME        the precedence window and the echo check (Haas); the
 *               backward-integrated decay with EDT / T20 / T30 (Schroeder).
 *   HALLS       bass ratio (Beranek).
 *   WALLS       field-incidence mass law, coincidence, mass–air–mass
 *               resonance, the ISO 717-1 single number Rw (Rettinger,
 *               Egan, Fasold).
 *   RESONATORS  Helmholtz, perforated / slotted panel and membrane
 *               absorbers (Helmholtz, Everest, Rettinger).
 *   DIFFUSERS   the quadratic-residue diffuser (D'Antonio & Konnert).
 *   NOISE       the NC curves and a room's NC rating (Beranek, Egan).
 *   SYSTEMS     %ALcons, potential and needed acoustic gain, ceiling
 *               speaker spacing (Eargle, Peutz, Davis).
 *   TRANSDUCER  the piston in a baffle, the closed box (Beranek 1954,
 *               Franz); electrical levels.
 *   WAVES       reflection at an impedance change (Elmore & Heald, Tipler).
 *   HEARING     beats, combination tones, intervals, roughness, phons and
 *               sones (Helmholtz, Hall).
 */

import { modeList, scoreDimensions } from '../acoustics/modalDistribution.js';

const LN1000 = 3 * Math.log(10);

// ------------------------------------------------------------------ modes

/**
 * A mode's decay. With small wall absorption, a mode loses energy at each
 * wall in proportion to the mean square pressure it presses on that wall:
 * twice the room average on the walls its own index runs between, the room
 * average on the walls it runs along. So, with A_x the absorption area of
 * the front and back walls (the pair normal to L), A_y the side walls and
 * A_z floor and ceiling,
 *
 *   δ = c / (16 V) · (ε_x A_x + ε_y A_y + ε_z A_z),   ε = 2 if that index ≠ 0, else 1,
 *
 * which is Sabine's c·A / 8V for an oblique mode in a room of even
 * absorption, and less for the axial and tangential ones. `alpha` is α per
 * face { floor, ceiling, front, back, left, right } at the mode's frequency.
 * Returns { delta (1/s), t60 (s), bw (Hz, half-power bandwidth δ/π) }.
 */
export function modeDecay({ L, W, H }, { nx, ny, nz }, alpha, c = 343) {
  const V = L * W * H;
  const a = (k) => alpha[k] ?? 0;
  const Ax = W * H * (a('front') + a('back'));
  const Ay = L * H * (a('left') + a('right'));
  const Az = L * W * (a('floor') + a('ceiling'));
  const e = (n) => (n ? 2 : 1);
  const delta = (c / (16 * V)) * (e(nx) * Ax + e(ny) * Ay + e(nz) * Az);
  return { delta, t60: delta > 0 ? LN1000 / delta : Infinity, bw: delta / Math.PI };
}

/**
 * Which way a mode travels: its plane waves run along (±nx/L, ±ny/W, ±nz/H).
 * azimuth: degrees in plan from the length axis (0 = front–back, 90 =
 * side to side); elevation: degrees above the floor plane (90 = vertical).
 */
export function modeAngles({ L, W, H }, { nx, ny, nz }) {
  const kx = nx / L;
  const ky = ny / W;
  const kz = nz / H;
  const k = Math.hypot(kx, ky, kz);
  if (!k) return { azimuth: NaN, elevation: NaN };
  return { azimuth: (Math.atan2(ky, kx) * 180) / Math.PI, elevation: (Math.asin(kz / k) * 180) / Math.PI };
}

/**
 * Sepmeyer's angular distribution: how many of `modes` travel within each
 * `binDeg` band of elevation (0 … 90°) and of azimuth (0 … 90°).
 */
export function angularDistribution(dims, modes, binDeg = 15) {
  const n = Math.ceil(90 / binDeg);
  const elevation = new Array(n).fill(0);
  const azimuth = new Array(n).fill(0);
  for (const m of modes) {
    const a = modeAngles(dims, m);
    elevation[Math.min(n - 1, Math.floor(a.elevation / binDeg))]++;
    if (a.elevation < 89.999) azimuth[Math.min(n - 1, Math.floor(a.azimuth / binDeg))]++;
  }
  return { binDeg, elevation, azimuth };
}

/**
 * The decay of a band of modes struck together and let ring (Knudsen's
 * beating decay): each mode a damped cosine, equal start, so the energy
 * envelope is |Σ e^(−δᵢt) e^(i2πfᵢt)|². `modes`: [{ f, delta }]. Returns
 * [{ t (s), db }] over `tMax`, 0 dB at t = 0.
 */
export function bandDecay(modes, { tMax = 1, n = 400 } = {}) {
  if (!modes.length) return [];
  const e0 = modes.length ** 2;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * tMax;
    let re = 0;
    let im = 0;
    for (const m of modes) {
      const amp = Math.exp(-m.delta * t);
      re += amp * Math.cos(2 * Math.PI * m.f * t);
      im += amp * Math.sin(2 * Math.PI * m.f * t);
    }
    out.push({ t, db: 10 * Math.log10(Math.max((re * re + im * im) / e0, 1e-12)) });
  }
  return out;
}

/** Coefficient of variation of the gaps between neighbours in a sorted list: 0 when evenly spaced. */
export function gapCv(freqs) {
  const f = [...freqs].sort((a, b) => a - b);
  if (f.length < 3) return NaN;
  const g = f.slice(1).map((v, i) => v - f[i]);
  const mean = g.reduce((s, v) => s + v, 0) / g.length;
  const sd = Math.sqrt(g.reduce((s, v) => s + (v - mean) ** 2, 0) / g.length);
  return mean > 0 ? sd / mean : NaN;
}

/**
 * Louden's kind of figure of merit: the spread of the gaps between the
 * lowest `count` modes, a property of the ratio alone (scaling the room
 * scales every gap alike). Lower is more even.
 */
export function spacingIndex(dims, count = 30) {
  const scale = 10 / Math.min(dims.L, dims.W, dims.H);
  const big = { L: dims.L * scale, W: dims.W * scale, H: dims.H * scale };
  let modes = modeList(big, 200);
  for (let f = 400; modes.length < count && f < 10000; f *= 2) modes = modeList(big, f);
  return gapCv(modes.slice(0, count).map((m) => m.f));
}

/**
 * Everest's axial check: the axial modes below `fMax`, the gaps between
 * neighbours wider than `gapHz`, and the pairs closer than `tol` (relative).
 */
export function axialCheck(dims, { fMax = 300, gapHz = 20, tol = 0.005 } = {}) {
  const ax = modeList(dims, fMax).filter((m) => m.type === 'axial');
  const gaps = [];
  const close = [];
  for (let i = 1; i < ax.length; i++) {
    const d = ax[i].f - ax[i - 1].f;
    if (d > gapHz) gaps.push({ lo: ax[i - 1].f, hi: ax[i].f, gap: d });
    if (d <= tol * ax[i].f) close.push({ a: ax[i - 1], b: ax[i] });
  }
  return { modes: ax, gaps, close, ok: !gaps.length && !close.length };
}

/**
 * Bolt's chart, computed: for height `H` (m, at 343 m/s), the app's mode
 * score (scoreDimensions: Bonello failures plus the spread of the spacing)
 * over a grid of W/H × L/H, L ≥ W. Returns { wr: [n], lr: [n], score:
 * [[lr][wr]] (NaN where L < W), ok: same shape (Bonello passes) }.
 */
export function boltMap(H, { wr = [1, 2], lr = [1, 3], n = 32, fMax = 200 } = {}) {
  const ws = Array.from({ length: n }, (_, i) => wr[0] + ((i + 0.5) / n) * (wr[1] - wr[0]));
  const ls = Array.from({ length: n }, (_, i) => lr[0] + ((i + 0.5) / n) * (lr[1] - lr[0]));
  const score = [];
  const ok = [];
  for (const l of ls) {
    const sr = [];
    const okr = [];
    for (const w of ws) {
      if (l < w) {
        sr.push(NaN);
        okr.push(false);
        continue;
      }
      const s = scoreDimensions({ L: l * H, W: w * H, H }, fMax);
      sr.push(s.score);
      okr.push(s.ok);
    }
    score.push(sr);
    ok.push(okr);
  }
  return { wr: ws, lr: ls, score, ok };
}

// ------------------------------------------------------------------ time

/**
 * The precedence window and the echo check, from Haas's single-echo
 * experiments. `arrivals` [{ t (ms), level (dB re direct), order }] with
 * the direct sound as order 0. Within 1 ms of the first arrival a
 * reflection pulls the image (summing localisation); up to about 30 ms it
 * fuses and the first arrival keeps the direction; past `echoMs` (50 for
 * speech, 80 for music) one within `echoDb` of the direct is a likely
 * echo. These are design readings of his curves, not his data. Returns
 * { t0, itdg (ms, the first reflection's lag), pulls, fused, echoes }
 * (lists of arrivals).
 */
export function haasCheck(arrivals, { echoMs = 50, echoDb = -10, pullMs = 1, pullDb = -3, fuseMs = 30 } = {}) {
  const direct = arrivals.find((a) => a.order === 0) ?? arrivals[0];
  if (!direct) return { t0: NaN, itdg: NaN, pulls: [], fused: [], echoes: [] };
  // reflections only: a second loudspeaker's own direct sound is a phantom image, not an echo
  const later = arrivals.filter((a) => a !== direct && a.order > 0).map((a) => ({ ...a, dt: a.t - direct.t, rel: a.level - direct.level }));
  return {
    t0: direct.t,
    itdg: later.length ? Math.min(...later.map((a) => a.dt)) : NaN,
    pulls: later.filter((a) => a.dt <= pullMs && a.rel >= pullDb),
    fused: later.filter((a) => a.dt > pullMs && a.dt <= fuseMs),
    echoes: later.filter((a) => a.dt > echoMs && a.rel >= echoDb),
  };
}

/**
 * Schroeder's backward integration of a list of arrivals: the energy still
 * to come after each moment, in dB re the total — what an interrupted
 * noise would decay as, without the noise. EDT from 0 to −10 dB, T20 from
 * −5 to −25, T30 from −5 to −35, each a least-squares line over the curve
 * sampled every `dt` ms and scaled to 60 dB; null where the curve does not
 * reach that far. `arrivals` [{ t (ms), level (dB) }].
 */
export function schroederDecay(arrivals, { dt = 1 } = {}) {
  const a = arrivals.filter((x) => Number.isFinite(x.level)).sort((p, q) => p.t - q.t);
  if (!a.length) return { curve: [], edt: null, t20: null, t30: null };
  const e = a.map((x) => 10 ** (x.level / 10));
  const total = e.reduce((s, v) => s + v, 0);
  const t0 = a[0].t;
  const tEnd = a[a.length - 1].t;
  const curve = [];
  let j = 0;
  let after = total;
  for (let t = t0; t <= tEnd + 1e-9; t += dt) {
    while (j < a.length && a[j].t < t) after -= e[j++];
    curve.push({ t, db: 10 * Math.log10(Math.max(after / total, 1e-12)) });
  }
  const fit = (hi, lo) => {
    const pts = curve.filter((p) => p.db <= hi && p.db >= lo);
    if (pts.length < 2 || curve[curve.length - 1].db > lo) return null;
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.t, 0) / n;
    const my = pts.reduce((s, p) => s + p.db, 0) / n;
    const sxy = pts.reduce((s, p) => s + (p.t - mx) * (p.db - my), 0);
    const sxx = pts.reduce((s, p) => s + (p.t - mx) ** 2, 0);
    const slope = sxy / sxx;
    return slope < 0 ? -60 / slope / 1000 : null;
  };
  return { curve, edt: fit(0, -10), t20: fit(-5, -25), t30: fit(-5, -35) };
}

// ------------------------------------------------------------------ halls

/** Beranek's bass ratio from octave RTs at [125, 250, 500, 1000, …]: (T125 + T250) / (T500 + T1000). */
export function bassRatio(rt) {
  return (rt[0] + rt[1]) / (rt[2] + rt[3]);
}

// ------------------------------------------------------------------ walls

/** ISO third-octave centres the single-number ratings use. */
export const R_BANDS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150];
/** The ISO 717-1 airborne reference curve over R_BANDS (Rw is its value at 500 Hz). */
export const ISO717_REF = [33, 36, 39, 42, 45, 48, 51, 52, 53, 54, 55, 56, 56, 56, 56, 56];

/** Field-incidence mass law: TL = 20·log10(m·f) − 47 dB, m in kg/m². */
export function massLaw(m, f) {
  return 20 * Math.log10(m * f) - 47;
}

/** Plate materials for the coincidence frequency: density kg/m³, Young's modulus Pa, Poisson's ratio. */
export const PLATES = [
  { id: 'gypsum', name: 'Gypsum board', rho: 800, E: 2.5e9, nu: 0.3 },
  { id: 'plywood', name: 'Plywood', rho: 600, E: 7e9, nu: 0.3 },
  { id: 'mdf', name: 'MDF', rho: 750, E: 3.5e9, nu: 0.3 },
  { id: 'glass', name: 'Glass', rho: 2500, E: 7e10, nu: 0.22 },
  { id: 'concrete', name: 'Concrete', rho: 2300, E: 3e10, nu: 0.2 },
  { id: 'brick', name: 'Brick', rho: 1800, E: 1.6e10, nu: 0.2 },
  { id: 'steel', name: 'Steel', rho: 7850, E: 2.1e11, nu: 0.3 },
];

/** A plate's coincidence frequency, Hz: fc = c² / (2π t) · √(12 ρ (1 − ν²) / E). `t` thickness in m. */
export function coincidence(plate, t, c = 343) {
  return ((c * c) / (2 * Math.PI * t)) * Math.sqrt((12 * plate.rho * (1 - plate.nu ** 2)) / plate.E);
}

/** Mass–air–mass resonance of two leaves m1, m2 (kg/m²) over a cavity d (m): f0 = 60·√((m1 + m2) / (m1·m2·d)). */
export function massAirMass(m1, m2, d) {
  return 60 * Math.sqrt((m1 + m2) / (m1 * m2 * d));
}

/**
 * The ISO 717-1 single number: shift the reference curve in whole dB until
 * the sum of the shortfalls of `tl` (over R_BANDS) below it is as large as
 * possible without passing 32 dB. Returns { rw, shortfall }.
 */
export function ratingRw(tl) {
  let best = null;
  for (let rw = 0; rw <= 100; rw++) {
    const sum = ISO717_REF.reduce((s, r, i) => s + Math.max(0, r - 52 + rw - tl[i]), 0);
    if (sum <= 32) best = { rw, shortfall: sum };
    else break;
  }
  return best ?? { rw: 0, shortfall: NaN };
}

// ------------------------------------------------------------------ resonators

/**
 * Helmholtz resonator: f = c / 2π · √(S / (V · l′)), neck of radius `a`
 * and length `l`, cavity `V` (m³); l′ = l + 1.7a, both ends flanged.
 */
export function helmholtz({ a, l, V }, c = 343) {
  const S = Math.PI * a * a;
  return (c / (2 * Math.PI)) * Math.sqrt(S / (V * (l + 1.7 * a)));
}

/**
 * Perforated or slotted panel over an air gap: f = c / 2π · √(P / (D · t′)),
 * open-area fraction P, gap D, panel thickness t; for holes of diameter d,
 * t′ = t + 0.8d (the end correction of round holes of diameter d; for
 * slots, use the slot width as d — rougher, but adequate for design).
 */
export function perforated({ P, D, t, d }, c = 343) {
  return (c / (2 * Math.PI)) * Math.sqrt(P / (D * (t + 0.8 * d)));
}

/** Membrane (panel) absorber: f = 60 / √(m·d), m kg/m², d air space in m. */
export function membrane(m, d) {
  return 60 / Math.sqrt(m * d);
}

// ------------------------------------------------------------------ diffusers

/** Is `n` prime? */
export function isPrime(n) {
  if (n < 2 || n % 1) return false;
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return false;
  return true;
}

/**
 * The quadratic-residue diffuser: N wells (N prime) of width w, designed
 * for f0. Well n has the residue sₙ = n² mod N and the depth sₙ·λ0 / 2N.
 * It scatters from about f0 up to c / 2w, where the wells stop being
 * narrow against a half-wave. Returns { residues, depths (m), fLow, fHigh,
 * period (m) }.
 */
export function qrd({ N, f0, w }, c = 343) {
  const lam = c / f0;
  const residues = Array.from({ length: N }, (_, n) => (n * n) % N);
  return { residues, depths: residues.map((s) => (s * lam) / (2 * N)), fLow: f0, fHigh: c / (2 * w), period: N * w };
}

// ------------------------------------------------------------------ noise

/** NC curve centres, Hz. */
export const NC_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
/** The NC curves (Beranek 1957), octave-band SPL at NC_BANDS. */
export const NC_CURVES = [
  [15, [47, 36, 29, 22, 17, 14, 12, 11]],
  [20, [51, 40, 33, 26, 22, 19, 17, 16]],
  [25, [54, 44, 37, 31, 27, 24, 22, 21]],
  [30, [57, 48, 41, 35, 31, 29, 28, 27]],
  [35, [60, 52, 45, 40, 36, 34, 33, 32]],
  [40, [64, 56, 50, 45, 41, 39, 38, 37]],
  [45, [67, 60, 54, 49, 46, 44, 43, 42]],
  [50, [71, 64, 58, 54, 51, 49, 48, 47]],
  [55, [74, 67, 62, 58, 56, 54, 53, 52]],
  [60, [77, 71, 67, 63, 61, 59, 58, 57]],
  [65, [80, 75, 71, 68, 66, 64, 63, 62]],
];

/**
 * A spectrum's NC rating: per band, the NC value its level reaches
 * (interpolated between curves, extrapolated past the ends), and the
 * rating the highest of them — the band that sets it named. `levels` dB
 * at NC_BANDS. Returns { nc, band, perBand }.
 */
export function ncRating(levels) {
  const perBand = levels.map((lv, i) => {
    const pts = NC_CURVES.map(([nc, row]) => [row[i], nc]);
    let k = pts.findIndex(([l]) => l >= lv);
    if (k <= 0) k = k === 0 ? 1 : pts.length - 1;
    const [l0, n0] = pts[k - 1];
    const [l1, n1] = pts[k];
    return n0 + ((lv - l0) * (n1 - n0)) / (l1 - l0);
  });
  let band = 0;
  perBand.forEach((v, i) => v > perBand[band] && (band = i));
  return { nc: perBand[band], band: NC_BANDS[band], perBand };
}

/** Background noise targets by room, NC (design guidance from the handbooks; a range, not a law). */
export const NC_TARGETS = [
  ['Recording studio', 15, 20],
  ['Control room', 15, 25],
  ['Broadcast studio', 15, 20],
  ['Concert hall', 15, 20],
  ['Theatre', 20, 25],
  ['Cinema', 25, 30],
  ['Classroom', 25, 30],
  ['Open office', 35, 40],
];

// ------------------------------------------------------------------ systems

/**
 * Peutz's articulation loss of consonants, %: 200·r²·T²·(n + 1) / (V·Q)
 * for a listener r m from the nearest of n + 1 like loudspeakers (n the
 * others), T the RT60, V m³, Q the directivity; past 3.16·Dc it levels at
 * 9·T. `dc` the critical distance, m.
 */
export function alcons({ r, T, V, Q, n = 0, dc }) {
  const lim = 9 * T;
  if (dc && r > 3.16 * dc) return lim;
  return Math.min(lim, (200 * r * r * T * T * (n + 1)) / (V * Q));
}

/**
 * Potential acoustic gain, dB: 20·log(D1·D0 / (Ds·D2)) − 10·log(NOM) − 6,
 * with D0 talker → farthest listener, Ds talker → mic, D1 mic → nearest
 * loudspeaker, D2 loudspeaker → farthest listener, NOM the open mics and
 * 6 dB of feedback margin. Needed acoustic gain 20·log(D0 / EAD). Both in
 * dB; the system works when PAG ≥ NAG.
 */
export function acousticGain({ D0, Ds, D1, D2, EAD, NOM = 1 }) {
  const pag = 20 * Math.log10((D1 * D0) / (Ds * D2)) - 10 * Math.log10(Math.max(1, NOM)) - 6;
  const nag = 20 * Math.log10(D0 / EAD);
  return { pag, nag, ok: pag >= nag };
}

/**
 * Ceiling loudspeakers on a square grid: the coverage circle at ear
 * height is r = (ceiling − ear)·tan(θ/2) for a coverage angle θ. Spacing
 * centre to centre: 2r edge to edge, r√2 minimum overlap, r centre to
 * centre (the most even).
 */
export function ceilingSpacing({ ceiling, ear = 1.2, angle = 90 }) {
  const r = Math.max(0, ceiling - ear) * Math.tan((angle * Math.PI) / 360);
  return { r, edge: 2 * r, overlap: r * Math.SQRT2, centre: r };
}

// ------------------------------------------------------------------ transducer

/** Bessel J1: the rational approximations of Numerical Recipes' bessj1 (about 1e-8 below x = 8, 1e-7 above). */
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const n = x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const d = 144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return n / d;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const v = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -v : v;
}

/**
 * A rigid piston of radius `a` in an infinite baffle at `f`: ka, the
 * relative pressure off axis 2·J1(x)/x with x = ka·sinθ, the −6 dB
 * half-angle (where 2·J1(x)/x = ½, x = 2.215; null when ka is too small
 * to narrow that far) and the directivity index
 * DI = 10·log((ka)² / (1 − J1(2ka)/ka)).
 */
export function piston(a, f, c = 343) {
  const ka = (2 * Math.PI * f * a) / c;
  const half = ka > 2.215 ? (Math.asin(2.215 / ka) * 180) / Math.PI : null;
  const di = 10 * Math.log10((ka * ka) / (1 - besselJ1(2 * ka) / ka));
  const at = (deg) => {
    const x = ka * Math.sin((deg * Math.PI) / 180);
    return Math.abs(x) < 1e-9 ? 1 : (2 * besselJ1(x)) / x;
  };
  return { ka, half6: half, di, at };
}

/** A driver in a closed box: fc = fs·√(1 + Vas/Vb), Qtc = Qts·√(1 + Vas/Vb). */
export function closedBox({ fs, qts, vas, vb }) {
  const k = Math.sqrt(1 + vas / vb);
  return { fc: fs * k, qtc: qts * k };
}

/** Electrical levels: dBu re 0.775 V, dBV re 1 V, of `volts` (RMS). */
export function electrical(volts) {
  return { dBu: 20 * Math.log10(volts / 0.7746), dBV: 20 * Math.log10(volts) };
}

/** On-axis SPL at `d` m from a speaker of `sens` dB (1 W, 1 m) driven with `watts`, free field. */
export function splFromPower(sens, watts, d = 1) {
  return sens + 10 * Math.log10(watts) - 20 * Math.log10(d);
}

// ------------------------------------------------------------------ waves

/** Characteristic impedances ρc, rayl (Pa·s/m), for the impedance tab. */
export const MEDIA = [
  ['Air (20 °C)', 413],
  ['Water', 1.48e6],
  ['Wood (along grain)', 2.4e6],
  ['Brick', 6.5e6],
  ['Concrete', 8e6],
  ['Glass', 1.3e7],
  ['Steel', 4.6e7],
];

/** A plane wave meeting a change of impedance at normal incidence: R = (Z2 − Z1) / (Z2 + Z1), the energy reflected R², transmitted 1 − R². */
export function impedanceStep(z1, z2) {
  const R = (z2 - z1) / (z2 + z1);
  return { R, reflected: R * R, transmitted: 1 - R * R };
}

// ------------------------------------------------------------------ hearing

/** Just intervals and their names, for the nearest-interval readout. */
export const JUST = [
  [1, 1, 'unison'],
  [16, 15, 'minor second'],
  [9, 8, 'major second'],
  [6, 5, 'minor third'],
  [5, 4, 'major third'],
  [4, 3, 'fourth'],
  [45, 32, 'tritone'],
  [3, 2, 'fifth'],
  [8, 5, 'minor sixth'],
  [5, 3, 'major sixth'],
  [9, 5, 'minor seventh'],
  [15, 8, 'major seventh'],
  [2, 1, 'octave'],
];
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** The note nearest `f` in equal temperament (A4 = `a4` Hz) and how many cents off. */
export function noteOf(f, a4 = 440) {
  const midi = 69 + 12 * Math.log2(f / a4);
  const n = Math.round(midi);
  return { name: `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`, cents: 100 * (midi - n) };
}

/**
 * Two tones together: the beat rate, the combination tones (difference
 * f2 − f1, cubic 2f1 − f2, sum f1 + f2), the interval in cents with the
 * nearest just interval (within the octave) and how far equal temperament
 * is from it, and the roughness after Plomp & Levelt as Sethares fits it,
 * 0 … 1 (1 at the roughest spacing for that register).
 */
export function twoTones(f1, f2) {
  const lo = Math.min(f1, f2);
  const hi = Math.max(f1, f2);
  const cents = 1200 * Math.log2(hi / lo);
  // within the octave, but an exact octave (or two) stays an octave, not a unison
  let inOct = cents % 1200;
  if (cents > 600 && inOct < 50) inOct += 1200;
  let near = JUST[0];
  for (const j of JUST) if (Math.abs(1200 * Math.log2(j[0] / j[1]) - inOct) < Math.abs(1200 * Math.log2(near[0] / near[1]) - inOct)) near = j;
  const justC = 1200 * Math.log2(near[0] / near[1]);
  const s = 0.24 / (0.021 * lo + 19);
  const x = hi - lo;
  const rough = (Math.exp(-3.5 * s * x) - Math.exp(-5.75 * s * x)) / 0.180775;
  const tidy = (v) => (Math.abs(v) < 1e-6 ? 0 : v);
  return { beat: x, difference: x, cubic: 2 * lo - hi, sum: lo + hi, cents, just: { ratio: `${near[0]}:${near[1]}`, name: near[2], off: tidy(inOct - justC), etOff: tidy(Math.round(justC / 100) * 100 - justC) }, roughness: Math.max(0, rough) };
}

/** Loudness in sones from loudness level in phons: 2^((P − 40)/10) from 40 phon, (P/40)^2.642 below. */
export function sones(phon) {
  return phon >= 40 ? 2 ** ((phon - 40) / 10) : (Math.max(0, phon) / 40) ** 2.642;
}

/** Loudness level in phons from sones (the inverse of `sones`). */
export function phons(sone) {
  return sone >= 1 ? 40 + 10 * Math.log2(sone) : 40 * Math.max(0, sone) ** (1 / 2.642);
}
