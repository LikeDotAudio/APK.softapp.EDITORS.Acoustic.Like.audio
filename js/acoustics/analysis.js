// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { AIR_DB_PER_M, BANDS, C } from './bands.js';
import { sourceDb } from './devices.js';
import { deviceGain } from './patterns.js';
import { imageReaches } from './images.js';
import { cachedQ, energyAt, modalDb, mountGainDb, waveDb } from './field.js';

/**
 * WHAT ONE MICROPHONE HEARS
 *
 * The echogram is the energy-time picture a measurement would give: every
 * image source as a discrete arrival, then a diffuse tail decaying at the
 * room's Eyring RT, picking up where the images stop. From it, the ISO 3382-1
 * parameters — EDT, T20, T30, C50, C80, D50 and centre time Ts — the same set
 * CHORAS and every measurement suite reports, so a number here can be read
 * against one from there.
 *
 * DIFFUSE RAIN. Image sources are specular only (images.js): a path that met
 * a surface with scattering s kept (1 − α)(1 − s) of the energy, and the
 * (1 − α)·s it scattered is still in the room — scattering moves energy, only
 * absorption removes it. So each arrival also pays out its scattered energy
 *
 *   E_scat = E_mirror − E_spec = E_mirror · scatterLoss
 *
 * (E_mirror: what the same path would bring if every surface were a mirror —
 * same spreading, directivity and air loss, reflAbs instead of refl) as a
 * diffuse tail that starts at its own arrival time and decays at the room's
 * Eyring rate k = 13.8155 / T:
 *
 *   e(t) = E_scat · k · exp(−k (t − t_n)),   t ≥ t_n
 *
 * — the "secondary sources / diffuse rain" idea of the hybrid ray tracers,
 * made statistical: the scattered energy reaches the mic later and spread out,
 * by way of the rest of the room, instead of as one spike. It integrates to
 * exactly E_scat, so the echogram's total energy does not change with s, and
 * it decays at the Eyring rate, so neither does T30. What moves is WHEN the
 * energy arrives: early specular energy becomes tail, so C50, C80 and D50 fall
 * and Ts and EDT rise as surfaces scatter more. The 4/R reverberant field
 * (energyAt, and the late tail here) depends on absorption alone and is left
 * as it was.
 *
 * THE LATE TAIL is the reverberant field's own decay counted from the direct
 * sound, eRev·k·e^(−k(t − tD)), drawn only from where the images stop: the
 * images up to that time ARE its early part, so the tail carries the share of
 * 4/R that is left after them — not all of it again. Its level carries the
 * mount's boundary gain, as energyAt's reverberant field does; the discrete
 * arrivals get theirs from the image sources themselves (devices.js).
 *
 * `tail` is everything diffuse — the late tail plus the scattered energy — so
 * the meter and the auralisation draw and play it without knowing the split;
 * `late` and `diffuse` keep the two parts apart for anyone who wants them.
 */

export const ECHO_DT = 0.0005;

export function echogram(room, prep, mic, band) {
  const freq = BANDS[band];
  const airDb = AIR_DB_PER_M[band];
  const arrivals = [];
  let eRev = 0;
  let eSpec = 0;
  let eScat = 0;
  const qMic = cachedQ(mic, freq);
  for (const { spk, images } of prep) {
    const L0 = sourceDb(spk, freq);
    const delay = (spk.delayMs || 0) / 1000;
    for (const img of images) {
      if ((img.top || img.shadows) && !imageReaches(img, mic)) continue;
      const dx = mic.x - img.x;
      const dy = mic.y - img.y;
      const dz = mic.z - img.z;
      const r = Math.max(Math.hypot(dx, dy, dz), 0.05);
      const [a, b, c, d] = img.M;
      const g = deviceGain(spk, [a * dx + c * dy, b * dx + d * dy, dz * img.zSign], freq) + deviceGain(mic, [-dx, -dy, -dz], freq);
      const L = L0 + g - 20 * Math.log10(r) - airDb * r + 10 * Math.log10(img.refl[band]);
      const energy = 10 ** (L / 10);
      // E_mirror · scatterLoss, written from E_spec so a 0 dB arrival stays exact: E_mirror = E_spec / (1 − scatterLoss)
      const sl = img.scatterLoss?.[band] ?? 0;
      const scattered = sl > 0 ? (sl < 1 ? (energy * sl) / (1 - sl) : 0) : 0;
      eSpec += energy;
      eScat += scattered;
      arrivals.push({ t: r / C + delay, level: L, energy, scattered, order: img.order, speaker: spk.id, img });
    }
    const Q = cachedQ(spk, freq);
    eRev += 10 ** ((L0 + mountGainDb(spk, freq) - 10 * Math.log10(Q / (4 * Math.PI)) + 10 * Math.log10(4 / room.perBand[band].R)) / 10) / qMic;
  }
  arrivals.sort((p, q) => p.t - q.t);
  const T = room.perBand[band].eyring;
  const k = 13.8155 / T;
  const tD = arrivals.find((a) => a.order === 0)?.t ?? arrivals[0]?.t ?? 0;
  const tTail = arrivals.length ? arrivals[arrivals.length - 1].t : tD;
  const duration = Math.min(4, tD + 1.4 * T + 0.05);
  const n = Math.ceil(duration / ECHO_DT);
  const bins = new Float64Array(n);
  for (const a of arrivals) {
    const i = Math.floor(a.t / ECHO_DT);
    if (i < n) bins[i] += a.energy;
  }
  const late = new Float64Array(n);
  for (let i = Math.floor(tTail / ECHO_DT); i < n; i++) {
    const t = i * ECHO_DT;
    late[i] = eRev * k * Math.exp(-k * (t - tD)) * ECHO_DT;
  }
  // Diffuse rain as one recursive pass instead of a tail per arrival: an impulse
  // dropped into bin j comes out as E·(1 − ρ)·ρ^(i − j), ρ = e^(−k·dt) — the
  // exponential sampled per bin, and it sums to exactly E.
  const diffuse = new Float64Array(n);
  if (eScat > 0) {
    const drop = new Float64Array(n);
    for (const a of arrivals) {
      const i = Math.floor(a.t / ECHO_DT);
      if (a.scattered > 0 && i < n) drop[i] += a.scattered;
    }
    const rho = Math.exp(-k * ECHO_DT);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = y * rho + drop[i] * (1 - rho);
      diffuse[i] = y;
    }
  }
  const tail = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tail[i] = late[i] + diffuse[i];
    bins[i] += tail[i];
  }
  return { arrivals, bins, tail, late, diffuse, eSpecular: eSpec, eScattered: eScat, tD, T, dt: ECHO_DT };
}

function regressionT(schroederDb, dt, hi, lo) {
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < schroederDb.length; i++) {
    if (i0 < 0 && schroederDb[i] <= hi) i0 = i;
    if (schroederDb[i] <= lo) {
      i1 = i;
      break;
    }
  }
  if (i0 < 0 || i1 <= i0 + 2) return NaN;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  const n = i1 - i0 + 1;
  for (let i = i0; i <= i1; i++) {
    const x = i * dt;
    sx += x;
    sy += schroederDb[i];
    sxx += x * x;
    sxy += x * schroederDb[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope < 0 ? -60 / slope : NaN;
}

export function iso3382(eg) {
  const { bins, tD, dt } = eg;
  const i0 = Math.floor(tD / dt);
  const sch = new Float64Array(bins.length);
  let acc = 0;
  for (let i = bins.length - 1; i >= 0; i--) {
    acc += bins[i];
    sch[i] = acc;
  }
  const total = sch[i0] || 1e-30;
  const sDb = Array.from(sch.slice(i0), (e) => 10 * Math.log10(e / total + 1e-30));
  const upTo = (ms) => total - (sch[i0 + Math.round(ms / 1000 / dt)] ?? 0);
  let ts = 0;
  for (let i = i0; i < bins.length; i++) ts += (i - i0) * dt * bins[i];
  const ratio = (ms) => 10 * Math.log10(upTo(ms) / Math.max(total - upTo(ms), 1e-30));
  return {
    EDT: regressionT(sDb, dt, 0, -10),
    T20: regressionT(sDb, dt, -5, -25),
    T30: regressionT(sDb, dt, -5, -35),
    C50: ratio(50),
    C80: ratio(80),
    D50: upTo(50) / total,
    Ts: (ts / total) * 1000,
    SPL: 10 * Math.log10(total),
  };
}

/** Everything the inspector shows for one mic, all three methods side by side. */
export function micReport(room, prep, modalPrep, mic, settings) {
  const band = settings.band;
  const eg = echogram(room, prep, mic, band);
  const energy = BANDS.map((_, b) => energyAt(room, prep, mic, b, mic));
  const firstReflections = eg.arrivals
    .filter((a) => a.order > 0)
    .slice(0, 12)
    .map((a) => ({ ...a, delayMs: (a.t - eg.tD) * 1000, relDb: a.level - (eg.arrivals.find((d) => d.order === 0 && d.speaker === a.speaker)?.level ?? a.level) }));
  return {
    wave: waveDb(prep, mic, settings.freq, mic),
    modal: modalPrep ? modalDb(room, modalPrep, mic) : NaN,
    energy,
    iso: iso3382(eg),
    echogram: eg,
    firstReflections,
    itdgMs: firstReflections.length ? firstReflections[0].delayMs : NaN,
  };
}

/** Critical distance, m: where direct and reverberant energy are equal. 0.141·√(Q·R) ≈ 0.057·√(Q·V/T60). */
/**
 * LATERAL ENERGY FRACTION (ISO 3382-1 LF) — the measure that goes with
 * apparent source width: of the energy reaching the seat in its first 80 ms,
 * how much arrives from the side between 5 and 80 ms, read as a figure-of-
 * eight microphone would read it with its null on the listener's facing:
 *
 *   LF = Σ(5–80 ms) E·cos²θ / Σ(0–80 ms) E
 *
 * θ the angle between where an arrival comes from and the line through the
 * ears (the listener's aim turned 90°). The specular arrivals bring their own
 * direction; the diffuse tail comes from everywhere, and the mean of cos²θ
 * over a sphere is 1/3. Times are from the first direct arrival.
 */
export function lateralFraction(eg, mic) {
  const a = (mic.aim ?? 90) * (Math.PI / 180);
  const ear = [Math.sin(a), -Math.cos(a), 0];
  const t0 = eg.tD;
  let num = 0;
  let den = 0;
  for (const x of eg.arrivals) {
    const dt = x.t - t0;
    if (dt < -1e-9 || dt > 0.08) continue;
    den += x.energy;
    if (dt < 0.005) continue;
    const d = [x.img.x - mic.x, x.img.y - mic.y, x.img.z - mic.z];
    const r = Math.hypot(...d) || 1;
    const c = (d[0] * ear[0] + d[1] * ear[1] + d[2] * ear[2]) / r;
    num += x.energy * c * c;
  }
  for (let i = 0; i < eg.tail.length; i++) {
    const dt = i * eg.dt - t0;
    if (dt < 0 || dt > 0.08) continue;
    den += eg.tail[i];
    if (dt >= 0.005) num += eg.tail[i] / 3;
  }
  return den > 0 ? num / den : NaN;
}

/**
 * THE REFLECTION-FREE ZONE AT A SEAT: no reflection within `windowMs` of a
 * speaker's direct sound louder than `belowDb` under it (the RFZ design
 * criterion — 20 dB down for the first 20 ms). Per speaker, from the specular
 * arrivals of the echogram; the diffuse tail is not a reflection.
 * { ok, worst: { speaker, order, delayMs, db } | null, count }.
 */
export function reflectionFreeZone(eg, { windowMs = 20, belowDb = -20 } = {}) {
  const direct = new Map();
  for (const x of eg.arrivals) if (x.order === 0 && !direct.has(x.speaker)) direct.set(x.speaker, x);
  let worst = null;
  let count = 0;
  for (const x of eg.arrivals) {
    const d = direct.get(x.speaker);
    if (!d || x.order === 0) continue;
    const delayMs = (x.t - d.t) * 1000;
    if (delayMs < 0 || delayMs > windowMs) continue;
    const db = x.level - d.level;
    if (db > belowDb) count++;
    if (!worst || db > worst.db) worst = { speaker: x.speaker, order: x.order, delayMs, db };
  }
  return { ok: count === 0, worst, count };
}

export function criticalDistance(room, spk, band) {
  return 0.141 * Math.sqrt(cachedQ(spk, BANDS[band]) * room.perBand[band].R);
}

/**
 * FLUTTER ECHO RISK
 *
 * Two hard, flat, parallel surfaces facing each other trade a sound back and
 * forth at the rate c / 2d — the "zing" of a clap between bare walls. What it
 * needs is the specular round trip to survive: each bounce keeps
 * (1 − α)(1 − s) in the mirror direction, so one there-and-back keeps
 *
 *   score = (1 − α_a)(1 − s_a) · (1 − α_b)(1 − s_b)
 *
 * read at 500 Hz and 1 kHz, where flutter is heard, and reported at the worse
 * of the two. Absorb either side or scatter it and the score collapses — both
 * are cures, which is the point of the number.
 *
 * Walls count as a pair when their inward normals are opposed within `tolDeg`
 * and they overlap by at least `minOverlap` m seen along each other — a splay
 * walks the echo off the pair and is itself the cure. How much splay is
 * enough is the literature's figure: 1 in 20 to 1 in 10, so the pair is cured
 * from 1 in 20 (SPLAY_CURE_DEG, 2.86°) on. Floor and ceiling are a pair in a flat room; under a drawn slope
 * (room.sloped) they are not taken as parallel.
 *
 * Returns [{ a, b, band, score, distance, rateHz }] (keys as room.surfaces
 * uses them: 'floor', 'ceiling', 'wall:i'), worst first, score ≥ threshold.
 */
export const FLUTTER_BANDS = [2, 3];

/** The least splay that cures flutter, degrees: 1 in 20. */
export const SPLAY_CURE_DEG = Math.atan(1 / 20) * (180 / Math.PI);

export function flutterRisk(room, { threshold = 0.5, tolDeg = SPLAY_CURE_DEG, minOverlap = 0.5 } = {}) {
  const cosTol = Math.cos((tolDeg * Math.PI) / 180);
  const worst = (ma, mb) => {
    let best = { band: FLUTTER_BANDS[0], score: -1 };
    for (const b of FLUTTER_BANDS) {
      const score = (1 - ma.alpha[b]) * (1 - (ma.scatter?.[b] ?? 0)) * (1 - mb.alpha[b]) * (1 - (mb.scatter?.[b] ?? 0));
      if (score > best.score) best = { band: b, score };
    }
    return best;
  };
  const out = [];
  const add = (a, b, ma, mb, distance) => {
    const w = worst(ma, mb);
    if (w.score >= threshold) out.push({ a, b, band: w.band, score: w.score, distance, rateHz: C / (2 * distance) });
  };
  const ws = room.walls;
  for (let i = 0; i < ws.length; i++)
    for (let j = i + 1; j < ws.length; j++) {
      const A = ws[i];
      const B = ws[j];
      // splayed by tolDeg or more: cured (the 1e-12 keeps an exact 1 in 20 on the cured side of the rounding)
      if (A.nIn.x * B.nIn.x + A.nIn.y * B.nIn.y >= -cosTol - 1e-12) continue;
      // B must stand in front of A (and so A in front of B, the normals being opposed)
      const mid = { x: (B.a.x + B.b.x) / 2, y: (B.a.y + B.b.y) / 2 };
      const d = (mid.x - A.a.x) * A.nIn.x + (mid.y - A.a.y) * A.nIn.y;
      if (!(d > 0.05)) continue;
      const along = (p) => (p.x - A.a.x) * A.t.x + (p.y - A.a.y) * A.t.y;
      const u0 = Math.min(along(B.a), along(B.b));
      const u1 = Math.max(along(B.a), along(B.b));
      if (Math.min(A.len, u1) - Math.max(0, u0) < minOverlap) continue;
      add(`wall:${A.i}`, `wall:${B.i}`, A.material, B.material, d);
    }
  if (!room.sloped && room.floor && room.ceiling) add('floor', 'ceiling', room.floor, room.ceiling, room.H);
  return out.sort((p, q) => q.score - p.score);
}
