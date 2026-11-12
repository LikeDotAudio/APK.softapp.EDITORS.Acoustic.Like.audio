// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTICS.LIKE.AUDIO — the toolbar: the edit and placing modes, the view buttons, the frequency, the field scale and its ramp, syncToolbar, the keys, the cache read-out.
 * Lifted out of main.js (ROAD-3753) and run at the same point of its start-up:
 * `app` is the page's shared context — what main.js holds, and what the other parts return.
 */
import { fieldScale, rampGradient } from '../views/paint.js';
import { F_MAX, F_MIN, powerMean, roomSeats, seatWeight } from '../compute/compute.js';
import { ELEVATION_LAYER } from '../acoustics/elevations.js';
import { hz } from '../ui/meters.js';
import { activeSet, LAYOUTS, setLayout, SPEAKER_SETS } from '../acoustics/layouts.js';

export function startToolbar(app) {
  const { askToPop, CEILING_LAYER, engine, inPlan, meters, renderGeometry, store, views } = app;
  // the other parts' functions, looked up when called
  const saveSession = (...a) => app.saveSession(...a);
  const syncRoomGrowth = (...a) => app.syncRoomGrowth(...a);
  const syncWidthScale = (...a) => app.syncWidthScale(...a);

  // ------------------------------------------------------------------ toolbar
  // the edit modes (CAD, Walls) and the placing ones (＋ Speaker, ＋ Mic), grouped apart on the bar
  for (const id of ['modes', 'place'])
    document.getElementById(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (b) store.setMode(b.dataset.mode);
    });
  document.getElementById('viewmode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) store.setSettings({ view: b.dataset.view });
    // ray tracing is not a view: an overlay over whichever is up
    const t = e.target.closest('button[data-show]');
    if (t) store.setShow({ [t.dataset.show]: !store.state.settings.show[t.dataset.show] });
  });
  // the 3-D room's bar: kept by its node, not looked up — it goes to another window with the tile
  const viewbar = document.querySelector('.tile.t3d .viewbar');
  viewbar.addEventListener('click', (e) => {
    const m = e.target.closest('button[data-method]');
    if (m) return store.setSettings({ method: m.dataset.method });
    const sh = e.target.closest('button[data-show]');
    if (sh) return store.setShow({ [sh.dataset.show]: !(store.state.settings.show[sh.dataset.show] ?? true) });
    if (e.target.closest('.viewMore')) viewbar.classList.toggle('open');
  });
  const freq = document.getElementById('freq');
  freq.addEventListener('input', () => store.setSettings({ freq: Math.round(10 ** parseFloat(freq.value)) }));

  /** One colour scale for every drawing of the field — they all share it, so it is shown once, above the meters. */
  const scaleBar = document.getElementById('fieldScale');
  scaleBar.querySelector('.ramp').style.background = rampGradient();
  function syncFieldScale() {
    const { scale } = engine.out;
    const { settings, speakers } = store.state;
    scaleBar.hidden = !(settings.show.field && scale && speakers.length);
    if (scaleBar.hidden) return;
    const lo = scale.top - scale.range;
    scaleBar.querySelector('.lo').textContent = `${+lo.toFixed(1)} dB`;
    const hi = scaleBar.querySelector('.hi');
    // the frequency is the slider's under the ramp, said once there; a window dragged out offers the whole field back
    hi.replaceChildren(`${+scale.top.toFixed(1)} dB`);
    if (app.scaleZoom) {
      const all = Object.assign(document.createElement('button'), { className: 'scaleAll', textContent: '⤢ all', title: 'Back to the whole field: the loudest cell sets the top' });
      all.onclick = () => zoomScale(null);
      hi.append(' ', all);
    }
    const ramp = scaleBar.querySelector('.ramp');
    ramp.replaceChildren();
    // the dB scale over the ramp: a tick every 1, 2 or 5 dB, a number every five ticks
    const step = [1, 2, 5, 10].find((s) => scale.range / s <= 16) ?? 10;
    for (let v = Math.ceil(lo / step) * step; v <= scale.top + 1e-9; v += step) {
      const at = ((v - lo) / scale.range) * 100;
      const major = Math.round(v / step) % 5 === 0;
      ramp.append(Object.assign(document.createElement('i'), { className: `dbTick${major ? ' major' : ''}`, style: `left:${at}%` }));
      if (major) ramp.append(Object.assign(document.createElement('span'), { className: 'dbNum', style: `left:${at}%`, textContent: String(+v.toFixed(1)) }));
    }
    // markers: what the mix seat and the whole room read on this scale, at the current frequency — a small triangle under the ramp each
    const { reports } = engine.out;
    const read = (rep) => (!rep ? NaN : settings.method === 'energy' ? rep.energy?.[settings.band]?.total : settings.method === 'modal' ? rep.modal : rep.wave);
    const mix = store.state.mics.find((m) => m.mix);
    const seats = roomSeats(store.state.mics);
    const marks = [['MIX', read(reports?.[mix?.id]), '#f43f5e']];
    if (seats.length > 1) marks.push([`room ·${seats.length}`, powerMean(seats.map((m) => read(reports?.[m.id])), seats.map(seatWeight)), '#a3e635']);
    for (const [name, db, colour] of marks) {
      if (!Number.isFinite(db)) continue;
      const t = Math.max(0, Math.min(1, (db - (scale.top - scale.range)) / scale.range));
      const mark = Object.assign(document.createElement('i'), { className: `mark${t <= 0 || t >= 1 ? ' off' : ''}`, title: `${name}: ${db.toFixed(1)} dB at the current frequency${t <= 0 || t >= 1 ? ' — outside this window' : ''}` });
      mark.style.left = `${t * 100}%`;
      mark.style.setProperty('--c', colour);
      mark.append(Object.assign(document.createElement('span'), { textContent: `${name} ${db.toFixed(1)}` }));
      ramp.append(mark);
    }
    if (rampDrag.sel) ramp.append(rampDrag.sel);
  }

  /** A window of the scale to look at: the field's colours spread over it alone, every view repainted (no recompute). */
  function zoomScale(zoom) {
    app.scaleZoom = zoom;
    engine.out.scale = fieldScale(engine.out.values, store.state.settings.rangeDb, zoom);
    renderGeometry();
    syncFieldScale();
    meters.render();
  }

  // drag across the ramp to look at that range of dB; ⤢ all (or a double-click) gives the whole field back
  const rampDrag = { from: null, sel: null };
  {
    const ramp = scaleBar.querySelector('.ramp');
    const dbAt = (e) => {
      const { scale } = engine.out;
      const box = ramp.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      return { t, db: scale.top - scale.range + t * scale.range };
    };
    ramp.addEventListener('pointerdown', (e) => {
      if (!engine.out.scale || e.button !== 0) return;
      ramp.setPointerCapture(e.pointerId);
      rampDrag.from = dbAt(e);
      rampDrag.sel = Object.assign(document.createElement('i'), { className: 'sel' });
      ramp.append(rampDrag.sel);
    });
    ramp.addEventListener('pointermove', (e) => {
      const now = dbAt(e);
      ramp.title = `${now.db.toFixed(1)} dB — drag to look at a range`;
      if (!rampDrag.from) return;
      const [a, b] = [Math.min(rampDrag.from.t, now.t), Math.max(rampDrag.from.t, now.t)];
      Object.assign(rampDrag.sel.style, { left: `${a * 100}%`, width: `${(b - a) * 100}%` });
      rampDrag.sel.textContent = `${Math.min(rampDrag.from.db, now.db).toFixed(1)} – ${Math.max(rampDrag.from.db, now.db).toFixed(1)}`;
    });
    const end = (e) => {
      if (!rampDrag.from) return;
      const now = dbAt(e);
      const [lo, hi] = [Math.min(rampDrag.from.db, now.db), Math.max(rampDrag.from.db, now.db)];
      rampDrag.sel?.remove();
      rampDrag.from = rampDrag.sel = null;
      // a click is not a range: a window narrower than 1 dB is ignored
      if (e.type === 'pointerup' && hi - lo >= 1) zoomScale({ top: +hi.toFixed(1), range: +(hi - lo).toFixed(1) });
    };
    ramp.addEventListener('pointerup', end);
    ramp.addEventListener('pointercancel', end);
    ramp.addEventListener('dblclick', () => app.scaleZoom && zoomScale(null));
  }

  function syncToolbar() {
    const { mode, settings, placeKind } = store.state;
    for (const b of document.querySelectorAll('button[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode);
    for (const b of document.querySelectorAll('#viewmode button')) b.classList.toggle('on', b.dataset.view === settings.view);
    for (const b of viewbar.querySelectorAll('button[data-method]')) b.classList.toggle('on', b.dataset.method === settings.method);
    for (const b of [...viewbar.querySelectorAll('button[data-show]'), ...document.querySelectorAll('#viewmode button[data-show]')]) b.classList.toggle('on', Boolean(settings.show[b.dataset.show] ?? true));
    viewbar.querySelector('.viewMore').classList.toggle('on', viewbar.classList.contains('open'));
    for (const b of document.querySelectorAll('#furniture button[data-arm]')) b.classList.toggle('on', mode === 'place-furniture' && b.dataset.arm === placeKind?.furniture);
    views.className = settings.view === '3d' ? 'three' : settings.view === 'wall' ? 'wall' : 'six';
    const { sheet } = store.state;
    inPlan('sheetName').textContent = sheet === 'plan' ? '' : sheet === 'ceiling' ? `treating the ceiling — layer “${CEILING_LAYER}”: place clouds and tiles over the plan` : `editing the ${sheet} elevation — layer “${ELEVATION_LAYER[sheet]}”`;
    inPlan('toPlan').hidden = sheet === 'plan';
    const popped = store.state.cad.popped;
    const pop = inPlan('popCad');
    pop.textContent = popped ? '⇲ Dock CAD' : '⇱ Pop out';
    pop.title = popped ? 'Bring the CAD back into this tile (or just close its window)' : 'Give the CAD a window of its own — the plan stays here';
    askToPop();
    syncRoomGrowth();
    syncWidthScale();
    if (popped) inPlan('sheetName').textContent = 'the CAD is in its own window · the plan here places and moves speakers and mics';
    for (const t of document.querySelectorAll('.tile.face')) t.classList.toggle('editing', t.dataset.face === sheet);
    if (document.activeElement !== freq) freq.value = Math.log10(settings.freq);
    const freqOut = document.getElementById('freqOut');
    freqOut.replaceChildren(Object.assign(document.createElement('small'), { textContent: settings.method === 'energy' ? 'current band' : 'current frequency' }), settings.method === 'energy' ? `${[125, 250, 500, '1k', '2k', '4k'][settings.band]} oct` : `${hz(settings.freq)} Hz`);
    freq.disabled = settings.method === 'energy';
    for (const row of document.querySelectorAll('#arrangement .speakerSet')) {
      const live = row.dataset.set === activeSet(settings);
      const preset = setLayout(settings, row.dataset.set).preset;
      row.classList.toggle('live', live);
      row.querySelector('.setLetter').classList.toggle('on', live);
      for (const b of row.querySelectorAll('button[data-preset]')) b.classList.toggle('on', b.dataset.preset === preset);
    }
    for (const input of document.querySelectorAll('.arrayFields input')) {
      if (document.activeElement === input) continue;
      const key = input.dataset.array;
      const k = input.dataset.set ?? activeSet(settings);
      const l = setLayout(settings, k);
      input.value = Math.round(key === 'radius' ? (l.radius ?? 2) * 1000 : key === 'rotate' ? l.rotate ?? 0 : l.offset?.[key] ?? 0);
    }
    for (const slider of document.querySelectorAll('.setRadius')) {
      if (document.activeElement === slider) continue;
      const k = slider.dataset.set;
      const l = setLayout(settings, k);
      slider.value = Math.round((l.radius ?? 2) * 1000);
      slider.disabled = !LAYOUTS[l.preset];
    }
    for (const btn of document.querySelectorAll('.arrayBtn[data-set]')) {
      const k = btn.dataset.set;
      const l = setLayout(settings, k);
      const live = k === activeSet(settings);
      btn.textContent = `◎ ${k} r ${Math.round((l.radius ?? 2) * 1000)}${l.rotate ? ` ⟲${Math.round(l.rotate)}°` : ''} ▾`;
      btn.classList.toggle('live', live);
    }
    const spreader = document.getElementById('spreader');
    if (spreader) spreader.hidden = !Object.keys(SPEAKER_SETS).some((k) => LAYOUTS[setLayout(settings, k).preset]);
  }

  for (const header of document.querySelectorAll('.tile header, .tile.face canvas, .tile.t3d canvas')) {
    header.addEventListener('dblclick', (e) => {
      // a quick second press on a bar's button is that button again, not a wish to fill the screen
      if (e.target.closest('button')) return;
      const tile = e.currentTarget.closest('.tile');
      const was = tile.classList.contains('max');
      for (const t of document.querySelectorAll('.tile')) t.classList.remove('max');
      if (!was) tile.classList.add('max');
      views.classList.toggle('maxed', !was);
      requestAnimationFrame(renderGeometry);
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSession();
      return;
    }
    if (e.target.closest?.('input, select, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      if (e.key === 'y' || e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (e.key === 'Escape') store.setMode('cad');
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selected) store.remove(store.state.selected.kind, store.state.selected.id);
  });

  new ResizeObserver(() => {
    // the pairs lay out by the shape of the space they get: a letterbox in one row, a tall one in three
    const aspect = views.clientWidth / Math.max(1, views.clientHeight);
    views.dataset.shape = aspect > 3.2 ? 'wide' : aspect < 1.1 ? 'tall' : '';
    renderGeometry();
  }).observe(views);

  /**
   * The frames cached so far (engine.js): a tick under the slider for each one,
   * and the tour's button filled as far as the cache is — breathing while it fills.
   */
  function showCache() {
    const strip = document.getElementById('freqCache');
    const { ready = [], ladder = [] } = engine.out.frames ?? {};
    const w = strip.clientWidth;
    const h = strip.clientHeight;
    if (w && h) {
      const dpr = window.devicePixelRatio || 1;
      if (strip.width !== Math.round(w * dpr)) [strip.width, strip.height] = [Math.round(w * dpr), Math.round(h * dpr)];
      const ctx = strip.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const lo = Math.log10(F_MIN);
      const span = Math.log10(F_MAX) - lo;
      ctx.fillStyle = 'rgba(253, 224, 71, .7)';
      for (const f of ready) ctx.fillRect(((Math.log10(f) - lo) / span) * (w - 1), 0, 1, h);
    }
    const share = ladder.length ? Math.min(1, ready.length / ladder.length) : 0;
    // looked up here: the engine can answer before the tour's part of this file has run
    const tourBtn = document.getElementById('tour');
    tourBtn.dataset.title ??= tourBtn.title;
    tourBtn.style.setProperty('--cache', share.toFixed(3));
    tourBtn.classList.toggle('filling', share > 0 && share < 1);
    tourBtn.classList.toggle('full', share >= 1);
    tourBtn.title = `${tourBtn.dataset.title} — ${ready.length} of ${ladder.length} frames painted`;
  }

  return { syncFieldScale, syncToolbar, showCache };
}
