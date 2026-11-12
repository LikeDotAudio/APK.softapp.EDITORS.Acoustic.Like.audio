// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — window 4, REVERB TIME.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { FORMULAS, RT_TARGETS, rtFormulas, rtTarget } from '../../acoustics/reverbTargets.js';
import { axes, COL, FACE_LABEL, FACES6, fmt, FT, group, h, material, prep, readout } from '../kit.js';
import { BAND_LABELS, BANDS } from '../../acoustics/bands.js';
import { optimiseAreas, rtFromMeasured } from '../classic.js';
import { bassRatio } from '../references.js';

export function reverbWindow(acx) {
  const {
    areaFromU, areaU, aUnit, boxAreas, chartBox, classicRoom, dimsGroup, drawRoom, edited, faceMatSelect, M,
    makeWindow, matOptions, newRV, reportNode, roomManager, tabs, viewStrip,
  } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // 4. REVERB TIME
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('reverb', 'Acoustic X — Reverb Time', { w: 880, h: 610 }, (win) => {
    const S = { target: 'control', user: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4], formula: 'sabine', face: 'back', selMat: 'absorber-100', vars: {}, sol: null, res: null, show: 'rt', editUser: false, editMeas: false, RV: newRV('3d') };

    // ── Type: what to aim for
    const typeRadios = RT_TARGETS.map((t) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-type', onchange: () => ((S.target = t.id), win.refresh()) });
      win.syncers.push(() => (r.checked = S.target === t.id));
      return h('div', {}, h('label', { class: 'opt', title: t.source }, r, t.label), h('span', { class: 'small muted' }, t.id === 'user' ? 'your own, per band' : t.source));
    });
    const bandInputs = (arr, set) => h('div', { class: 'bandin' }, BAND_LABELS.map((l, i) => h('label', {}, l, (() => {
      const inp = h('input', { type: 'number', step: 0.05, style: 'width:52px' });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (Number.isFinite(v) && v > 0) set(i, v);
        win.refresh();
      });
      win.syncers.push(() => {
        const a = arr();
        if (document.activeElement !== inp) inp.value = a ? String(a[i]) : '';
      });
      return inp;
    })())));
    const userPanel = h('div', { hidden: true }, group("User's RT60 Criteria (s)", bandInputs(() => S.user, (i, v) => (S.user[i] = v)), h('div', { class: 'btns' }, h('button', { onclick: () => ((userPanel.hidden = true), (S.target = 'user'), win.refresh()) }, 'Done'))));
    const measPanel = h('div', { hidden: true }, group('RT60 Of Empty Room (s)', bandInputs(() => M.measured, (i, v) => (M.measured = (M.measured ?? [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]).map((x, j) => (j === i ? v : x)))), h('div', { class: 'btns' }, h('button', { onclick: () => ((measPanel.hidden = true), (S.formula = 'measured'), win.refresh()) }, 'Done'))));

    // ── RT60: how to calculate it
    const formulaList = [...FORMULAS, { id: 'measured', label: 'Measured empty RT' }];
    const formulaRadios = formulaList.map((f) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-f', onchange: () => ((S.formula = f.id), win.refresh()) });
      win.syncers.push(() => {
        r.checked = S.formula === f.id;
        r.disabled = f.id === 'measured' && !M.measured;
      });
      return h('div', {}, h('label', { class: 'opt' }, r, f.label));
    });

    // ── Surface: what each surface is made of
    const faceList = h('select', { class: 'list', size: 6 }, FACES6.map((f) => h('option', { value: f }, FACE_LABEL[f])));
    faceList.addEventListener('change', () => ((S.face = faceList.value), win.refresh()));
    const nextFace = () => ((S.face = FACES6[(FACES6.indexOf(S.face) + 1) % 6]), win.refresh());
    const layerBox = h('div');
    const remainRo = readout('What the base material still covers');
    const matList = h('select', { class: 'list', size: 9, title: 'Double-click to lay it on the surface' }, matOptions());
    const srcRo = h('div', { class: 'small muted' });
    matList.addEventListener('change', () => ((S.selMat = matList.value), win.render()));
    const attach = () => {
      const layers = (M.layers[S.face] ??= []);
      if (layers.length >= 8) return (win.status.textContent = 'Eight materials per surface at most');
      const free = faceArea(S.face) - layers.reduce((s, l) => s + l.area, 0);
      layers.push({ id: S.selMat, area: +Math.max(0, Math.min(free, 1)).toFixed(2) });
      edited();
    };
    matList.addEventListener('dblclick', attach);
    win.syncers.push(() => {
      faceList.value = S.face;
      if (document.activeElement !== matList) matList.value = S.selMat;
    });

    // ── Optimise: the absorber overview
    const overview = h('tbody');
    const optNote = h('div', { class: 'small', style: 'margin-top:4px' });
    function goOptimise() {
      const chosen = Object.entries(S.vars).filter(([, v]) => v.on).slice(0, 5);
      if (!chosen.length) return (optNote.textContent = 'Tick up to five materials to vary, with their Begin, End and Step.');
      const tgt = targetNow().rt;
      try {
        const vars = chosen.map(([, v]) => v);
        const keys = chosen.map(([k]) => k);
        const best = optimiseAreas(vars, tgt, (areas) => rtWith(keys, areas));
        S.sol = { ...best, keys };
        optNote.replaceChildren(h('div', {}, `${best.tried} combinations tried. Best:`), ...keys.map((k, i) => h('div', {}, `• ${layerName(k)}: ${fmt(areaU(best.areas[i]), 1)} ${aUnit()}`)), h('div', {}, `RT ${best.rt.map((t) => fmt(t, 2)).join(' · ')} s`), h('div', { class: 'btns' }, h('button', { onclick: applySol }, 'Apply')));
      } catch (e) {
        optNote.textContent = `⚠ ${e.message}`;
      }
    }
    const layerName = (k) => {
      const [face, i] = k.split(':');
      return `${material(M.layers[face][+i].id).name} on the ${FACE_LABEL[face].toLowerCase()}`;
    };
    function rtWith(keys, areas) {
      const saved = keys.map((k) => {
        const [face, i] = k.split(':');
        return [face, +i, M.layers[face][+i].area];
      });
      keys.forEach((k, j) => {
        const [face, i] = k.split(':');
        M.layers[face][+i].area = Math.min(areas[j], faceArea(face));
      });
      const rt = rtNow();
      for (const [face, i, a] of saved) M.layers[face][i].area = a;
      return rt;
    }
    function applySol() {
      if (!S.sol) return;
      S.sol.keys.forEach((k, j) => {
        const [face, i] = k.split(':');
        M.layers[face][+i].area = Math.min(S.sol.areas[j], faceArea(face));
      });
      edited();
    }

    const T = tabs(win, ['Type', 'RT60', 'Surface', 'Optimize', 'Show Item']);
    const hallBox = h('div', { class: 'small' });
    T.pages.Type.append(group('Criteria Type', ...typeRadios), h('div', { class: 'btns' }, h('button', { onclick: () => (userPanel.hidden = !userPanel.hidden) }, 'Edit user defined RT60 criteria')), userPanel, group('Hall Checks (Beranek)', hallBox));
    T.pages.RT60.append(group('Calculation Method', ...formulaRadios), h('div', { class: 'btns' }, h('button', { onclick: () => ((M.measured ??= [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]), (measPanel.hidden = !measPanel.hidden), win.sync()) }, 'Edit Measured RT60 (Empty)'), h('button', { onclick: () => ((M.measured = null), S.formula === 'measured' && (S.formula = 'sabine'), win.refresh()) }, 'No Measured RT60')), measPanel, h('div', { class: 'small muted' }, 'A measured empty room already includes the air, so none is added. Fitzroy suits a room whose absorption is uneven — a hard floor and ceiling under absorbent walls.'));
    T.pages.Surface.append(
      dimsGroup(win),
      group('Surface Editor', faceList, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Base'), faceMatSelect(win, 'floor')), layerBox, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Unspecified'), remainRo), h('div', { class: 'btns' }, h('button', { onclick: nextFace }, 'Next Surface'))),
      group('Absorber Edit Manager', srcRo, matList, h('div', { class: 'btns' }, h('button', { onclick: attach }, 'Attach to surface'))),
    );
    // the base select above is rebuilt per surface in render
    const baseRow = T.pages.Surface.querySelector('fieldset:nth-of-type(2) .row');
    T.pages.Optimize.append(group('Absorber Overview', h('div', { class: 'scroll', style: 'max-height:260px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['', 'Material · surface', 'Now', 'Begin', 'End', 'Step'].map((t) => h('th', {}, t)))), overview))), h('div', { class: 'btns' }, h('button', { onclick: goOptimise }, 'Go Optimize')), optNote);
    const showR = [['rt', 'Reverb Time Data'], ['alpha', 'Average Absorption Coefficients']].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-show', onchange: () => ((S.show = v), win.render()) });
      win.syncers.push(() => (r.checked = S.show === v));
      return h('div', {}, h('label', { class: 'opt' }, r, l));
    });
    T.pages['Show Item'].append(group('Show Item (Data View)', ...showR));

    // ── right side
    const alphaC = chartBox('flex:0.8');
    const rtC = chartBox('flex:1.2');
    const chartPane = h('div', { class: 'acx-pane' }, h('fieldset', { class: 'grow' }, h('legend', {}, 'Reverb Time'), h('div', { style: 'display:flex;gap:4px;flex:1;min-height:0' }, alphaC.box, rtC.box)));
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const tbl = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, group('Data Table', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, ''), BAND_LABELS.map((l) => h('th', {}, l)))), tbl)), repBox);
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const faceArea = (f) => M.areas?.[f] ?? boxAreas()[f];
    const targetNow = () => {
      const V = classicRoom().V;
      if (S.target !== 'user') return rtTarget(S.target, V);
      return { rt: [...S.user], lo: S.user.map((t) => t * 0.9), hi: S.user.map((t) => t * 1.1) };
    };
    function rtNow(formula = S.formula) {
      const room = classicRoom();
      if (formula === 'measured' && M.measured) {
        const added = [];
        for (const f of FACES6) for (const l of M.layers[f] ?? []) added.push({ alpha: material(l.id).alpha, area: l.area, under: material(M.mats[f]).alpha });
        return rtFromMeasured(room.V, M.measured, added);
      }
      return BANDS.map((_, b) => rtFormulas(room, b)[formula === 'measured' ? 'sabine' : formula]);
    }

    win.compute = () => {
      const room = classicRoom();
      const all = BANDS.map((_, b) => rtFormulas(room, b));
      const Sarea = room.surfaces.reduce((s, x) => s + x.area, 0);
      const abar = BANDS.map((_, b) => room.surfaces.reduce((s, x) => s + x.area * x.material.alpha[b], 0) / Sarea);
      S.res = { room, all, rt: rtNow(), target: targetNow(), abar, measured: M.measured ? rtNow('measured') : null };
    };

    win.report = () => {
      const r = S.res;
      const rows = [];
      for (const f of FACES6) {
        const layers = M.layers[f] ?? [];
        const used = layers.reduce((s, l) => s + l.area, 0);
        rows.push([FACE_LABEL[f], material(M.mats[f]).name, `${fmt(areaU(Math.max(0, faceArea(f) - used)), 1)} ${aUnit()}`]);
        for (const l of layers) rows.push(['', material(l.id).name, `${fmt(areaU(l.area), 1)} ${aUnit()}`]);
      }
      return {
        title: 'Reverb Time',
        sections: [
          { heading: 'Room', rows: [['Volume', M.units === 'ft' ? `${fmt(r.room.V * FT ** 3, 0)} ft³` : `${fmt(r.room.V, 1)} m³`], ['Criteria', S.target === 'user' ? 'user defined' : RT_TARGETS.find((t) => t.id === S.target).label], ['Method', formulaList.find((f) => f.id === S.formula).label]] },
          { heading: 'Materials by surface', head: ['Surface', 'Material', 'Area'], rows },
          { heading: 'Hall checks (Beranek)', rows: hallRows(r.rt) },
          { heading: 'Reverb time (s)', head: ['', ...BAND_LABELS], rows: [...FORMULAS.map((f, i) => [f.label, ...r.all.map((x) => fmt(x[f.id], 2))]), ...(r.measured ? [['Measured basis', ...r.measured.map((t) => fmt(t, 2))]] : []), ['Criteria', ...r.target.rt.map((t) => fmt(t, 2))], ['Mean α', ...r.abar.map((a) => fmt(a, 3))]] },
        ],
      };
    };

    win.render = () => {
      if (!S.res) return;
      const r = S.res;
      // surface editor
      const layers = M.layers[S.face] ?? [];
      const used = layers.reduce((s, l) => s + l.area, 0);
      remainRo.textContent = `${fmt(areaU(faceArea(S.face) - used), 1)} ${aUnit()}`;
      remainRo.classList.toggle('warn', used > faceArea(S.face) + 1e-6);
      baseRow?.replaceChildren(h('span', { class: 'lbl' }, 'Base'), matSelectFor(S.face));
      layerBox.replaceChildren(
        ...layers.map((l, i) => {
          const inp = h('input', { type: 'number', step: 0.1, value: fmt(areaU(l.area), 2), style: 'width:56px' });
          inp.addEventListener('change', () => {
            const v = parseFloat(inp.value);
            if (Number.isFinite(v) && v >= 0) l.area = areaFromU(v);
            edited();
          });
          return h('div', { class: 'row' }, h('span', { class: 'lbl', title: material(l.id).name }, material(l.id).name.slice(0, 14)), inp, h('span', { class: 'unit' }, aUnit()), h('button', { title: 'Remove', onclick: () => (layers.splice(i, 1), edited()) }, '×'));
        }),
      );
      const selM = material(S.selMat);
      srcRo.textContent = selM.source
        ? `${selM.source} · ${selM.name}${selM.comments ? ` (${selM.comments})` : ''}`
        : `${selM.category} — ${selM.name}`;
      // optimise overview
      overview.replaceChildren(
        ...FACES6.flatMap((f) =>
          (M.layers[f] ?? []).map((l, i) => {
            const k = `${f}:${i}`;
            const v = (S.vars[k] ??= { on: false, begin: 0, end: Math.round(faceArea(f)), step: Math.max(0.5, Math.round(faceArea(f) / 10)) });
            const c = h('input', { type: 'checkbox', checked: v.on, onchange: () => (v.on = c.checked) });
            const n = (key) => {
              const inp = h('input', { type: 'number', step: 0.1, value: String(+areaU(v[key]).toFixed(2)), style: 'width:44px' });
              inp.addEventListener('change', () => (v[key] = Math.max(0, areaFromU(parseFloat(inp.value) || 0))));
              return h('td', {}, inp);
            };
            return h('tr', {}, h('td', {}, c), h('td', {}, `${material(l.id).name.slice(0, 18)} · ${f}`), h('td', {}, fmt(areaU(l.area), 1)), n('begin'), n('end'), n('step'));
          }),
        ),
      );
      if (!overview.children.length) overview.append(h('tr', {}, h('td', { colspan: 6 }, 'Lay materials on the surfaces first (Surface tab).')));
      // data
      if (win.pane === 'data') {
        tbl.replaceChildren(
          ...(S.show === 'rt'
            ? [...FORMULAS.map((f) => h('tr', { class: f.id === S.formula ? 'sel' : '' }, h('td', {}, f.label), r.all.map((x) => h('td', {}, fmt(x[f.id], 2))))), ...(r.measured ? [h('tr', { class: S.formula === 'measured' ? 'sel' : '' }, h('td', {}, 'Measured basis'), r.measured.map((t) => h('td', {}, fmt(t, 2))))] : []), h('tr', {}, h('td', {}, 'Criteria'), r.target.rt.map((t) => h('td', {}, fmt(t, 2))))]
            : [h('tr', {}, h('td', {}, 'Mean α'), r.abar.map((a) => h('td', {}, fmt(a, 3)))), ...FACES6.map((f) => h('tr', {}, h('td', {}, FACE_LABEL[f]), BANDS.map((_, b) => h('td', {}, fmt(faceAlpha(f, b), 2)))))]),
        );
        repBox.replaceChildren(reportNode(win.report()));
      }
      hallBox.replaceChildren(...hallRows(r.rt).slice(0, 2).map(([k, v]) => h('div', {}, h('b', {}, `${k}: `), v)));
      if (win.pane === 'chart') {
        drawAlpha();
        drawRt(r.rt, r.target);
      }
      if (win.pane === 'room') drawSurfacesRoom();
    };

    /** Beranek's numbers from the RT of the chosen method: the mid-band RT and the bass ratio, against his ranges for music. */
    const hallRows = (rt) => {
      const mid = (rt[2] + rt[3]) / 2;
      const br = bassRatio(rt);
      return [
        ['Mid-band RT (500 Hz–1 kHz)', `${fmt(mid, 2)} s — symphonic halls about 1.8–2.2 s, opera 1.3–1.6 s`],
        ['Bass ratio (T125 + T250) / (T500 + T1000)', `${fmt(br, 2)} — about 1.1–1.45 for warmth when the mid RT is under 1.8 s, 1.1–1.25 when it is over 2.2 s`],
        ['Initial-time-delay gap', 'see Ray Tracing, Time tab: the first reflection’s lag behind the direct sound; Beranek preferred about 20 ms or less'],
      ];
    };

    const faceAlpha = (f, b) => {
      const layers = M.layers[f] ?? [];
      const A = faceArea(f);
      const used = Math.min(A, layers.reduce((s, l) => s + l.area, 0));
      return ((A - used) * material(M.mats[f]).alpha[b] + layers.reduce((s, l) => s + l.area * material(l.id).alpha[b], 0)) / Math.max(A, 1e-9);
    };
    function matSelectFor(face) {
      const s = h('select', { class: 'list' }, matOptions());
      s.value = M.mats[face];
      s.addEventListener('change', () => ((M.mats[face] = s.value), edited()));
      return s;
    }

    function drawAlpha() {
      const p = prep(alphaC.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const mat = material(S.selMat);
      const a = axes(ctx, w, hh, { title: `α — ${mat.name.slice(0, 30)}`, cats: BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b))), x0: 0, x1: 1, y0: 0, y1: 1.2, yticks: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2], fmtY: (v) => v.toFixed(1) });
      mat.alpha.forEach((v, i) => {
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        ctx.fillStyle = COL.cyan;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(0) - y);
      });
    }

    function drawRt(rt, target) {
      const p = prep(rtC.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const top = Math.max(0.5, Math.ceil(Math.max(...rt.filter(Number.isFinite), ...target.hi) * 12) / 10);
      const tick = top > 2 ? 0.5 : top > 1 ? 0.2 : 0.1;
      const a = axes(ctx, w, hh, { title: `Reverb Time (s) — ${formulaList.find((f) => f.id === S.formula).label}`, cats: BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b))), x0: 0, x1: 1, y0: 0, y1: top, yticks: Array.from({ length: Math.floor(top / tick + 1e-9) + 1 }, (_, i) => +(i * tick).toFixed(2)), fmtY: (v) => v.toFixed(1), xLabel: 'Hz' });
      const mid = (i) => a.slot(i).x + a.slot(i).w / 2;
      rt.forEach((v, i) => {
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        const inside = v >= target.lo[i] && v <= target.hi[i];
        ctx.fillStyle = inside ? COL.green : COL.orange;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(0) - y);
        ctx.fillStyle = COL.lime;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(v, 2), mid(i), y - 3);
        ctx.textAlign = 'left';
      });
      const poly = (vals, style, dash) => {
        ctx.strokeStyle = style;
        ctx.setLineDash(dash);
        ctx.beginPath();
        vals.forEach((v, i) => (i ? ctx.lineTo(mid(i), a.Y(v)) : ctx.moveTo(mid(i), a.Y(v))));
        ctx.stroke();
        ctx.setLineDash([]);
      };
      poly(target.lo, COL.grey, [3, 3]);
      poly(target.hi, COL.grey, [3, 3]);
      ctx.lineWidth = 2;
      poly(target.rt, COL.grey, []);
      ctx.lineWidth = 1;
      ctx.fillStyle = COL.grey;
      ctx.textAlign = 'right';
      ctx.fillText(`Criteria: ${S.target === 'user' ? 'user defined' : RT_TARGETS.find((t) => t.id === S.target).label}`, w - 14, 30);
      ctx.textAlign = 'left';
    }

    /** The room, the surface being edited filled in. */
    function drawSurfacesRoom() {
      const f = S.face;
      const { L, W, H } = M;
      const quads = { floor: [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]], ceiling: [[0, 0, H], [W, 0, H], [W, L, H], [0, L, H]], front: [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], back: [[0, L, 0], [W, L, 0], [W, L, H], [0, L, H]], left: [[0, 0, 0], [0, L, 0], [0, L, H], [0, 0, H]], right: [[W, 0, 0], [W, L, 0], [W, L, H], [W, 0, H]] };
      drawRoom(roomCv, S.RV, {
        under: (ctx, S2) => {
          const q = quads[f].map(([X, Y, Z]) => S2({ X, Y, Z }));
          ctx.fillStyle = 'rgba(0,255,255,0.22)';
          ctx.beginPath();
          q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
        },
        note: `${FACE_LABEL[f]}: ${material(M.mats[f]).name}${(M.layers[f] ?? []).length ? ` + ${(M.layers[f] ?? []).length} more` : ''}`,
      });
    }
  });
}
