// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';
import { energyAt, modalDb, prepare, prepareModal, waveDb } from '../acoustics/field.js';
import { isListener } from '../acoustics/devices.js';
import { micReport } from '../acoustics/analysis.js';
import { schroeder } from '../acoustics/room.js';
import { gridPoints } from './grids.js';

/**
 * ONE JOB: EVERYTHING THE VIEWS AND METERS SHOW, FOR ONE STATE OF THE ROOM
 *
 * Runs in the worker (fieldWorker.js) and, if a worker cannot start, on the
 * page. Input and output are plain data so either side can hold them.
 */

/** 1/24 octave, 20 Hz to the top of the slider: fine enough that a notch between two points is not missed. */
export const F_MIN = 20;
export const F_MAX = 17000;
export const RESPONSE_FREQS = Array.from({ length: 240 }, (_, i) => F_MIN * 2 ** (i / 24)).filter((f) => f <= F_MAX);

/**
 * The response's frequencies for a graph `points` wide: log-spaced, 20 Hz to the top, one per point, never coarser
 * than 1/24 octave. A graph popped out across a big screen gets as many as it has pixels to show (meters.js asks).
 */
export function responseFreqs(points = 0) {
  const n = Math.max(RESPONSE_FREQS.length, Math.min(2400, Math.round(points) || 0));
  if (n === RESPONSE_FREQS.length) return RESPONSE_FREQS;
  const span = Math.log(F_MAX / F_MIN);
  return Array.from({ length: n }, (_, i) => F_MIN * Math.exp((span * i) / (n - 1)));
}

/** A modal room is rebuilt per frequency, so a fine response reads it at 1/48 octave at most and draws straight between. */
const MODAL_STEP_OCT = 1 / 48;
function modalCurve(room, speakers, monitor, freqs, fMax) {
  const out = freqs.map(() => NaN);
  let lastLog = -Infinity;
  const at = [];
  freqs.forEach((f, i) => {
    if (f > fMax) return;
    const lf = Math.log2(f);
    if (lf - lastLog < MODAL_STEP_OCT * 0.999 && freqs[i + 1] <= fMax) return;
    lastLog = lf;
    out[i] = modalDb(room, prepareModal(room, speakers, f), monitor);
    at.push(i);
  });
  for (let k = 1; k < at.length; k++) {
    const [i, j] = [at[k - 1], at[k]];
    for (let m = i + 1; m < j; m++) {
      const t = Math.log(freqs[m] / freqs[i]) / Math.log(freqs[j] / freqs[i]);
      out[m] = out[i] + (out[j] - out[i]) * t;
    }
  }
  return out;
}

/** The modal method is a low-frequency model: above this it shows the field at this frequency instead. */
export const MODAL_MAX = 1000;

export function runJob({ room, speakers, mics, settings, grids, monitorId, responsePoints }) {
  const prep = prepare(room, speakers, { maxOrder: settings.maxOrder });
  const modal = room && speakers.length ? prepareModal(room, speakers, Math.min(settings.freq, MODAL_MAX)) : null;
  const sample = (pt) => {
    if (!speakers.length) return NaN;
    if (settings.method === 'energy') return energyAt(room, prep, pt, settings.band).total;
    if (settings.method === 'modal') return modalDb(room, modal, pt);
    return waveDb(prep, pt, settings.freq);
  };
  const fill = (g) => {
    const pts = gridPoints(room, g);
    const out = new Float32Array(pts.length / 3);
    const pt = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < out.length; i++) {
      pt.x = pts[i * 3];
      pt.y = pts[i * 3 + 1];
      pt.z = pts[i * 3 + 2];
      out[i] = Number.isNaN(pt.x) ? NaN : sample(pt);
    }
    return out;
  };

  const values = {
    plan: fill(grids.plan),
    floor: fill(grids.floor),
    ceiling: fill(grids.ceiling),
    walls: grids.walls.map(fill),
  };

  const reports = {};
  for (const mic of mics) if (speakers.length) reports[mic.id] = micReport(room, prep, modal, mic, settings);

  let response = null;
  const monitor = mics.find((m) => m.id === monitorId);
  if (monitor && speakers.length) {
    const fModalMax = Math.min(MODAL_MAX, Math.max(200, schroeder(room) * 1.5));
    const seats = roomSeats(mics);
    const freqs = responseFreqs(responsePoints);
    response = {
      freqs,
      wave: freqs.map((f) => waveDb(prep, monitor, f, monitor)),
      modal: modalCurve(room, speakers, monitor, freqs, fModalMax),
      energy: BANDS.map((_, b) => energyAt(room, prep, monitor, b, monitor)),
      // the whole room: every seat's wave response, power-averaged by tier — one seat alone is not the room
      room: seats.length > 1 ? freqs.map((f) => powerMean(seats.map((m) => waveDb(prep, m, f, m)), seats.map(seatWeight))) : null,
      seats: seats.length,
    };
  }
  return { values, reports, response };
}

/** The seats that make up "the room": the listeners, or every mic when none is a listener. */
export const roomSeats = (mics) => (mics.some(isListener) ? mics.filter(isListener) : mics);

/** How much a seat counts in the room's average: its tier's weight, the mix seat never under 2 (as the sub designer weighs them). */
export const seatWeight = (m) => Math.max(m.weight ?? 1, m.mix ? 2 : 1);

/** dB levels averaged as power, optionally weighted: two seats at 100 and 80 dB average 97, not 90. */
export function powerMean(dbs, weights = dbs.map(() => 1)) {
  let sum = 0;
  let total = 0;
  dbs.forEach((d, i) => {
    if (!Number.isFinite(d)) return;
    sum += weights[i] * 10 ** (d / 10);
    total += weights[i];
  });
  return total ? 10 * Math.log10(sum / total) : NaN;
}
