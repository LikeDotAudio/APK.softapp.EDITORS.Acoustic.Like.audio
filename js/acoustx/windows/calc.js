// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — window 5, CALCULATOR.
 * Lifted out of createAcousticX (acoustx.js, ROAD-3752): `ctx` is the
 * component's shared context (the classic model M, its helpers and the
 * window kit); this reads it, it never replaces it.
 */
import { fmt, FT, group, h, readout } from '../kit.js';
import { addLevels, combNulls, convert, inverseSquare, roomFigures, speedOfSound, UNITS } from '../classic.js';
import {
  acousticGain,
  alcons,
  ceilingSpacing,
  closedBox,
  coincidence,
  electrical,
  helmholtz,
  impedanceStep,
  isPrime,
  massAirMass,
  massLaw,
  MEDIA,
  membrane,
  NC_BANDS,
  NC_TARGETS,
  ncRating,
  noteOf,
  perforated,
  piston,
  PLATES,
  qrd,
  R_BANDS,
  ratingRw,
  sones,
  splFromPower,
  twoTones,
} from '../references.js';

export function calcWindow(acx) {
  const { makeWindow, tabs } = acx;

  // ═════════════════════════════════════════════════════════════════════════
  // 5. CALCULATOR
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('calc', 'Acoustic X — Calculator', { w: 470, h: 540, foot: false }, (win) => {
    const S = { dir: 'toMetric', unit: 'length', wave: 'spherical', kind: 'energy', metric: true };
    const inp = (v, title) => h('input', { type: 'text', value: v, title, oninput: () => calc() });
    const out = () => readout();
    const I = { uv: inp('10'), l1: inp('90', 'Level at the reference distance, dB'), d1: inp('1'), d2: inp('4'), levels: inp('90, 90, 87', 'Levels to add, separated by commas'), t: inp('20', '°C — corrects the speed of sound'), f: inp('100'), lam: inp(''), per: inp(''), delay: inp('1', 'Arrival time difference, ms'), path: inp('', 'Path length difference') };
    const O = { uv: out(), l2: out(), sum: out(), n: out(), c: out(), n1: out(), n2: out(), n3: out(), sp: out() };
    const row = (l, ...kids) => h('div', { class: 'row' }, h('label', {}, l), ...kids);
    const radio = (name, key, v, l) => {
      const r = h('input', { type: 'radio', name, checked: S[key] === v, onchange: () => ((S[key] = v), calc()) });
      return h('label', { class: 'opt' }, r, l);
    };
    const unitSel = h('select', {}, [...UNITS.map((u) => h('option', { value: u[0] }, `${u[0]} (${u[1]} ↔ ${u[2]})`)), h('option', { value: 'temperature' }, 'temperature (°C ↔ °F)')]);
    unitSel.addEventListener('change', () => ((S.unit = unitSel.value), calc()));
    const lenU = () => (S.metric ? 'm' : 'ft');
    const lenK = () => (S.metric ? 1 : FT);
    const T = tabs(win, ['U', 'ISL', 'Add', 'Wave', 'Comb', 'Wall', 'Res', 'QRD', 'NC', 'PA', 'Spk', 'Z', 'Tone']);
    T.pages.U.append(group('Units Conversion', h('div', {}, radio('acx-c-dir', 'dir', 'toMetric', 'IMP to MKS'), radio('acx-c-dir', 'dir', 'toImperial', 'MKS to IMP')), row('Unit', unitSel), row('Value', I.uv), row('Converted', O.uv)));
    T.pages.ISL.append(group('Inverse Square Law', h('div', {}, radio('acx-c-wave', 'wave', 'spherical', 'Spherical (point source)'), radio('acx-c-wave', 'wave', 'cylindrical', 'Cylindrical (line source)')), row('Reference dist.', I.d1), row('Level @ ref. dist.', I.l1, 'dB'), row('Distance', I.d2), row('Level @ distance', O.l2, 'dB')));
    T.pages.Add.append(group('Level Addition', h('div', {}, radio('acx-c-kind', 'kind', 'energy', 'Energy (uncorrelated)'), radio('acx-c-kind', 'kind', 'pressure', 'Pressure (in phase)')), row('Levels (dB)', I.levels), row('Quantity of level', O.n), row('Total level', O.sum, 'dB')));
    T.pages.Wave.append(group('Frequency / Wavelength / Period', h('div', {}, radio('acx-c-m', 'metric', true, 'Metric'), radio('acx-c-m', 'metric', false, 'Imperial')), row('Temperature °C', I.t), row('Speed of sound', O.c), row('Frequency (Hz)', I.f), row('Wavelength', I.lam), row('Period (ms)', I.per), h('div', { class: 'small muted' }, 'Type into any one of the three: the other two follow.')));
    T.pages.Comb.append(group('Comb-Filter', row('Arrival time diff. (ms)', I.delay), row('Path length diff.', I.path), row('First null (Hz)', O.n1), row('Second null (Hz)', O.n2), row('Third null (Hz)', O.n3), row('Null spacing (Hz)', O.sp), h('div', { class: 'small muted' }, 'Enter either difference. Useful for the reflection off a console top.')));
    // ── the tabs from the suggested references (references.js): every input metric
    const sel = (list, title) => {
      const s = h('select', { title, onchange: () => calc() }, list.map(([v, l]) => h('option', { value: v }, l)));
      return s;
    };
    const X = {
      plate: sel(PLATES.map((p) => [p.id, p.name])),
      thick: inp('12.5', 'Leaf thickness, mm'),
      m1: out(),
      m2: inp('10', 'Second leaf, kg/m² (0: a single leaf)'),
      gap: inp('100', 'Cavity between the leaves, mm'),
      hA: inp('25', 'Neck radius, mm'),
      hL: inp('50', 'Neck length, mm'),
      hV: inp('10', 'Cavity volume, litres'),
      pP: inp('10', 'Open area, %'),
      pD: inp('100', 'Air gap behind the panel, mm'),
      pT: inp('6', 'Panel thickness, mm'),
      pd: inp('6', 'Hole diameter or slot width, mm'),
      mm: inp('5', 'Membrane surface mass, kg/m²'),
      md: inp('100', 'Air gap behind the membrane, mm'),
      qN: inp('7', 'Number of wells: a prime'),
      qF: inp('500', 'Design frequency, Hz'),
      qW: inp('50', 'Well width, mm'),
      nc: NC_BANDS.map((b, i) => inp(String([50, 45, 40, 35, 30, 28, 26, 25][i]), `${b} Hz octave band, dB SPL`)),
      aR: inp('10', 'Listener to the nearest loudspeaker, m'),
      aT: inp('1.5', 'RT60 at 2 kHz, s'),
      aV: inp('2000', 'Room volume, m³'),
      aQ: inp('10', 'Loudspeaker directivity factor Q'),
      aN: inp('0', 'Other loudspeakers like it (n)'),
      gD0: inp('20', 'Talker to the farthest listener, m'),
      gDs: inp('0.5', 'Talker to the microphone, m'),
      gD1: inp('6', 'Microphone to the nearest loudspeaker, m'),
      gD2: inp('15', 'Loudspeaker to the farthest listener, m'),
      gEAD: inp('3', 'Equivalent acoustic distance: how close the farthest listener should seem, m'),
      gNOM: inp('1', 'Number of open microphones'),
      cH: inp('3', 'Ceiling height, m'),
      cE: inp('1.2', 'Ear height, m (1.2 seated, 1.7 standing)'),
      cA: inp('90', 'Coverage angle, degrees'),
      sA: inp('100', 'Piston (cone) radius, mm'),
      sF: inp('2000', 'Frequency, Hz'),
      bFs: inp('40', 'Driver free-air resonance fs, Hz'),
      bQ: inp('0.4', 'Driver total Q, Qts'),
      bVas: inp('50', 'Driver compliance volume Vas, litres'),
      bVb: inp('25', 'Box volume, litres'),
      eV: inp('1.228', 'RMS volts'),
      eS: inp('88', 'Sensitivity, dB SPL at 1 W, 1 m'),
      eW: inp('100', 'Amplifier power, W'),
      eD: inp('4', 'Distance, m'),
      z1: sel(MEDIA.map(([n, z]) => [String(z), n])),
      z2: sel(MEDIA.map(([n, z]) => [String(z), n])),
      t1: inp('440', 'First tone, Hz'),
      t2: inp('660', 'Second tone, Hz'),
      ph: inp('60', 'Loudness level, phon'),
    };
    X.z2.value = String(MEDIA[4][1]);
    const Q = Object.fromEntries(['tl', 'fc', 'f0', 'rw', 'hF', 'pF', 'mF', 'qD', 'qR', 'nc', 'al', 'pag', 'nag', 'cR', 'cS', 'ka', 'beam', 'di', 'off', 'bFc', 'bQtc', 'eU', 'eSpl', 'zR', 'zRef', 'zT', 'tB', 'tC', 'tI', 'tR', 'tN', 'so'].map((k) => [k, out()]));
    for (const k of ['ncT', 'alNote', 'gOk']) Q[k] = h('div');
    const wide = (el) => h('div', { class: 'small', style: 'white-space:normal' }, el);
    T.pages.Wall.append(
      group('Mass Law & Rw', row('Leaf', X.plate), row('Thickness (mm)', X.thick), row('Leaf 1 (kg/m²)', X.m1, 'ρ·t'), row('Leaf 2 (kg/m²)', X.m2), row('Cavity (mm)', X.gap), row('TL at 500 Hz', Q.tl, 'dB'), row('Coincidence fc', Q.fc, 'Hz'), row('Mass–air–mass f0', Q.f0, 'Hz'), row('Rw (mass law)', Q.rw, 'dB'), wide('Field-incidence mass law over the total mass, 100–3150 Hz, rated by ISO 717-1. Real walls fall short near f0 and fc and do better above f0 when the cavity is filled — use it to compare, not to certify.')),
    );
    T.pages.Res.append(
      group('Resonators', h('div', { class: 'small' }, 'Helmholtz'), row('Neck radius (mm)', X.hA), row('Neck length (mm)', X.hL), row('Cavity (litres)', X.hV), row('Resonance', Q.hF, 'Hz'), h('div', { class: 'small' }, 'Perforated or slotted panel'), row('Open area (%)', X.pP), row('Air gap (mm)', X.pD), row('Panel (mm)', X.pT), row('Hole / slot (mm)', X.pd), row('Resonance', Q.pF, 'Hz'), h('div', { class: 'small' }, 'Membrane (panel) absorber'), row('Mass (kg/m²)', X.mm), row('Air gap (mm)', X.md), row('Resonance', Q.mF, 'Hz')),
    );
    T.pages.QRD.append(group('QRD Diffuser', row('Wells N (prime)', X.qN), row('Design f0 (Hz)', X.qF), row('Well width (mm)', X.qW), row('Works from–to', Q.qR, 'Hz'), row('Depths (mm)', Q.qD), wide('Well n is n² mod N deep, in units of λ0 / 2N; dividers between the wells are left out of the width. One period repeats every N wells.')));
    T.pages.NC.append(group('Background Noise (NC)', ...NC_BANDS.map((b, i) => row(`${b >= 1000 ? `${b / 1000}k` : b} Hz (dB)`, X.nc[i])), row('NC rating', Q.nc), wide(Q.ncT)));
    T.pages.PA.append(
      group('Speech & Gain', row('Distance r (m)', X.aR), row('RT60 (s)', X.aT), row('Volume (m³)', X.aV), row('Q', X.aQ), row('Others n', X.aN), row('%ALcons', Q.al, '%'), wide(Q.alNote), row('Talker → listener D0', X.gD0), row('Talker → mic Ds', X.gDs), row('Mic → speaker D1', X.gD1), row('Speaker → listener D2', X.gD2), row('EAD (m)', X.gEAD), row('Open mics', X.gNOM), row('PAG', Q.pag, 'dB'), row('NAG', Q.nag, 'dB'), wide(Q.gOk)),
      group('Ceiling Speakers', row('Ceiling (m)', X.cH), row('Ear height (m)', X.cE), row('Coverage (°)', X.cA), row('Circle radius', Q.cR, 'm'), row('Spacing', Q.cS)),
    );
    T.pages.Spk.append(
      group('Piston & Box', row('Radius (mm)', X.sA), row('Frequency (Hz)', X.sF), row('ka', Q.ka), row('−6 dB half-angle', Q.beam), row('DI', Q.di, 'dB'), row('At 30° / 60°', Q.off, 'dB'), row('fs (Hz)', X.bFs), row('Qts', X.bQ), row('Vas (litres)', X.bVas), row('Box (litres)', X.bVb), row('Closed box fc', Q.bFc, 'Hz'), row('Qtc', Q.bQtc)),
      group('Electrical Levels', row('Volts RMS', X.eV), row('dBu / dBV', Q.eU), row('Sensitivity (dB)', X.eS), row('Power (W)', X.eW), row('Distance (m)', X.eD), row('SPL', Q.eSpl, 'dB')),
    );
    T.pages.Z.append(group('Impedance Step', row('From', X.z1), row('Into', X.z2), row('Pressure reflection R', Q.zR), row('Energy reflected', Q.zRef, '%'), row('Energy through', Q.zT, '%'), wide('Normal incidence, plane wave.')));
    T.pages.Tone.append(
      group('Two Tones', row('f1 (Hz)', X.t1), row('f2 (Hz)', X.t2), row('Beats', Q.tB, 'Hz'), row('Combination tones', Q.tC), row('Interval', Q.tI), row('Roughness', Q.tR), row('Notes', Q.tN)),
      group('Loudness', row('Level (phon)', X.ph), row('Loudness', Q.so, 'sone')),
    );
    win.el.append(h('div', { class: 'acx-calc' }, T.nodes));
    const num = (el) => parseFloat(String(el.value).replace(',', '.'));
    let last = { wave: 'f', comb: 'delay' };
    for (const k of ['f', 'lam', 'per']) I[k].addEventListener('input', () => (last.wave = k));
    for (const k of ['delay', 'path']) I[k].addEventListener('input', () => (last.comb = k));
    function calc() {
      const v = num(I.uv);
      O.uv.textContent = Number.isFinite(v) ? fmt(convert(S.unit, v, S.dir), 4) : '—';
      const l1 = num(I.l1);
      const d1 = num(I.d1);
      const d2 = num(I.d2);
      O.l2.textContent = d1 > 0 && d2 > 0 ? fmt(inverseSquare(l1, d1, d2, S.wave), 1) : '—';
      const lv = String(I.levels.value).split(/[,;\s]+/).map(Number).filter(Number.isFinite);
      O.n.textContent = String(lv.length);
      O.sum.textContent = lv.length ? fmt(addLevels(lv, S.kind), 1) : '—';
      const t = num(I.t);
      const c = speedOfSound(Number.isFinite(t) ? t : 20);
      O.c.textContent = `${fmt(c * lenK(), 1)} ${lenU()}/s`;
      const set = (el, val, d) => document.activeElement !== el && (el.value = Number.isFinite(val) ? fmt(val, d) : '');
      let f = num(I.f);
      if (last.wave === 'lam') f = c / (num(I.lam) / lenK());
      if (last.wave === 'per') f = 1000 / num(I.per);
      if (f > 0) {
        set(I.f, f, 2);
        set(I.lam, (c / f) * lenK(), 4);
        set(I.per, 1000 / f, 4);
      }
      let dt = num(I.delay) / 1000;
      if (last.comb === 'path') dt = num(I.path) / lenK() / c;
      const n = combNulls(dt);
      if (dt > 0) {
        set(I.delay, dt * 1000, 3);
        set(I.path, dt * c * lenK(), 3);
      }
      [O.n1, O.n2, O.n3].forEach((o, i) => (o.textContent = fmt(n.nulls[i], 1)));
      O.sp.textContent = fmt(n.spacing, 1);
      calcRefs(c);
    }
    function calcRefs(c) {
      const v = (k) => num(X[k]);
      const put = (k, val, d = 1) => (Q[k].textContent = typeof val === 'string' ? val : fmt(val, d));
      // walls
      const plate = PLATES.find((p) => p.id === X.plate.value);
      const m1 = plate.rho * (v('thick') / 1000);
      X.m1.textContent = fmt(m1, 1);
      const m2 = v('m2') || 0;
      const mt = m1 + m2;
      put('tl', massLaw(mt, 500));
      put('fc', coincidence(plate, v('thick') / 1000, c), 0);
      put('f0', m2 > 0 ? massAirMass(m1, m2, v('gap') / 1000) : '—', 0);
      put('rw', mt > 0 ? String(ratingRw(R_BANDS.map((f) => massLaw(mt, f))).rw) : '—');
      // resonators
      put('hF', helmholtz({ a: v('hA') / 1000, l: v('hL') / 1000, V: v('hV') / 1000 }, c));
      put('pF', perforated({ P: v('pP') / 100, D: v('pD') / 1000, t: v('pT') / 1000, d: v('pd') / 1000 }, c));
      put('mF', membrane(v('mm'), v('md') / 1000));
      // diffuser
      const N = Math.round(v('qN'));
      if (isPrime(N) && N <= 97) {
        const q = qrd({ N, f0: v('qF'), w: v('qW') / 1000 }, c);
        put('qR', `${fmt(q.fLow, 0)} – ${fmt(q.fHigh, 0)}`);
        put('qD', q.depths.map((d) => fmt(d * 1000, 0)).join(' '));
      } else {
        put('qR', '—');
        put('qD', 'N must be a prime up to 97');
      }
      // noise
      const lv = X.nc.map((el) => num(el));
      if (lv.every(Number.isFinite)) {
        const r = ncRating(lv);
        put('nc', r.nc < 15 ? 'below NC-15' : `NC-${Math.ceil(r.nc - 1e-9)} (set by ${r.band} Hz)`);
        Q.ncT.textContent = NC_TARGETS.map(([n, lo, hi]) => `${n} NC-${lo}–${hi}${r.nc <= hi + 1e-9 ? ' ✓' : ''}`).join(' · ');
      }
      // speech and gain
      const T60 = v('aT');
      const room = roomFigures({ V: v('aV'), S: 6 * v('aV') ** (2 / 3), abar: Math.min(0.95, (0.161 * v('aV')) / (T60 * 6 * v('aV') ** (2 / 3))), Q: v('aQ'), c });
      const al = alcons({ r: v('aR'), T: T60, V: v('aV'), Q: v('aQ'), n: v('aN'), dc: room.dc });
      put('al', al);
      Q.alNote.textContent = `${al <= 5 ? 'Good' : al <= 10 ? 'Acceptable' : al <= 15 ? 'Poor' : 'Unusable'} (≤ 5 % good, ≤ 10 % acceptable, past 15 % unusable). Critical distance about ${fmt(room.dc, 1)} m in a cube of this volume.`;
      const g = acousticGain({ D0: v('gD0'), Ds: v('gDs'), D1: v('gD1'), D2: v('gD2'), EAD: v('gEAD'), NOM: v('gNOM') });
      put('pag', g.pag);
      put('nag', g.nag);
      Q.gOk.textContent = g.ok ? '✓ PAG ≥ NAG: the system can reach the level without feedback.' : '⚠ PAG < NAG: move the mic closer to the talker, the speakers away from the mic, or open fewer mics.';
      const cs = ceilingSpacing({ ceiling: v('cH'), ear: v('cE'), angle: v('cA') });
      put('cR', cs.r, 2);
      put('cS', `edge ${fmt(cs.edge, 2)} · overlap ${fmt(cs.overlap, 2)} · centre ${fmt(cs.centre, 2)} m`);
      // loudspeaker
      const pz = piston(v('sA') / 1000, v('sF'), c);
      put('ka', pz.ka, 2);
      put('beam', pz.half6 == null ? 'wider than ±90°' : `±${fmt(pz.half6, 0)}°`);
      put('di', pz.di);
      put('off', `${fmt(20 * Math.log10(Math.abs(pz.at(30)) || 1e-6), 1)} / ${fmt(20 * Math.log10(Math.abs(pz.at(60)) || 1e-6), 1)}`);
      const cb = closedBox({ fs: v('bFs'), qts: v('bQ'), vas: v('bVas'), vb: v('bVb') });
      put('bFc', cb.fc);
      put('bQtc', cb.qtc, 2);
      const el = electrical(v('eV'));
      put('eU', `${fmt(el.dBu, 1)} dBu / ${fmt(el.dBV, 1)} dBV`);
      put('eSpl', splFromPower(v('eS'), v('eW'), v('eD')));
      // impedance
      const z = impedanceStep(+X.z1.value, +X.z2.value);
      put('zR', z.R, 4);
      put('zRef', z.reflected * 100, 3);
      put('zT', z.transmitted * 100, 4);
      // hearing
      const tt = twoTones(v('t1'), v('t2'));
      Q.tB.textContent = tt.beat <= 20 ? fmt(tt.beat, 2) : `${fmt(tt.beat, 1)} — too far apart to beat`;
      put('tC', `f2−f1 ${fmt(tt.difference, 1)} · 2f1−f2 ${fmt(tt.cubic, 1)} · f1+f2 ${fmt(tt.sum, 1)} Hz`);
      put('tI', `${fmt(tt.cents, 1)} cents ≈ ${tt.just.name} ${tt.just.ratio} (${tt.just.off >= 0 ? '+' : ''}${fmt(tt.just.off, 1)}¢; equal temperament ${tt.just.etOff >= 0 ? '+' : ''}${fmt(tt.just.etOff, 1)}¢)`);
      put('tR', `${fmt(tt.roughness, 2)} (0 smooth … 1 roughest)`);
      const n1 = noteOf(v('t1'));
      const n2 = noteOf(v('t2'));
      put('tN', `${n1.name} ${n1.cents >= 0 ? '+' : ''}${fmt(n1.cents, 0)}¢ · ${n2.name} ${n2.cents >= 0 ? '+' : ''}${fmt(n2.cents, 0)}¢`);
      put('so', sones(v('ph')), 2);
    }
    win.refresh = calc;
    calc();
  });
}
