// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { talkers } from '../acoustics/talk.js';
import { receiverOrder, sourceGroups } from '../acoustics/groups.js';
import { setColour, SPEAKER_SETS } from '../acoustics/layouts.js';
import { h, row, select } from './dom.js';
import { TABS, fmt, spark, surfaceLabel } from './inspector/common.js';
import { inspectTab } from './inspector/inspect.js';
import { acousticsTab } from './inspector/acoustics.js';
import { roomTab } from './inspector/room.js';
import { layoutTab } from './inspector/layout.js';
import { furnitureTab } from './inspector/furniture.js';
import { buildTab } from './inspector/build.js';

/**
 * THE INSPECTOR
 *
 * Every parameter the engine reads is editable here, nothing hidden behind a
 * default: each speaker's level, pattern, coverage, low-frequency behaviour,
 * mount, delay; each mic's pattern and role; the room's height, front and six
 * surfaces; the field method, frequency, band, order and resolution; the
 * layout preset and the mirror. Tabs keep it to one screen.
 *
 * The treatments are the exception: they are painted in the CAD and live in
 * the drawing, so here they are read, not edited — what each surface ends up
 * made of, every treatment with its bands, and the catalogue the CAD's
 * palette blocks stand for.
 */

export function createInspector({ root, store, engine, cad, jumpTo, drawRoom, onSubs = () => {}, moveArray = () => {}, findWidth = () => {} }) {
  let tab = 'Inspect';
  let pending = false;

  root.addEventListener('focusout', () => {
    if (pending) setTimeout(render, 0);
  });

  function render() {
    // the inspector may be in a window of its own: ask its own document what has focus
    const active = root.ownerDocument.activeElement;
    if (root.contains(active) && active !== root.ownerDocument.body && active.tagName !== 'BUTTON') {
      pending = true;
      return;
    }
    pending = false;
    const scroll = root.querySelector('.body')?.scrollTop ?? 0;
    // the ⇱ rides at the end of the tab row, in the flow, so no tab ever covers it
    const popBtn = root.querySelector('.popbtn');
    root.replaceChildren(
      h('nav', { class: 'tabs' }, ...TABS.map((t) => h('button', { class: [t === tab ? 'on' : '', t === 'File' ? 'file' : ''].join(' ').trim(), onclick: () => { tab = t; render(); } }, t, t === 'Advisor' ? badge() : t === 'Treatments' ? warnBadge() : '')), ...(popBtn ? [popBtn] : [])),
      h('div', { class: 'body' }, ...PANES[tab]()),
    );
    root.querySelector('.body').scrollTop = scroll;
  }

  function badge() {
    const n = engine.out.advice.filter((a) => a.level === 'warn').length;
    return n ? h('i', { class: 'badge' }, String(n)) : '';
  }

  /** A treatment the room could not place is worth a look, the way an advisor warning is. */
  function warnBadge() {
    const n = engine.out.room?.patchWarnings?.length ?? 0;
    return n ? h('i', { class: 'badge', title: `${n} treatment${n > 1 ? 's' : ''} not placed` }, String(n)) : '';
  }

  const S = () => store.state;
  const set = (patch) => store.setSettings(patch);

  /** The set picked in the Colour row's drop-down, and the set the row was showing then: picked again elsewhere, it starts on its own. */
  let colourSet = null;
  /** Colour: which set (A B C), and that set's colour — its speakers, their patterns and its arrangement take it. */
  function colourRow(own) {
    const { settings } = S();
    const k = colourSet?.own === own ? colourSet.k : own;
    return row(
      'Colour',
      select(k, Object.entries(SPEAKER_SETS).map(([value, x]) => ({ value, label: x.title })), (v) => {
        colourSet = { own, k: v };
        render();
      }),
      h('input', { type: 'color', value: setColour(settings, k), title: `${SPEAKER_SETS[k].title}: its speakers, their patterns and its arrangement are drawn in this colour`, onchange: (e) => set({ setColours: { ...S().settings.setColours, [k]: e.target.value } }) }),
    );
  }

  // ------------------------------------------------------------------ Inspect
  // The list is rebuilt on every selection, so a double click never reaches the same button twice: clicks are counted here.
  let lastClick = { id: null, at: 0 };
  function listClick(kind, id) {
    const now = performance.now();
    const again = lastClick.id === id && now - lastClick.at < 450;
    lastClick = { id, at: now };
    // a second (or third) click on one outside the room brings it to the middle
    if (again && store.bringIn(kind, id, engine.out.room)) return;
    store.select({ kind, id });
  }

  /**
   * The ACOUSTIC GROUPS (acoustics/groups.js) as one tree: Room, Surfaces,
   * Sources by speaker set and the people who talk, Receivers. A branch folded shut stays shut across
   * redraws; `room: false` leaves the first two out (the transducer picker).
   */
  const shut = new Set();
  function branch(key, summary, kids, cls = '') {
    const el = h('details', { class: `branch ${cls}`.trim(), open: !shut.has(key) }, h('summary', {}, ...[summary].flat()), h('div', { class: 'leaves' }, ...kids));
    el.addEventListener('toggle', () => (el.open ? shut.delete(key) : shut.add(key)));
    return el;
  }
  function acousticTree({ room: withRoom = true, speaker, mic }) {
    const { speakers, mics, settings, selected } = S();
    const room = engine.out.room;
    const out = [];
    if (withRoom && room) {
      const wall = (w) => h('button', { class: `dev ${selected?.kind === 'wall' && selected.id === w.key ? 'on' : ''}`, style: '--c:#9ca3af', onclick: () => store.select({ kind: 'wall', id: w.key }) }, surfaceLabel(room, `wall:${w.i}`), h('small', {}, ` ${fmt(w.len, 2)} m`));
      out.push(branch('room', ['📐 Room', h('small', {}, ` ${fmt(room.area, 1)} m² · H ${fmt(room.H)} m · V ${fmt(room.V, 1)} m³`)], room.walls.map(wall)));
      const surface = (sf) =>
        h('button', { class: 'dev', style: '--c:#9ca3af', title: `α ${sf.material.alpha.map((a) => a.toFixed(2)).join(' ')} · s ${sf.material.scatter.map((a) => a.toFixed(2)).join(' ')}`, onclick: () => showSurface(sf.key) }, surfaceLabel(room, sf.key), ' ', spark(sf.material.alpha));
      out.push(branch('surfaces', ['🧱 Surfaces', h('small', {}, ` ᾱ ${fmt(room.perBand[2]?.abar)} at 500 Hz`)], (room.surfaces ?? []).map(surface)));
    }
    const sets = sourceGroups(speakers, settings);
    // the people talk too (acoustics/talk.js): each one a source to everyone else
    const people = talkers(mics);
    const voices = people.length ? [branch('set:people', ['🗣 People — each talks to the others', h('small', {}, ` STI each way · ${people.length}`)], people.map(mic))] : [];
    out.push(
      branch(
        'sources',
        ['🔊 Sources', h('small', {}, ` ${speakers.length + people.length}`)],
        sets.length || people.length ? [...sets.map((g) => branch(`set:${g.key}`, [g.title, h('small', {}, ` ${g.muted ? 'none · muted' : g.preset ?? 'by hand'}${g.live && !g.muted ? ' · sounding' : ''} · ${g.items.length}`)], g.items.map(speaker), g.live && !g.muted ? 'live' : '')), ...voices] : [h('p', { class: 'hint' }, 'None yet — ＋ Speaker.')],
      ),
    );
    out.push(branch('receivers', ['🎧 Receivers', h('small', {}, ` ${mics.length}`)], mics.length ? receiverOrder(mics).map(mic) : [h('p', { class: 'hint' }, 'None yet — ＋ Mic.')]));
    return h('div', { class: 'tree' }, ...out);
  }
  /** A surface's α and s, band by band: the Wall half of the Acoustics tab. */
  function showSurface(key) {
    tab = 'Acoustics';
    acoustics = { view: 'Wall', for: undefined, surface: key };
    if (S().selected) store.select(null);
    else render();
  }

  let acoustics = { view: null, for: undefined };
  // ── the shared context the parts read (ui/inspector/) ──
  const ins = {
    acousticTree, cad, colourRow, drawRoom, engine, findWidth, jumpTo, listClick, moveArray, onSubs, render,
    S, set, showWall, store,
    get acoustics() {
      return acoustics;
    },
    set acoustics(v) {
      acoustics = v;
    },
    get tab() {
      return tab;
    },
    set tab(v) {
      tab = v;
    },
  };
  Object.assign(ins, inspectTab(ins));
  Object.assign(ins, acousticsTab(ins));
  Object.assign(ins, roomTab(ins));
  Object.assign(ins, layoutTab(ins));
  Object.assign(ins, furnitureTab(ins));
  Object.assign(ins, buildTab(ins));
  const {
    acousticsPane, advisorPane, buildPane, fieldPane, filePane, furniturePane, inspectPane, layoutPane,
    materialsPane, placeCurrentLayout, roomPane, subsPane, symmetryPane, treatmentsPane,
  } = ins;

  /** A wall picked anywhere: selected and shown on the Inspect tab. */
  function showWall(key) {
    if (!key) return;
    tab = 'Inspect';
    if (S().selected?.kind === 'wall' && S().selected.id === key) render();
    else store.select({ kind: 'wall', id: key });
  }

  const PANES = { Inspect: inspectPane, Acoustics: acousticsPane, Room: roomPane, Build: buildPane, Treatments: treatmentsPane, Furniture: furniturePane, Symmetry: symmetryPane, Materials: materialsPane, Field: fieldPane, Layout: layoutPane, Subs: subsPane, Advisor: advisorPane, File: filePane };

  return {
    render,
    placeLayout: placeCurrentLayout,
    show: (t) => {
      tab = t;
      render();
    },
    showWall,
    /** A treatment clicked in a view: selected, and shown where its details are — unless the Treatments list already is. */
    showPatch: (id) => {
      if (tab !== 'Treatments') tab = 'Inspect';
      store.select({ kind: 'patch', id });
    },
  };
}

