// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { AIR_DB_PER_M, BANDS, C } from './bands.js';
import { MOUNTS, sourceDb } from './devices.js';
import { deviceGain, directivityQ, frame, patternWeight } from './patterns.js';
import { imageReaches, roomImages } from './images.js';

/**
 * THREE WAYS TO ASK WHAT A POINT HEARS
 *
 * Borrowed as an idea from CHORAS (choras-org, GPL — no code taken): one room,
 * several methods behind one door, so they can be laid side by side and
 * disagree in the open.
 *
 *   wave      image sources summed WITH PHASE at one frequency. Interference,
 *             comb filtering, SBIR notches and boundary gain all fall out of
 *             it. What the surfaces in a Treble/Dolby render look like.
 *   energy    direct sound per octave band plus a diffuse reverberant field
 *             (Hopkins–Stryker, 4/R). Smooth: coverage, not interference.
 *   modal     the room's own modes summed at one frequency (rectangle, or the
 *             working-space box). Truest below the Schroeder frequency, where
 *             the other two are least so.
 *
 * Every level is dB SPL. A speaker radiates sourceDb() on axis at 1 m: its
 * level (set, or from sensitivity and watts) through its frequency range.
 *
 * SCATTERING (images.js) reaches the three differently. The wave sum reads
 * img.amp, the SPECULAR part (1 − α)(1 − s) per bounce, so a diffuser takes
 * its wall out of the interference pattern; the energy it scatters is
 * incoherent and has no phase to add, so the wave method leaves it out (the
 * echogram keeps it — analysis.js). The energy method's 4/R depends on
 * absorption alone: scattering changes when energy arrives, not how much is
 * left, so energyAt is the same with or without it. The modal sum is the
 * rigid box's and knows no s.
 */

export function nearestBand(freq) {
  let best = 0;
  for (let i = 1; i < BANDS.length; i++) if (Math.abs(Math.log(freq / BANDS[i])) < Math.abs(Math.log(freq / BANDS[best]))) best = i;
  return best;
}

/** Everything per speaker that does not depend on the listening point. */
export function prepare(room, speakers, opts) {
  return speakers.map((s) => {
    const spk = { ...s, _frame: frame(s.aim, s.tilt) };
    return { spk, images: roomImages(room, spk, opts.maxOrder) };
  });
}

/** The boundary gain of a flush or corner mount: only where the box radiates as a point source, below its omniBelow (devices.js). */
export function mountGainDb(spk, freq) {
  return freq <= (spk.omniBelow ?? 250) ? (MOUNTS[spk.mount]?.gainDb ?? 0) : 0;
}

/** Complex pressure sum at `pt` for one frequency: { re, im } in pascals re 20 µPa scale. */
export function waveAt(prep, pt, freq, mic = null) {
  const k = (2 * Math.PI * freq) / C;
  const w = 2 * Math.PI * freq;
  const band = nearestBand(freq);
  const airDb = AIR_DB_PER_M[band];
  let re = 0;
  let im = 0;
  for (const { spk, images } of prep) {
    const level = 10 ** (sourceDb(spk, freq) / 20);
    if (level < 1e-6) continue;
    // polarity flipped at the monitor controller: the same pressure, upside down
    const A = spk.invert ? -level : level;
    const tau = (spk.delayMs || 0) / 1000;
    // Below its omniBelow the box is a point source: no pattern to evaluate.
    const omni = spk.pattern === 'omni' || patternWeight(freq, spk.omniBelow) === 0;
    for (const img of images) {
      if ((img.top || img.shadows) && !imageReaches(img, pt)) continue;
      const dx = pt.x - img.x;
      const dy = pt.y - img.y;
      const dz = pt.z - img.z;
      const r = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.05);
      let g = 0;
      if (!omni) {
        const [a, b, c, d] = img.M;
        g = deviceGain(spk, [a * dx + c * dy, b * dx + d * dy, dz * img.zSign], freq);
      }
      if (mic) g += deviceGain(mic, [-dx, -dy, -dz], freq);
      const amp = ((g || airDb ? A * 10 ** ((g - airDb * r) / 20) : A) * img.amp[band]) / r;
      const ph = -k * r - w * tau;
      re += amp * Math.cos(ph);
      im += amp * Math.sin(ph);
    }
  }
  return { re, im };
}

export function waveDb(prep, pt, freq, mic = null) {
  const { re, im } = waveAt(prep, pt, freq, mic);
  return 10 * Math.log10(re * re + im * im + 1e-12);
}

/** Direct + reverberant energy in one octave band: { direct, reverb, total } dB. R is absorption-only, so s does not enter (see the header). */
export function energyAt(room, prep, pt, band, mic = null) {
  const freq = BANDS[band];
  const airDb = AIR_DB_PER_M[band];
  const R = room.perBand[band].R;
  const qMic = mic ? directivityQ(mic, freq) : 1;
  let eD = 0;
  let eR = 0;
  for (const { spk } of prep) {
    const base = sourceDb(spk, freq) + mountGainDb(spk, freq);
    const dir = [pt.x - spk.x, pt.y - spk.y, pt.z - spk.z];
    const r = Math.max(Math.hypot(...dir), 0.05);
    let g = deviceGain(spk, dir, freq);
    if (mic) g += deviceGain(mic, [-dir[0], -dir[1], -dir[2]], freq);
    eD += 10 ** ((base + g - 20 * Math.log10(r) - airDb * r) / 10);
    const Q = cachedQ(spk, freq);
    const Lw = base - 10 * Math.log10(Q / (4 * Math.PI));
    eR += 10 ** ((Lw + 10 * Math.log10(4 / R)) / 10) / qMic;
  }
  const db = (e) => (e > 0 ? 10 * Math.log10(e) : -Infinity);
  return { direct: db(eD), reverb: db(eR), total: db(eD + eR) };
}

const qCache = new Map();
export function cachedQ(dev, freq) {
  const key = `${dev.pattern}|${dev.hCov}|${dev.vCov}|${dev.omniBelow}|${freq}`;
  let q = qCache.get(key);
  if (q === undefined) {
    q = directivityQ(dev, freq);
    qCache.set(key, q);
  }
  return q;
}

/**
 * Modal sum in the working-space box (front-frame coordinates), damped by
 * the Eyring RT of the nearest band. Sources are taken as omni — below the
 * Schroeder frequency, where this method is meant to be read, they are.
 * Scaled so a single source far from any mode reads close to its free field.
 */
export function prepareModal(room, speakers, freq) {
  const { L, W, H } = room;
  const band = nearestBand(freq);
  const delta = 6.91 / room.perBand[band].eyring;
  const w = 2 * Math.PI * freq;
  const fMax = Math.max(freq * 1.6, freq + 80);
  const modes = [];
  const maxN = (len) => Math.min(40, Math.floor((2 * len * fMax) / C));
  for (let nx = 0; nx <= maxN(L); nx++)
    for (let ny = 0; ny <= maxN(W); ny++)
      for (let nz = 0; nz <= maxN(H); nz++) {
        const fn = (C / 2) * Math.hypot(nx / L, ny / W, nz / H);
        if (fn > fMax) continue;
        const wn = 2 * Math.PI * fn;
        const lam = (nx ? 0.5 : 1) * (ny ? 0.5 : 1) * (nz ? 0.5 : 1);
        const dr = wn * wn - w * w;
        const di = 2 * delta * w;
        const den = room.V * lam * (dr * dr + di * di);
        let sr = 0;
        let si = 0;
        for (const s of speakers) {
          const q = toBox(room, s);
          // heights from the floor, as modalDb measures the receiver's
          const psi = Math.cos((nx * Math.PI * q.u) / L) * Math.cos((ny * Math.PI * q.v) / W) * Math.cos((nz * Math.PI * (s.z - (room.zFloor ?? 0))) / H);
          const A = (s.invert ? -1 : 1) * 10 ** (sourceDb(s, freq) / 20);
          const ph = -w * ((s.delayMs || 0) / 1000);
          sr += A * psi * Math.cos(ph);
          si += A * psi * Math.sin(ph);
        }
        // (sr + j·si) / (dr + j·di), by the conjugate
        modes.push({ nx, ny, nz, re: (sr * dr + si * di) / den, im: (si * dr - sr * di) / den });
      }
  return { modes, scale: 4 * Math.PI * C * C, L, W, H };
}

function toBox(room, p) {
  const { f, r } = room.frame;
  return { u: room.frame.front - (p.x * f.x + p.y * f.y), v: p.x * r.x + p.y * r.y - room.frame.left };
}

/**
 * The modes packed flat, for modalDb: their indices and complex weights in
 * typed arrays, and the highest index along each axis. Made once per prepareModal.
 */
function packModes(mp) {
  const n = mp.modes.length;
  const p = { n, nx: new Uint8Array(n), ny: new Uint8Array(n), nz: new Uint8Array(n), re: new Float64Array(n), im: new Float64Array(n), top: [0, 0, 0] };
  mp.modes.forEach((m, i) => {
    p.nx[i] = m.nx;
    p.ny[i] = m.ny;
    p.nz[i] = m.nz;
    p.re[i] = m.re;
    p.im[i] = m.im;
    p.top = [Math.max(p.top[0], m.nx), Math.max(p.top[1], m.ny), Math.max(p.top[2], m.nz)];
  });
  return p;
}

/** cos(k·π·x) for k = 0 … top, into `out`. */
function cosines(out, top, x) {
  for (let k = 0; k <= top; k++) out[k] = Math.cos(k * Math.PI * x);
  return out;
}
// an index is at most 40 (prepareModal maxN): one table per axis, reused point after point
const CX = new Float64Array(41);
const CY = new Float64Array(41);
const CZ = new Float64Array(41);

export function modalDb(room, mp, pt) {
  const q = toBox(room, pt);
  // a mode's shape is a product of three cosines, each taking one of a few dozen values at this point: tabled, not recomputed per mode
  const p = (mp.packed ??= packModes(mp));
  const cx = cosines(CX, p.top[0], q.u / mp.L);
  const cy = cosines(CY, p.top[1], q.v / mp.W);
  const cz = cosines(CZ, p.top[2], (pt.z - (room.zFloor ?? 0)) / mp.H);
  let re = 0;
  let im = 0;
  for (let i = 0; i < p.n; i++) {
    const psi = cx[p.nx[i]] * cy[p.ny[i]] * cz[p.nz[i]];
    re += p.re[i] * psi;
    im += p.im[i] * psi;
  }
  re *= mp.scale;
  im *= mp.scale;
  return 10 * Math.log10(re * re + im * im + 1e-12);
}
