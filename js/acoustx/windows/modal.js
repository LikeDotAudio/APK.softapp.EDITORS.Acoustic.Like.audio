// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — window 1, MODAL RESPONSE.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { axes, clamp, COL, countTicks, FACES6, fmt, group, h, prep, readout } from '../kit.js';
import { C } from '../../acoustics/bands.js';
import {
  bonello,
  dimensionGrid,
  FAVOURABLE_RATIOS,
  ituBs1116,
  keepBest,
  modeList,
  scoreDimensions,
} from '../../acoustics/modalDistribution.js';
import { ACOUSTX_FREQ_3RD, ACOUSTX_FREQ_OCTAVE } from '../database.js';
import { idealCounts, modeFreq, modeType, pressureField } from '../classic.js';
import {
  angularDistribution,
  axialCheck,
  bandDecay,
  boltMap,
  modeAngles,
  modeDecay,
  spacingIndex,
} from '../references.js';

export function modalWindow(acx) {
  const {
    chartBox, classicRoom, cNow, dimsAtC, dimsChanged, drawRoom, edited, fromRoomBtn, job, lenField, M,
    makeWindow, newRV, numField, onDrawRoom, roomManager, tabs, toU, unitsRow, viewStrip,
  } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // 1. MODAL RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('modal', 'Acoustic X — Modal Response', { w: 860, h: 600 }, (win) => {
    const S = {
      sel: null,
      sort: 'all',
      order: 'asc',
      listed: 'all',
      ratioMode: false,
      ranges: null,
      step: 0.05,
      pct: 25,
      results: [],
      resSel: 0,
      res: null,
      idx: { nx: 1, ny: 0, nz: 0 },
      multi: false,
      lf: 40,
      hf: 60,
      dbase: 'third',
      dres: 0.3048,
      disp: 'horizontal',
      at: { horizontal: 0, length: null, width: null },
      param: 'pressure',
      hold: false,
      held: [],
      field: null,
      hover: null,
      RV: newRV('3d'),
    };
    const dims = () => ({ L: M.L, W: M.W, H: M.H });
    const minDim = () => Math.min(M.L, M.W, M.H);

    // ── Room tab
    const ratioBox = (k) => {
      const inp = h('input', { type: 'number', step: 0.01, title: 'Ratio to the smallest dimension' });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v) || v < 1) return win.sync();
        M[k] = minDim() * v;
        dimsChanged();
        edited();
      });
      win.syncers.push(() => {
        if (document.activeElement !== inp) inp.value = fmt(M[k] / minDim(), 2);
        inp.readOnly = !S.ratioMode || M[k] === minDim();
        inp.classList.toggle('ro', inp.readOnly);
      });
      return inp;
    };
    const dimRow = (label, k, title) => {
      const row = lenField(win, label, () => M[k], (v) => ((M[k] = Math.max(0.5, v)), dimsChanged()), { title, disabled: () => S.ratioMode && M[k] !== minDim() });
      row.append(ratioBox(k));
      return row;
    };
    const sizeR = h('input', { type: 'radio', name: 'acx-sr', onchange: () => ((S.ratioMode = false), win.sync()) });
    const ratioR = h('input', { type: 'radio', name: 'acx-sr', onchange: () => ((S.ratioMode = true), win.sync()) });
    win.syncers.push(() => {
      sizeR.checked = !S.ratioMode;
      ratioR.checked = S.ratioMode;
    });
    const bonelloBox = h('div', { class: 'scroll small', style: 'max-height:110px;min-height:40px' });

    // ── Optimize tab
    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = Math.max(0.5, v));
    function defaultRanges() {
      const r = (v, a, b) => [Math.round(v * a * 20) / 20, Math.round(v * b * 20) / 20];
      return { L: r(M.L, 0.9, 1.1), W: r(M.W, 0.9, 1.1), H: [M.H, M.H] };
    }
    const searchOn = { L: true, W: true, H: false };
    const elemChecks = ['L', 'W', 'H'].map((k) => {
      const c = h('input', { type: 'checkbox', onchange: () => (searchOn[k] = c.checked) });
      win.syncers.push(() => (c.checked = searchOn[k]));
      return h('label', { class: 'opt' }, c, { L: 'Length', W: 'Width', H: 'Height' }[k]);
    });
    function fromPct() {
      const p = S.pct / 100;
      S.ranges = Object.fromEntries(['L', 'W', 'H'].map((k) => [k, searchOn[k] ? [M[k] * (1 - p), M[k] * (1 + p)] : [M[k], M[k]]]));
      win.refresh();
    }
    const optList = h('select', { class: 'list', size: 9 });
    optList.addEventListener('change', () => (S.resSel = optList.selectedIndex));
    const optNote = h('div', { class: 'small muted' });
    const rangeRows = ['L', 'W', 'H'].map((k) => h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true })));
    function runOptimise() {
      const ranges = (S.ranges ??= defaultRanges());
      let step = S.step;
      const k = C / cNow();
      let grid = dimensionGrid(ranges, step);
      while (grid.count > 40000) grid = dimensionGrid(ranges, (step *= 2));
      const coarse = step !== S.step ? step : null;
      const best = [];
      optNote.textContent = `Searching ${grid.count} rooms…`;
      job(
        win,
        grid.L.length,
        (i) => {
          const L = grid.L[i];
          for (const W of grid.W)
            for (const H of grid.H) {
              const s = scoreDimensions({ L: L * k, W: W * k, H: H * k });
              keepBest(best, { L, W, H, score: s.score, ok: s.ok }, 10);
            }
        },
        () => {
          S.results = best;
          S.resSel = 0;
          const ok = best.filter((b) => b.ok).length;
          optNote.textContent = `${grid.count} rooms tried${coarse ? `, step coarsened to ${fmt(toU(coarse), 2)} ${M.units}` : ''}; ${ok} of the best ten meet the criteria. Score = 2·(Bonello failures) + spread of the axial and of all mode spacings — lower is better.`;
          win.render();
        },
      );
    }
    function useThese() {
      const r = S.results[S.resSel];
      if (!r) return;
      M.L = r.L;
      M.W = r.W;
      M.H = r.H;
      dimsChanged();
      edited();
      onDrawRoom?.({ L: r.L, W: r.W, H: r.H });
    }

    // ── Mode 1 tab: which mode, or which band of them
    const idxField = (k, label) => numField(win, label, '', () => S.idx[k], (v) => ((S.idx[k] = Math.max(0, Math.round(v))), (S.multi = false)), { title: { nx: 'Related to room length', ny: 'Related to room width', nz: 'Related to room height' }[k], width: 46 });
    const modeFRo = readout('The frequency of the mode entered');
    const multiC = h('input', { type: 'checkbox', onchange: () => ((S.multi = multiC.checked), win.refresh()) });
    win.syncers.push(() => (multiC.checked = S.multi));
    const countRo = readout('How many modes the band holds');
    const dbSel = h('select', {}, h('option', { value: 'octave' }, 'Octave'), h('option', { value: 'third' }, '1/3 Octave'));
    const fcSel = h('select', {});
    const fillFc = () => {
      const list = S.dbase === 'octave' ? ACOUSTX_FREQ_OCTAVE : ACOUSTX_FREQ_3RD;
      fcSel.replaceChildren(h('option', { value: '' }, 'centre…'), ...list.map((b) => h('option', { value: String(b.center) }, `${b.center} Hz`)));
    };
    dbSel.addEventListener('change', () => ((S.dbase = dbSel.value), fillFc()));
    fcSel.addEventListener('change', () => {
      const list = S.dbase === 'octave' ? ACOUSTX_FREQ_OCTAVE : ACOUSTX_FREQ_3RD;
      const b = list.find((x) => String(x.center) === fcSel.value);
      if (!b) return;
      S.lf = b.lower;
      S.hf = b.upper;
      S.multi = true;
      win.refresh();
    });
    win.syncers.push(() => (dbSel.value = S.dbase));
    fillFc();
    const getFreq = () => {
      if (!S.sel) return;
      S.lf = +(S.sel.f - 0.05).toFixed(2);
      S.hf = +(S.sel.f + 0.05).toFixed(2);
      S.multi = true;
      win.refresh();
    };

    // ── Mode 2 tab: how to show it
    const radios = (name, key, list, after = () => win.refresh()) =>
      list.map(([v, l]) => {
        const r = h('input', { type: 'radio', name, onchange: () => ((S[key] = v), after()) });
        win.syncers.push(() => (r.checked = S[key] === v));
        return h('div', {}, h('label', { class: 'opt' }, r, l));
      });
    const planeAt = () => S.at[S.disp] ?? (S.disp === 'length' ? M.W : S.disp === 'width' ? M.L : 0);
    const atRow = lenField(win, 'Plane distance', planeAt, (v) => (S.at[S.disp] = Math.max(0, v)), { local: true, title: 'Horizontal: above the floor · Length: from the left wall · Width: from the front wall', disabled: () => S.disp === '3d' });
    const holdC = h('input', { type: 'checkbox', onchange: () => (S.hold = holdC.checked) });
    win.syncers.push(() => (holdC.checked = S.hold));

    // ── Criteria tab, and the decay on Mode 1: what the other references ask of the modes
    const decayC = chartBox('flex:none;height:120px');
    const decayNote = h('div');
    const boltC = chartBox('flex:none;height:210px');
    const boltNote = h('div');
    const spacingRo = readout('Spread of the gaps between the lowest 30 modes (coefficient of variation): 0 is perfectly even');
    const ratioRank = h('div');
    const axialBox = h('div', { class: 'small' });
    const angleTable = h('tbody');
    let boltKey = '';
    let boltRes = null;
    boltC.cv.addEventListener('click', (e) => {
      if (!boltC.map) return;
      const r = boltC.cv.getBoundingClientRect();
      const wr = boltC.map.Xinv(e.clientX - r.left);
      const lr = boltC.map.Yinv(e.clientY - r.top);
      if (!(wr >= 1 && lr >= wr)) return;
      M.W = M.H * wr;
      M.L = M.H * lr;
      dimsChanged();
      edited();
    });

    const T = tabs(win, ['Room', 'Optimize', 'Mode 1', 'Mode 2', 'Criteria']);
    const ratioList = h('select', { class: 'list', size: 7 }, FAVOURABLE_RATIOS.filter((r) => r.ratio).map((r) => h('option', { value: r.id }, `${r.name}   ${r.ratio.map((x) => x.toFixed(2)).join(' : ')}`)));
    T.pages.Room.append(
      group('Enter Input Data', dimRow('Room Length', 'L', 'Front wall to back wall'), dimRow('Room Width', 'W', 'Left wall to right wall'), dimRow('Room Height', 'H', 'Floor to ceiling'), unitsRow(win)),
      group('Data Edit Options', h('label', { class: 'opt' }, sizeR, 'Change room dimensions'), h('br'), h('label', { class: 'opt' }, ratioR, 'Change ratio of dimensions')),
      group('Favourable Room Ratios', ratioList, h('div', { class: 'btns' }, h('button', { onclick: applyRatio, title: 'The 1 is the floor-to-ceiling height: width and length follow' }, 'Apply ratio'), fromRoomBtn())),
      group('Bonello Criterion', bonelloBox),
    );
    function applyRatio() {
      const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
      if (!r?.ratio) return;
      M.W = M.H * r.ratio[1];
      M.L = M.H * r.ratio[2];
      dimsChanged();
      edited();
    }
    T.pages.Optimize.append(
      group('Select Elements To Search', ...elemChecks),
      group('Enter Extent Of Search', numField(win, 'Search size ±', '%', () => S.pct, (v) => (S.pct = clamp(v, 1, 80)), { step: 1 }), numField(win, 'Search step', 'm', () => S.step, (v) => (S.step = Math.max(0.01, v)), { step: 0.01, title: 'Grid step, metres (0.15 m is about 6 in)' }), h('div', { class: 'btns' }, h('button', { onclick: fromPct }, 'Set limits from ±%'))),
      group('Dimension Limits', ...rangeRows),
      h('div', { class: 'btns' }, h('button', { onclick: runOptimise }, 'Optimize'), h('button', { onclick: useThese, title: 'Take the selected room into every classic window (and hand it to the host to draw)' }, 'Use these')),
      h('div', { style: 'margin-top:6px' }, optList),
      optNote,
    );
    T.pages['Mode 1'].append(
      group('Enter Mode Index', h('div', { class: 'cols' }, idxField('nx', 'Nx'), idxField('ny', 'Ny'), idxField('nz', 'Nz')), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Mode frequency'), modeFRo, 'Hz')),
      group(
        'Multi-Mode Summation',
        h('label', { class: 'opt' }, multiC, 'Sum every mode in the band'),
        numField(win, 'LF cut-off', 'Hz', () => S.lf, (v) => ((S.lf = Math.max(1, v)), (S.multi = true)), { step: 0.5 }),
        numField(win, 'HF cut-off', 'Hz', () => S.hf, (v) => ((S.hf = Math.max(1, v)), (S.multi = true)), { step: 0.5 }),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Bandwidth'), dbSel, fcSel),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Modes summed'), countRo),
        h('div', { class: 'btns' }, h('button', { onclick: getFreq, title: 'Take the mode picked on the chart' }, 'Get freq.')),
      ),
      group('Display Resolution', lenField(win, 'Display res.', () => S.dres, (v) => (S.dres = clamp(v, 0.05, 2)), { local: true, title: 'Grid spacing of the pressure display — smaller is finer and slower' })),
      group('Mode Decay (Knudsen)', decayC.box, h('div', { class: 'small' }, decayNote)),
    );
    T.pages.Criteria.append(
      group('Bolt Area', boltC.box, h('div', { class: 'small muted' }, boltNote)),
      group('Spacing Index (Louden)', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'This room'), spacingRo), h('div', { class: 'scroll small', style: 'max-height:84px' }, ratioRank)),
      group('Axial Spacing (Everest)', axialBox),
      group('Mode Directions (Sepmeyer)', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Angle', 'Elevation', 'Azimuth'].map((t) => h('th', {}, t)))), angleTable)),
    );
    T.pages['Mode 2'].append(
      group('Display Type', ...radios('acx-md-disp', 'disp', [['3d', '3-Dimensional'], ['horizontal', 'Horizontal Plane'], ['length', 'Vertical Plane (Length)'], ['width', 'Vertical Plane (Width)']], () => (S.disp !== '3d' && S.RV.view === '3d' ? 0 : 0, win.refresh())), atRow),
      group('Display Parameter', ...radios('acx-md-par', 'param', [['pressure', 'Relative Sound Pressure'], ['intensity', 'Relative Sound Intensity'], ['phase', 'Relative Phase Addition']])),
      group('Hold', h('label', { class: 'opt' }, holdC, 'Hold previous display'), h('div', { class: 'btns' }, h('button', { onclick: () => ((S.held = []), win.render()) }, 'Clear held'))),
      h('div', { class: 'small muted' }, 'Brighter is more pressure. Low-frequency absorbers go where it is brightest — for many modes at once, usually the corners.'),
    );

    // ── right side: the three views
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const top = chartBox('flex:1.2');
    const bot = chartBox('flex:1');
    const ro = { n: readout(), f: readout(), idx: readout(), band: readout(), dev: readout('Actual − ideal modes in the band under the mouse') };
    const byF = h('input', { type: 'number', step: 0.1, title: 'Type a frequency to find the mode nearest it', style: 'width:56px' });
    byF.addEventListener('change', () => {
      const f = parseFloat(byF.value);
      if (!Number.isFinite(f) || !S.res) return;
      S.sel = nearest(listedModes(), f);
      win.render();
    });
    const nearest = (modes, f) => modes.reduce((b, m) => (!b || Math.abs(m.f - f) < Math.abs(b.f - f) ? m : b), null);
    const pickTop = (e, click) => {
      if (!S.res || !top.map) return;
      const r = top.cv.getBoundingClientRect();
      const m = nearest(listedModes(), top.map.Xinv(e.clientX - r.left));
      if (!m) return;
      if (click && S.sel && Math.abs(S.sel.f - m.f) < 0.01 * m.f) {
        // clicking a stack again toggles through its modes
        const stack = listedModes().filter((x) => Math.abs(x.f - m.f) <= 0.005 * m.f);
        S.sel = stack[(stack.indexOf(S.sel) + 1) % stack.length];
      } else S.sel = m;
      if (click) Object.assign(S.idx, { nx: S.sel.nx, ny: S.sel.ny, nz: S.sel.nz });
      win.render();
    };
    top.cv.addEventListener('mousemove', (e) => pickTop(e, false));
    top.cv.addEventListener('click', (e) => pickTop(e, true));
    bot.cv.addEventListener('mousemove', (e) => {
      if (!bot.map || !S.res) return;
      const r = bot.cv.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left - bot.map.pad.l) / bot.map.iw) * S.res.counts.length);
      S.hover = i >= 0 && i < S.res.counts.length ? i : null;
      win.render();
    });
    const rr = (l, el, u) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, l), el, u ? h('span', {}, u) : null);
    const chartPane = h(
      'div',
      { class: 'acx-pane' },
      h('fieldset', { class: 'grow' }, h('legend', {}, 'Display Mode Distribution'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
      group('Chart View Manager', h('div', { class: 'manager' }, rr('Modes', ro.n), rr('Frequency', ro.f, 'Hz'), rr('Index', ro.idx), rr('By frequency', byF, 'Hz'), h('button', { onclick: getFreq }, 'Get freq.')), h('div', { class: 'manager' }, rr('Band', ro.band), rr('Deviation', ro.dev))),
    );
    const sortR = radios('acx-md-sort', 'sort', [['all', 'All modes'], ['axial', 'Axial modes'], ['tangential', 'Tangential modes'], ['oblique', 'Oblique modes']], () => win.render());
    const ordR = radios('acx-md-ord', 'order', [['asc', 'Ascending'], ['desc', 'Descending']], () => win.render());
    const modeTable = h('tbody');
    const bandTable = h('tbody');
    const dataPane = h(
      'div',
      { class: 'acx-pane' },
      group('Data View Manager', h('div', { class: 'manager' }, ...sortR), h('div', { class: 'manager' }, ...ordR, h('button', { onclick: () => ((S.listed = S.sort), win.render()), title: 'Show only these modes on the Chart View, and in the report' }, 'List data'))),
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['#', 'Hz', 'Nx', 'Ny', 'Nz', 'Type', 'T60 s', 'Az°', 'El°'].map((t) => h('th', {}, t)))), modeTable)),
      group('Modes per 1/3 Octave — actual against ideal', h('div', { class: 'scroll', style: 'max-height:150px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Band', 'Edges Hz', 'Actual', 'Ideal', 'Deviation', ''].map((t) => h('th', {}, t)))), bandTable))),
    );
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const listedModes = () => (S.res?.modes ?? []).filter((m) => S.listed === 'all' || m.type === S.listed);
    const fieldModes = () => {
      if (!S.res) return [];
      if (S.multi) return S.res.modes.filter((m) => m.f >= S.lf && m.f <= S.hf);
      const { nx, ny, nz } = S.idx;
      if (!(nx || ny || nz)) return [];
      return [{ nx, ny, nz, f: modeFreq(dims(), nx, ny, nz, cNow()), type: modeType(nx, ny, nz) }];
    };

    win.compute = () => {
      const k = cNow() / C;
      const scaled = dimsAtC();
      const modes = modeList(scaled, 200).map((m) => ({ ...m }));
      const b = bonello(scaled, 200);
      const counts = b.counts;
      const ideal = idealCounts(dims(), counts, cNow());
      // each mode's own decay, from the walls it presses on (α at 125 Hz, the lowest band), and its direction
      const a125 = alpha125();
      for (const m of modes) {
        Object.assign(m, modeDecay(dims(), m, a125, cNow()));
        m.ang = modeAngles(dims(), m);
      }
      S.res = { modes, bonello: b, counts, ideal, k, axial: axialCheck(scaled), spacing: spacingIndex(dims()), angles: angularDistribution(dims(), modes) };
      const bk = `${scaled.H.toFixed(3)}`;
      if (bk !== boltKey) {
        boltKey = bk;
        boltRes = boltMap(scaled.H, { n: 40 });
      }
      if (S.sel) S.sel = modes.find((m) => m.nx === S.sel.nx && m.ny === S.sel.ny && m.nz === S.sel.nz) ?? null;
      const fm = fieldModes();
      const at = planeAt();
      const field = fm.length ? pressureField(dims(), fm, { plane: S.disp, at, res: S.dres, weights: M.gen.weights, param: S.param }) : null;
      if (S.hold && S.field && field && (S.field.plane !== field.plane || S.field.at !== field.at)) S.held = [...S.held, S.field].slice(-6);
      S.field = field;
      S.fieldN = fm.length;
    };

    win.report = () => {
      const res = S.res;
      const shown = listedModes();
      return {
        title: 'Modal Response',
        sections: [
          { heading: 'Room', rows: [['Length', `${fmt(toU(M.L))} ${M.units}`], ['Width', `${fmt(toU(M.W))} ${M.units}`], ['Height', `${fmt(toU(M.H))} ${M.units}`], ['Ratio H : W : L', `1 : ${fmt(M.W / M.H)} : ${fmt(M.L / M.H)}`], ['Speed of sound', `${fmt(cNow(), 1)} m/s at ${M.gen.tempC} °C`]] },
          { heading: 'Bonello criterion', text: res.bonello.ok ? 'Passes: the count per third-octave never falls, and no two modes coincide in a band of fewer than five.' : res.bonello.warnings.join('; ') },
          { heading: `Modes below 200 Hz — ${S.listed}`, head: ['#', 'Hz', 'Nx', 'Ny', 'Nz', 'Type'], rows: shown.map((m, i) => [i + 1, fmt(m.f, 1), m.nx, m.ny, m.nz, m.type]) },
          { heading: 'Modes per 1/3 octave', head: ['Band Hz', 'Low', 'High', 'Actual', 'Ideal', 'Deviation'], rows: res.counts.map((b, i) => [b.fc, fmt(b.lo, 1), fmt(b.hi, 1), b.count, fmt(res.ideal[i], 1), fmt(b.count - res.ideal[i], 1)]) },
          { heading: 'Other criteria', rows: [['Spacing index (Louden, lowest 30 modes)', fmt(res.spacing, 3)], ['Axial modes below 300 Hz (Everest)', axialText(res.axial)]] },
          { heading: 'Mode decay and direction', text: 'Each mode’s T60 from the walls it presses on, α at 125 Hz (Morse & Bolt). Azimuth in plan from the length axis; elevation above the floor (Sepmeyer).', head: ['Hz', 'Nx Ny Nz', 'T60 s', 'Bandwidth Hz', 'Azimuth°', 'Elevation°'], rows: shown.map((m) => [fmt(m.f, 1), `${m.nx} ${m.ny} ${m.nz}`, fmt(m.t60, 2), fmt(m.bw, 2), fmt(m.ang.azimuth, 0), fmt(m.ang.elevation, 0)]) },
        ],
      };
    };

    win.render = () => {
      const res = S.res;
      if (!res) return;
      bonelloBox.replaceChildren(
        h('div', { class: res.bonello.ok ? '' : 'warn' }, res.bonello.ok ? '✓ This room meets the criteria: counts never fall, no coincident modes in a thin band.' : `⚠ ${res.bonello.warnings.length} reason${res.bonello.warnings.length === 1 ? '' : 's'} it does not:`),
        ...res.bonello.warnings.map((w) => h('div', { class: 'warn' }, `• ${w}`)),
        (() => {
          const itu = ituBs1116(dims());
          return h('div', { class: itu.ok ? 'muted' : 'warn' }, itu.ok ? 'Inside the ITU-R BS.1116 proportions.' : `ITU-R BS.1116: ${itu.notes.join('; ')}`);
        })(),
      );
      optList.replaceChildren(...S.results.map((r, i) => h('option', { selected: i === S.resSel }, `${fmt(toU(r.L))} × ${fmt(toU(r.W))} × ${fmt(toU(r.H))} ${M.units}   ${fmt(r.score, 3)} ${r.ok ? '✓' : '⚠'}`)));
      const fm = fieldModes();
      modeFRo.textContent = !S.multi && fm[0] ? fmt(fm[0].f, 2) : '';
      countRo.textContent = String(S.multi ? fm.length : fm.length ? 1 : 0);
      // data view
      const sorted = res.modes.filter((m) => S.sort === 'all' || m.type === S.sort);
      if (S.order === 'desc') sorted.reverse();
      modeTable.replaceChildren(...sorted.map((m, i) => h('tr', { class: m === S.sel ? 'sel' : '', onclick: () => ((S.sel = m), Object.assign(S.idx, { nx: m.nx, ny: m.ny, nz: m.nz }), (S.multi = false), win.refresh()) }, h('td', {}, i + 1), h('td', {}, fmt(m.f, 1)), h('td', {}, m.nx), h('td', {}, m.ny), h('td', {}, m.nz), h('td', {}, m.type), h('td', {}, fmt(m.t60, 2)), h('td', {}, fmt(m.ang.azimuth, 0)), h('td', {}, fmt(m.ang.elevation, 0)))));
      bandTable.replaceChildren(
        ...res.counts.map((b, i) => {
          const drop = i > 0 && res.counts.slice(0, i).some((x) => x.count > 0) && b.count < res.counts[i - 1].count;
          return h('tr', { class: i === S.hover ? 'sel' : '' }, h('td', {}, `${b.fc} Hz`), h('td', {}, `${fmt(b.lo, 1)}–${fmt(b.hi, 1)}`), h('td', {}, b.count), h('td', {}, fmt(res.ideal[i], 1)), h('td', {}, fmt(b.count - res.ideal[i], 1)), h('td', { class: 'warn' }, drop ? 'falls' : ''));
        }),
      );
      // chart view manager
      const stack = S.sel ? listedModes().filter((m) => Math.abs(m.f - S.sel.f) <= 0.005 * S.sel.f) : [];
      ro.n.textContent = S.sel ? String(stack.length) : '';
      ro.f.textContent = S.sel ? fmt(S.sel.f, 2) : '';
      ro.idx.textContent = S.sel ? `${S.sel.nx} ${S.sel.ny} ${S.sel.nz}` : '';
      const hb = S.hover != null ? res.counts[S.hover] : null;
      ro.band.textContent = hb ? `${hb.fc} Hz: ${hb.count} / ${fmt(res.ideal[S.hover], 1)}` : '';
      ro.dev.textContent = hb ? fmt(hb.count - res.ideal[S.hover], 1) : '';
      if (win.pane === 'chart') {
        drawModes(listedModes());
        drawThirds(res.counts, res.ideal);
      }
      if (win.pane === 'room') drawField();
      // Criteria tab
      spacingRo.textContent = fmt(res.spacing, 3);
      const ranked = FAVOURABLE_RATIOS.filter((r) => r.ratio).map((r) => ({ r, v: spacingIndex({ H: 1, W: r.ratio[1], L: r.ratio[2] }) })).sort((a, b) => a.v - b.v);
      ratioRank.replaceChildren(...ranked.map(({ r, v }) => h('div', {}, `${fmt(v, 3)}  ${r.name}  1 : ${fmt(r.ratio[1])} : ${fmt(r.ratio[2])}`)));
      axialBox.replaceChildren(h('div', { class: res.axial.ok ? '' : 'warn' }, axialText(res.axial)), ...res.axial.gaps.map((g) => h('div', { class: 'warn' }, `• gap ${fmt(g.gap, 1)} Hz between ${fmt(g.lo, 1)} and ${fmt(g.hi, 1)} Hz`)), ...res.axial.close.map((c) => h('div', { class: 'warn' }, `• ${c.a.nx}${c.a.ny}${c.a.nz} and ${c.b.nx}${c.b.ny}${c.b.nz} coincide at ${fmt(c.b.f, 1)} Hz`)));
      const ad = res.angles;
      angleTable.replaceChildren(...ad.elevation.map((n, i) => h('tr', {}, h('td', {}, `${i * ad.binDeg}–${(i + 1) * ad.binDeg}°`), h('td', {}, n), h('td', {}, ad.azimuth[i]))));
      drawBolt();
      drawDecay(fm);
    };
    const axialText = (ax) => (ax.ok ? `✓ ${ax.modes.length} axial modes below 300 Hz: no gap over 20 Hz, none coincide.` : `⚠ ${ax.modes.length} axial modes below 300 Hz: ${ax.gaps.length} gap${ax.gaps.length === 1 ? '' : 's'} over 20 Hz, ${ax.close.length} coincident pair${ax.close.length === 1 ? '' : 's'}.`);

    /** Bolt's chart, computed: the mode score over W/H × L/H at this height, the BS.1116 bounds, this room. Click to take a ratio. */
    function drawBolt() {
      const p = prep(boltC.cv);
      if (!p || !boltRes) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: 'L/H against W/H — brighter scores better', x0: 1, x1: 2, y0: 1, y1: 3, xticks: [1, 1.25, 1.5, 1.75, 2].map((v) => ({ v, label: String(v) })), yticks: [1, 1.5, 2, 2.5, 3], fmtY: (v) => v.toFixed(1), xLabel: 'W/H' });
      boltC.map = { ...a, Yinv: (py) => 1 + (1 - (py - a.pad.t) / a.ih) * 2 };
      const { wr, lr, score, ok } = boltRes;
      const fin = score.flat().filter(Number.isFinite);
      const lo = Math.min(...fin);
      const hi = Math.max(...fin);
      const cw = a.iw / wr.length;
      const ch = a.ih / lr.length;
      lr.forEach((l, j) =>
        wr.forEach((wv, i) => {
          const v = score[j][i];
          if (!Number.isFinite(v)) return;
          const g = Math.round(200 - 170 * Math.sqrt((v - lo) / Math.max(hi - lo, 1e-9)));
          ctx.fillStyle = ok[j][i] ? `rgb(${Math.round(g * 0.3)},${g},${Math.round(g * 0.3)})` : `rgb(${g},${Math.round(g * 0.4)},${Math.round(g * 0.3)})`;
          ctx.fillRect(a.X(wv) - cw / 2, a.Y(l) - ch / 2, cw + 0.5, ch + 0.5);
        }),
      );
      // ITU-R BS.1116: 1.1·W/H ≤ L/H ≤ 4.5·W/H − 4, both ratios under 3
      ctx.strokeStyle = COL.cyan;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.X(1), a.Y(1.1));
      ctx.lineTo(a.X(2), a.Y(2.2));
      ctx.moveTo(a.X(1.111), a.Y(1));
      ctx.lineTo(a.X(1.556), a.Y(3));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.yellow;
      for (const r of FAVOURABLE_RATIOS.filter((x) => x.ratio)) ctx.fillRect(a.X(r.ratio[1]) - 1.5, a.Y(r.ratio[2]) - 1.5, 3, 3);
      const rw = M.W / M.H;
      const rl = M.L / M.H;
      ctx.strokeStyle = COL.white;
      ctx.beginPath();
      ctx.arc(a.X(clamp(rw, 1, 2)), a.Y(rl), 4, 0, 2 * Math.PI);
      ctx.stroke();
      boltNote.textContent = `This room 1 : ${fmt(rw)} : ${fmt(rl)} (white ring). Green passes Bonello, red fails; yellow dots are the favourable ratios; cyan dashes the ITU-R BS.1116 bounds. Computed at H = ${fmt(toU(M.H))} ${M.units} — click to take a ratio.`;
    }

    /** The modes of Mode 1 struck together and left to ring: each with its own decay, beating where they are close. */
    function drawDecay(fm) {
      const p = prep(decayC.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a125 = alpha125();
      const withD = fm.map((m) => ({ ...m, ...modeDecay(dims(), m, a125, cNow()) }));
      const t60 = Math.max(0.2, ...withD.map((m) => (Number.isFinite(m.t60) ? m.t60 : 0)));
      const tMax = Math.min(4, Math.ceil(t60 * 10) / 10);
      const a = axes(ctx, w, hh, { title: 'Decay (dB) / Time (s)', x0: 0, x1: tMax, y0: -60, y1: 0, xticks: [0, 0.25, 0.5, 0.75, 1].map((k) => ({ v: k * tMax, label: fmt(k * tMax, 2) })), yticks: [-60, -40, -20, 0] });
      const curve = bandDecay(withD, { tMax, n: Math.round(a.iw) });
      ctx.strokeStyle = COL.lime;
      ctx.beginPath();
      curve.forEach((q, i) => (i ? ctx.lineTo(a.X(q.t), a.Y(q.db)) : ctx.moveTo(a.X(q.t), a.Y(q.db))));
      ctx.stroke();
      decayNote.textContent = withD.length ? `${withD.length} mode${withD.length === 1 ? '' : 's'}; T60 ${withD.map((m) => fmt(m.t60, 2)).slice(0, 6).join(', ')}${withD.length > 6 ? '…' : ''} s. Close modes beat; axial ones ring longest.` : 'Enter a mode or a band above.';
    }
    /** α per face at 125 Hz, the lowest band: what the laid materials and the base give, area-weighted. */
    function alpha125() {
      const room = classicRoom();
      return Object.fromEntries(
        FACES6.map((f) => {
          const ss = room.surfaces.filter((x) => x.face === f);
          const A = ss.reduce((t, x) => t + x.area, 0);
          return [f, A ? ss.reduce((t, x) => t + x.area * x.material.alpha[0], 0) / A : 0];
        }),
      );
    }

    function drawModes(vis) {
      const p = prep(top.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const groups = [];
      for (const m of vis) {
        const g = groups.find((x) => Math.abs(x.f - m.f) <= 0.005 * x.f);
        if (g) g.modes.push(m);
        else groups.push({ f: m.f, modes: [m] });
      }
      const t = countTicks(Math.max(4, ...groups.map((g) => g.modes.length + 1)));
      const a = axes(ctx, w, hh, { title: `Number of Modes / Frequency${S.listed === 'all' ? '' : ` — ${S.listed} only`}`, x0: 0, x1: 200, y0: 0, y1: t.max, xticks: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((v) => ({ v, label: String(v) })), yticks: t.ticks, xLabel: 'Hz' });
      top.map = a;
      const rank = { axial: 0, tangential: 1, oblique: 2 };
      if (S.multi) {
        ctx.fillStyle = 'rgba(255,255,0,0.18)';
        ctx.fillRect(a.X(Math.max(0, S.lf)), a.pad.t, Math.max(2, a.X(Math.min(200, S.hf)) - a.X(Math.max(0, S.lf))), a.ih);
      }
      for (const g of groups) {
        const tt = g.modes.reduce((b, m) => (rank[m.type] < rank[b] ? m.type : b), 'oblique');
        const x = Math.round(a.X(g.f));
        const sel = S.sel && g.modes.includes(S.sel);
        const inBand = S.multi && g.f >= S.lf && g.f <= S.hf;
        ctx.fillStyle = sel || inBand ? COL.yellow : tt === 'axial' ? COL.red : tt === 'tangential' ? COL.orange : COL.grey;
        const bw = tt === 'axial' ? 3 : tt === 'tangential' ? 2 : 1;
        const y = a.Y(g.modes.length);
        ctx.fillRect(x - Math.floor(bw / 2), y, bw, a.Y(0) - y);
      }
      ctx.textAlign = 'right';
      [['Axial', COL.red], ['Tangential', COL.orange], ['Oblique', COL.grey], ['Selected', COL.yellow]].forEach(([l, c], i) => {
        ctx.fillStyle = c;
        ctx.fillText(l, w - 14, 30 + i * 12);
      });
      ctx.textAlign = 'left';
    }

    function drawThirds(counts, ideal) {
      const p = prep(bot.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const t = countTicks(Math.max(...counts.map((c) => c.count), ...ideal) * 1.12 + 1);
      const a = axes(ctx, w, hh, { title: 'Number of Modes / 1/3 Octave Band — green this room, blue the ideal for its volume', cats: counts.map((c) => String(c.fc)), y0: 0, y1: t.max, x0: 0, x1: 1, yticks: t.ticks, xLabel: 'Hz' });
      bot.map = a;
      counts.forEach((c, i) => {
        const s = a.slot(i);
        const bw = Math.max(4, s.w * 0.5);
        const x = s.x + (s.w - bw) / 2;
        const y = a.Y(c.count);
        ctx.fillStyle = i === S.hover ? COL.lime : COL.green;
        if (c.count) ctx.fillRect(x, y, bw, a.Y(0) - y);
        const drop = i > 0 && counts.slice(0, i).some((q) => q.count > 0) && c.count < counts[i - 1].count;
        ctx.fillStyle = drop ? COL.yellow : COL.lime;
        ctx.textAlign = 'center';
        ctx.fillText(String(c.count), s.x + s.w / 2, y - 3);
      });
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#4080ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ideal.forEach((v, i) => {
        const s = a.slot(i);
        const y = a.Y(v);
        if (i) ctx.lineTo(s.x, y);
        else ctx.moveTo(s.x, y);
        ctx.lineTo(s.x + s.w, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    /** The pressure display: each held plane and the current one as shaded cells, or the volume as dots. */
    function drawField() {
      const shade = (v, param) => {
        if (param === 'phase') return v >= 0 ? `rgba(255,${Math.round(220 - 160 * v)},60,${0.2 + 0.75 * v})` : `rgba(60,${Math.round(220 + 160 * v)},255,${0.2 - 0.75 * v})`;
        const g = Math.round(40 + 215 * v);
        return `rgb(${g},${g},${g})`;
      };
      const paint = (ctx, S2, field) => {
        if (!field) return;
        if (field.plane === '3d') {
          for (const p of field.points) {
            if (Math.abs(p.value) < 0.15) continue;
            const q = S2(p);
            ctx.fillStyle = shade(p.value, field.param ?? S.param);
            ctx.globalAlpha = 0.25 + 0.6 * Math.abs(p.value);
            ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
          }
          ctx.globalAlpha = 1;
          return;
        }
        const pt = (u, v) => (field.plane === 'horizontal' ? { X: u, Y: v, Z: field.at } : field.plane === 'length' ? { X: field.at, Y: u, Z: v } : { X: u, Y: field.at, Z: v });
        const { us, vs, grid } = field;
        ctx.globalAlpha = 0.85;
        for (let j = 0; j + 1 < vs.length; j++)
          for (let i = 0; i + 1 < us.length; i++) {
            const v = (grid[j][i] + grid[j][i + 1] + grid[j + 1][i] + grid[j + 1][i + 1]) / 4;
            const c4 = [pt(us[i], vs[j]), pt(us[i + 1], vs[j]), pt(us[i + 1], vs[j + 1]), pt(us[i], vs[j + 1])].map(S2);
            ctx.fillStyle = shade(v, field.param);
            ctx.beginPath();
            c4.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
            ctx.closePath();
            ctx.fill();
          }
        ctx.globalAlpha = 1;
      };
      const fm = fieldModes();
      const label = !fm.length ? 'enter a mode index or a band (Mode 1)' : S.multi ? `${fm.length} modes, ${fmt(S.lf, 1)}–${fmt(S.hf, 1)} Hz` : `mode ${S.idx.nx} ${S.idx.ny} ${S.idx.nz} · ${fmt(fm[0].f, 1)} Hz`;
      drawRoom(roomCv, S.RV, {
        under: (ctx, S2) => {
          for (const f of S.held) paint(ctx, S2, f);
          paint(ctx, S2, S.field);
        },
        note: label,
      });
    }
  });
}
