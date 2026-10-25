// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { advise } from '../acoustics/advisor.js';
import { arrayFront, layoutCentre, layoutCheck, soundingSpeakers } from '../acoustics/layouts.js';
import { ELEVATION_FACES, elevationFaceOf } from '../acoustics/elevations.js';
import { buildRoom } from '../acoustics/room.js';
import { planFromWalls } from '../acoustics/wallChains.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { buildGrids } from './grids.js';
import { F_MAX, F_MIN, runJob } from './compute.js';

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

/**
 * A plan drawn as wall pieces that never close — a doorway left open: on each
 * plan layer the pieces joined across their gaps (wallChains.js), the largest
 * room that makes. { layerId, poly, openings } or null.
 */
export function openPlanFromCad(geometry, maxGap) {
  if (!Array.isArray(geometry?.walls)) return null;
  const k = METRES_PER_UNIT[geometry.units] ?? 1;
  const names = new Map((geometry.layers ?? []).map((l) => [l.id, l.name]));
  const byLayer = new Map();
  for (const w of geometry.walls) {
    const name = names.get(w.layerId) ?? w.layerId;
    if (elevationFaceOf(name) || String(name).trim().toLowerCase() === 'ceiling') continue;
    if (!byLayer.has(w.layerId)) byLayer.set(w.layerId, []);
    byLayer.get(w.layerId).push({ a: { x: w.a[0] * k, y: w.a[1] * k }, b: { x: w.b[0] * k, y: w.b[1] * k } });
  }
  let best = null;
  for (const [layerId, segs] of byLayer) {
    const plan = planFromWalls(segs, maxGap);
    if (!plan) continue;
    const area = Math.abs(plan.poly.reduce((s, p, i) => { const q = plan.poly[(i + 1) % plan.poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
    if (area > 1 && (!best || area > best.area)) best = { layerId, area, ...plan };
  }
  return best;
}

/** The largest loop on each elevation layer: [{ face, poly }]. */
export function elevationsFromCad(geometry) {
  const loops = loopsFromCad(geometry);
  return ELEVATION_FACES.map((face) => loops.find((r) => r.face === face)).filter(Boolean).map((r) => ({ face: r.face, poly: r.poly }));
}

/**
 * What is painted on the surfaces: the CAD's `geometry.patches` (fills and
 * product blocks placed from our palette), in metres, each with its layer's
 * NAME — the name is what says which surface it lands on (patches.js).
 * A CAD that sends no patches simply has none.
 */
export function patchesFromCad(geometry) {
  if (!Array.isArray(geometry?.patches)) return [];
  const k = METRES_PER_UNIT[geometry.units] ?? 1;
  const names = new Map((geometry.layers ?? []).map((l) => [l.id, l.name]));
  return geometry.patches
    .filter((p) => p && Array.isArray(p.points) && p.points.length >= 3)
    .map((p) => ({
      id: String(p.id),
      paletteId: p.paletteId,
      layer: names.get(p.layerId) ?? p.layerId,
      poly: p.points.map(([x, y]) => ({ x: x * k, y: y * k })),
      // a placed product's centre and turn, for the furniture this app keeps in place (the console)
      ...(Array.isArray(p.at) ? { at: { x: p.at[0] * k, y: p.at[1] * k }, rotation: p.rotation ?? 0 } : {}),
      // drawn by this app's own marks (its panels, its glass), not by the user
      ...(p.host ? { host: p.host } : {}),
    }));
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
  let inflight = null;
  const out = { room: null, grids: null, values: null, reports: {}, response: null, frames: { ready: [], ladder: [] }, advice: [], layout: [], rooms: [], error: null, computing: false, virtual: false };

  function currentRoom() {
    const { settings, cad } = store.state;
    const rooms = roomsFromCad(cad.geometry);
    out.rooms = rooms;
    let poly;
    let openings = [];
    const picked = rooms.find((r) => r.id === settings.roomId) ?? rooms[0];
    // no closed loop: the wall pieces, closed across their gaps — each gap an opening
    const open = picked ? null : openPlanFromCad(cad.geometry, settings.maxOpening);
    if (picked) {
      poly = picked.poly;
      out.virtual = false;
    } else if (open) {
      poly = open.poly;
      openings = open.openings;
      out.virtual = false;
    } else {
      const { w, l } = settings.virtualRoom;
      poly = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];
      out.virtual = true;
    }
    out.planLayer = picked?.layerId ?? open?.layerId ?? null;
    out.elevations = elevationsFromCad(cad.geometry);
    return buildRoom(poly, settings, out.elevations, patchesFromCad(cad.geometry), openings);
  }

  function run(job) {
    busy = true;
    inflight = job;
    const done = (result, error) => {
      busy = false;
      inflight = null;
      if (job.frame) keepFrame(job, result);
      else if (error) {
        out.error = error;
        out.computing = false;
        onResult(out);
      } else finish(result, job);
      if (queued) {
        const next = queued;
        queued = null;
        run(next);
      } else pump();
    };
    if (!worker) {
      setTimeout(() => {
        try {
          done(runJob(job));
        } catch (err) {
          done(null, String(err?.stack || err));
        }
      }, 0);
      return;
    }
    const id = ++seq;
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      done(e.data.result, e.data.error);
    };
    worker.onerror = () => {
      worker = null;
      busy = false;
      run(job);
    };
    worker.postMessage({ id, job: { ...job, scene: undefined } }); // the scene only keys the frame cache, not worth cloning
  }

  function finish(result, job) {
    out.fieldRoom = job.room;
    out.fieldGrids = job.grids;
    out.values = result.values;
    out.reports = result.reports;
    out.response = result.response;
    out.error = null;
    out.computing = Boolean(queued);
    if (!job.coarse && job.scene === scene) cache.set(job.settings.freq, { result, job });
    syncFrames();
    onResult(out);
  }

  /**
   * THE SWEEP'S FRAMES
   *
   * While a sweep runs, the idle worker paints the field ahead of it at the
   * round frequencies — 20, 30, 50, 100, 200, 300, 500, 1k … — then the ones
   * between (40, 60, 70 …), then halves the gaps again and again. The sweep
   * plays whichever are ready, so the loop starts coarse and slowly fills in
   * smooth. Any change but the frequency starts the frames over.
   */
  const LADDER = frameLadder();
  const cache = new Map(); // freq → { result, job }, for `scene`
  let scene = null;
  let sceneKey = '';
  let precalc = false;
  let last = null; // the last full-resolution job: the template a frame is painted from
  const failed = new Set();

  function keepFrame(job, result) {
    if (job.scene !== scene) return;
    if (result) cache.set(job.settings.freq, { result, job });
    else failed.add(job.settings.freq);
    syncFrames();
    onResult(out, 'frame');
  }

  function syncFrames() {
    out.frames = { ready: [...cache.keys()].sort((x, y) => x - y), ladder: precalc || cache.size ? LADDER : [] };
  }

  /** The worker is free: paint the next frame the sweep has not got yet. */
  function pump() {
    if (!precalc || busy || !last || last.settings.method === 'energy') return;
    const f = LADDER.find((g) => !cache.has(g) && !failed.has(g));
    if (f === undefined) return;
    run({ ...last, settings: { ...last.settings, freq: f }, frame: true });
  }

  /** Paint frames ahead of the sweep, or stop. The frames already painted stay. */
  function frames(on) {
    precalc = on;
    syncFrames();
    if (on) pump();
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
    out.layout = mix ? layoutCheck(state.speakers, layoutCentre(mix, arrayFront(settings), settings.layout.offset), arrayFront(settings), settings.layout.preset) : [];
    const monitorId = (state.selected?.kind === 'mic' && state.selected.id) || mix?.id || state.mics[0]?.id;
    // everything the field depends on but the frequency; what only changes how it is shown is left out
    const key = [state.cad.geometry, state.speakers, state.mics];
    const flat = JSON.stringify({ ...settings, freq: 0, view: 0, show: 0, monitorId, responsePoints });
    if (!scene || key.some((v, i) => v !== scene.refs[i]) || flat !== sceneKey) {
      scene = { refs: key };
      sceneKey = flat;
      cache.clear();
      failed.clear();
      syncFrames();
    }
    // the field hears the highlighted arrangement, as the plan shows it
    const job = { room, speakers: soundingSpeakers(state.speakers, settings), mics: state.mics, settings, grids, monitorId, responsePoints, scene, coarse };
    out.monitorId = monitorId;
    if (!coarse) last = job;
    const hit = !coarse && cache.get(settings.freq);
    if (hit) {
      queued = null;
      // what is being painted now is older than this: keep it as a frame, do not show it over this one
      if (inflight) inflight.frame = true;
      finish(hit.result, hit.job);
      return;
    }
    out.computing = true;
    onResult(out, 'room');
    if (busy) queued = job;
    else run(job);
  }

  /**
   * How many points the frequency response is drawn across (meters.js, from the graph's width): a graph popped out
   * across a big screen is recomputed finer. Rounded to 50 so a sash dragged a pixel does not recompute the room.
   */
  let responsePoints = 0;
  function setResponsePoints(n) {
    const next = Math.round(n / 50) * 50;
    if (next === responsePoints) return;
    responsePoints = next;
    if (last) update();
  }

  return { update, out, currentRoom, frames, setResponsePoints };
}

/**
 * The order the sweep's frames are painted in: the 1-2-3-5 steps of every
 * decade, then the rest of the round numbers, then the gaps halved (on a log
 * scale, to two figures) until they are under a 24th of an octave.
 */
export function frameLadder(lo = F_MIN, hi = F_MAX) {
  const decades = [];
  for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi; d *= 10) decades.push(d);
  const seen = new Set();
  const order = [];
  const take = (fs) => {
    for (const f of fs.filter((g) => g >= lo && g <= hi && !seen.has(g)).sort((x, y) => x - y)) {
      seen.add(f);
      order.push(f);
    }
  };
  take(decades.flatMap((d) => [1, 2, 3, 5].map((m) => Math.round(m * d))));
  take(decades.flatMap((d) => [1.5, 4, 6, 7, 8, 9].map((m) => Math.round(m * d))));
  for (;;) {
    const sorted = [...seen].sort((x, y) => x - y);
    const mids = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] / sorted[i - 1] < 2 ** (1 / 24)) continue;
      const m = Number((Math.sqrt(sorted[i] * sorted[i - 1])).toPrecision(2));
      if (m > sorted[i - 1] && m < sorted[i]) mids.push(m);
    }
    if (!mids.length) break;
    take(mids);
  }
  return order;
}
