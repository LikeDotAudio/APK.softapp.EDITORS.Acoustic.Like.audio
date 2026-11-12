// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — furniture drawn by the CAD, and the room library: drawing a library room, its pending layout, a floor plan's room, doors, the grab bag and the room picker.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { makeWindow } from '../acoustics/windows.js';
import { furnish, grabBag, ROOM_LIBRARY, roomById } from '../acoustics/roomLibrary.js';
import { furnitureLayer } from '../cad/marks.js';
import { makeMic } from '../acoustics/devices.js';
import { LAYOUTS } from '../acoustics/layouts.js';
import { buildRoom } from '../acoustics/room.js';
import { elevationOrigin, faceCoords } from '../acoustics/patches.js';
import { ELEVATION_LAYER } from '../acoustics/elevations.js';

export function startRooms(app) {
  const { cad, engine, inspector, jumpTo, status, store } = app;

  // ------------------------------------------------------------------ furniture: the CAD draws it, at true size
  document.getElementById('furniture').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-arm]');
    if (!b) return;
    const paletteId = b.dataset.arm;
    const inFurnitureMode = store.state.mode === 'place-furniture';
    const currentArm = store.state.placeKind.furniture;
    if (inFurnitureMode && currentArm === paletteId) {
      store.setMode('cad');
      return;
    }
    store.setPlaceKind('furniture', paletteId);
    store.setMode('place-furniture');
    jumpTo('plan');
    if (cad.link) cad.link.arm(paletteId);
  });

  // ------------------------------------------------------------------ the room library
  let pendingRoom = null;

  /** Draw a library room into the CAD beside whatever is there, on a layer of its own, and make it the room. */
  function drawRoom(entry) {
    if (!entry || !cad.link) return;
    const g = store.state.cad.geometry;
    const k = METRES_PER_UNIT[g?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
    const xs = (g?.walls ?? []).flatMap((w) => [w.a[0], w.b[0]]).map((x) => x * k);
    const ys = (g?.walls ?? []).flatMap((w) => [w.a[1], w.b[1]]).map((y) => y * k);
    // far enough from the last room that its blow-up (ceiling, floor and walls drawn above it) has room
    const gap = Math.max(4, 2 * (entry.h ?? 3) + 2);
    const ox = xs.length ? Math.max(...xs) + gap - Math.min(...entry.poly.map(([x]) => x)) : 0;
    const oy = ys.length ? Math.min(...ys) : 0;
    const layer = `Room · ${entry.name}`;
    const seed = entry.poly.map(([x, y]) => [+((x + ox) / k).toFixed(4), +((y + oy) / k).toFixed(4)]);
    pendingRoom = { layer, h: entry.h, id: entry.id, entry, ox, oy, k };
    store.setSheet('plan');
    cad.link.sheet(layer, { color: '#e5e7eb', seed });
    status.textContent = `drawing “${entry.name}” into the CAD…`;
  }

  /** A dice room's arrangement waits for the engine to make the drawn loop the room and seat the mixer, then goes in. */
  let pendingLayout = null;
  function placePendingLayout() {
    if (!pendingLayout || engine.out.planLayer !== pendingLayout) return;
    if (!store.state.mics.some((m) => m.mix)) return;
    pendingLayout = null;
    inspector.placeLayout();
  }

  /** The floor plan's drawing is on the sheet: a clean overlay for it, and its room furnished once the engine finds one. */
  function startPlan() {
    const name = app.pendingPlan;
    app.pendingPlan = null;
    const doc = store.exportDoc();
    store.importDoc({ ...doc, settings: { ...doc.settings, lastLibraryRoom: null }, speakers: [], mics: [], furniture: [], locked: [] });
    const k = METRES_PER_UNIT[store.state.cad.geometry?.units ?? 'm'] ?? 1;
    const h = store.state.settings.roomHeight;
    pendingRoom = { layer: null, h, id: 'floorplan', entry: { id: 'floorplan', group: 'Control rooms', name, h }, ox: 0, oy: 0, k };
  }

  /** Once the CAD has drawn it, the new loop becomes the room (a floor plan's: the first plan loop, on whatever layer). */
  function pickDrawnRoom() {
    if (!pendingRoom) return;
    const loop = pendingRoom.layer === null ? engine.out.rooms?.[0] : engine.out.rooms?.find((r) => r.layerId === pendingRoom.layer);
    if (!loop) return;
    const { h, id, ox, oy, k } = pendingRoom;
    // a floor plan's room is only known now: furnished from the loop the CAD found
    const entry = pendingRoom.entry.poly ? pendingRoom.entry : { ...pendingRoom.entry, poly: loop.poly.map((q) => [q.x, q.y]) };
    pendingRoom = null;
    const heights = { ...store.state.settings.roomHeights, [loop.layerId]: +h.toFixed(3) };
    // its glass, if it has any, belongs to the loop just drawn
    const windows = { ...store.state.settings.windows, [loop.layerId]: (entry.windows ?? []).map(makeWindow) };
    // a room built with its own finishes (a hardwood floor) has them; the rest keep what the surfaces were given
    const faceMaterials = { ...store.state.settings.faceMaterials, ...entry.faces };
    store.setSettings({ roomId: loop.id, roomHeight: +h.toFixed(3), lastLibraryRoom: id, frontDeg: 90, roomHeights: heights, windows, faceMaterials });
    // furnished, and with its people in it: the console, couch and rack into the CAD as real blocks, the listeners seated
    if (entry.group) {
      const { furniture, seats, door } = furnish(entry);
      // each kind of furniture on a layer of its own (marks.js slices)
      for (const f of furniture) cad.link.place(furnitureLayer(f.paletteId), [{ paletteId: f.paletteId, at: [+((f.x + ox) / k).toFixed(4), +((f.y + oy) / k).toFixed(4)], rotation: f.rotation }]);
      store.seat(seats.map((s) => makeMic(s.kind, { x: s.x + ox, y: s.y + oy, z: s.z }, { aim: s.aim, mix: Boolean(s.mix) })));
      // the arrangement picked on the toolbar goes in round the new mix seat, once the engine has the room
      if (seats.some((x) => x.mix) && LAYOUTS[store.state.settings.layout.preset]) pendingLayout = loop.layerId;
      if (door) hangDoor(loop, door, h, ox, oy, k);
    }
  }

  /**
   * The door goes on the back elevation, where a door is drawn: its frame is
   * the one the engine will read the patch in (patches.js elevationOrigin) — the
   * back loop already drawn, or the seed under this plan — so it is built here
   * as the engine is about to build the room.
   */
  function hangDoor(loop, door, h, ox, oy, k) {
    const room = buildRoom(loop.poly, { ...store.state.settings, frontDeg: 90, roomHeight: h }, engine.out.elevations ?? []);
    const origin = elevationOrigin(room, 'back');
    if (!origin) return;
    const { t } = faceCoords(room, 'back')({ x: door.x + ox, y: door.y + oy });
    // the back elevation is seen from inside, looking back: t (from the left) runs right to left on the sheet
    const at = [origin.x + room.W - t, origin.y + door.h / 2];
    cad.link.place(ELEVATION_LAYER.back, [{ paletteId: door.paletteId, at: at.map((v) => +(v / k).toFixed(4)), rotation: 0 }]);
  }

  document.getElementById('grabBag').addEventListener('click', () => drawRoom(grabBag(store.state.settings.lastLibraryRoom)));

  // the library by name, a group per kind of room: the one picked is drawn into the CAD, as the grab bag's is
  const roomPick = document.getElementById('roomPick');
  roomPick.append(new Option('Room shapes …', ''));
  for (const group of [...new Set(ROOM_LIBRARY.map((r) => r.group))]) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const r of ROOM_LIBRARY.filter((x) => x.group === group)) og.append(Object.assign(new Option(r.name, r.id), { title: r.note }));
    roomPick.append(og);
  }
  roomPick.value = roomById(store.state.settings.lastLibraryRoom) ? store.state.settings.lastLibraryRoom : '';
  roomPick.addEventListener('change', () => drawRoom(roomById(roomPick.value)));
  store.subscribe(() => {
    // a floor plan's room is none of the library's: the picker goes back to its prompt
    const id = roomById(store.state.settings.lastLibraryRoom) ? store.state.settings.lastLibraryRoom : '';
    if (roomPick.value !== id) roomPick.value = id;
  });

  return { drawRoom, placePendingLayout, startPlan, pickDrawnRoom };
}
