// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — window 2, SPEAKER BOUNDARY INTERFERENCE RESPONSE.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { axes, clamp, COL, FACE_LABEL, FACES6, fmt, FREQ_TICKS, group, h, prep, readout } from '../kit.js';
import { ACOUSTX_BY_ID, ACOUSTX_SPEAKER_PRESETS, boxSize, SPEAKER_PRESETS } from '../../acoustics/devices.js';
import { sbirDeviation, sbirFreqs } from '../../acoustics/sbir.js';
import { C } from '../../acoustics/bands.js';
import {
  crossoverCheck,
  listenerGeometry,
  modeShape,
  sbirScore,
  specularAbsorbers,
  surroundPositions,
} from '../classic.js';
import { modeList, steps } from '../../acoustics/modalDistribution.js';

export function sbirWindow(acx) {
  const {
    areaU, aUnit, box, chartBox, cNow, dimsAtC, dimsGroup, drawRoom, edited, faceMatSelect, job, lenField, M,
    makeWindow, newRV, numField, pointGroup, realRoom, refreshAll, reportNode, roomManager, spk2, store,
    tabs, toBox, toSheetReal, toU, viewStrip,
  } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // 2. SPEAKER BOUNDARY INTERFERENCE RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('sbir', 'Acoustic X — Speaker Boundary Interference Response', { w: 880, h: 610 }, (win) => {
    const S = { perOct: 12, mode: 'absolute', noSearch: false, ranges: null, step: 0.15, results: [], resSel: 0, res: null, spkOpt: 'position', win: 1, RV: newRV('3d') };
    const T = tabs(win, ['Room', 'SPK', 'Listener', 'Search']);
    T.pages.Room.append(dimsGroup(win), group('Surfaces', ...FACES6.map((f) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), faceMatSelect(win, f)))));

    // ── SPK: size (or from the BIM library: the Acoustic X monitors are library parts) and position
    function spkOptions() {
      const makers = [...new Set(ACOUSTX_BY_ID.map(([, s]) => s.maker))];
      return [
        h('option', { value: '' }, '— speaker database —'),
        ...makers.map((m) =>
          h(
            'optgroup',
            { label: `Acoustic X · ${m}` },
            ACOUSTX_BY_ID.filter(([, s]) => s.maker === m).map(([key, s]) => h('option', { value: key }, s.label)),
          ),
        ),
        h(
          'optgroup',
          { label: 'Modern presets' },
          Object.entries(SPEAKER_PRESETS)
            .filter(([k]) => k !== 'sub')
            .map(([k, p]) => h('option', { value: `preset:${k}` }, p.label)),
        ),
      ];
    }
    const dbSel = h('select', { class: 'list' }, ...spkOptions());
    dbSel.addEventListener('change', () => {
      const v = dbSel.value;
      if (!v) return;
      if (v.startsWith('preset:')) {
        const k = v.slice(7);
        const p = SPEAKER_PRESETS[k];
        if (!p) return;
        const b = boxSize({ kind: k, litres: p.litres });
        M.spkModel = k;
        M.spkSize = { w: b.w, d: b.d, h: b.h };
        M.woofer = +(b.h * 0.3).toFixed(3);
        M.centerHeight = +(b.h * 0.5).toFixed(3);
        if (p.fLow) M.lfCut = p.fLow;
      } else {
        const s = ACOUSTX_SPEAKER_PRESETS[v];
        if (!s) return;
        M.spkModel = v;
        M.spkSize = { w: s.w, d: s.d, h: s.h };
        M.woofer = s.wooferHeight;
        M.centerHeight = s.centerHeight;
        M.lfCut = s.fLow;
        if (s.fCross) M.xover = s.fCross;
      }
      edited();
    });
    win.syncers.push(() => (dbSel.value = M.spkModel ?? ''));
    const sizeF = (label, k, title) => lenField(win, label, () => M.spkSize[k], (v) => (M.spkSize = { ...M.spkSize, [k]: Math.max(0.05, v) }), { title });
    const sizePanel = h('div', {}, group('Speaker Database', dbSel), group('Size', sizeF('Depth', 'd', 'Front to back of the cabinet'), sizeF('Width', 'w'), sizeF('Height', 'h'), lenField(win, 'Center height', () => M.centerHeight ?? +(M.spkSize.h * 0.5).toFixed(3), (v) => (M.centerHeight = Math.max(0, v)), { title: 'Acoustic center height of the speaker above the bottom of the cabinet' }), lenField(win, 'Woofer height', () => M.woofer, (v) => (M.woofer = Math.max(0, v)), { title: 'Centre of the woofer above the bottom of the cabinet: the boundary calculation places the woofer' })));
    const exc = { idx: readout(), f: readout() };
    const posPanel = h('div', {}, pointGroup(win, 'Speaker1 (woofer centre)', () => M.spk1, (v) => (M.spk1 = v)), pointGroup(win, 'Speaker2 (mirror image)', spk2, () => {}, { disabled: () => true }), group('Mode Excited By Position', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Index'), exc.idx), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Frequency'), exc.f, 'Hz'), h('div', { class: 'small muted' }, 'The lowest mode the speaker sits on a pressure maximum of, and the listener hears. Magenta on the chart.')));
    const optR = ['size', 'position'].map((v) => {
      const r = h('input', { type: 'radio', name: 'acx-sb-opt', onchange: () => ((S.spkOpt = v), sync()) });
      win.syncers.push(() => (r.checked = S.spkOpt === v));
      return h('label', { class: 'opt' }, r, v === 'size' ? 'Size' : 'Position');
    });
    const sync = () => {
      sizePanel.hidden = S.spkOpt !== 'size';
      posPanel.hidden = S.spkOpt !== 'position';
    };
    win.syncers.push(sync);
    T.pages.SPK.append(sizePanel, posPanel, group('Option', ...optR));

    // ── Listener: where, the critical frequencies, what the geometry says
    const geo = { angle: readout(), d: readout(), tilt: readout(), rear: readout() };
    const geoWarn = h('div', { class: 'warn small' });
    T.pages.Listener.append(
      pointGroup(win, 'Listener', () => M.lis, (v) => (M.lis = v)),
      group('Speaker Critical Frequency', numField(win, 'LF cut-off', 'Hz', () => M.lfCut, (v) => (M.lfCut = Math.max(10, v)), { step: 1, title: 'Red on the chart: only frequencies above it count toward the deviation', local: false }), numField(win, 'LF cross-over', 'Hz', () => M.xover, (v) => (M.xover = Math.max(0, v)), { step: 10, title: 'Yellow on the chart: a dip here is flagged', local: false })),
      group('Valid Listening Window', lenField(win, 'Window size', () => S.win, (v) => (S.win = clamp(v, 0.2, 3)), { local: true, title: 'How far the head may move round the mix position and still hear no first reflection — the specular absorbers are sized to it' })),
      group('Listener / Speakers', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Angle between'), geo.angle, '°'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Distance'), geo.d), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Speaker tilt'), geo.tilt, '°'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Rear angle'), geo.rear), geoWarn),
    );

    // ── Search
    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = v);
    function defaultRanges() {
      const g = M.gen.sbir;
      if (g.custom) return { X: [g.sideMin, g.sideMax], Y: [g.frontMin, g.frontMax] };
      return { X: [0.3, Math.max(0.35, M.W / 2 - M.gen.sbir.minSpk / 2)], Y: [0.3, Math.max(0.35, Math.min(M.L * 0.45, M.lis.Y - 0.5))] };
    }
    const resList = h('select', { class: 'list', size: 8 });
    resList.addEventListener('change', () => (S.resSel = resList.selectedIndex));
    const searchNote = h('div', { class: 'small muted' });
    const noC = h('input', { type: 'checkbox', onchange: () => (S.noSearch = noC.checked) });
    win.syncers.push(() => (noC.checked = S.noSearch));
    const modeR = [
      ['absolute', 'Min. Absolute Deviation'],
      ['negative', 'Min. Negative Deviation'],
    ].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-sb-mode', onchange: () => ((S.mode = v), win.refresh()) });
      win.syncers.push(() => (r.checked = S.mode === v));
      return h('div', {}, h('label', { class: 'opt' }, r, l));
    });
    T.pages.Search.append(
      group('Search Parameters', h('label', { class: 'opt' }, noC, 'No search — check the position as it is'), lenField(win, 'Search step', () => S.step, (v) => (S.step = Math.max(0.02, v)), { local: true, title: 'The grid the optimiser walks (0.15 m ≈ 6 in)' }), ...modeR),
      group('Search Limits (Speaker1)', h('div', { class: 'small muted' }, 'X from the side wall, Y from the front wall. The height stays where the SPK tab puts it.'), ...['X', 'Y'].map((k) => h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true }))), h('div', { class: 'btns' }, h('button', { onclick: () => ((S.ranges = null), win.refresh()) }, 'Automatic limits'))),
      h('div', { class: 'btns' }, h('button', { onclick: () => runSearch() }, 'Search'), h('button', { onclick: applyResult, title: "Move the design's speaker (and its mirror twin) to the selected position" }, 'Apply')),
      h('div', { style: 'margin-top:6px' }, resList),
      searchNote,
    );

    /** The deviation at the listener for one speaker position, at this temperature. */
    function devAt(P, perOct = 48) {
      const freqs = sbirFreqs(16, 1000, perOct);
      const k = C / cNow();
      const out = sbirDeviation(box(), toBox(P), toBox(M.lis), freqs.map((f) => f * k));
      return { freqs, dev: out.dev };
    }
    const scoreOf = (d) => sbirScore(d.freqs, d.dev, { lfCut: M.lfCut, fMax: 300, mode: S.mode });

    function runSearch(avoidDip = false) {
      if (S.noSearch) {
        win.refresh();
        win.showPane('chart');
        return;
      }
      const r = (S.ranges ??= defaultRanges());
      const xs = steps(r.X, S.step).filter((X) => M.W - 2 * X >= M.gen.sbir.minSpk - 1e-9);
      const ys = steps(r.Y, S.step);
      if (!xs.length) {
        searchNote.textContent = `⚠ No X in the limits keeps the speakers ${fmt(toU(M.gen.sbir.minSpk))} ${M.units} apart.`;
        return;
      }
      const all = [];
      job(
        win,
        xs.length,
        (i) => {
          for (const Y of ys) {
            const P = { X: xs[i], Y, Z: M.spk1.Z };
            const d = devAt(P, 24);
            const x = crossoverCheck(d.freqs, d.dev, M.xover);
            all.push({ ...P, score: scoreOf(d), dips: x.dips });
          }
        },
        () => {
          all.sort((a, b) => a.score - b.score);
          const pool = avoidDip ? all.filter((p) => !p.dips) : all;
          S.results = pool.slice(0, 8);
          S.resSel = 0;
          const best = S.results[0];
          searchNote.textContent = `${all.length} positions tried, ${S.mode === 'negative' ? 'least negative' : 'least absolute'} deviation above ${M.lfCut} Hz.`;
          win.render();
          if (best?.dips && !avoidDip && M.xover > 0 && window.confirm(`The best position has a negative deviation at the ${M.xover} Hz crossover. Find a position where it does not?`)) runSearch(true);
        },
      );
    }
    function applyResult() {
      const P = S.results[S.resSel];
      if (!P) return;
      const real = realRoom();
      const [id1, id2] = M.ids;
      const speakers = store?.state?.speakers ?? [];
      M.spk1 = { X: P.X, Y: P.Y, Z: P.Z };
      if (!real || !id1 || !speakers.some((s) => s.id === id1)) {
        edited();
        win.status.textContent = 'No speaker in the design to move — the classic Speaker1 moved instead';
        return;
      }
      const wasLinked = M.linked;
      const p = toSheetReal(real, P);
      store.update('speaker', id1, { x: p.x, y: p.y, z: p.z });
      const s1 = store.state.speakers.find((s) => s.id === id1);
      if (id2 && !s1?.pairId) {
        const q = toSheetReal(real, { X: real.W - P.X, Y: P.Y, Z: P.Z });
        store.update('speaker', id2, { x: q.x, y: q.y, z: q.z });
      }
      if (!wasLinked) refreshAll();
    }

    // ── right side
    const chart = chartBox();
    const resRadios = [[1, 'Octave'], [3, '1/3'], [6, '1/6'], [12, '1/12']].map(([n, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-sbir-res', onchange: () => ((S.perOct = n), win.render()) });
      win.syncers.push(() => (r.checked = S.perOct === n));
      return h('label', { class: 'opt' }, r, l);
    });
    const devRo = readout();
    const devLbl = h('span', { class: 'lbl', style: 'width:auto' });
    const xoWarn = h('span', { class: 'warn small' });
    const chartPane = h('div', { class: 'acx-pane' }, h('fieldset', { class: 'grow' }, h('legend', {}, 'SBIR'), h('div', { class: 'manager' }, ...resRadios, xoWarn), chart.box, h('div', { class: 'row' }, devLbl, devRo, 'dB')));
    const roomCv = h('canvas');
    const absBox = h('div', { class: 'small' });
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), h('div', { class: 'cols' }, roomManager(win, S.RV, roomCv), group('Absorption', absBox)));
    const devTable = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, h('div', { class: 'cols', style: 'flex:1;min-height:0' }, h('div', { class: 'scroll', style: 'max-width:200px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Hz', 'dB'].map((t) => h('th', {}, t)))), devTable)), repBox));
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const speakersNow = () => {
      const out = [M.spk1, spk2()];
      const g = M.gen.sbir;
      if (g.centre || g.rear) {
        const sur = surroundPositions(M.spk1, M.lis, { rearRise: g.rearRise });
        if (g.centre) out.push(sur.centre);
        if (g.rear) out.push(sur.rearLeft, sur.rearRight);
      }
      return out;
    };

    win.compute = () => {
      const fine = devAt(M.spk1, 48);
      const score = scoreOf(fine);
      const xo = crossoverCheck(fine.freqs, fine.dev, M.xover);
      // the modes the position excites: the speaker within 5 % of a pressure maximum, the listener not on a null
      const dims = { L: M.L, W: M.W, H: M.H };
      const modes = modeList(dimsAtC(), 300);
      const excited = modes.filter((m) => Math.abs(modeShape(dims, m, M.spk1)) >= 0.95 && Math.abs(modeShape(dims, m, M.lis)) >= 0.3).slice(0, 6);
      const absorbers = specularAbsorbers(dims, [M.spk1, spk2()], M.lis, S.win);
      const sur = surroundPositions(M.spk1, M.lis, { rearRise: M.gen.sbir.rearRise });
      S.res = { fine, score, xo, excited, absorbers, geo: listenerGeometry(M.spk1, spk2(), M.lis), sur };
      M.absorbers = absorbers;
    };

    win.report = () => {
      const r = S.res;
      const A = r.absorbers;
      const surf = (n, a) => (a ? [n, `${fmt(toU(a.u0))}–${fmt(toU(a.u1))}`, `${fmt(toU(a.v0))}–${fmt(toU(a.v1))}`, `${fmt(areaU(a.area), 1)} ${aUnit()}`] : [n, '—', '—', '—']);
      const pos = (n, P) => [n, fmt(toU(P.X)), fmt(toU(P.Y)), fmt(toU(P.Z))];
      return {
        title: 'Speaker Boundary Interference Response',
        sections: [
          { heading: `Positions (${M.units}: X from the left wall, Y from the front wall, Z above the floor)`, head: ['', 'X', 'Y', 'Z'], rows: [pos('Speaker 1 (woofer)', M.spk1), pos('Speaker 2 (woofer)', spk2()), pos('Listener', M.lis), ...(M.gen.sbir.centre ? [pos('Centre', r.sur.centre)] : []), ...(M.gen.sbir.rear ? [pos('Rear left', r.sur.rearLeft), pos('Rear right', r.sur.rearRight)] : [])] },
          { heading: 'Speaker', rows: [['Model', ACOUSTX_SPEAKER_PRESETS[M.spkModel]?.label ?? SPEAKER_PRESETS[M.spkModel]?.label ?? 'entered by size'], ['Size (w × d × h)', `${fmt(toU(M.spkSize.w))} × ${fmt(toU(M.spkSize.d))} × ${fmt(toU(M.spkSize.h))} ${M.units}`], ['Center height', `${fmt(toU(M.centerHeight ?? M.spkSize.h * 0.5))} ${M.units}`], ['Woofer height', `${fmt(toU(M.woofer))} ${M.units}`], ['LF cut-off', `${M.lfCut} Hz`], ['LF cross-over', `${M.xover} Hz`]] },
          { heading: 'Result', rows: [[S.mode === 'negative' ? 'Negative deviation' : 'Absolute deviation', `${fmt(r.score, 2)} dB`], ['At the crossover', Number.isFinite(r.xo.dev) ? `${fmt(r.xo.dev, 1)} dB${r.xo.dips ? ' — dips' : ''}` : '—'], ['Angle between speakers', `${fmt(r.geo.angle, 1)}°`], ['Speaker tilt', `${fmt(r.geo.tilt, 1)}° ${r.geo.warn}`], ['Modes excited', r.excited.map((m) => `${m.nx}${m.ny}${m.nz} ${fmt(m.f, 1)} Hz`).join(', ') || 'none flagged']] },
          { heading: `Specular absorption for a ${fmt(toU(S.win))} ${M.units} listening window (u, v on the surface)`, head: ['Surface', 'u', 'v', 'Area'], rows: [surf('Left wall (u = Y, v = Z)', A.left), surf('Right wall (u = Y, v = Z)', A.right), surf('Ceiling (u = X, v = Y)', A.ceiling)] },
          { heading: 'Deviation, 1/12 octave', head: ['Hz', 'dB'], rows: thinned(r.fine, 12).map(([f, d]) => [fmt(f, 1), fmt(d, 1)]) },
        ],
      };
    };
    const thinned = (d, perOct) => {
      const out = [];
      for (const fc of sbirFreqs(16, 1000, perOct)) {
        const i = d.freqs.reduce((b, f, j) => (Math.abs(Math.log(f / fc)) < Math.abs(Math.log(d.freqs[b] / fc)) ? j : b), 0);
        out.push([fc, d.dev[i]]);
      }
      return out;
    };

    win.render = () => {
      if (!S.res) return;
      const r = S.res;
      devLbl.textContent = S.mode === 'negative' ? 'Negative Deviation' : 'Absolute Deviation';
      devRo.textContent = fmt(r.score, 2);
      xoWarn.textContent = r.xo.dips ? `⚠ ${fmt(r.xo.dev, 1)} dB at the ${M.xover} Hz crossover` : '';
      exc.idx.textContent = r.excited[0] ? `${r.excited[0].nx} ${r.excited[0].ny} ${r.excited[0].nz}` : '—';
      exc.f.textContent = r.excited[0] ? fmt(r.excited[0].f, 1) : '';
      geo.angle.textContent = fmt(r.geo.angle, 1);
      geo.d.textContent = `${fmt(toU(r.geo.d1))} ${M.units}`;
      geo.tilt.textContent = fmt(r.geo.tilt, 1);
      geo.rear.textContent = M.gen.sbir.rear ? `±110°, tilt ${fmt(r.sur.rearTilt, 1)}°` : 'rears off';
      geoWarn.textContent = r.geo.warn ? `⚠ ${r.geo.warn}` : '';
      resList.replaceChildren(...S.results.map((p, i) => h('option', { selected: i === S.resSel }, `X ${fmt(toU(p.X))}  Y ${fmt(toU(p.Y))} ${M.units}   ${fmt(p.score, 2)} dB${p.dips ? ' ⚠ xover' : ''}`)));
      const A = r.absorbers;
      absBox.replaceChildren(...[['Left wall', A.left], ['Right wall', A.right], ['Ceiling', A.ceiling]].map(([n, a]) => h('div', {}, `${n}: ${a ? `${fmt(areaU(a.area), 1)} ${aUnit()}` : '—'}`)), h('div', { class: 'muted' }, `for a ${fmt(toU(S.win))} ${M.units} window`));
      if (win.pane === 'chart') drawSbir(r);
      if (win.pane === 'room') drawSbirRoom(r);
      if (win.pane === 'data') {
        devTable.replaceChildren(...thinned(r.fine, 12).map(([f, d]) => h('tr', {}, h('td', {}, fmt(f, 1)), h('td', { class: d < 0 && S.mode === 'negative' ? 'warn' : '' }, fmt(d, 1)))));
        repBox.replaceChildren(reportNode(win.report()));
      }
    };

    function drawSbir(r) {
      const p = prep(chart.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: `SBIR — Deviation (dB) / Frequency (Hz) — ${S.mode === 'negative' ? 'negative deviation in red' : 'absolute'}`, x0: 16, x1: 1000, xlog: true, y0: -30, y1: 12, xticks: FREQ_TICKS, yticks: [-30, -24, -18, -12, -6, 0, 6, 12], xLabel: 'Hz' });
      const half = 1 / (2 * S.perOct);
      for (const fc of sbirFreqs(16, 1000, S.perOct)) {
        let s = 0;
        let n = 0;
        r.fine.freqs.forEach((f, i) => {
          if (Math.abs(Math.log2(f / fc)) <= half + 1e-9) {
            s += r.fine.dev[i];
            n++;
          }
        });
        const v = n ? s / n : 0;
        const x0 = a.X(Math.max(16, fc * 2 ** -half));
        const x1 = a.X(Math.min(1000, fc * 2 ** half));
        ctx.fillStyle = fc < M.lfCut ? '#305030' : S.mode === 'negative' && v < 0 ? COL.red : COL.green;
        const y0 = a.Y(0);
        const y1 = a.Y(v);
        ctx.fillRect(x0 + 0.5, Math.min(y0, y1), Math.max(1, x1 - x0 - 1), Math.max(1, Math.abs(y1 - y0)));
      }
      ctx.strokeStyle = COL.frame;
      ctx.beginPath();
      ctx.moveTo(a.pad.l, Math.round(a.Y(0)) + 0.5);
      ctx.lineTo(w - a.pad.r, Math.round(a.Y(0)) + 0.5);
      ctx.stroke();
      const vline = (f, colour, label) => {
        if (!(f >= 16 && f <= 1000)) return;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.moveTo(Math.round(a.X(f)) + 0.5, a.pad.t);
        ctx.lineTo(Math.round(a.X(f)) + 0.5, hh - a.pad.b);
        ctx.stroke();
        ctx.fillStyle = colour;
        ctx.fillText(label, a.X(f) + 3, a.pad.t + 10);
      };
      vline(M.lfCut, COL.red, `LF cut-off ${M.lfCut} Hz`);
      vline(M.xover, COL.yellow, `x-over ${M.xover} Hz`);
      r.excited.forEach((m, i) => {
        if (!(m.f >= 16 && m.f <= 1000)) return;
        ctx.strokeStyle = '#ff40ff';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(a.X(m.f)) + 0.5, a.pad.t);
        ctx.lineTo(Math.round(a.X(m.f)) + 0.5, hh - a.pad.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff40ff';
        ctx.fillText(`${m.nx}${m.ny}${m.nz}`, a.X(m.f) + 3, hh - a.pad.b - 6 - 11 * i);
      });
    }

    function drawSbirRoom(r) {
      const A = r.absorbers;
      drawRoom(roomCv, S.RV, {
        speakers: speakersNow(),
        lis: M.lis,
        over: (ctx, S2) => {
          const quad = (pts, fill, stroke) => {
            const q = pts.map(S2);
            ctx.beginPath();
            q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.stroke();
          };
          // the valid listening window, at ear height
          const w2 = S.win / 2;
          quad([{ X: M.lis.X - w2, Y: M.lis.Y - w2, Z: M.lis.Z }, { X: M.lis.X + w2, Y: M.lis.Y - w2, Z: M.lis.Z }, { X: M.lis.X + w2, Y: M.lis.Y + w2, Z: M.lis.Z }, { X: M.lis.X - w2, Y: M.lis.Y + w2, Z: M.lis.Z }], 'rgba(255,255,0,0.15)', COL.yellow);
          // the specular absorbers on the side walls and the ceiling
          const side = (X, a) => a && quad([{ X, Y: a.u0, Z: a.v0 }, { X, Y: a.u1, Z: a.v0 }, { X, Y: a.u1, Z: a.v1 }, { X, Y: a.u0, Z: a.v1 }], 'rgba(0,192,255,0.25)', COL.cyan);
          side(0, A.left);
          side(M.W, A.right);
          if (A.ceiling) quad([{ X: A.ceiling.u0, Y: A.ceiling.v0, Z: M.H }, { X: A.ceiling.u1, Y: A.ceiling.v0, Z: M.H }, { X: A.ceiling.u1, Y: A.ceiling.v1, Z: M.H }, { X: A.ceiling.u0, Y: A.ceiling.v1, Z: M.H }], 'rgba(0,192,255,0.2)', COL.cyan);
          // corner absorbers: the two front corners, floor to ceiling, 0.6 m across
          const c = 0.42;
          for (const [X0, X1] of [[0, c], [M.W - c, M.W]]) {
            ctx.strokeStyle = COL.orange;
            ctx.beginPath();
            const Ycorner = X0 === 0 ? (X) => c - X : (X) => c - (M.W - X);
            const a = { X: X0 === 0 ? 0 : M.W, Y: c };
            const b = { X: X0 === 0 ? c : M.W - c, Y: 0 };
            for (const Z of [0, M.H]) {
              const p1 = S2({ ...a, Z });
              const p2 = S2({ ...b, Z });
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            }
            for (const P of [a, b]) {
              const p1 = S2({ ...P, Z: 0 });
              const p2 = S2({ ...P, Z: M.H });
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            }
            ctx.stroke();
            void Ycorner;
          }
          ctx.fillStyle = COL.text;
          ctx.fillText('yellow: listening window · cyan: specular absorption · orange: corner absorbers', 8, 28);
        },
      });
    }
  });
}
