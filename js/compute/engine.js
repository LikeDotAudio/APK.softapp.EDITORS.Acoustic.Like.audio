// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { advise } from '../acoustics/advisor.js';
import { layoutCheck } from '../acoustics/layouts.js';
import { ELEVATION_FACES, elevationFaceOf } from '../acoustics/elevations.js';
import { buildRoom } from '../acoustics/room.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { buildGrids } from './grids.js';
import { runJob } from './compute.js';

/**
 * FROM STATE TO NUMBERS
 *
 * Turns the store into a room (the CAD's chosen loop, in metres, extruded),
 * hands the heavy part to the worker, and keeps the latest answer. Only one
 * job is in flight; a change that lands meanwhile replaces whatever was
 * queued, so dragging a speaker never builds a backlog — the field catches up
 * to where it is, not to everywhere it has been.
 */

/** Every closed loop on the sheet, in metres, largest first; `face` names the elevation a loop's layer holds, or null for the plan. */
export function loopsFromCad(geometry) {
  if (!geometry) return [];
  const k = METRES_PER_UNIT[geometry.units] ?? 1;
  const names = new Map((geometry.layers ?? []).map((l) => [l.id, l.name]));
  return geometry.rooms
    .map((r) => ({ id: r.id, layerId: r.layerId, face: elevationFaceOf(names.get(r.layerId) ?? r.layerId), poly: r.points.map(([x, y]) => ({ x: x * k, y: y * k })) }))
    .map((r) => ({ ...r, area: Math.abs(r.poly.reduce((s, p, i) => { const q = r.poly[(i + 1) % r.poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2) }))
    .filter((r) => r.area > (r.face ? 0.1 : 1))
    .sort((a, b) => b.area - a.area);
}

/** The plan candidates: loops not on an elevation layer. */
export function roomsFromCad(geometry) {
  return loopsFromCad(geometry).filter((r) => !r.face);
}

/** The largest loop on each elevation layer: [{ face, poly }]. */
export function elevationsFromCad(geometry) {
  const loops = loopsFromCad(geometry);
  return ELEVATION_FACES.map((face) => loops.find((r) => r.face === face)).filter(Boolean).map((r) => ({ face: r.face, poly: r.poly }));
}

export function createEngine(store, onResult) {
  let worker = null;
  try {
    worker = new Worker(new URL('./fieldWorker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  let seq = 0;
  let busy = false;
  let queued = null;
  const out = { room: null, grids: null, values: null, reports: {}, response: null, advice: [], layout: [], rooms: [], error: null, computing: false, virtual: false };

  function currentRoom() {
    const { settings, cad } = store.state;
    const rooms = roomsFromCad(cad.geometry);
    out.rooms = rooms;
    let poly;
    const picked = rooms.find((r) => r.id === settings.roomId) ?? rooms[0];
    if (picked) {
      poly = picked.poly;
      out.virtual = false;
    } else {
      const { w, l } = settings.virtualRoom;
      poly = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];
      out.virtual = true;
    }
    out.planLayer = picked?.layerId ?? null;
    out.elevations = elevationsFromCad(cad.geometry);
    return buildRoom(poly, settings, out.elevations);
  }

  function run(job) {
    if (!worker) {
      setTimeout(() => finish(runJob(job), job), 0);
      return;
    }
    busy = true;
    const id = ++seq;
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      busy = false;
      if (e.data.error) {
        out.error = e.data.error;
        out.computing = false;
        onResult(out);
      } else finish(e.data.result, job);
      if (queued) {
        const next = queued;
        queued = null;
        run(next);
      }
    };
    worker.onerror = () => {
      worker = null;
      busy = false;
      run(job);
    };
    worker.postMessage({ id, job });
  }

  function finish(result, job) {
    out.fieldRoom = job.room;
    out.fieldGrids = job.grids;
    out.values = result.values;
    out.reports = result.reports;
    out.response = result.response;
    out.error = null;
    out.computing = Boolean(queued);
    onResult(out);
  }

  /** Recompute. `coarse` halves the resolution — used while something is being dragged. */
  function update(coarse = false) {
    const { state } = store;
    const { settings } = state;
    const room = currentRoom();
    const mix = state.mics.find((m) => m.mix);
    const sliceZ = settings.sliceHeight ?? mix?.z ?? 1.2;
    const grids = buildGrids(room, Math.min(sliceZ, room.Hmax - 0.05), coarse ? Math.max(16, settings.resolution / 2) : settings.resolution);
    out.room = room;
    out.grids = grids;
    const mirror = state.cad.mirror ? { enabled: state.cad.mirror.enabled, x: state.cad.mirror.xMetres } : null;
    out.advice = advise(room, state.speakers, state.mics, settings, mirror);
    out.layout = mix ? layoutCheck(state.speakers, mix, settings.frontDeg, settings.layout.preset) : [];
    const monitorId = (state.selected?.kind === 'mic' && state.selected.id) || mix?.id || state.mics[0]?.id;
    const job = { room, speakers: state.speakers, mics: state.mics, settings, grids, monitorId };
    out.monitorId = monitorId;
    out.computing = true;
    onResult(out, 'room');
    if (busy) queued = job;
    else run(job);
  }

  return { update, out, currentRoom };
}
