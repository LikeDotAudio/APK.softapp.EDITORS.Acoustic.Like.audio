// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Field and Layout tabs: refining’s cost, the field, the layout presets, the width fit, the growth rows, placing a layout, the CAD marks part.
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { gridCount, REFINE_LABEL, refinedRes } from '../../compute/engine.js';
import { fmt } from './common.js';
import { button, check, h, num, row, select, slider } from '../dom.js';
import { BAND_LABELS, C } from '../../acoustics/bands.js';
import { ACOUSTX_MENU, makeSpeaker, newId, SPEAKER_PRESETS } from '../../acoustics/devices.js';
import {
  activeSet,
  arrangedSpeakers,
  arrayFront,
  HAND_LAYOUT,
  isMain,
  layoutCentre,
  layoutPositions,
  LAYOUTS,
  NO_LAYOUT,
  setOf,
  SPEAKER_SETS,
} from '../../acoustics/layouts.js';
import { LOW_END } from '../../acoustics/widthFinder.js';
import { CLEAR_M, growthDetail, growthText, roomGrowth } from '../../acoustics/roomFit.js';
import { PRODUCTS } from '../../acoustics/materials.js';

export function layoutTab(ins) {
  const { colourRow, engine, findWidth, moveArray, S, set, store } = ins;

  /**
   * What refining costs, before it is paid: every halving of the cell is four
   * times the points to compute and four times the cells the 3-D view draws.
   * Estimated from the field as set, and — once a level has run — measured.
   */
  function refineWarning(settings) {
    const levels = settings.refine ?? 0;
    const grids = engine.out.grids;
    if (!levels || !grids) return [];
    const base = gridCount(grids);
    const cost = engine.out.cost ?? [];
    const ms0 = cost[0]?.ms;
    const lines = [];
    for (let l = 1; l <= levels; l++) {
      const k = (refinedRes(settings.resolution, l) / settings.resolution) ** 2;
      const had = cost[l];
      const pts = had?.points ?? base * k;
      const time = had ? `took ${fmt(had.ms / 1000, 1)} s` : ms0 ? `about ${fmt((ms0 * k) / 1000, 1)} s` : `${fmt(k, 0)}× the work`;
      lines.push(`cells ${REFINE_LABEL[l]}: ${fmt(pts / 1e6, 2)} M points · ${time}`);
    }
    const heavy = (cost[levels]?.points ?? base * (refinedRes(settings.resolution, levels) / settings.resolution) ** 2) > 400000;
    return [
      h('p', { class: `hint${heavy ? ' warn' : ''}` }, `⚠ CPU and rendering: each halving of the cell is 4× the points to compute and 4× the cells the 3-D room draws. ${lines.join(' · ')}. It runs in the background after the field is up and stops the moment anything changes; the sweep's frames wait for it, and the 3-D room drops back to coarse cells while you orbit or zoom.`),
    ];
  }

  // -------------------------------------------------------------------- Field
  function fieldPane() {
    const { settings } = S();
    const sh = settings.show;
    const logF = Math.log10(settings.freq);
    const freqNum = num(settings.freq, (v) => set({ freq: Math.max(20, Math.min(2000, v)) }), { step: 1, unit: 'Hz' });
    return [
      h('h3', {}, 'Field'),
      row('Method', select(settings.method, [{ value: 'wave', label: 'Wave — image sources with phase' }, { value: 'energy', label: 'Energy — direct + diffuse, per octave' }, { value: 'modal', label: 'Modal — room modes (rectangle / box)' }], (v) => set({ method: v }))),
      row('Frequency', slider(logF, Math.log10(20), Math.log10(2000), 0.005, (v) => set({ freq: Math.round(10 ** v) })), freqNum),
      row('Octave band', select(settings.band, BAND_LABELS.map((label, value) => ({ value, label })), (v) => set({ band: +v }))),
      row('Reflection order', num(settings.maxOrder, (v) => set({ maxOrder: Math.max(0, Math.min(6, Math.round(v))) }), { step: 1, min: 0, max: 6 })),
      row('Resolution', num(settings.resolution, (v) => set({ resolution: Math.max(16, Math.min(200, Math.round(v))) }), { step: 8, unit: 'cells', min: 16, max: 200 })),
      row('Then refine to', select(String(settings.refine ?? 0), REFINE_LABEL.map((label, i) => ({ value: String(i), label: i ? `cells ${REFINE_LABEL.slice(1, i + 1).join(' → ')}` : 'no — stop at the resolution' })), (v) => set({ refine: +v }))),
      ...refineWarning(settings),
      row('Colour range', num(settings.rangeDb, (v) => set({ rangeDb: Math.max(6, v) }), { step: 3, unit: 'dB', min: 6 })),
      row('Plan slice height', num(settings.sliceHeight ?? NaN, (v) => set({ sliceHeight: v }), { unit: 'm (blank = mix ears)' }), button('auto', () => set({ sliceHeight: null }))),
      row('A-weighting (meter)', check(settings.aWeight, (v) => set({ aWeight: v }))),
      h('p', { class: 'hint' }, `λ at ${settings.freq} Hz = ${fmt(C / settings.freq)} m · ¼λ = ${fmt(C / settings.freq / 4)} m`),
      h('h4', {}, 'Show'),
      h(
        'div',
        { class: 'toggles' },
        check(sh.field, (v) => store.setShow({ field: v }), 'Field'),
        check(sh.devices, (v) => store.setShow({ devices: v }), 'Devices'),
        check(sh.coverage, (v) => store.setShow({ coverage: v }), 'Coverage'),
        check(sh.rays, (v) => store.setShow({ rays: v }), 'Reflections'),
        check(sh.talk, (v) => store.setShow({ talk: v }), 'Talk paths (STI)'),
        check(sh.trace, (v) => store.setShow({ trace: v }), 'Ray tracing (every view)'),
        check(sh.rc, (v) => store.setShow({ rc: v }), 'Critical distance'),
        check(sh.rings, (v) => store.setShow({ rings: v }), 'Distance rings'),
        check(sh.nulls, (v) => store.setShow({ nulls: v }), 'Modal nulls'),
        check(sh.guides, (v) => store.setShow({ guides: v }), '38 % / ear guides'),
      ),
    ];
  }

  // ------------------------------------------------------------------- Layout
  function layoutPane() {
    const { settings } = S();
    const out = engine.out;
    const mix = S().mics.find((m) => m.mix);
    const room = out.room;
    // the best width found for this arrangement (main.js findWidth), if any
    const fit = S().widthFit?.preset === settings.layout.preset ? S().widthFit : null;
    const best = fit?.running ? null : fit?.best;
    // where the array sits if not on the seat: the toolbar's ↔ ↕ ⇡, said in words
    const off = settings.layout.offset ?? {};
    const offAxis = [['right', 'right', 'left'], ['front', 'forward', 'back'], ['up', 'up', 'down']]
      .filter(([k]) => off[k])
      .map(([k, plus, minus]) => `${Math.abs(off[k])} mm ${off[k] > 0 ? plus : minus}`)
      .join(', ');
    // the generic boxes, then every monitor in the Acoustic X library by its slug (each is listed under three keys)
    const acx = ACOUSTX_MENU;
    const boxes = [...Object.entries(SPEAKER_PRESETS).filter(([k]) => k !== 'sub'), ...acx].map(([value, p]) => ({ value, label: p.label }));
    const parts = [
      h('h3', {}, SPEAKER_SETS[activeSet(settings)].title),
      row('Preset', select(settings.layout.preset, [{ value: NO_LAYOUT, label: 'Empty — the set is silent' }, { value: HAND_LAYOUT, label: 'By hand — every box sounds' }, ...SPEAKER_SETS[activeSet(settings)].presets.map((value) => ({ value, label: LAYOUTS[value].label }))], (v) => set({ layout: { ...settings.layout, preset: v } }))),
      // the width carries the placed speakers with it, so they stay round the listener
      row('Width', widthSlider(settings.layout.radius, best), num(settings.layout.radius, (v) => moveArray('radius', Math.max(0.8, v) * 1000), { unit: 'm radius', min: 0.8, step: 0.1 })),
      ...widthFitRows(fit, best, settings.layout.radius),
      ...growthRows(room, settings),
      offAxis ? row('Centre', h('span', { class: 'stat' }, `${offAxis} off the ${mix?.name || 'mix seat'}`), button('On the listener', () => ['right', 'front', 'up'].forEach((k) => moveArray(k, 0)))) : '',
      // turning carries the placed speakers round the centre, each still aimed at the listener
      row('Rotate', slider(settings.layout.rotate ?? 0, -180, 180, 1, (v) => moveArray('rotate', v, true), (v) => moveArray('rotate', v)), num(settings.layout.rotate ?? 0, (v) => moveArray('rotate', v), { unit: '°', step: 1, min: -180, max: 180 })),
      colourRow(activeSet(settings)),
      row('Mains · L C R', select(settings.layout.mains ?? 'dmt12', boxes, (v) => set({ layout: { ...settings.layout, mains: v } }))),
      row('Surrounds & tops', select(settings.layout.surround ?? 'dmt8', boxes, (v) => set({ layout: { ...settings.layout, surround: v } }))),
      h(
        'div',
        { class: 'actions' },
        settings.layout.preset === NO_LAYOUT ? h('p', { class: 'hint' }, 'Empty: every box in this set is muted. Pick an arrangement, or By hand to hear the boxes you place.') : !LAYOUTS[settings.layout.preset] ? h('p', { class: 'hint' }, 'By hand: every speaker is yours to place, and every one sounds.') : mix && room ? button(`Place ${settings.layout.preset} around mix`, () => placeLayout(mix, room)) : h('p', { class: 'hint' }, 'Place a mix-position mic first.'),
      ),
    ];
    if (out.layout.length)
      parts.push(
        h('h4', {}, 'Check against references'),
        h(
          'table',
          { class: 'grid' },
          h('tr', {}, h('th', {}, ''), h('th', {}, 'az°'), h('th', {}, 'want'), h('th', {}, 'el°'), h('th', {}, 'm'), h('th', {}, 'delay'), h('th', {}, 'trim')),
          ...out.layout.map((r) =>
            h(
              'tr',
              { class: r.ok ? 'ok' : 'bad', onclick: () => store.select({ kind: 'speaker', id: r.id }) },
              h('td', {}, `${r.ok ? '✓' : '✗'} ${r.role}`),
              h('td', {}, fmt(r.az, 0)),
              h('td', {}, r.want.side === 'C' ? '0' : `${r.want.range[0]}–${r.want.range[1]}`),
              h('td', {}, fmt(r.el, 0)),
              h('td', {}, fmt(r.dist)),
              h('td', {}, `${fmt(r.delayMs, 2)} ms`),
              h('td', {}, `${fmt(r.trimDb, 1)} dB`),
            ),
          ),
        ),
        h('p', { class: 'hint' }, 'References: ITU-R BS.2051 / BS.775 public tables. Certification is the Dolby Atmos Room Design Tool’s job; this shows how far the drawing is from a starting point.'),
      );
    return parts;
  }

  /** The Width slider: drag spreads the placed speakers live, release commits; the best width is a tick on it. */
  function widthSlider(r, best) {
    const input = slider(r, 0.8, 6, 0.05, (v) => moveArray('radius', v * 1000, true), (v) => moveArray('radius', v * 1000));
    if (!best) return input;
    const id = 'bestWidthPane';
    input.setAttribute('list', id);
    return h('span', { class: 'widthSlider' }, input, h('datalist', { id }, h('option', { value: best.r })));
  }

  /** The best-width finder's line: run it, watch it, snap to what it found. */
  function widthFitRows(fit, best, r) {
    if (fit?.running) return [h('p', { class: 'stat' }, `Finding the best width… ${fit.done} of ${fit.total}`)];
    const find = button(fit ? '⌖ Find again' : '⌖ Find best width', () => findWidth());
    if (!best) return [h('div', { class: 'actions' }, find, fit ? h('span', { class: 'hint' }, 'No width fits: every radius tried puts a speaker outside the room.') : '')];
    const here = fit.tried.reduce((a, t) => (Math.abs(t.r - r) < Math.abs(a.r - r) ? t : a), fit.tried[0]);
    return [
      h('p', { class: 'stat' }, `Flattest low end at r ${fmt(best.r)} m: ±${fmt(best.spread, 1)} dB over the room’s seats, ${LOW_END.lo}–${LOW_END.hi} Hz (now ±${fmt(here.spread, 1)} dB at ${fmt(here.r)} m)`),
      h('div', { class: 'actions' }, Math.abs(best.r - r) > 0.01 ? button(`Snap to ${fmt(best.r)} m`, () => moveArray('radius', best.r * 1000)) : h('span', { class: 'hint' }, 'At the best width.'), find),
    ];
  }

  /** The array wider than the room: the expansion it would need, wall by wall. */
  function growthRows(room, settings) {
    const g = roomGrowth(room, arrangedSpeakers(S().speakers, settings));
    if (!g.any) return [];
    return [h('p', { class: 'hint grow' }, `⤢ This width needs a bigger room — ${growthText(g)}: ${growthDetail(g)}, keeping every box ${CLEAR_M} m clear. The dashed outline on the plan shows it.`)];
  }

  /** The toolbar's Place: place the current preset around the mix seat. False when there is no mix seat or room. */
  function placeCurrentLayout() {
    const mix = S().mics.find((m) => m.mix);
    const room = engine.out.room;
    if (!mix || !room || !LAYOUTS[S().settings.layout.preset]) return false;
    placeLayout(mix, room);
    return true;
  }

  function placeLayout(mix, room) {
    // the arrangement faces the way the mixer faces: its Rotate is the mixer's turn off the room's front
    if (mix.aim != null) {
      const rotate = ((((mix.aim - S().settings.frontDeg + 180) % 360) + 360) % 360) - 180;
      if (Math.abs(rotate - (S().settings.layout.rotate ?? 0)) > 0.05) store.setSettings({ layout: { ...S().settings.layout, rotate: +rotate.toFixed(1) } }, true);
    }
    const { settings } = S();
    const ax = store.axis();
    // the mains one box, the surrounds and heights another: DMT 12s at the front, DMT 8s round the rest
    const box = (role) => LAYOUTS[settings.layout.preset]?.box ?? (isMain(role) ? settings.layout.mains ?? 'dmt12' : settings.layout.surround ?? 'dmt8');
    // only the selected set is laid afresh: the other sets' boxes stay where they stand
    const setId = activeSet(settings);
    const keep = S().speakers.filter((s) => !s.role || setOf(s) !== setId);
    const centre = layoutCentre(mix, arrayFront(settings), settings.layout.offset);
    const placed = layoutPositions(settings.layout.preset, centre, arrayFront(settings), settings.layout.radius, room.H, room);
    const pairs = new Map();
    const speakers = placed.map((p) => {
      const s = { ...makeSpeaker(p.sub ? 'sub' : box(p.role), p, { name: p.role, role: p.role, side: p.side, aim: +p.aim.toFixed(1), tilt: +p.tilt.toFixed(1) }), set: setId };
      const base = p.role.slice(1);
      if (settings.symmetric && ax != null && Math.abs(centre.x - ax) < 0.02 && (p.side === 'L' || p.side === 'R')) {
        if (!pairs.has(base)) pairs.set(base, newId('p'));
        s.pairId = pairs.get(base);
      }
      return s;
    });
    store.replaceSpeakers([...keep, ...speakers]);
  }

  /** What this app draws into the CAD file itself, and the panels it puts at the reflection points. */
  function cadMarksPart() {
    const { settings } = S();
    const cm = settings.cadMarks;
    const ap = settings.autoPanels;
    const toggle = (key, label) => check(cm[key], (v) => set({ cadMarks: { ...cm, [key]: v } }), label);
    const products = PRODUCTS.map((p) => ({ value: p.id, label: p.name }));
    return [
      h('h4', {}, 'Drawn into the CAD'),
      h('div', { class: 'checks' }, toggle('panels', 'reflection panels on the walls'), toggle('ceilingPanels', 'clouds at the ceiling reflections'), toggle('finishes', 'region tags & finish schedule on each wall'), toggle('slices', 'a layer per thing, from the brass marker'), toggle('windows', 'windows and their casings'), toggle('labels', 'wall and plan labels'), toggle('cutaways', '3 cut-away views'), toggle('reflections', 'rays & reflection heat in the cut-aways'), toggle('sections', 'wall & floor sections'), toggle('arrangement', 'speaker layout'), toggle('schematic', 'system schematic: signal flow and racks')),
      row('Wall panel', select(ap.wall, products, (v) => set({ autoPanels: { ...ap, wall: v } }))),
      row('Panel size', num(ap.w, (v) => set({ autoPanels: { ...ap, w: v } }), { unit: 'm wide', min: 0.2, step: 0.05 }), num(ap.h, (v) => set({ autoPanels: { ...ap, h: v } }), { unit: 'm tall', min: 0.2, step: 0.05 })),
      row('Ceiling cloud', select(ap.ceiling, products, (v) => set({ autoPanels: { ...ap, ceiling: v } }))),
      h('div', { class: 'checks' }, check(ap.front !== false, (v) => set({ autoPanels: { ...ap, front: v } }), 'a panel on the wall behind each free-standing box'), check(ap.sideDiffusers === true, (v) => set({ autoPanels: { ...ap, sideDiffusers: v } }), 'diffusers at the side-wall reflections, 305 mm under the ears to 914 mm over')),
      row('Side diffuser', select(ap.diffuser ?? 'qrd-1200x600', products, (v) => set({ autoPanels: { ...ap, diffuser: v } }))),
      h('p', { class: 'hint' }, 'A panel goes wherever a speaker’s first reflection meets a wall on its way to the mix seat, named LEFT-1, RIGHT-2 … on the wall’s elevation. They move when the speakers or the seat move, and the room hears them like any treatment.'),
    ];
  }

  return { fieldPane, layoutPane, placeCurrentLayout, cadMarksPart };
}
