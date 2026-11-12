// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — the frequency slider's log ticks, the speaker arrangements' bar with its Width lanes, the monitor and furniture folds, finding the best width, the room growth, the console follow, moving an array.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { F_MAX, F_MIN } from '../compute/compute.js';
import { hz } from '../ui/meters.js';
import {
  activeSet,
  arrangedSpeakers,
  arrayFront,
  LAYOUTS,
  NO_LAYOUT,
  relayArray,
  selectSet,
  setLayout,
  SPEAKER_SETS,
} from '../acoustics/layouts.js';
import { makeFold } from '../ui/fold.js';
import { createMonitor } from '../ui/monitor.js';
import { widthSweep } from '../acoustics/widthFinder.js';
import { CLEAR_M, growthDetail, growthText, roomGrowth } from '../acoustics/roomFit.js';
import { crossings, DIRECT_MARKS_MS, GAP_MARKS_MS, radiusLanes } from '../acoustics/radiusScale.js';
import { consoleOf, consoleSettled, consoleSpot } from '../acoustics/console.js';
import { patchesFromCad } from '../compute/engine.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';

export function startWidthLanes(app) {
  const { cad, engine, inspector, status, store } = app;

  // ------------------------------------------------------------------ the slider, read as a log scale
  {
    const ticks = document.getElementById('freqTicks');
    const lo = Math.log10(F_MIN);
    const span = Math.log10(F_MAX) - lo;
    for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const at = ((Math.log10(f) - lo) / span) * 100;
      ticks.insertAdjacentHTML('beforeend', `<i style="left:${at}%"></i>${[20, 100, 1000, 10000].includes(f) ? `<span style="left:${at}%">${hz(f)}</span>` : ''}`);
    }
  }

  /** The Width slider's range, mm. */
  const WIDTH_MM = [800, 6000];
  const widthLanes = { key: [], list: [] };

  // ------------------------------------------------------------------ speaker arrangements
  {
    const bar = document.getElementById('arrangement');
    // one row per speaker set (layouts.js SPEAKER_SETS): its letter selects it, a preset selects it and lays that
    // arrangement over the room, Place puts it round the mix seat and Empty beside it silences the set —
    // only the selected set sounds
    const pick = (k, patch = {}) => {
      const settings = selectSet(store.state.settings, k);
      store.setSettings({ speakerSet: settings.speakerSet ?? 'A', layout: { ...settings.layout, ...patch }, layoutSets: settings.layoutSets, ...(patch.preset && patch.preset !== NO_LAYOUT ? { show: { ...settings.show, arrangement: true } } : {}) });
    };
    for (const [k, set] of Object.entries(SPEAKER_SETS)) {
      const row = document.createElement('div');
      row.className = 'group speakerSet';
      row.dataset.set = k;
      const letter = Object.assign(document.createElement('button'), { className: 'setLetter', textContent: set.label, title: `${set.title}: make it the set that sounds` });
      // a set picked is a set to listen to: the monitor controller opens beside them
      letter.onclick = () => {
        pick(k);
        monitorFold.open = true;
      };
      const none = document.createElement('button');
      none.dataset.preset = NO_LAYOUT;
      none.textContent = 'Empty';
      none.title = 'Empty: this set is silent — every box in it muted. A speaker placed by hand afterwards makes it a set placed by hand, and it sounds';
      none.onclick = () => pick(k, { preset: NO_LAYOUT });
      row.append(letter);
      for (const preset of set.presets) {
        const l = LAYOUTS[preset];
        const b = document.createElement('button');
        b.dataset.preset = preset;
        b.textContent = preset;
        b.title = `${set.title} · ${l.label}: show its reference angles over the room`;
        b.onclick = () => pick(k, { preset });
        row.append(b);
      }
      const place = document.createElement('button');
      place.dataset.place = '';
      place.textContent = 'Place';
      place.title = `Place this arrangement around the mix seat (replaces the ${set.title.split(' — ')[0]}'s arranged speakers)`;
      place.onclick = () => {
        if (k !== activeSet(store.state.settings)) pick(k);
        if (!LAYOUTS[store.state.settings.layout.preset]) status.textContent = '⚠ pick an arrangement to place — Empty and By hand place nothing';
        else if (!inspector.placeLayout()) status.textContent = '⚠ place a mix-position mic first';
      };
      row.append(place, none);
      bar.append(row);
    }
    // the monitor controller sits at the end of the last set's row, beside the sets it switches
    const lastRow = bar.lastElementChild;
    lastRow.append(document.getElementById('monitorBtn'), document.getElementById('monitor'));

    // the spreader: a shared table chart with a spacing fader for each speaker set (A, B, C),
    // and the shared ruler scale underneath them
    const spreader = Object.assign(document.createElement('div'), { id: 'spreader', className: 'spreaderTable' });
    for (const [k, set] of Object.entries(SPEAKER_SETS)) {
      const row = document.createElement('div');
      row.className = 'spreaderRow';
      row.dataset.set = k;

      // the fold with the set's centre offsets and rotation
      const field = (key, glyph, title) => {
        const input = Object.assign(document.createElement('input'), { type: 'number', step: key === 'rotate' ? 1 : 10, title });
        input.dataset.array = key;
        input.dataset.set = k;
        input.addEventListener('change', () => {
          const v = parseFloat(input.value);
          if (Number.isFinite(v)) moveSetArray(k, key, v);
        });
        const label = document.createElement('label');
        label.className = 'arrayField';
        label.title = title;
        label.append(glyph, input);
        return label;
      };
      const fields = document.createElement('div');
      fields.className = 'group arrayFields';
      fields.append(
        field('right', '↔', `${set.title} centre: mm to the listener’s right of the mix seat`),
        field('front', '↕', `${set.title} centre: mm toward the front from the mix seat`),
        field('up', '⇡', `${set.title} centre: mm above the mix seat’s ears`),
        field('radius', 'r', `${set.title} radius, mm — the placed speakers scale with it`),
        field('rotate', '⟲', `${set.title} rotation, degrees counter-clockwise — the placed speakers turn round the listener with it`),
      );
      const arrayBtn = Object.assign(document.createElement('button'), {
        className: 'arrayBtn',
        title: `${set.title}: centre off mix seat, width and turn — click to open offsets and make it the sounding set`,
      });
      arrayBtn.dataset.set = k;
      arrayBtn.addEventListener('click', () => {
        if (k !== activeSet(store.state.settings)) pick(k);
      });
      row.append(arrayBtn);
      makeFold(arrayBtn, fields);

      // each speaker set's own spacing fader
      const fader = Object.assign(document.createElement('input'), {
        type: 'range',
        className: 'setRadius',
        min: WIDTH_MM[0],
        max: WIDTH_MM[1],
        step: 10,
        title: `${set.title} width: radius round the listener — the placed speakers follow`,
      });
      fader.dataset.set = k;
      fader.setAttribute('list', 'bestWidth');
      fader.addEventListener('input', () => moveSetArray(k, 'radius', parseFloat(fader.value), true));
      fader.addEventListener('change', () => moveSetArray(k, 'radius', parseFloat(fader.value)));

      row.append(fader);
      spreader.append(row);
    }

    // under the faders: the shared scale ruler chart
    const scaleRow = document.createElement('div');
    scaleRow.className = 'spreaderScale';
    const spacer = Object.assign(document.createElement('div'), { className: 'scaleSpacer' });
    const scale = Object.assign(document.createElement('div'), { className: 'widthScale' });
    const lanes = Object.assign(document.createElement('div'), { id: 'widthLanes', className: 'lanes' });
    lanes.addEventListener('pointermove', (e) => {
      const box = lanes.getBoundingClientRect();
      const r = (WIDTH_MM[0] + ((e.clientX - box.left - 8) / (box.width - 16)) * (WIDTH_MM[1] - WIDTH_MM[0])) / 1000;
      const near = widthLanes.list.reduce((b, l) => (!b || Math.abs(l.r - r) < Math.abs(b.r - r) ? l : b), null);
      lanes.title = near ? laneText(near) : '';
    });
    scale.append(lanes);
    const find = Object.assign(document.createElement('button'), { id: 'findWidthBtn', textContent: '⌖', title: 'Find the width with the flattest low end over the room’s seats' });
    find.onclick = () => findWidth();
    const grow = Object.assign(document.createElement('span'), { id: 'roomGrow', className: 'roomGrow', hidden: true });
    const ticks = Object.assign(document.createElement('datalist'), { id: 'bestWidth' });
    scaleRow.append(spacer, scale, find, grow, ticks);
    spreader.append(scaleRow);

    bar.after(spreader);
  }
  const monitor = createMonitor({ root: document.getElementById('monitor'), store, engine });
  const monitorFold = makeFold(document.getElementById('monitorBtn'), document.getElementById('monitor'), { sticky: true, onOpen: () => monitor.render() });
  makeFold(document.getElementById('furnitureBtn'), document.getElementById('furniture'), { closeOn: 'button[data-arm]' });

  /**
   * Sweep the array's width for the flattest low end over the room's seats
   * (acoustics/widthFinder.js), a few radii a frame so the page keeps drawing.
   * The answer goes in state.widthFit (not saved) and shows as a tick on both
   * Width sliders; the Layout tab offers to snap to it.
   */
  function findWidth() {
    const room = engine.out.room;
    const { speakers, mics, settings } = store.state;
    if (!room || !mics.some((m) => m.mix)) {
      status.textContent = '⚠ place a mix-position mic first';
      return;
    }
    const sweep = widthSweep(room, speakers, mics, settings, { to: Math.min(6, Math.max(1, Math.hypot(room.L, room.W) / 2)) });
    let done = 0;
    const tick = () => {
      const t0 = performance.now();
      let more = true;
      while (more && performance.now() - t0 < 30) {
        more = sweep.step();
        done++;
      }
      store.state.widthFit = { ...sweep.result, running: more, done, total: sweep.total };
      store.emit('fit');
      if (more) requestAnimationFrame(tick);
    };
    tick();
  }

  /** The arranged speakers through a wall or the ceiling: the room they would need, beside the Width slider. */
  function syncRoomGrowth() {
    const el = document.getElementById('roomGrow');
    if (!el) return;
    const g = roomGrowth(engine.out.room, arrangedSpeakers(store.state.speakers, store.state.settings));
    el.hidden = !g.any;
    el.textContent = g.any ? `⤢ room ${growthText(g)}` : '';
    el.title = g.any ? `This width puts speakers outside the room. To keep them ${CLEAR_M} m clear of the walls: ${growthDetail(g)} — the dashed outline on the plan.` : '';
  }

  const laneText = (l) => `r ${l.r.toFixed(2)} m · direct ${l.direct.toFixed(1)} ms · first reflection +${l.gap.toFixed(1)} ms${l.fits ? '' : ' · outside the room'}`;

  /**
   * The scale under the Width slider (acoustics/radiusScale.js): a metre ruler; the room's footprint as a strip,
   * green where the carried speakers fit and red where they would go through a wall; ticks where the main speakers'
   * direct sound reaches the mix seat in a round number of ms (blue), and where the first reflection's lag behind
   * it falls through 20, 10, 5 ms (amber). Recomputed only when the room, the boxes, the seats or the layout change.
   */
  function syncWidthScale() {
    const el = document.getElementById('widthLanes');
    if (!el) return;
    const { speakers, mics, settings } = store.state;
    const key = [engine.out.room, speakers, mics, settings.layout, settings.speakerSet];
    if (key.every((k, i) => k === widthLanes.key[i])) return;
    widthLanes.key = key;
    const list = radiusLanes(engine.out.room, speakers, mics, settings, { from: WIDTH_MM[0] / 1000, to: WIDTH_MM[1] / 1000 });
    widthLanes.list = list;
    const span = WIDTH_MM[1] - WIDTH_MM[0];
    const pos = (r) => `left: calc(8px + (100% - 16px) * ${((r * 1000 - WIDTH_MM[0]) / span).toFixed(4)})`;
    const parts = [];
    // the footprint strip: one gradient stop per change of fit
    if (list.length) {
      const stops = [];
      list.forEach((l, i) => {
        const f = ((l.r * 1000 - WIDTH_MM[0]) / span) * 100;
        const c = l.fits ? 'var(--ok)' : 'var(--bad)';
        if (i === 0 || l.fits !== list[i - 1].fits) stops.push(`${c} ${f.toFixed(2)}%`);
        if (i === list.length - 1 || l.fits !== list[i + 1].fits) stops.push(`${c} ${f.toFixed(2)}%`);
      });
      parts.push(`<i class="foot" style="background: linear-gradient(90deg, ${stops.join(', ')})" title="The room's footprint: green, the speakers fit; red, they would go through a wall or the ceiling"></i>`);
    }
    for (let r = Math.ceil(WIDTH_MM[0] / 500) * 0.5; r * 1000 <= WIDTH_MM[1]; r += 0.5) {
      parts.push(`<i class="tick${r % 1 ? '' : ' major'}" style="${pos(r)}"></i>`);
      if (!(r % 1)) parts.push(`<span class="m" style="${pos(r)}">${r}${r === 1 ? ' m' : ''}</span>`);
    }
    for (const c of crossings(list, 'direct', DIRECT_MARKS_MS)) parts.push(`<b class="mark direct" style="${pos(c.r)}" title="The direct sound reaches the mix seat in ${c.ms} ms at r ${c.r.toFixed(2)} m">${c.ms}</b>`);
    for (const c of crossings(list, 'gap', GAP_MARKS_MS)) parts.push(`<b class="mark gap" style="${pos(c.r)}" title="The first reflection arrives ${c.ms} ms after the direct sound at r ${c.r.toFixed(2)} m — narrower keeps it later">+${c.ms}</b>`);
    el.innerHTML = parts.join('');
  }

  /** The best width as a tick on every Width slider. */
  function syncWidthTicks() {
    const fit = store.state.widthFit;
    const best = fit?.preset === store.state.settings.layout.preset ? fit.best : null;
    const list = document.getElementById('bestWidth');
    if (list) list.replaceChildren(...(best ? [Object.assign(document.createElement('option'), { value: Math.round(best.r * 1000) })] : []));
  }

  /**
   * Keep the console at the mixer's nose (acoustics/console.js): after every
   * recompute — so while the seat is dragged or turned too — the nearest
   * console on the sheet is moved square in front of the mix seat, its near
   * edge the set number of people clear. Nothing is sent once it is there.
   */
  function followConsole() {
    const { settings, mics, cad: { geometry } } = store.state;
    const mix = mics.find((m) => m.mix);
    if (!cad.link || !geometry || !mix || settings.console?.follow === false) return;
    const desk = consoleOf(patchesFromCad(geometry), mix);
    if (!desk) return;
    const spot = consoleSpot(mix, desk.paletteId, settings.console?.people ?? 2);
    if (consoleSettled(desk, spot)) return;
    const k = METRES_PER_UNIT[geometry.units] ?? 1;
    cad.link.move([{ id: desk.id, at: [+(spot.x / k).toFixed(4), +(spot.y / k).toFixed(4)], rotation: spot.rotation }]);
  }

  /** Change set k's array centre offset or radius (mm), or its rotation (degrees), carrying its placed speakers along. */
  function moveSetArray(k, key, mm, live = false) {
    const { settings, speakers, mics } = store.state;
    const layout = setLayout(settings, k);
    const next =
      key === 'radius' ? { ...layout, radius: Math.max(0.3, mm / 1000) }
      : key === 'rotate' ? { ...layout, rotate: ((((mm + 180) % 360) + 360) % 360) - 180 }
      : { ...layout, offset: { ...layout.offset, [key]: mm } };
    const mix = mics.find((m) => m.mix);
    const setSettings = { ...settings, speakerSet: k, layout };
    const moved = relayArray(speakers, setSettings, mix, next, engine.out.room);
    if (moved.length) store.updateMany('speaker', moved, true);
    if (k === activeSet(settings)) {
      if (key === 'rotate' && mix) store.updateMany('mic', [{ id: mix.id, aim: +arrayFront({ ...settings, layout: next }).toFixed(1) }], true);
      store.setSettings({ layout: next }, live);
    } else {
      store.setSettings({ layoutSets: { ...settings.layoutSets, [k]: next } }, live);
    }
  }

  /** Change the active array's centre offset or radius (mm), or its rotation (degrees), carrying the speakers placed in it along. */
  function moveArray(key, mm, live = false) {
    moveSetArray(activeSet(store.state.settings), key, mm, live);
  }

  return { monitor, findWidth, syncRoomGrowth, syncWidthScale, syncWidthTicks, followConsole, moveArray };
}
