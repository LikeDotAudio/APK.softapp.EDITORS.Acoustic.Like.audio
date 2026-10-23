// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { AIR_DB_PER_M, BANDS, C } from './bands.js';
import { lowpassGain } from './devices.js';
import { deviceGain } from './patterns.js';
import { cachedQ, energyAt, modalDb, waveDb } from './field.js';

/**
 * WHAT ONE MICROPHONE HEARS
 *
 * The echogram is the energy-time picture a measurement would give: every
 * image source as a discrete arrival, then a diffuse tail decaying at the
 * room's Eyring RT, picking up where the images stop. From it, the ISO 3382-1
 * parameters — EDT, T20, T30, C50, C80, D50 and centre time Ts — the same set
 * CHORAS and every measurement suite reports, so a number here can be read
 * against one from there.
 */

export const ECHO_DT = 0.0005;

export function echogram(room, prep, mic, band) {
  const freq = BANDS[band];
  const airDb = AIR_DB_PER_M[band];
  const arrivals = [];
  let eRev = 0;
  const qMic = cachedQ(mic, freq);
  for (const { spk, images } of prep) {
    const lp = 20 * Math.log10(lowpassGain(freq, spk.lowpass));
    const delay = (spk.delayMs || 0) / 1000;
    for (const img of images) {
      const dx = mic.x - img.x;
      const dy = mic.y - img.y;
      const dz = mic.z - img.z;
      const r = Math.max(Math.hypot(dx, dy, dz), 0.05);
      const [a, b, c, d] = img.M;
      const g = deviceGain(spk, [a * dx + c * dy, b * dx + d * dy, dz * img.zSign], freq) + deviceGain(mic, [-dx, -dy, -dz], freq);
      const L = spk.level + lp + g - 20 * Math.log10(r) - airDb * r + 10 * Math.log10(img.refl[band]);
      arrivals.push({ t: r / C + delay, level: L, energy: 10 ** (L / 10), order: img.order, speaker: spk.id, img });
    }
    const Q = cachedQ(spk, freq);
    eRev += 10 ** ((spk.level + lp - 10 * Math.log10(Q / (4 * Math.PI)) + 10 * Math.log10(4 / room.perBand[band].R)) / 10) / qMic;
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
  const tail = new Float64Array(n);
  for (let i = Math.floor(tTail / ECHO_DT); i < n; i++) {
    const t = i * ECHO_DT;
    tail[i] = eRev * k * Math.exp(-k * (t - tD)) * ECHO_DT;
    bins[i] += tail[i];
  }
  return { arrivals, bins, tail, tD, T, dt: ECHO_DT };
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
export function criticalDistance(room, spk, band) {
  return 0.141 * Math.sqrt(cachedQ(spk, BANDS[band]) * room.perBand[band].R);
}
