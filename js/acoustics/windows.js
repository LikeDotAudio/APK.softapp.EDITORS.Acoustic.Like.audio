// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ELEVATION_LAYER, alongLength } from './elevations.js';
import { elevationOrigin, faceCoords } from './patches.js';

/**
 * WINDOWS
 *
 * The glass in a room's walls, kept by the app per plan layer
 * (settings.windows[layerId]) and drawn into the CAD on the wall's elevation
 * (cad/marks.js `windows`): a pane of glass and its casing round it — head,
 * sill and two jambs — so the room hears glass where the glass is and wood
 * where the frame is, and every number stays editable in the inspector.
 *
 * A window is { id, face, at, w, h, sill, casing, glass }, metres:
 *   face    the elevation it is on — 'front', 'back', 'left' or 'right'
 *   at      its centre, from that elevation's left edge as the drawing shows it
 *   w × h   the glass, TRUE size along the wall
 *   sill    the bottom of the glass above the floor
 *   casing  the frame's width round the glass, every side
 *   glass   the pane's material (materials.js)
 *
 * An elevation draws a splayed wall foreshortened, so a window on one is
 * drawn narrower by the wall's cos — on the wall itself it is w wide.
 */

export const DEFAULT_WINDOW = { face: 'front', w: 1.8, h: 1.2, sill: 0.9, casing: 0.1, glass: 'glass-heavy' };
export const CASING_MATERIAL = 'casing-wood';
export const GLASS_TYPES = ['glass-heavy', 'glass-window'];

/** A window filled out with the defaults, and an id when it has none. */
export function makeWindow(w = {}, i = 0) {
  return { id: `win-${i + 1}`, ...DEFAULT_WINDOW, ...w };
}

/**
 * Where a window sits on its elevation, in sheet metres: { glass, casing, label }
 * — glass one rectangle, casing four (head, sill, left jamb, right jamb) —
 * or null when its centre is on no wall of that face.
 */
export function windowOnSheet(room, win) {
  const origin = elevationOrigin(room, win.face);
  if (!origin) return null;
  const span = alongLength(win.face) ? room.L : room.W;
  // the drawing reads left/back from the far end (patches.js wallPieces)
  const t = win.face === 'left' || win.face === 'back' ? span - win.at : win.at;
  const at = faceCoords(room, win.face);
  const wall = room.walls.find((w) => {
    if (w.face !== win.face) return false;
    const [a, b] = [at(w.a).t, at(w.b).t];
    return t >= Math.min(a, b) - 1e-9 && t <= Math.max(a, b) + 1e-9;
  });
  if (!wall) return null;
  const k = Math.abs(at(wall.b).t - at(wall.a).t) / wall.len || 1;
  const half = (win.w * k) / 2;
  const c = win.casing * k;
  const x0 = origin.x + win.at - half;
  const x1 = origin.x + win.at + half;
  const y0 = origin.y + win.sill;
  const y1 = y0 + win.h;
  const box = (ax, ay, bx, by) => [[ax, ay], [bx, ay], [bx, by], [ax, by]];
  return {
    layer: ELEVATION_LAYER[win.face],
    glass: box(x0, y0, x1, y1),
    casing: win.casing > 0 ? [box(x0 - c, y1, x1 + c, y1 + win.casing), box(x0 - c, y0 - win.casing, x1 + c, y0), box(x0 - c, y0, x0, y1), box(x1, y0, x1 + c, y1)] : [],
    label: [x0 - c, y1 + win.casing],
  };
}
