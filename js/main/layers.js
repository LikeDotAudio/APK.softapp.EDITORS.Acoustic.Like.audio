// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — what this app draws into the CAD file, layer by layer: the wall inputs and the marks kept in step with the room.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { patchesFromCad } from '../compute/engine.js';
import { elevationFaceOf } from '../acoustics/elevations.js';
import { buildRoom } from '../acoustics/room.js';
import { buildMarks, hashOf, MARK_KEYS, spacesOf } from '../cad/marks.js';

export function startLayers(app) {
  const { cad, engine, store } = app;

  // ------------------------------------------------------------------ what this app draws into the CAD file
  /**
   * What is drawn on the walls' elevations, in sheet metres: the user's own regions and the mirrored copies
   * the symmetry made (the schedule and the wall builder list both), and the lines drawn there.
   */
  function wallInputs(g) {
    if (!g) return { patches: [], lines: [] };
    const k = METRES_PER_UNIT[g.units] ?? 1;
    const names = new Map((g.layers ?? []).map((l) => [l.id, l.name]));
    return {
      patches: patchesFromCad(g).filter((p) => elevationFaceOf(p.layer) && (!p.host || p.host === 'symmetry')),
      lines: (g.walls ?? [])
        .map((w) => ({ layer: names.get(w.layerId) ?? w.layerId, a: { x: w.a[0] * k, y: w.a[1] * k }, b: { x: w.b[0] * k, y: w.b[1] * k } }))
        .filter((w) => elevationFaceOf(w.layer)),
    };
  }

  let marksTimer = 0;
  function syncMarks() {
    clearTimeout(marksTimer);
    marksTimer = setTimeout(() => {
      const g = store.state.cad.geometry;
      if (!cad.link || !g || !engine.out.room) return;
      const k = METRES_PER_UNIT[g.units] ?? 1;
      const xs = (g.walls ?? []).flatMap((w) => [w.a[0], w.b[0]]).map((x) => x * k);
      const ys = (g.walls ?? []).flatMap((w) => [w.a[1], w.b[1]]).map((y) => y * k);
      const sheetBounds = xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null;
      const layers = new Set((g.layers ?? []).map((l) => l.name));
      // every plan on the sheet gets its blow-up: the one being designed as the engine has it, the rest built here
      const names = new Map((g.layers ?? []).map((l) => [l.id, l.name]));
      const patches = patchesFromCad(g).filter((p) => !elevationFaceOf(p.layer));
      const settings = store.state.settings;
      const rooms = (engine.out.rooms ?? []).map((loop) => ({
        name: String(names.get(loop.layerId) ?? loop.layerId).replace(/^Room · /, ''),
        room: loop.layerId === engine.out.planLayer && !engine.out.virtual ? engine.out.room : buildRoom(loop.poly, { ...settings, roomHeight: settings.roomHeights?.[loop.layerId] ?? settings.roomHeight }, [], patches),
      }));
      const { patches: wallPatches, lines: wallLines } = wallInputs(g);
      const sets = buildMarks({ room: engine.out.room, state: store.state, planLayer: engine.out.planLayer, sheetBounds, k, layers, rooms, wallPatches, wallLines, patches: patchesFromCad(g) });
      const onSheet = g.marks ?? {};
      for (const key of MARK_KEYS) {
        const items = sets[key];
        const hash = hashOf(items);
        if (onSheet[key] === hash || (onSheet[key] === undefined && !items.length)) continue;
        cad.link.marks(key, hash, items);
      }
      // every drawing on the sheet a model space of its own, one scale for all (marks.js spacesOf)
      const spaces = spacesOf(engine.out.room, sets, k);
      const spacesHash = hashOf(spaces);
      if (spacesHash !== lastSpaces) {
        lastSpaces = spacesHash;
        cad.link.spaces(spaces);
      }
    }, 350);
  }
  let lastSpaces = null;

  return { wallInputs, syncMarks };
}
