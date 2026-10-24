// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';
import { energyAt, modalDb, prepare, prepareModal, waveDb } from '../acoustics/field.js';
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

/** The modal method is a low-frequency model: above this it shows the field at this frequency instead. */
export const MODAL_MAX = 1000;

export function runJob({ room, speakers, mics, settings, grids, monitorId }) {
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
    response = {
      freqs: RESPONSE_FREQS,
      wave: RESPONSE_FREQS.map((f) => waveDb(prep, monitor, f, monitor)),
      modal: RESPONSE_FREQS.map((f) => (f <= fModalMax ? modalDb(room, prepareModal(room, speakers, f), monitor) : NaN)),
      energy: BANDS.map((_, b) => energyAt(room, prep, monitor, b, monitor)),
    };
  }
  return { values, reports, response };
}
