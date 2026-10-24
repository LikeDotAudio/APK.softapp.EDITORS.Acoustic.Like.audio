// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { makeMic, makeSpeaker, newId } from '../acoustics/devices.js';
import { mirrorDevice, syncTwin } from '../acoustics/symmetry.js';

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
  layout: { preset: '7.1.4', radius: 2.0 },
  show: { field: true, devices: true, rays: true, rings: false, nulls: true, guides: true, rc: true, coverage: true },
};

const KEY = 'acoustic.like.audio/v1/';

export function createStore() {
  const listeners = new Set();
  const state = {
    speakers: [],
    mics: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    selected: null,
    mode: 'cad',
    /** Which drawing the CAD is showing: 'plan', or the elevation's face. Not saved: the CAD decides where it opens. */
    sheet: 'plan',
    placeKind: { speaker: 'monitor', mic: 'omni' },
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
    return { format: 'acoustic.like.audio@1', fileName: state.fileName, settings: state.settings, speakers: state.speakers, mics: state.mics };
  }

  function importDoc(doc) {
    if (!doc || doc.format !== 'acoustic.like.audio@1') throw new Error('Not an acoustic.like.audio@1 file');
    state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...doc.settings, show: { ...DEFAULT_SETTINGS.show, ...doc.settings?.show } };
    state.speakers = doc.speakers ?? [];
    state.mics = doc.mics ?? [];
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

  /** The mirror axis in metres, or null when the CAD's Symmetrical Mode is off. */
  const axis = () => (state.cad.mirror?.enabled ? state.cad.mirror.xMetres : null);

  const listOf = (kind) => (kind === 'speaker' ? 'speakers' : 'mics');

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
    setSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      changed('settings');
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
    /** Change one device; its mirror twin follows. `live` skips the save while dragging. */
    update(kind, id, patch, live = false) {
      const key = listOf(kind);
      let next = state[key].map((d) => (d.id === id ? { ...d, ...patch } : d));
      const dev = next.find((d) => d.id === id);
      if (dev?.pairId) next = syncTwin(next, dev, axis());
      if (kind === 'mic' && patch.mix) next = next.map((m) => (m.id === id ? m : { ...m, mix: false }));
      state[key] = next;
      if (live) emit('drag');
      else changed();
    },
    remove(kind, id) {
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

export function selectedDevice(state) {
  const s = state.selected;
  if (!s || (s.kind !== 'speaker' && s.kind !== 'mic')) return null;
  return (s.kind === 'speaker' ? state.speakers : state.mics).find((d) => d.id === s.id) ?? null;
}
