// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { advise } from '../acoustics/advisor.js';
import { arrayFront, layoutCentre, layoutCheck } from '../acoustics/layouts.js';
import { monitoredSpeakers } from '../acoustics/monitor.js';
import { ELEVATION_FACES, elevationFaceOf } from '../acoustics/elevations.js';
import { buildRoom } from '../acoustics/room.js';
import { planFromWalls } from '../acoustics/wallChains.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { buildGrids } from './grids.js';
import { F_MAX, F_MIN, MODAL_MAX, runJob } from './compute.js';

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
   * THE SWEEP'S FRAMES — A CACHE FILLED IN THE BACKGROUND
   *
   * Whenever the worker is idle it paints the field at frequencies it has not
   * got yet, and keeps every frame: the sweep, the tour and the slider play
   * whichever are ready, and nothing is painted twice. First the ladder's
   * SEEDS, a decade at a time — 1k, 10k, 100, then 20, 200, 2k and the top,
   * then 50, 500, 5k — so the whole range is roughed in at once; then, again
   * and again, the middle (on a log scale) of the widest gap between two
   * frames it has, the gaps near the current frequency first: the room fills
   * in smooth from where you are looking outward. Anything but the frequency
   * changing — a setting, something moved — flushes it and starts again from
   * 1k. The tour hands its own list instead (`sweepFrames`), in the order it
   * will play them, and gets those first.
   *
   * The modal field stops at MODAL_MAX (compute.js): every frame above it is
   * that one, so it is painted once and kept for them all.
   */
  const LADDER = frameLadder();
  let wanted = LADDER;
  const cache = new Map(); // freq → { result, job }, for `scene`
  let scene = null;
  let sceneKey = '';
  let last = null; // the last full-resolution job: the template a frame is painted from
  const failed = new Set();

  function keepFrame(job, result) {
    if (job.scene !== scene) return;
    // painted without the response curve, which is the same at every frequency: the room's, already shown
    if (result && !result.response) result.response = out.response;
    if (result) cache.set(job.settings.freq, { result, job });
    else failed.add(job.settings.freq);
    syncFrames();
    onResult(out, 'frame');
  }

  function syncFrames() {
    out.frames = { ready: [...cache.keys()].sort((x, y) => x - y), ladder: LADDER, wanted };
  }

  /** The worker is free: paint the next frame the cache has not got yet. */
  function pump() {
    if (busy || !last || last.settings.method === 'energy') return;
    for (;;) {
      const have = (g) => cache.has(g) || failed.has(g);
      const f = wanted !== LADDER ? wanted.find((g) => !have(g)) ?? nextFrame(LADDER, have, last.settings.freq) : nextFrame(LADDER, have, last.settings.freq);
      if (f === undefined) return;
      const above = last.settings.method === 'modal' && f > MODAL_MAX;
      if (above && cache.has(MODAL_MAX)) {
        cache.set(f, cache.get(MODAL_MAX));
        syncFrames();
        onResult(out, 'frame');
        continue;
      }
      return run({ ...last, settings: { ...last.settings, freq: above ? MODAL_MAX : f }, frame: true, withResponse: false });
    }
  }

  /** Paint `list`'s frames first, in its order (the tour's), or — off — go back to filling the whole ladder. The frames already painted stay. */
  function frames(on, list = LADDER) {
    wanted = on ? list : LADDER;
    syncFrames();
    pump();
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
    // the field hears the highlighted arrangement, as the plan shows it, through the monitor controller
    const job = { room, speakers: monitoredSpeakers(state.speakers, settings), mics: state.mics, settings, grids, monitorId, responsePoints, scene, coarse };
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

/** How many of the ladder's first frequencies are its seeds, painted in their order before any gap is split. */
export const SEEDS = 10;

/**
 * The next frame to paint: the ladder's seeds in order; then, of the ladder's
 * frequencies not had yet, the one farthest (in octaves) from any it has — the
 * middle of the widest gap — each gap counted smaller the farther it lies from
 * `near`, the current frequency, so the cache fills in from where you are.
 */
export function nextFrame(ladder, have, near) {
  const seed = ladder.slice(0, SEEDS).find((g) => !have(g));
  if (seed !== undefined) return seed;
  const got = ladder.filter(have).sort((x, y) => x - y);
  let best;
  let bestScore = -Infinity;
  for (const f of ladder) {
    if (have(f)) continue;
    let gap = Infinity;
    for (const g of got) gap = Math.min(gap, Math.abs(Math.log2(f / g)));
    const score = gap / (1 + Math.abs(Math.log2(f / near)));
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return best;
}

/**
 * The frames a sweep that moves `step` of an octave at a time plays, bottom
 * to top: the ladder's frame nearest each step, each once.
 */
export function sweepFrames(step = 1 / 12, ladder = frameLadder()) {
  const sorted = [...ladder].sort((x, y) => x - y);
  const out = [];
  for (let f = F_MIN; f <= F_MAX * 1.0001; f *= 2 ** step) {
    const near = sorted.reduce((best, g) => (Math.abs(Math.log(g / f)) < Math.abs(Math.log(best / f)) ? g : best));
    if (near !== out.at(-1)) out.push(near);
  }
  // the steps stop short of the top by a fraction of one: the sweep ends on it all the same
  if (out.at(-1) !== sorted.at(-1)) out.push(sorted.at(-1));
  return out;
}

/**
 * The frequencies the sweep's frames are painted at. First the SEEDS, a decade
 * at a time from the middle out — 1k, 10k, 100, then 20, 200, 2k and the top,
 * then 50, 500, 5k (10 Hz, 5 Hz and 20 kHz would be outside the range, the
 * ends stand in for them) — then the gaps halved on a log scale, to two
 * figures, until they are under a 24th of an octave. The engine picks among
 * the halves by where you are (nextFrame); this order is only the seeds'.
 */
export function frameLadder(lo = F_MIN, hi = F_MAX) {
  const seen = new Set();
  const order = [];
  const take = (fs, sorted = true) => {
    const keep = fs.map((g) => Math.min(hi, Math.max(lo, g))).filter((g, i, a) => !seen.has(g) && a.indexOf(g) === i);
    for (const f of sorted ? keep.sort((x, y) => x - y) : keep) {
      seen.add(f);
      order.push(f);
    }
  };
  take([1000, 10000, 100, 20, 200, 2000, hi, 50, 500, 5000], false);
  for (;;) {
    const sorted = [...seen].sort((x, y) => x - y);
    const mids = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] / sorted[i - 1] < 2 ** (1 / 24)) continue;
      const m = Number(Math.sqrt(sorted[i] * sorted[i - 1]).toPrecision(2));
      if (m > sorted[i - 1] && m < sorted[i]) mids.push(m);
    }
    if (!mids.length) break;
    take(mids);
  }
  return order;
}
