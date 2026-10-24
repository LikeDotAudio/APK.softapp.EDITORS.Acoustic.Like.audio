// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { makeMic, makeSpeaker, newId } from '../acoustics/devices.js';
import { DEFAULT_ISOLATION } from '../acoustics/isolation.js';
import { mirrorDevice, syncTwin } from '../acoustics/symmetry.js';
import { clampInside, CLEAR_M, intoRoom, outside } from '../acoustics/inRoom.js';
import { carryArray } from '../acoustics/layouts.js';
import { pointInPolygon } from '../acoustics/geometry.js';

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * ONE STATE, SAVED PER DRAWING
 *
 * Everything this app adds to a CAD sheet — speakers, microphones and the
 * settings that turn the sheet into a room — keyed by the CAD file's name, so
 * opening a drawing brings back the overlay that was made on it. Positions are
 * metres in the sheet's own frame: a units switch in the CAD rescales the
 * drawing to keep its physical size, and so these stay put.
 *
 * Paired devices (L/R) keep their twin across the CAD's Virtual Mirror in
 * step on every change; see symmetry.js.
 */

export const DEFAULT_SETTINGS = {
  roomHeight: 3.0,
  frontDeg: 90,
  roomId: null,
  virtualRoom: { w: 5, l: 7 },
  faceMaterials: { floor: 'wood-floor', ceiling: 'acoustic-tile', front: 'gypsum', back: 'absorber-100', left: 'gypsum', right: 'gypsum' },
  method: 'wave',
  freq: 80,
  band: 2,
  maxOrder: 3,
  resolution: 64,
  rangeDb: 30,
  sliceHeight: null,
  aWeight: false,
  view: 'six',
  symmetric: true,
  layout: { preset: '7.1.4', radius: 2.0, rotate: 0, mains: 'dmt12', surround: 'dmt8' },
  isolation: DEFAULT_ISOLATION,
  /** What the user has said each wall is, by wallKey: { material?, note? } — its own finish, and what it is in their words. */
  walls: {},
  /** The widest gap between wall pieces still read as an opening (a door, a pass-through), metres; wider is a plan not yet closed. */
  maxOpening: 4,
  /** Speakers are placed relative to the listener: moving the mix seat carries them (subs and flush-mounted boxes stay). */
  followListener: true,
  /** The console follows the mixer: square in front of their nose, `people` people clear of it. */
  console: { follow: true, people: 2 },
  /** Ceiling heights of the other plan loops on the sheet (library rooms), by layer id, for their blow-ups. */
  roomHeights: {},
  /** The glass in each plan loop's walls, by layer id (acoustics/windows.js): drawn into its elevations with their casings. */
  windows: {},
  /** What this app draws into the CAD itself (cad/marks.js): labels, reflection panels, cut-aways, construction sections. */
  cadMarks: { labels: true, panels: true, ceilingPanels: true, cutaways: true, reflections: true, sections: true, arrangement: true, blowup: true, windows: true },
  autoPanels: { wall: 'panel-1200x600x100', ceiling: 'cloud-1200', w: 0.6, h: 1.2 },
  show: { field: true, devices: true, rays: true, rings: false, nulls: true, guides: true, rc: true, coverage: true, arrangement: true },
};

const KEY = 'acoustic.like.audio/v1/';

export function createStore() {
  const listeners = new Set();
  const state = {
    speakers: [],
    mics: [],
    furniture: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    selected: null,
    mode: 'cad',
    /** Which drawing the CAD is showing: 'plan', or the elevation's face. Not saved: the CAD decides where it opens. */
    sheet: 'plan',
    placeKind: { speaker: 'dmt12', mic: 'mixer', furniture: 'desk-1800x900' },
    cad: { geometry: null, view: null, mirror: null, connected: false, popped: false },
    fileName: null,
  };
  let saveTimer = 0;

  const emit = (what = 'state') => {
    for (const fn of listeners) fn(state, what);
  };
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY + (state.fileName || 'untitled'), JSON.stringify(exportDoc()));
      } catch {
        /* private window or quota: the overlay still works, it just won't be there next time */
      }
    }, 400);
  };
  const changed = (what = 'model') => {
    save();
    emit(what);
  };

  function exportDoc() {
    return { format: 'acoustic.like.audio@1', fileName: state.fileName, settings: state.settings, speakers: state.speakers, mics: state.mics, furniture: state.furniture };
  }

  function importDoc(doc) {
    if (!doc || doc.format !== 'acoustic.like.audio@1') throw new Error('Not an acoustic.like.audio@1 file');
    const d = doc.settings ?? {};
    state.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...d,
      show: { ...DEFAULT_SETTINGS.show, ...d.show },
      isolation: { ...DEFAULT_ISOLATION, ...d.isolation, shared: { ...DEFAULT_ISOLATION.shared, ...d.isolation?.shared } },
      cadMarks: { ...DEFAULT_SETTINGS.cadMarks, ...d.cadMarks },
      autoPanels: { ...DEFAULT_SETTINGS.autoPanels, ...d.autoPanels },
      roomHeights: { ...d.roomHeights },
      windows: { ...d.windows },
    };
    state.speakers = doc.speakers ?? [];
    state.mics = doc.mics ?? [];
    state.furniture = doc.furniture ?? [];
    state.selected = null;
    changed();
  }

  function load(fileName) {
    state.fileName = fileName;
    try {
      const raw = localStorage.getItem(KEY + (fileName || 'untitled'));
      if (raw) {
        importDoc(JSON.parse(raw));
        return;
      }
    } catch {
      /* fall through to an empty overlay */
    }
    emit();
  }

  /**
   * A session file's overlay, for the drawing `fileName`: kept in this browser
   * under that name (so the CAD opening the drawing finds it) and put on now.
   */
  function adopt(fileName, doc) {
    state.fileName = fileName;
    try {
      localStorage.setItem(KEY + (fileName || 'untitled'), JSON.stringify({ ...doc, fileName }));
    } catch {
      /* the overlay still opens; it just will not be there next time */
    }
    importDoc(doc);
  }

  /** The mirror axis in metres, or null when the CAD's Symmetrical Mode is off. */
  const axis = () => (state.cad.mirror?.enabled ? state.cad.mirror.xMetres : null);

  const listOf = (kind) => (kind === 'speaker' ? 'speakers' : kind === 'furniture' ? 'furniture' : 'mics');

  function add(kind, dev) {
    const key = listOf(kind);
    const ax = axis();
    const out = [dev];
    if (state.settings.symmetric && ax != null && Math.abs(dev.x - ax) > 0.05 && !dev.mix) {
      const pairId = newId('p');
      const side = dev.x < ax ? 'L' : 'R';
      out[0] = { ...dev, pairId, side, name: `${dev.name} ${side}` };
      out.push({ ...mirrorDevice(out[0], ax), id: newId(kind[0]), pairId });
    }
    state[key] = [...state[key], ...out];
    state.selected = { kind, id: out[0].id };
    changed();
  }

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit,
    load,
    exportDoc,
    importDoc,
    adopt,
    axis,
    setCad(patch, what = 'cad') {
      Object.assign(state.cad, patch);
      emit(what);
    },
    setMode(mode) {
      state.mode = mode;
      emit('mode');
    },
    setSheet(sheet) {
      state.sheet = sheet;
      if (sheet !== 'plan') state.mode = 'cad';
      emit('mode');
    },
    setPlaceKind(kind, preset) {
      state.placeKind[kind] = preset;
      emit('mode');
    },
    /** `live` (a slider mid-drag): the quick recompute only, no save — the release commits. */
    setSettings(patch, live = false) {
      state.settings = { ...state.settings, ...patch };
      if (live) emit('drag');
      else changed('settings');
    },
    setShow(patch) {
      state.settings = { ...state.settings, show: { ...state.settings.show, ...patch } };
      changed('settings');
    },
    setFaceMaterial(face, id) {
      state.settings = { ...state.settings, faceMaterials: { ...state.settings.faceMaterials, [face]: id } };
      changed('settings');
    },
    /**
     * `sel` is { kind: 'speaker' | 'mic' | 'patch', id }. A patch is the CAD's
     * (it lives in the drawing, not in this overlay), so selecting one is a
     * view of it only: nothing here can move or delete it.
     */
    select(sel) {
      state.selected = sel;
      emit('selection');
    },
    addSpeaker(kind, at, extra) {
      add('speaker', makeSpeaker(kind, at, extra));
    },
    addMic(kind, at, extra) {
      const mic = makeMic(kind, at, extra);
      if (!state.mics.some((m) => m.mix)) mic.mix = true;
      add('mic', mic);
    },
    addFurniture(paletteId, at, rotation = 0) {
      const item = { id: newId('f'), paletteId, x: +at.x.toFixed(3), y: +at.y.toFixed(3), rotation };
      state.furniture = [...(state.furniture ?? []), item];
      state.selected = { kind: 'furniture', id: item.id };
      changed();
      return item;
    },
    updateFurniture(id, patch, live = false) {
      state.furniture = (state.furniture ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f));
      if (live) emit('drag');
      else changed();
    },
    removeFurniture(id) {
      state.furniture = (state.furniture ?? []).filter((f) => f.id !== id);
      if (state.selected?.kind === 'furniture' && state.selected.id === id) state.selected = null;
      changed();
    },
    /** Change one device; its mirror twin follows. `live` skips the save while dragging. */
    update(kind, id, patch, live = false) {
      const key = listOf(kind);
      const before = state[key].find((d) => d.id === id);
      // the speakers belong to the listener: the mix seat moving carries them with it, its ears rising
      // lifts them, and it turning swings the arrangement round it (the array's Rotate follows)
      if (kind === 'mic' && before?.mix && state.settings.followListener) {
        const dx = (patch.x ?? before.x) - before.x;
        const dy = (patch.y ?? before.y) - before.y;
        const dz = 'z' in patch ? (patch.z ?? before.z) - before.z : 0;
        if (dx || dy || dz) state.speakers = state.speakers.map((s) => (carried(s) ? { ...s, x: s.x + dx, y: s.y + dy, z: Math.max(0.1, s.z + dz) } : s));
        const turn = 'aim' in patch && before.aim != null ? wrap180(patch.aim - before.aim) : 0;
        if (turn) {
          const layout = state.settings.layout;
          const nextLayout = { ...layout, rotate: wrap180((layout.rotate ?? 0) + turn) };
          const seat = { ...before, x: before.x + dx, y: before.y + dy, z: before.z + dz };
          const by = new Map(carryArray(state.speakers, state.settings, seat, nextLayout).map((m) => [m.id, m]));
          state.speakers = state.speakers.map((s) => (by.has(s.id) ? { ...s, ...by.get(s.id) } : s));
          state.settings = { ...state.settings, layout: nextLayout };
        }
      }
      let next = state[key].map((d) => (d.id === id ? { ...d, ...patch } : d));
      const dev = next.find((d) => d.id === id);
      if (dev?.pairId) next = syncTwin(next, dev, axis());
      if (kind === 'mic' && patch.mix) next = next.map((m) => (m.id === id ? m : { ...m, mix: false }));
      state[key] = next;
      if (live) emit('drag');
      else changed();
    },
    /** A device outside or on a wall of `room` brought inside (inRoom.js) and selected. False when it was already safely inside. */
    bringIn(kind, id, room) {
      const dev = (kind === 'speaker' ? state.speakers : kind === 'furniture' ? state.furniture : state.mics).find((d) => d.id === id);
      if (!dev || !outside(room, dev)) return false;
      const mix = state.mics.find((m) => m.mix);
      const target = clampInside(room, dev, CLEAR_M, mix?.id === id ? null : mix);
      const dest = outside(room, target) ? intoRoom(room, dev, kind, mix?.id === id ? null : mix) : target;
      if (kind === 'furniture') this.updateFurniture(id, dest);
      else this.update(kind, id, dest);
      this.select({ kind, id });
      return true;
    },
    /**
     * Nothing stands outside the rooms: every speaker, mic and piece of
     * furniture outside all of `polys` (the plans on the sheet) or through a
     * wall of `room` comes inside it, in one change. True when any moved.
     */
    keepInside(room, polys = [room.poly]) {
      const mix = state.mics.find((m) => m.mix);
      const elsewhere = (d) => polys.some((poly) => poly !== room.poly && pointInPolygon(d.x, d.y, poly));
      let moved = false;
      const fix = (list, kind) =>
        list.map((d) => {
          if (elsewhere(d) || !outside(room, kind === 'furniture' ? { ...d, z: 1 } : d)) return d;
          const at = clampInside(room, kind === 'furniture' ? { ...d, z: 1 } : d, CLEAR_M, mix?.id === d.id ? null : mix);
          const dest = outside(room, at) ? intoRoom(room, d, kind, mix?.id === d.id ? null : mix) : at;
          if (Math.abs(dest.x - d.x) < 1e-3 && Math.abs(dest.y - d.y) < 1e-3 && (kind === 'furniture' || Math.abs(dest.z - d.z) < 1e-3)) return d;
          moved = true;
          return kind === 'furniture' ? { ...d, x: dest.x, y: dest.y } : { ...d, x: dest.x, y: dest.y, z: dest.z };
        });
      state.speakers = fix(state.speakers, 'speaker');
      state.mics = fix(state.mics, 'mic');
      state.furniture = fix(state.furniture ?? [], 'furniture');
      if (moved) changed();
      return moved;
    },
    remove(kind, id) {
      if (kind === 'furniture') {
        this.removeFurniture(id);
        return;
      }
      if (kind !== 'speaker' && kind !== 'mic') return;
      const key = listOf(kind);
      const dev = state[key].find((d) => d.id === id);
      state[key] = state[key].filter((d) => d.id !== id && !(dev?.pairId && d.pairId === dev.pairId));
      if (state.selected?.id === id) state.selected = null;
      changed();
    },
    /** Break a pair: both stay where they are, and stop following each other. */
    unpair(kind, id) {
      const key = listOf(kind);
      const dev = state[key].find((d) => d.id === id);
      if (!dev?.pairId) return;
      state[key] = state[key].map((d) => (d.pairId === dev.pairId ? { ...d, pairId: undefined } : d));
      changed();
    },
    /**
     * Several devices at once, exactly as given — no twin sync: the caller has
     * already placed both of a pair (the hold-to-orbit drag mirrors across the
     * LISTENER, not the CAD's axis). [{ id, ...patch }].
     */
    updateMany(kind, patches, live = false) {
      const key = listOf(kind);
      const by = new Map(patches.map((p) => [p.id, p]));
      state[key] = state[key].map((d) => (by.has(d.id) ? { ...d, ...by.get(d.id) } : d));
      if (live) emit('drag');
      else changed();
    },
    /** Replace the mics: the listening tiers a library room comes with. Speakers follow the mixer if it moved. */
    seat(mics) {
      const old = state.mics.find((m) => m.mix);
      const mix = mics.find((m) => m.mix);
      if (old && mix && state.settings.followListener) {
        const dx = mix.x - old.x;
        const dy = mix.y - old.y;
        state.speakers = state.speakers.map((s) => (carried(s) ? { ...s, x: s.x + dx, y: s.y + dy } : s));
      }
      state.mics = mics;
      state.selected = null;
      changed();
    },
    append(kind, devs) {
      const key = listOf(kind);
      state[key] = [...state[key], ...devs];
      changed();
    },
    replaceSpeakers(list) {
      state.speakers = list;
      state.selected = null;
      changed();
    },
    clear() {
      state.speakers = [];
      state.mics = [];
      state.selected = null;
      changed();
    },
    commit() {
      changed();
    },
  };
}

/** Speakers that travel with the listener: not the subs (they belong to the room's modes) and not boxes built into a wall. */
const carried = (s) => s.kind !== 'sub' && s.mount !== 'flush' && s.mount !== 'corner';

export function selectedDevice(state) {
  const s = state.selected;
  if (!s || (s.kind !== 'speaker' && s.kind !== 'mic')) return null;
  return (s.kind === 'speaker' ? state.speakers : state.mics).find((d) => d.id === s.id) ?? null;
}
