// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE CLASSIC PROGRAM'S ARITHMETIC
 *
 * The 1997 Acoustic-X manual says what each of its modules works out, in
 * words; this is that arithmetic, written down from the textbooks it cites,
 * plain data in and out so it can be tested and the windows (acoustx.js)
 * only have to draw it. Everything is in the CLASSIC box: X from the left
 * wall (0 … W), Y from the front wall (0 … L), Z above the floor (0 … H),
 * metres, seconds, hertz. Mode indices go nx ↔ length, ny ↔ width, nz ↔
 * height, as the manual has them.
 *
 *   AIR             c from temperature; ISO 9613-1 absorption from
 *                   temperature and humidity (the General Parameters).
 *   MODES           the ideal count per band a box of that volume should
 *                   have (Bolt's statistics, the manual's blue chart);
 *                   axial / tangential / oblique weights 1 · ½ · ¼; the
 *                   relative pressure of one mode or a sum of them on a
 *                   plane or through the volume.
 *   SBIR            deviation above the speaker's LF cut-off, absolute or
 *                   negative-only; the crossover check.
 *   SURROUND        centre and rears from the stereo pair, on the listener's
 *                   circle; the angles the Listener tab reports.
 *   RAY TRACING     equal-area rays from the speaker, followed bounce by
 *                   bounce round the box, caught by a sphere at the listener;
 *                   the polar energy; the room figures and the comb nulls
 *                   the Data View lists.
 *   REVERB          a measured empty room as the basis; the area optimiser
 *                   that tries every combination of up to five materials.
 *   CALCULATOR      units, spherical / cylindrical spreading, pressure or
 *                   energy level addition, frequency ↔ wavelength ↔ period.
 */

// ------------------------------------------------------------------ air

/** Speed of sound in air at `t` °C, m/s. */
export function speedOfSound(t = 20) {
  return 331.3 * Math.sqrt(1 + t / 273.15);
}

/**
 * Air absorption, dB per metre, at frequency f (Hz), temperature t (°C),
 * relative humidity rh (%), pressure pa (kPa) — ISO 9613-1:1993, eq. 3–5.
 */
export function airDbPerM(f, t = 20, rh = 50, pa = 101.325) {
  const T = t + 273.15;
  const T0 = 293.15;
  const T01 = 273.16;
  const pr = pa / 101.325;
  const psat = 10 ** (-6.8346 * (T01 / T) ** 1.261 + 4.6151);
  const hum = (rh * psat) / pr;
  const frO = pr * (24 + (4.04e4 * hum * (0.02 + hum)) / (0.391 + hum));
  const frN = pr * (T / T0) ** -0.5 * (9 + 280 * hum * Math.exp(-4.17 * ((T / T0) ** (-1 / 3) - 1)));
  const f2 = f * f;
  return (
    8.686 *
    f2 *
    (1.84e-11 / pr * Math.sqrt(T / T0) +
      (T / T0) ** -2.5 * (0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO) + 0.1068 * Math.exp(-3352 / T) / (frN + f2 / frN)))
  );
}

// ------------------------------------------------------------------ modes

/** The default modal weights: tangential half as strong as axial, oblique half again. */
export const MODE_WEIGHTS = { axial: 1, tangential: 0.5, oblique: 0.25 };

/**
 * How many modes a box of these dimensions has below f, on average — Bolt
 * (1946) after Morse: N(f) = 4πVf³/3c³ + πSf²/4c² + Lf/8c, with S the total
 * surface and L the sum of all twelve edges. The manual's blue chart.
 */
export function modesBelow({ L, W, H }, f, c = 343) {
  const V = L * W * H;
  const S = 2 * (L * W + L * H + W * H);
  const E = 4 * (L + W + H);
  return (4 * Math.PI * V * f ** 3) / (3 * c ** 3) + (Math.PI * S * f * f) / (4 * c * c) + (E * f) / (8 * c);
}

/** The ideal count in each band [{ lo, hi }]: N(hi) − N(lo). */
export function idealCounts(dims, bands, c = 343) {
  return bands.map((b) => modesBelow(dims, b.hi, c) - modesBelow(dims, b.lo, c));
}

/** A mode's frequency in a box, Hz. */
export function modeFreq({ L, W, H }, nx, ny, nz, c = 343) {
  return (c / 2) * Math.hypot(nx / L, ny / W, nz / H);
}

export const modeType = (nx, ny, nz) => ['oblique', 'tangential', 'axial'][(nx === 0) + (ny === 0) + (nz === 0)] ?? 'none';

/** A mode's pressure shape at a classic point, −1 … 1: cos(nxπY/L)·cos(nyπX/W)·cos(nzπZ/H). */
export function modeShape({ L, W, H }, m, P) {
  return Math.cos((m.nx * Math.PI * P.Y) / L) * Math.cos((m.ny * Math.PI * P.X) / W) * Math.cos((m.nz * Math.PI * P.Z) / H);
}

/**
 * Relative pressure of one mode or a group, sampled on a plane or through
 * the volume, every `res` metres:
 *
 *   plane 'horizontal'  at height `at` (Z)        → u = X, v = Y
 *         'length'      at `at` from the left (X) → u = Y, v = Z
 *         'width'       at `at` from the front (Y) → u = X, v = Z
 *         '3d'          the whole volume           → points { X, Y, Z, value }
 *
 * `param`, the original's three display parameters:
 *   'pressure'   relative sound pressure: the modes add as energy, each by
 *                its weight, √(Σ w·ψ²) — 0 … 1, the loudest point 1 (the
 *                darkest grey in the original);
 *   'intensity'  relative sound intensity: Σ w·ψ², 0 … 1;
 *   'phase'      relative phase addition: the shapes added with their signs,
 *                Σ w·ψ, −1 … 1 — where neighbouring modes reinforce and
 *                where they cancel.
 */
export function pressureField(dims, modes, { plane = 'horizontal', at = 0, res = 0.3, weights = MODE_WEIGHTS, param = 'pressure' } = {}) {
  const { L, W, H } = dims;
  const w = modes.map((m) => weights[m.type] ?? 1);
  const value = (P) => {
    let e = 0;
    if (param === 'phase') modes.forEach((m, i) => (e += w[i] * modeShape(dims, m, P)));
    else modes.forEach((m, i) => (e += w[i] * modeShape(dims, m, P) ** 2));
    return param === 'pressure' ? Math.sqrt(e) : e;
  };
  const peak = (vals) => Math.max(1e-12, ...vals.map(Math.abs));
  const steps = (len) => Math.max(2, Math.round(len / res) + 1);
  const along = (len, n) => Array.from({ length: n }, (_, i) => (len * i) / (n - 1));
  if (plane === '3d') {
    const xs = along(W, steps(W));
    const ys = along(L, steps(L));
    const zs = along(H, steps(H));
    const points = [];
    for (const X of xs) for (const Y of ys) for (const Z of zs) points.push({ X, Y, Z, value: value({ X, Y, Z }) });
    const max = peak(points.map((p) => p.value));
    for (const p of points) p.value /= max;
    return { plane, points };
  }
  const [uLen, vLen] = plane === 'horizontal' ? [W, L] : plane === 'length' ? [L, H] : [W, H];
  const us = along(uLen, steps(uLen));
  const vs = along(vLen, steps(vLen));
  const point = (u, v) => (plane === 'horizontal' ? { X: u, Y: v, Z: at } : plane === 'length' ? { X: at, Y: u, Z: v } : { X: u, Y: at, Z: v });
  const grid = vs.map((v) => us.map((u) => value(point(u, v))));
  const max = peak(grid.flat());
  return { plane, at, us, vs, param, grid: grid.map((row) => row.map((x) => x / max)) };
}

// ------------------------------------------------------------------ SBIR

/**
 * One number for a placement, from a deviation curve: the mean of |dev|
 * ('absolute') or of the negative part only ('negative') over the
 * frequencies from the speaker's LF cut-off up to `fMax`.
 */
export function sbirScore(freqs, dev, { lfCut = 0, fMax = 300, mode = 'absolute' } = {}) {
  let s = 0;
  let n = 0;
  freqs.forEach((f, i) => {
    if (f < lfCut || f > fMax) return;
    s += mode === 'negative' ? Math.max(0, -dev[i]) : Math.abs(dev[i]);
    n++;
  });
  return n ? s / n : 0;
}

/** The deviation at the crossover (interpolated on a log axis), and whether it dips. */
export function crossoverCheck(freqs, dev, xover, tolDb = 0) {
  if (!(xover > freqs[0] && xover < freqs[freqs.length - 1])) return { dev: NaN, dips: false };
  const i = freqs.findIndex((f) => f >= xover);
  const t = Math.log(xover / freqs[i - 1]) / Math.log(freqs[i] / freqs[i - 1]);
  const d = dev[i - 1] + t * (dev[i] - dev[i - 1]);
  return { dev: d, dips: d < -tolDb };
}

// ------------------------------------------------------------------ the listener and the surrounds

const DEG = Math.PI / 180;

/**
 * What the Listener tab reports for a stereo pair: the angle the pair
 * subtends at the listener, each speaker's distance, and the tilt that aims
 * it at the ears (positive: tilted down). A tilt over 15° either way is
 * flagged: the speaker sits too high or too low for the listener.
 */
export function listenerGeometry(spk1, spk2, lis) {
  const d = (s) => Math.hypot(s.X - lis.X, s.Y - lis.Y, s.Z - lis.Z);
  const az = (s) => Math.atan2(s.X - lis.X, lis.Y - s.Y) / DEG;
  const tilt = (s) => Math.atan2(s.Z - lis.Z, Math.hypot(s.X - lis.X, s.Y - lis.Y)) / DEG;
  const t1 = tilt(spk1);
  return { angle: Math.abs(az(spk1) - az(spk2)), d1: d(spk1), d2: d(spk2), tilt: t1, warn: Math.abs(t1) > 15 ? (t1 > 0 ? 'speakers too high for the listener' : 'speakers too low for the listener') : '' };
}

/**
 * The centre and the two rears, derived from the stereo pair as the SBIR
 * module does: on the circle round the listener the mains sit on, the centre
 * straight ahead at their height, the rears at ±110° (ITU-R BS.775) raised by
 * `rearRise` metres — the distance to the listener kept, so the rear's plan
 * radius shrinks as it rises.
 */
export function surroundPositions(spk1, lis, { rearDeg = 110, rearRise = 0 } = {}) {
  const r = Math.hypot(spk1.X - lis.X, spk1.Y - lis.Y, spk1.Z - lis.Z);
  const centre = { X: lis.X, Y: lis.Y - Math.sqrt(Math.max(0, r * r - (spk1.Z - lis.Z) ** 2)), Z: spk1.Z };
  const rz = lis.Z + rearRise;
  const rp = Math.sqrt(Math.max(0, r * r - rearRise * rearRise));
  const rear = (sign) => ({ X: lis.X + sign * rp * Math.sin(rearDeg * DEG), Y: lis.Y - rp * Math.cos(rearDeg * DEG), Z: rz });
  return { centre, rearLeft: rear(-1), rearRight: rear(1), radius: r, rearTilt: Math.atan2(rearRise, rp) / DEG };
}

/**
 * Where to put absorption so the listening window stays free of first
 * reflections — the "specular absorbers" of the SBIR room view. For each
 * speaker and each corner of a window `win` metres across round the listener
 * (in plan and height), the specular point on the side walls and the
 * ceiling; each surface's absorber is the box round its points, `pad` metres
 * wider each way (a panel needs a margin past the geometric point). Returns
 * { left, right, ceiling } as { u0, u1, v0, v1 } in that surface's own
 * coordinates (side walls: u = Y, v = Z; ceiling: u = X, v = Y).
 */
export function specularAbsorbers(dims, speakers, lis, win = 1, pad = 0.15) {
  const { W, H } = dims;
  const corners = [];
  for (const dx of [-win / 2, win / 2]) for (const dy of [-win / 2, win / 2]) for (const dz of [-win / 4, win / 4]) corners.push({ X: lis.X + dx, Y: lis.Y + dy, Z: lis.Z + dz });
  const hits = { left: [], right: [], ceiling: [] };
  for (const s of speakers)
    for (const c of corners) {
      // mirror the speaker in the plane, the specular point is where the line to the listener crosses it
      const at = (k, plane, img) => ({ k, t: (plane - img[k]) / (c[k] - img[k]) });
      for (const [name, k, plane] of [
        ['left', 'X', 0],
        ['right', 'X', W],
        ['ceiling', 'Z', H],
      ]) {
        const img = { ...s, [k]: 2 * plane - s[k] };
        const { t } = at(k, plane, img);
        if (!(t > 0 && t < 1)) continue;
        const p = { X: img.X + t * (c.X - img.X), Y: img.Y + t * (c.Y - img.Y), Z: img.Z + t * (c.Z - img.Z) };
        hits[name].push(name === 'ceiling' ? [p.X, p.Y] : [p.Y, p.Z]);
      }
    }
  const boxOf = (pts) => (pts.length ? { u0: Math.min(...pts.map((p) => p[0])) - pad, u1: Math.max(...pts.map((p) => p[0])) + pad, v0: Math.min(...pts.map((p) => p[1])) - pad, v1: Math.max(...pts.map((p) => p[1])) + pad } : null);
  const out = { left: boxOf(hits.left), right: boxOf(hits.right), ceiling: boxOf(hits.ceiling) };
  for (const k of Object.keys(out)) if (out[k]) out[k].area = (out[k].u1 - out[k].u0) * (out[k].v1 - out[k].v0);
  return out;
}

// ------------------------------------------------------------------ ray tracing

/**
 * Directions spread so each ray stands for the same area of the sphere: the
 * vertical angle steps by `step` from vBegin to vEnd; at each, the horizontal
 * step is widened by 1/cos so there are fewer rays toward the poles. Angles
 * are taken off the speaker's 0 axis (the line to the mix position),
 * horizontal clockwise seen from above, vertical positive up. Returns unit
 * vectors in that axis's frame { f (forward), r (right), u (up) }.
 */
export function equalAreaDirections({ step = 5, vBegin = -90, vEnd = 90, hBegin = 0, hEnd = 360 } = {}) {
  const out = [];
  const span = Math.abs(hEnd - hBegin);
  for (let v = vBegin; v <= vEnd + 1e-9; v += step) {
    const cv = Math.cos(v * DEG);
    const n = Math.max(1, Math.round((span * cv) / step));
    // a full turn does not repeat its first ray
    const full = span >= 360 - 1e-9;
    for (let i = 0; i < n; i++) {
      const hDeg = hBegin + (full ? (span * i) / n : n === 1 ? span / 2 : (span * i) / (n - 1));
      out.push({ f: cv * Math.cos(hDeg * DEG), r: cv * Math.sin(hDeg * DEG), u: Math.sin(v * DEG) });
    }
  }
  return out;
}

const FACE_PLANES = [
  ['left', 'X', 0],
  ['right', 'X', 'W'],
  ['front', 'Y', 0],
  ['back', 'Y', 'L'],
  ['floor', 'Z', 0],
  ['ceiling', 'Z', 'H'],
];

/**
 * Follow rays round the box. `alpha` gives each face's absorption ({ left,
 * right, front, back, floor, ceiling }, one band); `patches` lays absorbers
 * on top ([{ face, u0, u1, v0, v1, alpha }] in that face's own coordinates —
 * see faceUV — the specular absorbers the SBIR window places). Every bounce
 * keeps (1 − α) of a ray's energy and the air takes `airDb` per metre.
 * A ray that passes within `radius` of the listener is HEARD there, at the
 * distance it has travelled to the nearest point of its pass: its level is
 * that energy over the inverse-square law, relative to the direct sound.
 *
 * Every ray of the same path — the same faces in the same order — is one
 * reflection, so it is kept once, at its strongest. Returns { arrivals:
 * [{ t (ms), level (dB re direct), order, faces, from: { X, Y, Z } (the
 * direction it arrives from, unit) }], traces: [[{ X, Y, Z, order }]] the
 * first `keepTraces` rays' polylines for drawing, rays }.
 */
export function traceRays(dims, src, lis, { dirs, alpha, patches = [], maxRefl = 14, radius = 0.3, c = 343, airDb = 0, keepTraces = 400 } = {}) {
  const lim = { X: dims.W, Y: dims.L, Z: dims.H };
  const val = (v) => (typeof v === 'string' ? dims[v] : v);
  const d0 = Math.max(0.05, Math.hypot(lis.X - src.X, lis.Y - src.Y, lis.Z - src.Z));
  const best = new Map();
  const traces = [];
  for (let ri = 0; ri < dirs.length; ri++) {
    let p = { ...src };
    let d = { ...dirs[ri] };
    let travelled = 0;
    let keep = 1;
    const faces = [];
    const poly = ri < keepTraces ? [{ ...p, order: 0 }] : null;
    for (let order = 0; order <= maxRefl; order++) {
      // where this leg ends: the nearest face ahead
      let tHit = Infinity;
      let hit = null;
      for (const [name, k, at] of FACE_PLANES) {
        const plane = val(at);
        if (Math.abs(d[k]) < 1e-12) continue;
        const t = (plane - p[k]) / d[k];
        if (t > 1e-9 && t < tHit) {
          tHit = t;
          hit = { name, k };
        }
      }
      if (!hit) break;
      // does this leg pass the listener?
      const w = { X: lis.X - p.X, Y: lis.Y - p.Y, Z: lis.Z - p.Z };
      const s = w.X * d.X + w.Y * d.Y + w.Z * d.Z;
      if (s > 0 && s < tHit) {
        const miss = Math.hypot(w.X - s * d.X, w.Y - s * d.Y, w.Z - s * d.Z);
        if (miss <= radius) {
          const dist = Math.max(travelled + s, 0.05);
          const e = (keep * 10 ** ((-airDb * dist) / 10)) / (dist * dist);
          const key = faces.join('>');
          const prev = best.get(key);
          if (!prev || e > prev.e) best.set(key, { e, dist, order, faces: [...faces], from: { X: -d.X, Y: -d.Y, Z: -d.Z } });
        }
      }
      p = { X: p.X + tHit * d.X, Y: p.Y + tHit * d.Y, Z: p.Z + tHit * d.Z };
      p[hit.k] = Math.min(lim[hit.k], Math.max(0, p[hit.k]));
      travelled += tHit;
      if (poly) poly.push({ ...p, order });
      if (order === maxRefl) break;
      d[hit.k] = -d[hit.k];
      const [pu, pv] = faceUV(hit.name, p);
      const patch = patches.find((q) => q.face === hit.name && pu >= q.u0 && pu <= q.u1 && pv >= q.v0 && pv <= q.v1);
      keep *= 1 - (patch ? patch.alpha : alpha[hit.name] ?? 0);
      faces.push(hit.name);
      if (keep < 1e-9) break;
    }
    if (poly) traces.push(poly);
  }
  const eDirect = 10 ** ((-airDb * d0) / 10) / (d0 * d0);
  const arrivals = [...best.values()]
    .map((a) => ({ t: (a.dist / c) * 1000, level: 10 * Math.log10(a.e / eDirect), order: a.order, faces: a.faces, from: a.from }))
    .sort((a, b) => a.t - b.t);
  return { arrivals, traces, rays: dirs.length };
}

/** A point's coordinates on a face: side walls u = Y, v = Z; front and back u = X, v = Z; floor and ceiling u = X, v = Y. */
export function faceUV(face, P) {
  if (face === 'left' || face === 'right') return [P.Y, P.Z];
  if (face === 'front' || face === 'back') return [P.X, P.Z];
  return [P.X, P.Y];
}

/** A speaker's axis frame: forward toward the listener, right, up — and the rays turned into the room's X, Y, Z. */
export function raysToward(src, lis, local) {
  const f = norm({ X: lis.X - src.X, Y: lis.Y - src.Y, Z: lis.Z - src.Z });
  // right of forward, level: forward × up(0,0,1), seen with Y increasing toward the back
  let r = norm({ X: -f.Y, Y: f.X, Z: 0 });
  if (!Number.isFinite(r.X)) r = { X: 1, Y: 0, Z: 0 };
  const u = { X: r.Y * f.Z - r.Z * f.Y, Y: r.Z * f.X - r.X * f.Z, Z: r.X * f.Y - r.Y * f.X };
  return local.map((d) => norm({ X: d.f * f.X + d.r * r.X + d.u * u.X, Y: d.f * f.Y + d.r * r.Y + d.u * u.Y, Z: d.f * f.Z + d.r * r.Z + d.u * u.Z }));
}

const norm = (v) => {
  const n = Math.hypot(v.X, v.Y, v.Z);
  return { X: v.X / n, Y: v.Y / n, Z: v.Z / n };
};

/**
 * Energy by direction in plan: the arrivals summed into `bins` sectors by the
 * bearing they come FROM (0° straight ahead toward the front wall, clockwise),
 * in dB re the strongest sector. The two circles the original draws are 0 and
 * −10 dB.
 */
export function polarEnergy(arrivals, bins = 36) {
  const e = new Array(bins).fill(0);
  for (const a of arrivals) {
    const brg = (Math.atan2(a.from.X, -a.from.Y) / DEG + 360) % 360;
    e[Math.floor(brg / (360 / bins)) % bins] += 10 ** (a.level / 10);
  }
  const max = Math.max(...e);
  return e.map((x) => (x > 0 ? 10 * Math.log10(x / max) : -Infinity));
}

/**
 * The figures the Ray Tracing Data View lists: volume, surface, mean α,
 * Sabine RT60, mean free path 4V/S, room constant R = Sᾱ/(1 − ᾱ), critical
 * distance 0.141·√(Q·R), and the number of reflections a ray must be followed
 * for to track `follow` (a fraction) of the reverberation time — one per mean
 * free path.
 */
export function roomFigures({ V, S, abar, Q = 2, follow = 0.5, c = 343 }) {
  const a = Math.min(0.99, Math.max(1e-4, abar));
  const rt = (0.161 * V) / (S * a);
  const mfp = (4 * V) / S;
  const R = (S * a) / (1 - a);
  return { V, S, abar: a, rt60: rt, mfp, R, dc: 0.141 * Math.sqrt(Q * R), prefReflections: Math.ceil((follow * rt * c) / mfp) };
}

/** The comb filter of a reflection `dt` seconds behind the direct sound: first null 1/2dt, then every 1/dt. */
export function combNulls(dt, n = 3) {
  if (!(dt > 0)) return { first: NaN, spacing: NaN, nulls: [] };
  return { first: 1 / (2 * dt), spacing: 1 / dt, nulls: Array.from({ length: n }, (_, k) => (2 * k + 1) / (2 * dt)) };
}

// ------------------------------------------------------------------ reverb

/**
 * Reverb time from a MEASURED empty room: the measurement fixes the room's
 * own absorption A₀ = 0.161·V / T₀ (air included, so none is added), and
 * each treatment then changes it by its area × (α_new − α of what it covers).
 * `added`: [{ alpha: [6], area, under?: [6] }]. Returns six seconds.
 */
export function rtFromMeasured(V, measured, added = []) {
  return measured.map((t0, b) => {
    let A = (0.161 * V) / Math.max(t0, 1e-3);
    for (const x of added) A += x.area * (x.alpha[b] - (x.under?.[b] ?? 0));
    return (0.161 * V) / Math.max(A, 1e-3);
  });
}

/**
 * The area optimiser: try every combination of areas for up to five
 * variable materials (begin … end by step each) and keep the one whose
 * reverb time is closest to the target over all six bands — the sum of
 * squared relative errors. `rtOf(areas)` computes the six times for one
 * combination; the caller decides the formula. Returns { areas, rt, cost,
 * tried }, or null when there is nothing to vary.
 */
export function optimiseAreas(vars, target, rtOf, { maxCombos = 200000 } = {}) {
  const use = vars.slice(0, 5);
  if (!use.length) return null;
  const lists = use.map((v) => {
    const out = [];
    for (let a = v.begin; a <= v.end + 1e-9; a += Math.max(v.step, 1e-6)) out.push(+a.toFixed(6));
    return out.length ? out : [v.begin];
  });
  const total = lists.reduce((n, l) => n * l.length, 1);
  if (total > maxCombos) throw new Error(`${total} combinations is too many — widen a step`);
  let best = null;
  const idx = new Array(lists.length).fill(0);
  for (let n = 0; n < total; n++) {
    const areas = idx.map((i, k) => lists[k][i]);
    const rt = rtOf(areas);
    const cost = rt.reduce((s, t, b) => s + ((t - target[b]) / target[b]) ** 2, 0);
    if (!best || cost < best.cost) best = { areas, rt, cost };
    for (let k = 0; k < idx.length; k++) {
      if (++idx[k] < lists[k].length) break;
      idx[k] = 0;
    }
  }
  return { ...best, tried: total };
}

// ------------------------------------------------------------------ calculator

/** Level at d2 from a level at d1: a point source loses 20·log, a line source 10·log, per distance ratio. */
export function inverseSquare(l1, d1, d2, wave = 'spherical') {
  return l1 - (wave === 'cylindrical' ? 10 : 20) * Math.log10(d2 / d1);
}

/**
 * Levels added: 'energy' (uncorrelated sources — 10·log of the summed
 * powers, 90 + 90 = 93 dB) or 'pressure' (the same signal in phase —
 * 20·log of the summed pressures, 90 + 90 = 96 dB).
 */
export function addLevels(levels, kind = 'energy') {
  const k = kind === 'pressure' ? 20 : 10;
  const s = levels.filter(Number.isFinite).reduce((t, l) => t + 10 ** (l / k), 0);
  return s > 0 ? k * Math.log10(s) : -Infinity;
}

/** Units the calculator converts, metric ↔ imperial: [id, metric unit, imperial unit, metric per imperial]. */
export const UNITS = [
  ['length', 'm', 'ft', 0.3048],
  ['short length', 'mm', 'in', 25.4],
  ['area', 'm²', 'ft²', 0.09290304],
  ['volume', 'm³', 'ft³', 0.028316846592],
  ['absorption', 'metric sabin (m²)', 'sabin (ft²)', 0.09290304],
  ['speed', 'm/s', 'ft/s', 0.3048],
  ['mass', 'kg', 'lb', 0.45359237],
  ['surface density', 'kg/m²', 'lb/ft²', 4.882427636],
  ['pressure', 'Pa', 'psi', 6894.757293],
];

/** Convert `v` along UNITS row `id`: 'toMetric' from imperial, 'toImperial' from metric. Temperatures are handled apart. */
export function convert(id, v, dir = 'toMetric') {
  if (id === 'temperature') return dir === 'toMetric' ? ((v - 32) * 5) / 9 : (v * 9) / 5 + 32;
  const row = UNITS.find((u) => u[0] === id);
  if (!row) return NaN;
  return dir === 'toMetric' ? v * row[3] : v / row[3];
}
