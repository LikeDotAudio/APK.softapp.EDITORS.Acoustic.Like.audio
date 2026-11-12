// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — window 3, RAY TRACING.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { axes, clamp, COL, FACE_LABEL, FACES6, fmt, FT, group, h, material, prep, readout } from '../kit.js';
import { BAND_LABELS, BANDS, dbSum } from '../../acoustics/bands.js';
import {
  airDbPerM,
  combNulls,
  equalAreaDirections,
  polarEnergy,
  raysToward,
  roomFigures,
  specularAbsorbers,
  surroundPositions,
  traceRays,
} from '../classic.js';
import { haasCheck, schroederDecay } from '../references.js';

export function raysWindow(acx) {
  const {
    areaU, aUnit, chartBox, classicRoom, cNow, dimsGroup, drawRoom, edited, faceMatSelect, lenField, M,
    makeWindow, newRV, numField, pointGroup, pullFromRoom, refreshAll, reportNode, roomManager, spk2, tabs,
    toU, viewStrip,
  } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // 3. RAY TRACING
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('rays', 'Acoustic X — Ray Tracing', { w: 880, h: 610 }, (win) => {
    const S = {
      band: 2,
      refl: 14,
      v: { step: 5, begin: -90, end: 90 },
      hz: { begin: 0, end: 360 },
      radius: 0.3,
      sources: { s1: true, s2: true, c: false, rl: false, rr: false },
      align: true,
      aimAt: null,
      suppress: [false, false, false, false],
      showTrace: true,
      items: { speakers: true, absorbers: true, listener: true, polar: true },
      absAlpha: 0.9,
      follow: 0.5,
      mode: 'total',
      idx: 0,
      res: null,
      RV: newRV('plan'),
      mouseEdit: false,
      use: 'speech',
    };
    const T = tabs(win, ['Room', 'SPK', 'LS', 'Acoustic', 'Sim.', 'Time']);
    T.pages.Room.append(dimsGroup(win));
    const check = (obj, key, label, title, after = () => win.refresh()) => {
      const c = h('input', { type: 'checkbox', onchange: () => ((obj[key] = c.checked), after()) });
      win.syncers.push(() => (c.checked = Boolean(obj[key])));
      return h('div', {}, h('label', { class: 'opt', title }, c, label));
    };
    T.pages.SPK.append(
      pointGroup(win, 'Speaker1', () => M.spk1, (v) => (M.spk1 = v)),
      pointGroup(win, 'Speaker2 (mirror image)', spk2, () => {}, { disabled: () => true }),
      group('Parameters', check(S, 'align', 'Automatic speaker alignment', 'On: the speakers always point at the listener. Off: they keep the aim they had', () => ((S.aimAt = S.align ? null : { ...M.lis }), win.refresh()))),
    );
    const mouseB = h('button', { title: 'Click on the Plan View to put the listener there', onclick: () => ((S.mouseEdit = !S.mouseEdit), (S.RV.onPick = S.mouseEdit ? pick : null), S.mouseEdit && ((S.RV.view = 'plan'), win.showPane('room')), syncMouse()) }, 'Mouse Edit');
    const syncMouse = () => mouseB.classList.toggle('down', S.mouseEdit);
    win.syncers.push(syncMouse);
    const pick = (P) => {
      M.lis = { ...M.lis, X: P.X, Y: P.Y };
      edited();
    };
    T.pages.LS.append(pointGroup(win, 'Listening Position', () => M.lis, (v) => (M.lis = v)), h('div', { class: 'btns' }, mouseB, h('button', { title: 'Back to the room being designed', onclick: () => (pullFromRoom(), refreshAll()) }, 'Reset positions')), lenField(win, 'Sphere radius', () => S.radius, (v) => (S.radius = clamp(v, 0.05, 2)), { local: true, title: 'The energy tracking sphere round the listener: bigger catches more reflections' }));
    const bandSel = h('select', {}, BAND_LABELS.map((l, i) => h('option', { value: i }, l)));
    bandSel.addEventListener('change', () => ((S.band = +bandSel.value), win.refresh()));
    const alphaRo = Object.fromEntries(FACES6.map((f) => [f, readout('α in the chosen band')]));
    win.syncers.push(() => {
      bandSel.value = String(S.band);
      for (const f of FACES6) alphaRo[f].textContent = `α ${fmt(material(M.mats[f]).alpha[S.band], 2)}`;
    });
    T.pages.Acoustic.append(
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Octave band'), bandSel),
      group('Rect. Room', ...FACES6.map((f) => h('div', {}, h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), alphaRo[f]), faceMatSelect(win, f)))),
      group('Specular Absorbers', numField(win, 'α', '', () => S.absAlpha, (v) => (S.absAlpha = clamp(v, 0, 1)), { step: 0.05, title: 'The absorbers the SBIR window places on the side walls and the ceiling' }), check(S.items, 'absorbers', 'Use them in the trace')),
    );
    const traces = readout();
    const angGroup = (legend, o, withStep) => group(legend, ...(withStep ? [numField(win, 'Step', '°', () => o.step, (v) => (o.step = clamp(v, 0.5, 30)), { step: 0.5 })] : []), numField(win, 'Begin', '°', () => o.begin, (v) => (o.begin = v)), numField(win, 'End', '°', () => o.end, (v) => (o.end = v)));
    T.pages['Sim.'].append(
      group('Trace', numField(win, 'Number of ref.', '', () => S.refl, (v) => (S.refl = clamp(Math.round(v), 1, 40)), { title: 'How many reflections each ray is followed for (14: the direct sound and 13 bounces)' }), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Total traces'), traces)),
      angGroup('Vertical Angle', S.v, true),
      angGroup('Horizontal Angle (step follows)', S.hz, false),
      group('Display Items', check(S.items, 'speakers', 'Speakers'), check(S.items, 'listener', 'Listener'), check(S.items, 'polar', 'Polar energy'), check(S, 'showTrace', 'Show the traces')),
      group('Suppression', ...['Direct energy', 'First reflection', 'Second reflection', 'Third reflection'].map((l, i) => check(S.suppress, i, l))),
      group('SPK Source', check(S.sources, 's1', 'Speaker 1'), check(S.sources, 's2', 'Speaker 2'), check(S.sources, 'c', 'Centre (General Parameters)'), check(S.sources, 'rl', 'Rear left'), check(S.sources, 'rr', 'Rear right')),
      numField(win, 'Follow time', '%', () => S.follow * 100, (v) => (S.follow = clamp(v, 5, 100) / 100), { step: 5, title: 'The share of the reverb time the time display tracks' }),
    );
    // ── Time: what the arrivals mean to a listener (Haas) and how they decay (Schroeder)
    const useR = [['speech', 'Speech (echo after 50 ms)'], ['music', 'Music (echo after 80 ms)']].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-ray-use', onchange: () => ((S.use = v), win.refresh()) });
      win.syncers.push(() => (r.checked = S.use === v));
      return h('div', {}, h('label', { class: 'opt' }, r, l));
    });
    const haasBox = h('div', { class: 'small' });
    const decayRo = { edt: readout('Early decay time: 0 to −10 dB, ×6'), t20: readout('−5 to −25 dB, ×3'), t30: readout('−5 to −35 dB, ×2') };
    const decayC = chartBox('flex:none;height:130px');
    T.pages.Time.append(
      group('Precedence & Echo (Haas)', ...useR, haasBox),
      group('Decay (Schroeder)', decayC.box, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'EDT'), decayRo.edt, 's'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'T20'), decayRo.t20, 's'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'T30'), decayRo.t30, 's'), h('div', { class: 'small muted' }, 'Backward-integrated from the traced arrivals: the tail stops where the trace stops, so raise Number of ref. for T30.')),
    );

    // ── right side
    const top = chartBox('flex:1');
    const bot = chartBox('flex:1.2');
    const modeR = [['single', 'Single impulse / surface'], ['total', 'Total energy / surface']].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-ray-mode', onchange: () => ((S.mode = v), win.render()) });
      win.syncers.push(() => (r.checked = S.mode === v));
      return h('label', { class: 'opt' }, r, l);
    });
    const ro = { t: readout(), l: readout(), s: readout(), flag: readout('Reflections within 10 dB of the direct sound') };
    const stepTo = (d) => {
      const n = S.res?.arrivals.length ?? 0;
      if (!n) return;
      S.idx = (S.idx + d + n) % n;
      S.mode = 'single';
      win.sync();
      win.render();
    };
    bot.cv.addEventListener('click', (e) => {
      if (!S.res?.arrivals.length || !bot.map) return;
      const r = bot.cv.getBoundingClientRect();
      const t = bot.map.Xinv(e.clientX - r.left);
      let best = 0;
      S.res.arrivals.forEach((a, i) => Math.abs(a.t - t) < Math.abs(S.res.arrivals[best].t - t) && (best = i));
      S.idx = best;
      S.mode = 'single';
      win.sync();
      win.render();
    });
    const rr = (l, el, u) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, l), el, u ?? null);
    const chartPane = h(
      'div',
      { class: 'acx-pane' },
      h('fieldset', { class: 'grow' }, h('legend', {}, 'Impulse Answer'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
      group('Chart View Manager', h('div', { class: 'manager' }, ...modeR), h('div', { class: 'manager' }, rr('X', ro.t, 'ms'), rr('Y', ro.l, 'dB'), rr('Surface', ro.s), rr('Within 10 dB', ro.flag), h('button', { onclick: () => stepTo(-1) }, '◄ Prev'), h('button', { onclick: () => stepTo(1) }, 'Next ►'))),
    );
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const params = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, group('Acoustic Parameters', h('table', { class: 'grid' }, params)), repBox);
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const ORDER_COL = [COL.red, '#4060ff', '#60c0ff', COL.green];
    const orderCol = (o) => ORDER_COL[Math.min(3, o)];
    const BUCKETS = ['direct', 'left', 'back', 'right', 'front', 'floor', 'ceiling'];

    function sourcesNow() {
      const sur = surroundPositions(M.spk1, M.lis, { rearRise: M.gen.sbir.rearRise });
      return [
        ['Speaker 1', M.spk1, S.sources.s1],
        ['Speaker 2', spk2(), S.sources.s2],
        ['Centre', sur.centre, S.sources.c],
        ['Rear left', sur.rearLeft, S.sources.rl],
        ['Rear right', sur.rearRight, S.sources.rr],
      ].filter((x) => x[2]);
    }

    win.compute = () => {
      const dims = { L: M.L, W: M.W, H: M.H };
      const alpha = Object.fromEntries(FACES6.map((f) => [f, material(M.mats[f]).alpha[S.band]]));
      const A = M.absorbers ?? specularAbsorbers(dims, [M.spk1, spk2()], M.lis);
      const patches = S.items.absorbers ? [['left', A.left], ['right', A.right], ['ceiling', A.ceiling]].filter((x) => x[1]).map(([face, a]) => ({ face, ...a, alpha: S.absAlpha })) : [];
      const local = equalAreaDirections({ step: S.v.step, vBegin: S.v.begin, vEnd: S.v.end, hBegin: S.hz.begin, hEnd: S.hz.end });
      const c = cNow();
      const airDb = airDbPerM(BANDS[S.band], M.gen.tempC, M.gen.rh);
      const srcs = sourcesNow();
      const aim = S.align || !S.aimAt ? M.lis : S.aimAt;
      let arrivals = [];
      let traces = [];
      let d0min = Infinity;
      for (const [, P] of srcs) d0min = Math.min(d0min, Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z));
      srcs.forEach(([name, P], si) => {
        const out = traceRays(dims, P, M.lis, { dirs: raysToward(P, aim, local), alpha, patches, maxRefl: S.refl - 1, radius: S.radius, c, airDb, keepTraces: Math.ceil(300 / srcs.length) });
        const d0 = Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z);
        const shift = 20 * Math.log10(d0min / d0);
        arrivals.push(...out.arrivals.map((a) => ({ ...a, speaker: si, name, level: a.level + shift })));
        traces.push(...out.traces);
      });
      const kept = arrivals.filter((a) => !(a.order <= 3 && S.suppress[a.order]) && a.level > -60).sort((a, b) => a.t - b.t);
      const totals = Object.fromEntries(BUCKETS.map((b) => [b, dbSum(kept.filter((a) => (b === 'direct' ? a.order === 0 : a.faces.includes(b))).map((a) => a.level))]));
      // the figures the Data View lists
      const room = classicRoom();
      const Sarea = room.surfaces.reduce((s, x) => s + x.area, 0);
      const abar = room.surfaces.reduce((s, x) => s + x.area * x.material.alpha[S.band], 0) / Sarea;
      const fig = roomFigures({ V: room.V, S: Sarea, abar, follow: S.follow, c });
      // what a listener hears does not depend on what the charts suppress: Haas and Schroeder take every arrival traced
      const all = [...arrivals].sort((a, b) => a.t - b.t);
      const haas = haasCheck(all, { echoMs: S.use === 'music' ? 80 : 50 });
      S.res = { arrivals: kept, totals, traces, fig, rays: local.length * srcs.length, srcs, polar: polarEnergy(kept, 36), haas, decay: schroederDecay(all) };
      if (S.idx >= kept.length) S.idx = 0;
    };

    win.report = () => {
      const r = S.res;
      const f = r.fig;
      const c = cNow();
      // per speaker, per surface: the first-order reflection's lag behind the direct sound, and its comb filter
      const rows = [];
      for (const [name, P] of r.srcs) {
        const d0 = Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z);
        for (const [face, k, plane] of [['left', 'X', 0], ['right', 'X', M.W], ['front', 'Y', 0], ['back', 'Y', M.L], ['floor', 'Z', 0], ['ceiling', 'Z', M.H]]) {
          const img = { ...P, [k]: 2 * plane - P[k] };
          const d = Math.hypot(img.X - M.lis.X, img.Y - M.lis.Y, img.Z - M.lis.Z);
          const dt = (d - d0) / c;
          const n = combNulls(dt);
          rows.push([name, face, fmt(dt * 1000, 2), fmt(toU(d - d0), 2), fmt(n.first, 0), fmt(n.spacing, 0)]);
        }
      }
      return {
        title: 'Ray Tracing',
        sections: [
          { heading: `Acoustic parameters, ${BAND_LABELS[S.band]}`, rows: paramRows(f, r) },
          { heading: 'Arrivals (within 60 dB)', head: ['ms', 'dB', 'Order', 'Speaker', 'Surfaces'], rows: r.arrivals.slice(0, 120).map((a) => [fmt(a.t, 2), fmt(a.level, 1), a.order, a.name, a.order ? a.faces.join(' → ') : 'direct']) },
          { heading: 'Precedence and echo (Haas)', rows: haasRows(r.haas) },
          { heading: 'Decay (Schroeder backward integration)', rows: [['EDT', `${fmt(r.decay.edt, 2)} s`], ['T20', `${fmt(r.decay.t20, 2)} s`], ['T30', `${fmt(r.decay.t30, 2)} s`]] },
          { heading: 'First-order reflections and their nulls', text: 'Calculated for cross-checking against a measurement: they are where nulls would be, not proof that they are there.', head: ['Speaker', 'Surface', 'Δt ms', `Δpath ${M.units}`, 'First null Hz', 'Spacing Hz'], rows },
        ],
      };
    };
    const haasRows = (hc) => [
      ['Image pulled (within 1 ms, within 3 dB)', hc.pulls.length ? hc.pulls.map((a) => `${fmt(a.dt, 2)} ms ${fmt(a.rel, 1)} dB ${a.faces.join(' → ')}`).join('; ') : 'none — the first arrival sets the direction'],
      ['Fused with the direct (1–30 ms)', String(hc.fused.length)],
      ['Initial-time-delay gap (first reflection)', `${fmt(hc.itdg, 1)} ms`],
      [`Likely echoes (after ${S.use === 'music' ? 80 : 50} ms, within 10 dB)`, hc.echoes.length ? hc.echoes.slice(0, 6).map((a) => `${fmt(a.dt, 1)} ms ${fmt(a.rel, 1)} dB ${a.faces.join(' → ')}`).join('; ') : 'none'],
    ];
    const paramRows = (f, r) => [
      ['Room volume', M.units === 'ft' ? `${fmt(f.V * FT ** 3, 0)} ft³` : `${fmt(f.V, 1)} m³`],
      ['Room surface area', `${fmt(areaU(f.S), 1)} ${aUnit()}`],
      ['Alpha (mean α)', fmt(f.abar, 3)],
      ['RT60 (Sabine)', `${fmt(f.rt60, 2)} s`],
      ['MFP (mean free path)', `${fmt(toU(f.mfp), 2)} ${M.units}`],
      ['RC (room constant)', `${fmt(areaU(f.R), 1)} ${aUnit()}`],
      ['Critical distance (Q = 2)', `${fmt(toU(f.dc), 2)} ${M.units}`],
      ['Pref. # of reflections', `${f.prefReflections} (to follow ${Math.round(S.follow * 100)} % of RT60)`],
      ['Total traces', String(r.rays)],
      ['Follow time', `${Math.round(Math.min(1, ((S.refl - 1) * f.mfp) / cNow() / f.rt60) * 100)} % of RT60 with ${S.refl} reflections`],
    ];

    win.render = () => {
      if (!S.res) return;
      const { arrivals, totals } = S.res;
      const cur = arrivals[S.idx];
      traces.textContent = String(S.res.rays);
      ro.t.textContent = cur ? fmt(cur.t, 2) : '';
      ro.l.textContent = cur ? fmt(cur.level, 1) : '';
      ro.s.textContent = cur ? (cur.order ? cur.faces.join(' → ') : 'direct') : '';
      ro.flag.textContent = String(arrivals.filter((a) => a.order > 0 && a.level > -10).length);
      const hc = S.res.haas;
      haasBox.replaceChildren(
        h('div', { class: hc.pulls.length ? 'warn' : '' }, hc.pulls.length ? `⚠ ${hc.pulls.length} reflection${hc.pulls.length === 1 ? '' : 's'} within 1 ms and 3 dB: the image moves toward ${hc.pulls.length === 1 ? 'it' : 'them'}.` : '✓ The first arrival sets the direction.'),
        h('div', {}, `${hc.fused.length} reflection${hc.fused.length === 1 ? '' : 's'} fuse with the direct sound (1–30 ms). Initial-time-delay gap ${fmt(hc.itdg, 1)} ms.`),
        h('div', { class: hc.echoes.length ? 'warn' : '' }, hc.echoes.length ? `⚠ ${hc.echoes.length} likely echo${hc.echoes.length === 1 ? '' : 'es'}: later than ${S.use === 'music' ? 80 : 50} ms and within 10 dB of the direct.` : `✓ No reflection later than ${S.use === 'music' ? 80 : 50} ms comes within 10 dB of the direct.`),
        ...hc.echoes.slice(0, 4).map((a) => h('div', { class: 'warn' }, `• ${fmt(a.dt, 1)} ms, ${fmt(a.rel, 1)} dB, ${a.faces.join(' → ')}`)),
      );
      const dc = S.res.decay;
      decayRo.edt.textContent = fmt(dc.edt, 2);
      decayRo.t20.textContent = fmt(dc.t20, 2);
      decayRo.t30.textContent = fmt(dc.t30, 2);
      drawDecay(dc);
      if (win.pane === 'chart') {
        drawSurfaces(S.mode === 'single' && cur ? Object.fromEntries(BUCKETS.map((b) => [b, (b === 'direct' ? cur.order === 0 : cur.faces.includes(b)) ? cur.level : -Infinity])) : totals);
        drawTime(arrivals, cur);
      }
      if (win.pane === 'room') drawRays();
      if (win.pane === 'data') {
        params.replaceChildren(...paramRows(S.res.fig, S.res).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))));
        repBox.replaceChildren(reportNode(win.report()));
      }
    };

    function drawSurfaces(levels) {
      const p = prep(top.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: `Energy (dB) / Surface — ${S.mode === 'single' ? 'single impulse' : 'total energy'}, ${BAND_LABELS[S.band]}`, cats: ['Direct', 'Left', 'Back', 'Right', 'Front', 'Floor', 'Ceiling'], x0: 0, x1: 1, y0: -50, y1: 5, yticks: [-50, -40, -30, -20, -10, 0] });
      BUCKETS.forEach((b, i) => {
        const v = levels[b];
        if (!Number.isFinite(v)) return;
        const s = a.slot(i);
        const bw = Math.max(2, s.w * 0.08);
        const y = a.Y(v);
        ctx.fillStyle = COL.white;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(-50) - y);
        ctx.fillStyle = COL.text;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(v, 1), s.x + s.w / 2, y - 3);
        ctx.textAlign = 'left';
      });
    }

    function drawTime(arrivals, cur) {
      const p = prep(bot.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const follow = S.follow * S.res.fig.rt60 * 1000;
      const tEnd = Math.max(20, Math.ceil(Math.max(follow, ...arrivals.map((x) => x.t)) / 10) * 10);
      const step = tEnd > 400 ? 100 : tEnd > 200 ? 50 : tEnd > 100 ? 20 : 10;
      const a = axes(ctx, w, hh, { title: 'Energy (dB) / Time (ms) — red direct, blue 1st, light blue 2nd, green later', x0: 0, x1: tEnd, y0: -50, y1: 5, xticks: Array.from({ length: Math.floor(tEnd / step) + 1 }, (_, i) => ({ v: i * step, label: String(i * step) })), yticks: [-50, -40, -30, -20, -10, 0], xLabel: 'ms' });
      bot.map = a;
      for (const x of arrivals) {
        const px = Math.round(a.X(x.t));
        const y = a.Y(x.level);
        ctx.fillStyle = x === cur && S.mode === 'single' ? COL.yellow : orderCol(x.order);
        ctx.fillRect(px - 1, y, 2, a.Y(-50) - y);
      }
      // the 10 dB window: the strongest arrival, and 10 dB under it
      const top0 = Math.max(...arrivals.map((x) => x.level), -50);
      ctx.strokeStyle = '#4080ff';
      for (const v of [top0, top0 - 10]) {
        ctx.beginPath();
        ctx.moveTo(a.pad.l, Math.round(a.Y(v)) + 0.5);
        ctx.lineTo(w - a.pad.r, Math.round(a.Y(v)) + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = '#4080ff';
      ctx.textAlign = 'right';
      ctx.fillText('10 dB window', w - a.pad.r - 4, a.Y(top0 - 10) - 4);
      // Haas: past this a reflection within 10 dB is heard as an echo
      const tEcho = S.res.haas.t0 + (S.use === 'music' ? 80 : 50);
      if (tEcho < tEnd) {
        ctx.strokeStyle = COL.orange;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(a.X(tEcho)) + 0.5, a.pad.t);
        ctx.lineTo(Math.round(a.X(tEcho)) + 0.5, a.Y(-50));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COL.orange;
        ctx.fillText('echo limit', a.X(tEcho) - 4, a.pad.t + 10);
      }
      ctx.textAlign = 'left';
    }

    function drawDecay(dc) {
      const p = prep(decayC.cv);
      if (!p || !dc.curve.length) return;
      const { ctx, w, h: hh } = p;
      const tEnd = Math.max(20, Math.ceil(dc.curve[dc.curve.length - 1].t / 10) * 10);
      const step = tEnd > 400 ? 100 : tEnd > 200 ? 50 : tEnd > 100 ? 20 : 10;
      const a = axes(ctx, w, hh, { title: 'Energy still to come (dB) / ms', x0: 0, x1: tEnd, y0: -40, y1: 0, xticks: Array.from({ length: Math.floor(tEnd / step) + 1 }, (_, i) => ({ v: i * step, label: String(i * step) })).filter((t, i) => i % 2 === 0), yticks: [-40, -30, -20, -10, 0] });
      ctx.strokeStyle = COL.cyan;
      ctx.beginPath();
      dc.curve.forEach((q, i) => (i ? ctx.lineTo(a.X(q.t), a.Y(q.db)) : ctx.moveTo(a.X(q.t), a.Y(q.db))));
      ctx.stroke();
    }

    function drawRays() {
      const r = S.res;
      drawRoom(roomCv, S.RV, {
        speakers: S.items.speakers ? r.srcs.map((x) => x[1]) : [],
        lis: S.items.listener ? M.lis : null,
        under: (ctx, S2) => {
          if (!S.showTrace) return;
          ctx.globalAlpha = 0.35;
          for (const poly of r.traces) {
            for (let i = 1; i < poly.length; i++) {
              const order = poly[i].order;
              if (order <= 3 && S.suppress[order]) continue;
              const a = S2(poly[i - 1]);
              const b = S2(poly[i]);
              ctx.strokeStyle = orderCol(order);
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        },
        over: (ctx, S2, f) => {
          if (!S.items.polar || S.RV.view !== 'plan') return;
          // the polar energy round the listener: two blue circles, the strongest direction and 10 dB under it
          const c = S2(M.lis);
          const R = Math.min(90, 0.3 * Math.min(M.W, M.L) * f.k);
          const rOf = (db) => R * Math.max(0, 1 + db / 30);
          ctx.strokeStyle = '#4080ff';
          for (const db of [0, -10]) {
            ctx.beginPath();
            ctx.arc(c[0], c[1], rOf(db), 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.strokeStyle = COL.yellow;
          ctx.fillStyle = 'rgba(255,255,0,0.25)';
          ctx.beginPath();
          r.polar.forEach((db, i) => {
            const brg = ((i + 0.5) * 10 * Math.PI) / 180;
            // bearing 0° is toward the front wall (up on the plan), clockwise
            const x = c[0] + Math.sin(brg) * rOf(Number.isFinite(db) ? db : -30);
            const y = c[1] - Math.cos(brg) * rOf(Number.isFinite(db) ? db : -30);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = COL.text;
          ctx.fillText(`polar energy: outer circle the strongest direction, inner −10 dB${S.mouseEdit ? ' · click to move the listener' : ''}`, 8, 28);
        },
      });
    }
  });
}
