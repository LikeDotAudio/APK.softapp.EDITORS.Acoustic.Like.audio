// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE PUCK (a 3Dconnexion SpaceMouse)
 *
 * The OS shell holds the puck on the bus and posts its frames into the
 * focused window's iframe, about 60 a second while it is pushed:
 *
 *   { apkos: 'puck', action: 'move', pan: { dx, dy }, zoom, orbit: { yaw, pitch },
 *     unit, consumers: { acoustic_room, acoustic_walls, cad, … }, host }
 *
 * pan is CSS px in view terms (+dx the view moves right, +dy up), zoom a
 * factor (> 1 in), orbit radians. Here a frame flies one view:
 *
 *  - the 3-D room orbits, dollies and pans (consumers.acoustic_room);
 *  - a wall elevation or the reflected ceiling zooms and pans (consumers.acoustic_walls);
 *  - the plan is the CAD itself: the frame goes on into the CAD's iframe
 *    unchanged, and the CAD's own receiver honours consumers.cad.
 *
 * Which view: the one filling the screen (a tile maxed), else the tile the
 * pointer was last over, else what the layout puts first — the 3-D room in
 * the 3-D layout, the elevation being edited in the six-view one, the CAD
 * otherwise. A `status` frame and anything malformed are let go.
 */

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** A frame worth flying with, its numbers made safe (missing ones do nothing), or null. */
export function puckFrame(data) {
  if (!data || typeof data !== 'object' || data.apkos !== 'puck' || data.action !== 'move') return null;
  const pan = data.pan && typeof data.pan === 'object' ? data.pan : {};
  const orbit = data.orbit && typeof data.orbit === 'object' ? data.orbit : {};
  const f = {
    dx: num(pan.dx) ? pan.dx : 0,
    dy: num(pan.dy) ? pan.dy : 0,
    zoom: num(data.zoom) && data.zoom > 0 ? data.zoom : 1,
    yaw: num(orbit.yaw) ? orbit.yaw : 0,
    pitch: num(orbit.pitch) ? orbit.pitch : 0,
    consumers: data.consumers && typeof data.consumers === 'object' ? data.consumers : {},
  };
  return f;
}

/**
 * Where a frame goes: 'room', a face ('ceiling', 'front', …), 'cad', or null.
 * `layout` is the views' class ('three' | 'six' | 'wall'); `tile` the data-face of the maxed or last-hovered
 * tile still on screen (or null); `editing` the face whose sheet the CAD is on; `cadDocked` whether the
 * CAD is in this page's iframe.
 */
export function puckTarget({ layout, tile = null, editing = null, cadDocked = true }) {
  const FACES = ['ceiling', 'front', 'back', 'left', 'right'];
  if (tile === '3d') return 'room';
  if (FACES.includes(tile)) return tile;
  if (tile === 'plan' && cadDocked) return 'cad';
  if (layout === 'three') return 'room';
  if (layout === 'six') {
    if (FACES.includes(editing)) return editing;
    return cadDocked ? 'cad' : 'front';
  }
  return cadDocked ? 'cad' : null;
}

/** Fly one frame on the target; true when something took it. */
export function flyFrame(data, target, { room, faces = {}, cad = null }) {
  const f = puckFrame(data);
  if (!f || !target) return false;
  if (target === 'cad') {
    if (!cad) return false;
    cad.postMessage(data, '*');
    return true;
  }
  if (target === 'room') {
    if (f.consumers.acoustic_room === false || !room) return false;
    room.fly(f);
    return true;
  }
  const face = faces[target];
  if (f.consumers.acoustic_walls === false || !face) return false;
  face.fly({ zoom: f.zoom, dx: f.dx, dy: f.dy });
  return true;
}

/**
 * Listen for the shell's frames. `views` is #views; `room` the 3-D view; `faces` { face: faceView };
 * `iframe` the CAD's; `cadDocked()` whether the CAD is in it (not popped out to a window of its own).
 */
export function installPuck({ win = window, views, room, faces, iframe, cadDocked = () => true }) {
  let hovered = null;
  const shows = (t) => Boolean(t && t.isConnected && t.getClientRects().length);
  // the pointer's tile: an iframe gets its own events, but its element is still the one the pointer went over
  views.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('.tile');
    if (t) hovered = t;
  });
  win.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.apkos !== 'puck' || data.action !== 'move') return;
    // only the shell's frames: one the CAD sent up would come straight back to it
    if (iframe && e.source && e.source === iframe.contentWindow) return;
    const maxed = views.classList.contains('maxed') ? views.querySelector(':scope > .tile.max') : null;
    const t = maxed ?? (shows(hovered) && views.contains(hovered) ? hovered : null);
    const layout = ['three', 'six', 'wall'].find((c) => views.classList.contains(c)) ?? 'six';
    const editing = views.querySelector(':scope > .tile.face.editing')?.dataset.face ?? null;
    const docked = Boolean(cadDocked());
    const target = puckTarget({ layout, tile: t?.dataset.face ?? null, editing, cadDocked: docked });
    try {
      flyFrame(data, target, { room, faces, cad: docked ? iframe?.contentWindow : null });
    } catch {
      // a frame that cannot be flown is only one frame: the next one comes in 16 ms
    }
  });
}
