// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — the shared field builders, tabs, view strips, the room manager and the report node every window builds with.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { clamp, COL, FACE_LABEL, fmt, group, h, prep } from './kit.js';
import { ACOUSTX_ABSORBERS } from './database.js';
import { MATERIALS } from '../acoustics/materials.js';
import { speedOfSound } from './classic.js';
import { C } from '../acoustics/bands.js';
import { boxPath, DEFAULT_USER, drawBox, fit, nudgeUser, project, VIEWS } from './roomView.js';

export function createWidgets(acx) {
  const { dimsChanged, edited, fromU, M, pullFromRoom, refreshAll, toU } = acx;

  // ── shared field builders ──

  function lenField(win, label, get, set, { disabled, title, local } = {}) {
    const inp = h('input', { type: 'number', step: 0.01, title });
    const unit = h('span', { class: 'unit' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return win.sync();
      set(fromU(v));
      if (local) win.refresh();
      else edited();
    });
    win.syncers.push(() => {
      if (document.activeElement !== inp) inp.value = fmt(toU(get()), 2);
      unit.textContent = M.units;
      inp.disabled = Boolean(disabled?.());
    });
    return h('div', { class: 'row' }, h('label', { title }, label), inp, unit);
  }

  function numField(win, label, unit, get, set, { step = 1, title, local = true, width } = {}) {
    const inp = h('input', { type: 'number', step, title, style: width ? `width:${width}px` : null });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return win.sync();
      set(v);
      if (local) win.refresh();
      else edited();
    });
    win.syncers.push(() => {
      if (document.activeElement !== inp) inp.value = String(+get().toFixed(3));
    });
    return h('div', { class: 'row' }, h('label', { title }, label), inp, h('span', { class: 'unit' }, unit));
  }

  function unitsRow(win) {
    const name = `acx-u-${win.name}`;
    const ft = h('input', { type: 'radio', name, onchange: () => ((M.units = 'ft'), refreshAll()) });
    const m = h('input', { type: 'radio', name, onchange: () => ((M.units = 'm'), refreshAll()) });
    win.syncers.push(() => {
      ft.checked = M.units === 'ft';
      m.checked = M.units === 'm';
    });
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Units'), h('label', { class: 'opt' }, ft, 'Feet'), h('label', { class: 'opt' }, m, 'Metres'));
  }

  const fromRoomBtn = () =>
    h('button', { title: 'Reset every classic window to the room being designed, and link them to it again', onclick: () => (pullFromRoom(), refreshAll()) }, '↻ From room');

  function dimsGroup(win, extra = []) {
    const set = (k) => (v) => {
      M[k] = Math.max(0.5, v);
      dimsChanged();
    };
    return group(
      'Room Dimensions',
      lenField(win, 'Room Length', () => M.L, set('L'), { title: 'Front wall to back wall' }),
      lenField(win, 'Room Width', () => M.W, set('W'), { title: 'Left wall to right wall' }),
      lenField(win, 'Room Height', () => M.H, set('H'), { title: 'Floor to ceiling (the mean, for a sloped ceiling)' }),
      unitsRow(win),
      ...extra,
      h('div', { class: 'btns' }, fromRoomBtn()),
    );
  }

  function matOptions() {
    const sources = [...new Set(ACOUSTX_ABSORBERS.map((a) => a.source || 'Other'))];
    const acxGroups = sources.map((src) =>
      h(
        'optgroup',
        { label: `Acoustic X · ${src}` },
        ACOUSTX_ABSORBERS.filter((a) => (a.source || 'Other') === src).map((a) =>
          h('option', { value: a.id }, `${a.name}${a.comments ? ` (${a.comments})` : ''}`),
        ),
      ),
    );
    const cats = [...new Set(MATERIALS.map((m) => m.category))];
    const cadGroups = cats.map((c) =>
      h('optgroup', { label: `CAD · ${c}` }, MATERIALS.filter((m) => m.category === c).map((m) => h('option', { value: m.id }, m.name))),
    );
    return [...acxGroups, ...cadGroups];
  }
  function matSelect(win, get, set, title) {
    const s = h('select', { class: 'list', title }, matOptions());
    s.addEventListener('change', () => set(s.value));
    win.syncers.push(() => (s.value = get()));
    return s;
  }
  const faceMatSelect = (win, face) => matSelect(win, () => M.mats[face], (v) => ((M.mats[face] = v), edited()), FACE_LABEL[face]);

  function pointGroup(win, legend, get, set, { disabled } = {}) {
    const field = (label, k, title) => lenField(win, label, () => get()[k], (v) => set({ ...get(), [k]: v }), { disabled, title });
    return group(legend, field('X', 'X', 'From the left wall'), field('Y', 'Y', 'From the front wall'), field('Z', 'Z', 'Above the floor'));
  }

  function tabs(win, names) {
    const strip = h('div', { class: 'acx-tabs' });
    const sheet = h('div', { class: 'acx-sheet' });
    const pages = {};
    const tabEls = {};
    const show = (n) => {
      for (const k of names) {
        tabEls[k].classList.toggle('on', k === n);
        pages[k].hidden = k !== n;
      }
      // a page's charts can only be drawn once it shows
      requestAnimationFrame(() => !win.el.hidden && win.render());
    };
    for (const n of names) {
      tabEls[n] = h('div', { class: 'acx-tab', onclick: () => show(n) }, n);
      pages[n] = h('div', { class: 'acx-page' });
      strip.append(tabEls[n]);
      sheet.append(pages[n]);
    }
    show(names[0]);
    return { nodes: [strip, sheet], pages, show };
  }

  const chartBox = (style = '') => {
    const cv = h('canvas');
    return { box: h('div', { class: 'acx-chart', style }, cv), cv };
  };

  /** The speed of sound the General Parameters' temperature gives. */
  const cNow = () => speedOfSound(M.gen.tempC);
  /** Dimensions scaled so the 343 m/s mode tables give this temperature's frequencies (f ∝ c / size). */
  const dimsAtC = () => {
    const k = C / cNow();
    return { L: M.L * k, W: M.W * k, H: M.H * k };
  };

  // ── the three views every module window has ──

  /**
   * Room View · Chart View · Data View, as the original's tool bar offered:
   * `panes` { room, chart, data } are the three containers; the strip of
   * buttons shows one at a time.
   */
  function viewStrip(win, panes, initial = 'chart') {
    const btns = {};
    const strip = h(
      'div',
      { class: 'btns acx-views' },
      [
        ['room', 'Room View', 'The room as a wire-frame, with what this module computes drawn in it'],
        ['chart', 'Chart View', 'The results as charts'],
        ['data', 'Data View', 'The lists and the report'],
      ].map(([k, l, t]) => (btns[k] = h('button', { title: t, onclick: () => show(k) }, l))),
    );
    function show(k) {
      win.pane = k;
      for (const [n, el] of Object.entries(panes)) el.hidden = n !== k;
      for (const [n, b] of Object.entries(btns)) b.classList.toggle('down', n === k);
      requestAnimationFrame(() => win.render());
    }
    win.pane = initial;
    for (const [n, el] of Object.entries(panes)) el.hidden = n !== initial;
    btns[initial].classList.add('down');
    win.showPane = show;
    return strip;
  }

  /**
   * The Room View Manager: Plan View, Side and End Elevation, 3-Dimensional,
   * User View — and Set, which swaps in the arrows that turn (R) or move (M)
   * the user view, with zoom and a reset between them. `RV` is the window's
   * { view, user, mode }. Dragging on a user view turns it too.
   */
  function roomManager(win, RV, cv) {
    const vb = (v) => {
      const b = h('button', { onclick: () => ((RV.view = v), sync(), win.render()) }, VIEWS.find((x) => x[0] === v)[1]);
      b.dataset.v = v;
      return b;
    };
    const setB = h('button', { title: 'Turn and move the user view', onclick: () => ((main.hidden = true), (pad.hidden = false), (RV.view = 'user'), sync(), win.render()) }, 'Set');
    const main = h('div', { class: 'rvm' }, vb('plan'), h('div', { class: 'pair' }, vb('side'), vb('end')), vb('3d'), h('div', { class: 'pair' }, vb('user'), setB));
    const rB = h('button', { title: 'The arrows turn the view', onclick: () => ((RV.mode = 'R'), sync()) }, 'R');
    const mB = h('button', { title: 'The arrows move the view', onclick: () => ((RV.mode = 'M'), sync()) }, 'M');
    const go = (dir) => () => ((RV.user = nudgeUser(RV.user, RV.mode, dir)), (RV.view = 'user'), sync(), win.render());
    const zoom = (k) => () => ((RV.user = { ...RV.user, zoom: clamp(RV.user.zoom * k, 0.3, 6) }), win.render());
    const pad = h(
      'div',
      { class: 'rvm', hidden: true },
      h('div', { class: 'pad' }, h('span'), h('button', { onclick: go('up') }, '▲'), h('span'), h('button', { onclick: go('left') }, '◄'), h('button', { title: 'Back to the preset', onclick: () => ((RV.user = { ...DEFAULT_USER }), win.render()) }, '◎'), h('button', { onclick: go('right') }, '►'), h('span'), h('button', { onclick: go('down') }, '▼'), h('span')),
      h('div', { class: 'pair' }, rB, mB, h('button', { title: 'Zoom in', onclick: zoom(1.2) }, '+'), h('button', { title: 'Zoom out', onclick: zoom(1 / 1.2) }, '−')),
      h('button', { onclick: () => ((pad.hidden = true), (main.hidden = false)) }, 'Back to Room View Manager'),
    );
    function sync() {
      for (const b of main.querySelectorAll('button[data-v]')) b.classList.toggle('down', b.dataset.v === RV.view);
      rB.classList.toggle('down', RV.mode === 'R');
      mB.classList.toggle('down', RV.mode === 'M');
    }
    win.syncers.push(sync);
    if (cv) {
      cv.addEventListener('pointerdown', (e) => {
        if (RV.view !== 'user' || RV.onPick) return;
        const sx = e.clientX;
        const sy = e.clientY;
        const u0 = { ...RV.user };
        cv.setPointerCapture(e.pointerId);
        const move = (ev) => {
          RV.user = { ...u0, yaw: (((u0.yaw + (ev.clientX - sx) * 0.5) % 360) + 360) % 360, pitch: clamp(u0.pitch - (ev.clientY - sy) * 0.4, -90, 90) };
          win.render();
        };
        const up = () => {
          cv.removeEventListener('pointermove', move);
          cv.removeEventListener('pointerup', up);
        };
        cv.addEventListener('pointermove', move);
        cv.addEventListener('pointerup', up);
      });
      cv.addEventListener('click', (e) => {
        if (!RV.onPick || RV.view !== 'plan' || !RV.last) return;
        const r = cv.getBoundingClientRect();
        const [X, Y] = RV.last.inv(e.clientX - r.left, e.clientY - r.top);
        RV.onPick({ X: clamp(X, 0, M.W), Y: clamp(Y, 0, M.L) });
      });
    }
    return group('Room View Manager', main, pad);
  }

  const newRV = (view = '3d') => ({ view, user: { ...DEFAULT_USER }, mode: 'R', last: null, onPick: null });

  /**
   * Draw a room view: the box (with the Display Axis when it is on), the
   * speakers as red boxes, the listener as a red circle; `under` and `over`
   * draw the window's own layers below and above them. Returns { S, k }.
   */
  function drawRoom(cv, RV, { speakers = [], lis = null, under = null, over = null, note = '' } = {}) {
    const p = prep(cv);
    if (!p) return null;
    const { ctx, w, h: hh } = p;
    const dims = { L: M.L, W: M.W, H: M.H };
    const proj = project(RV.view, dims, RV.user);
    const f = fit(proj, dims, w, hh, { margin: 34, user: RV.view === 'user' ? RV.user : null });
    RV.last = f;
    const { S } = f;
    under?.(ctx, S, f);
    drawBox(ctx, S, dims, { axis: M.gen.axis && lis ? { listener: lis, speakers } : null });
    const sz = M.spkSize;
    ctx.strokeStyle = COL.red;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const s of speakers) boxPath(ctx, S, s.X - sz.w / 2, s.X + sz.w / 2, s.Y - sz.d / 2, s.Y + sz.d / 2, s.Z - M.woofer, s.Z - M.woofer + sz.h);
    ctx.stroke();
    if (lis) {
      const L0 = S(lis);
      ctx.beginPath();
      ctx.arc(L0[0], L0[1], 6, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    over?.(ctx, S, f);
    ctx.fillStyle = COL.title;
    ctx.fillText(`Room Display (${VIEWS.find((v) => v[0] === RV.view)[1]})   ${fmt(toU(M.L))} × ${fmt(toU(M.W))} × ${fmt(toU(M.H))} ${M.units}${note ? `   ${note}` : ''}`, 8, 14);
    ctx.fillStyle = COL.text;
    if (RV.view === 'plan') ctx.fillText('front wall ↑', 8, hh - 8);
    if (RV.view === 'side') ctx.fillText('← front wall', 8, hh - 8);
    if (RV.view === 'end') ctx.fillText('looking at the front wall', 8, hh - 8);
    if (RV.view === 'user') ctx.fillText(`turn ${Math.round(RV.user.yaw)}° · tip ${Math.round(RV.user.pitch)}° — drag to turn`, 8, hh - 8);
    return f;
  }

  /** A report table as rows of cells, for the Data View and every export. */
  const reportTable = (head, rows) => h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))));
  function reportNode(rep) {
    return h(
      'div',
      { class: 'report' },
      h('h4', {}, rep.title),
      projectLines().map((l) => h('div', { class: 'small' }, l)),
      rep.sections.map((s) => h('div', {}, h('h5', {}, s.heading), s.text ? h('p', {}, s.text) : null, s.rows ? reportTable(s.head ?? [], s.rows) : null)),
    );
  }
  const projectLines = () => [M.project.description && `Project: ${M.project.description}`, M.project.client && `Client: ${M.project.client}`, M.project.location && `Location: ${M.project.location}`].filter(Boolean);

  return { lenField, numField, unitsRow, fromRoomBtn, dimsGroup, matOptions, matSelect, faceMatSelect, pointGroup, tabs, chartBox, cNow, dimsAtC, viewStrip, roomManager, newRV, drawRoom, reportTable, reportNode, projectLines };
}
