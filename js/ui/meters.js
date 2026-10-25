// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';
import { directivityQ, deviceGain, frame } from '../acoustics/patterns.js';
import { findNulls } from '../acoustics/nulls.js';
import { allModes } from '../acoustics/room.js';
import { F_MAX, F_MIN } from '../compute/compute.js';
import { selectedDevice } from '../model/store.js';
import { fitCanvas } from '../views/glyphs.js';
import { download } from './dom.js';
import { makePoppable, saveCanvas, toCsv } from './popout.js';

/**
 * THE METER BRIDGE
 *
 * What the monitored microphone (the selected one, else the mix position)
 * hears, read the way a console reads it: a level meter, an octave RTA, a
 * frequency response with the room's modes marked under it, the echogram and
 * its Schroeder decay, the ISO 3382 numbers as meter tiles, RT60 per band
 * against the EBU Tech 3276 window, and the polar pattern of whatever is
 * selected. Click the response to tune the wave field to that frequency.
 */

const A_WEIGHT = [-16.1, -8.6, -3.2, 0, 1.2, 1.0];
const GRID = '#263042';
const TEXT = '#9aa4b2';
const FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
/** The current frequency's colour everywhere: the toolbar slider, this chart's line, the scale bar. */
export const FREQ_COLOUR = '#fde047';
/** The whole room's curve: every seat, power-averaged. */
const ROOM_COLOUR = '#a3e635';
/** The meters tucked into the tray, remembered in this browser. */
const MIN_KEY = 'acoustic.metersMinimised';
/** Each meter's icon in the tray. */
const ICONS = { spl: '▮ SPL', rta: '▥ RTA', response: '〰 FR', echogram: '⋮ Echo', iso3382: '▦ ISO', rt60: '⏱ RT60', polar: '◎ Polar' };

export function createMeters({ root, tray = null, store, engine, onListen }) {
  root.innerHTML = `
    <div class="meter m-spl" data-kind="spl"><h4>SPL <span class="sub spl-mic"></span></h4><canvas></canvas></div>
    <div class="meter m-rta" data-kind="rta"><h4>Octave RTA <span class="sub">direct + diffuse</span></h4><canvas></canvas></div>
    <div class="meter m-fr wide" data-kind="response"><h4>Frequency response <span class="sub">mix · room · modal · <b style="color:#38bdf8">nulls</b> · click to set the current frequency</span></h4><canvas></canvas></div>
    <div class="meter m-echo wide" data-kind="echogram"><h4>Echogram <span class="sub">arrivals · tail · Schroeder</span></h4><canvas></canvas></div>
    <div class="meter m-iso" data-kind="iso3382"><h4>ISO 3382 <button class="listen" title="Hear the estimated impulse response at this mic">▶ Listen</button></h4><div class="tiles"></div></div>
    <div class="meter m-rt" data-kind="rt60"><h4>RT60 <span class="sub">Sabine · Eyring · EBU</span></h4><canvas></canvas></div>
    <div class="meter m-polar" data-kind="polar"><h4>Polar <span class="sub pol-name"></span></h4><canvas></canvas></div>`;
  // Held, not looked up: a meter popped into its own window is no longer under `root`.
  const el = Object.fromEntries([...root.querySelectorAll('.meter')].map((m) => [m.dataset.kind, m]));
  const cv = (kind) => el[kind].querySelector('canvas');
  el.iso3382.querySelector('.listen').addEventListener('click', () => onListen());

  const fr = cv('response');
  const frX = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return F_MIN * (F_MAX / F_MIN) ** ((e.clientX - r.left - 30) / (r.width - 40));
  };
  fr.addEventListener('click', (e) => {
    const f = frX(e);
    if (f >= F_MIN && f <= F_MAX) store.setSettings({ freq: Math.round(f), method: store.state.settings.method === 'energy' ? 'wave' : store.state.settings.method });
  });
  // Explore: what the curve reads under the pointer.
  let hover = null;
  fr.addEventListener('pointermove', (e) => {
    hover = frX(e);
    drawResponse(fr, engine.out, store.state.settings, hover);
  });
  fr.addEventListener('pointerleave', () => {
    hover = null;
    drawResponse(fr, engine.out, store.state.settings);
  });

  // tucked in until opened: nothing remembered means every meter starts in the tray
  const minimised = new Set(Object.keys(el));
  try {
    const kept = localStorage.getItem(MIN_KEY);
    if (kept !== null) {
      minimised.clear();
      for (const k of JSON.parse(kept)) minimised.add(k);
    }
  } catch {
    // nothing remembered: every meter tucked in
  }
  const titles = { spl: 'SPL', rta: 'Octave RTA', response: 'Frequency response', echogram: 'Echogram', iso3382: 'ISO 3382', rt60: 'RT60', polar: 'Polar' };
  for (const [kind, m] of Object.entries(el)) {
    const pop = makePoppable(m, {
      title: titles[kind],
      onChange: () => render(),
      tools: (win) => {
        const b = (label, title, fn) => {
          const x = win.document.createElement('button');
          x.textContent = label;
          x.title = title;
          x.onclick = fn;
          return x;
        };
        const name = `${(store.state.fileName || 'room').replace(/\.[^.]+$/, '')}-${kind}`;
        const out = [b('⬇ CSV', 'Export the numbers behind this graph', () => download(`${name}.csv`, toCsv(meterRows(kind, engine.out, store.state)), 'text/csv'))];
        if (m.querySelector('canvas')) out.unshift(b('⬇ PNG', 'Save this graph as a picture', () => saveCanvas(m.querySelector('canvas'), `${name}.png`)));
        return out;
      },
    });
    // – tucks it into the tray at the bottom of the screen, an icon there; the icon brings it back
    const min = Object.assign(document.createElement('button'), { className: 'minbtn', textContent: '–', title: 'Minimise: tuck this meter into the tray at the bottom' });
    min.onclick = () => minimise(kind, true);
    m.append(min);
    const icon = Object.assign(document.createElement('button'), { textContent: ICONS[kind], title: `${titles[kind]}: open it over the views` });
    icon.dataset.kind = kind;
    icon.onclick = () => minimise(kind, false);
    tray?.append(icon);
    tuck(kind, minimised.has(kind));
    // The title pops it out; so does a double-click anywhere on it (a single click on the response still tunes).
    m.querySelector('h4').addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      pop.pop();
    });
    m.addEventListener('dblclick', () => pop.pop());
  }

  function tuck(kind, on) {
    el[kind].classList.toggle('min', on);
    tray?.querySelector(`[data-kind="${kind}"]`)?.toggleAttribute('hidden', !on);
  }

  function minimise(kind, on) {
    tuck(kind, on);
    if (on) minimised.add(kind);
    else minimised.delete(kind);
    try {
      localStorage.setItem(MIN_KEY, JSON.stringify([...minimised]));
    } catch {
      // folded for this page only
    }
    if (!on) requestAnimationFrame(render);
  }

  function render() {
    // faded away while a frequency renders (ui/meterFold.js), or hidden: nothing to see; it draws again on the way back
    if (root.clientHeight < 24 || document.body.classList.contains('meters-folded')) return;
    const out = engine.out;
    const { state } = store;
    const rep = out.reports?.[out.monitorId];
    const mic = state.mics.find((m) => m.id === out.monitorId);
    root.classList.toggle('empty', !rep);
    el.spl.querySelector('.spl-mic').textContent = mic ? (mic.mix ? 'MIX' : mic.name) : '';
    drawSpl(cv('spl'), rep, state.settings);
    drawRta(cv('rta'), rep, state.settings);
    drawResponse(fr, out, state.settings, hover);
    // one point of the response per 2 px of the graph: popped out wide, it is recomputed that fine
    if (fr.clientWidth) engine.setResponsePoints?.((fr.clientWidth - 40) / 2);
    drawEcho(cv('echogram'), rep);
    drawIso(el.iso3382.querySelector('.tiles'), rep, state.settings);
    drawRt(cv('rt60'), out.room, state.settings);
    drawPolar(cv('polar'), selectedDevice(state) ?? state.speakers[0], state.settings, el.polar.querySelector('.pol-name'));
  }
  return { render, open: (kind) => el[kind] && minimise(kind, false) };
}

/** The numbers behind each graph, as CSV rows (header first). */
export function meterRows(kind, out, state) {
  const rep = out.reports?.[out.monitorId];
  const bands = BANDS.map((b) => b);
  if (kind === 'response') {
    const r = out.response;
    if (!r) return [['no response — place a speaker and a mic']];
    const nulls = findNulls(r.freqs, r.wave);
    const inNull = (f) => nulls.find((n) => f >= n.lo && f <= n.hi);
    return [['Hz', 'wave dB', 'room dB', 'modal dB', 'null'], ...r.freqs.map((f, i) => [f, r.wave[i], r.room?.[i] ?? '', r.modal[i], inNull(f) ? `${hz(inNull(f).f)} −${inNull(f).depth.toFixed(1)} dB` : ''])];
  }
  if (kind === 'rt60') {
    const room = out.room;
    if (!room) return [['no room']];
    return [['Hz', 'Sabine s', 'Eyring s', 'mean alpha'], ...room.perBand.map((p, i) => [bands[i], p.sabine, p.eyring, p.abar])];
  }
  if (!rep) return [['no mic report — place a speaker and a mic']];
  if (kind === 'spl' || kind === 'rta') return [['Hz', 'total dB', 'direct dB', 'reverb dB'], ...rep.energy.map((e, i) => [bands[i], e.total, e.direct, e.reverb])];
  if (kind === 'echogram') return [['t ms', 'level dB', 'order'], ...rep.echogram.arrivals.map((a) => [a.t * 1000, a.level, a.order])];
  if (kind === 'iso3382') return [['parameter', 'value'], ...Object.entries(rep.iso).map(([k, v]) => [k, v]), ['ITDG ms', rep.itdgMs], ['wave dB', rep.wave], ['modal dB', rep.modal]];
  if (kind === 'polar') {
    const dev = selectedDevice(state) ?? state.speakers[0];
    if (!dev) return [['no device']];
    const freq = state.settings.method === 'energy' ? BANDS[state.settings.band] : state.settings.freq;
    const probe = { ...dev, _frame: frame(0, 0) };
    const rows = [['deg', 'horizontal dB', 'vertical dB']];
    for (let d = 0; d < 360; d += 5) {
      const a = d * (Math.PI / 180);
      rows.push([d, deviceGain(probe, [Math.cos(a), -Math.sin(a), 0], freq), deviceGain(probe, [Math.cos(a), 0, Math.sin(a)], freq)]);
    }
    return rows;
  }
  return [];
}

function noData(ctx, w, h, text = 'Place a speaker and a mic') {
  ctx.fillStyle = TEXT;
  ctx.font = FONT;
  ctx.fillText(text, 8, h / 2);
}

function broadband(rep, aWeight) {
  let e = 0;
  rep.energy.forEach((b, i) => {
    e += 10 ** ((b.total + (aWeight ? A_WEIGHT[i] : 0)) / 10);
  });
  return 10 * Math.log10(e);
}

function drawSpl(canvas, rep, settings) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!rep) return noData(ctx, w, h, '—');
  const lo = 40;
  const hi = 130;
  const top = 8;
  const bot = h - 30;
  const y = (db) => bot - ((Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * (bot - top);
  const value = broadband(rep, settings.aWeight);
  const seg = 3;
  const bars = [
    { x: 4, db: value, label: settings.aWeight ? 'dBA' : 'dBZ' },
    { x: 40, db: rep.wave, label: `${settings.freq.toFixed(0)}` },
  ];
  for (const b of bars) {
    for (let yy = bot; yy > top; yy -= seg + 1) {
      const db = lo + ((bot - yy) / (bot - top)) * (hi - lo);
      const lit = db <= b.db;
      const c = db > 105 ? '#ef4444' : db > 85 ? '#facc15' : '#22c55e';
      ctx.fillStyle = lit ? c : '#1a2130';
      ctx.fillRect(b.x, yy - seg, 20, seg);
    }
    ctx.fillStyle = TEXT;
    ctx.font = FONT;
    ctx.fillText(b.label, b.x - 2, h - 18);
  }
  ctx.fillStyle = TEXT;
  for (let db = lo; db <= hi; db += 10) {
    ctx.fillText(String(db), 66, y(db) + 3);
  }
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillText(value.toFixed(1), 4, h - 3);
  ctx.font = FONT;
}

function drawRta(canvas, rep, settings) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!rep) return noData(ctx, w, h);
  const vals = rep.energy;
  const top = Math.ceil(Math.max(...vals.map((v) => v.total)) / 10) * 10 + 5;
  const range = 50;
  const y = (db) => h - 18 - ((Math.max(top - range, db) - (top - range)) / range) * (h - 30);
  const bw = (w - 30) / vals.length;
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  ctx.font = FONT;
  for (let db = top - range; db <= top; db += 10) {
    ctx.beginPath();
    ctx.moveTo(26, y(db));
    ctx.lineTo(w, y(db));
    ctx.stroke();
    ctx.fillText(String(db), 0, y(db) + 3);
  }
  vals.forEach((v, i) => {
    const x = 28 + i * bw;
    const grad = ctx.createLinearGradient(0, y(v.total), 0, h - 18);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 3, y(v.total), bw - 6, h - 18 - y(v.total));
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x + 3, y(v.reverb) - 1, bw - 6, 2);
    ctx.fillStyle = i === settings.band ? '#e5e7eb' : TEXT;
    ctx.fillText(BANDS[i] >= 1000 ? `${BANDS[i] / 1000}k` : String(BANDS[i]), x + bw / 2 - 9, h - 5);
  });
}

function drawResponse(canvas, out, settings, hover = null) {
  const { ctx, w, h } = fitCanvas(canvas);
  const r = out.response;
  if (!r || !out.room) return noData(ctx, w, h);
  const x = (f) => 30 + (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * (w - 40);
  const all = [...r.wave, ...r.modal, ...(r.room ?? [])].filter(Number.isFinite);
  const top = Math.ceil(Math.max(...all) / 6) * 6 + 3;
  const range = 42;
  const y = (db) => 6 + ((top - Math.max(top - range, Math.min(top, db))) / range) * (h - 30);
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  ctx.font = FONT;
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    ctx.beginPath();
    ctx.moveTo(x(f), 6);
    ctx.lineTo(x(f), h - 24);
    ctx.stroke();
    ctx.fillText(hz(f), x(f) - 8, h - 12);
  }
  for (let db = top; db >= top - range; db -= 6) {
    ctx.beginPath();
    ctx.moveTo(30, y(db));
    ctx.lineTo(w, y(db));
    ctx.stroke();
    ctx.fillText(String(db), 0, y(db) + 3);
  }
  for (const m of allModes(out.room, 300)) {
    const c = m.type === 'axial' ? '#ef4444' : m.type === 'tangential' ? '#f59e0b' : '#64748b';
    ctx.fillStyle = c;
    ctx.fillRect(x(m.f), h - 24, 1.5, m.type === 'axial' ? 8 : m.type === 'tangential' ? 5 : 3);
  }
  const fs = 2000 * Math.sqrt(out.room.perBand[2].eyring / out.room.V);
  ctx.strokeStyle = '#a78bfa';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x(fs), 6);
  ctx.lineTo(x(fs), h - 24);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#a78bfa';
  ctx.fillText(`Schroeder ${fs.toFixed(0)}`, x(fs) + 3, 16);
  const trace = (vals, colour, width) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    r.freqs.forEach((f, i) => {
      const v = vals[i];
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      if (pen) ctx.lineTo(x(f), y(v));
      else ctx.moveTo(x(f), y(v));
      pen = true;
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  // The nulls: shaded where the curve is down, the deepest point marked and named.
  let lastLabel = -Infinity;
  for (const n of findNulls(r.freqs, r.wave)) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.fillRect(x(n.lo), 6, Math.max(2, x(n.hi) - x(n.lo)), h - 30);
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x(n.f), y(n.db), 3.5, 0, Math.PI * 2);
    ctx.stroke();
    // a label only where there is room for it; the shading and the ring still mark every null
    const label = `${hz(n.f)} −${n.depth.toFixed(0)}`;
    if (x(n.f) - 14 > lastLabel + 4) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(label, x(n.f) - 14, Math.min(h - 28, y(n.db) + 14));
      lastLabel = x(n.f) - 14 + ctx.measureText(label).width;
    }
  }
  trace(r.modal, '#22d3ee', 1.2);
  if (r.room) trace(r.room, ROOM_COLOUR, 1.6);
  trace(r.wave, '#f43f5e', 1.8);
  // The sweep's frames: a faint tick for each one still to paint, a dot on the curve for each one ready.
  const { ready = [], ladder = [] } = out.frames ?? {};
  const done = new Set(ready);
  ctx.fillStyle = 'rgba(253, 224, 71, .25)';
  for (const f of ladder) if (!done.has(f)) ctx.fillRect(x(f) - 0.5, h - 26, 1, 2);
  ctx.fillStyle = '#fde047';
  for (const f of ready) {
    ctx.fillRect(x(f) - 0.5, h - 28, 1.5, 4);
    const db = waveAt(r, f);
    if (!Number.isFinite(db)) continue;
    ctx.beginPath();
    ctx.arc(x(f), y(db), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // the current frequency — the toolbar slider's — as a line with its readings on it
  if (settings.method !== 'energy') {
    const fx = x(settings.freq);
    ctx.strokeStyle = FREQ_COLOUR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx, 6);
    ctx.lineTo(fx, h - 24);
    ctx.stroke();
    ctx.lineWidth = 1;
    const at = (vals) => valueAt(r.freqs, vals, settings.freq);
    const mixDb = at(r.wave);
    const roomDb = r.room ? at(r.room) : NaN;
    for (const [db, colour] of [[mixDb, '#f43f5e'], [roomDb, ROOM_COLOUR]]) {
      if (!Number.isFinite(db)) continue;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(fx, y(db), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const label = `current ${hz(settings.freq)} Hz${Number.isFinite(mixDb) ? ` · mix ${mixDb.toFixed(1)}` : ''}${Number.isFinite(roomDb) ? ` · room ${roomDb.toFixed(1)}` : ''} dB`;
    const tw = ctx.measureText(label).width + 8;
    const lx = Math.max(30, Math.min(w - tw - 2, fx - tw / 2));
    ctx.fillStyle = 'rgba(11,13,18,.9)';
    ctx.fillRect(lx, h - 40, tw, 14);
    ctx.fillStyle = FREQ_COLOUR;
    ctx.fillText(label, lx + 4, h - 30);
  }
  const legend = [['wave', '#f43f5e'], ...(r.room ? [[`room ·${r.seats}`, ROOM_COLOUR]] : []), ['modal', '#22d3ee']];
  let lx = w - 4;
  for (const [text, colour] of legend.reverse()) {
    lx -= ctx.measureText(text).width + 8;
    ctx.fillStyle = colour;
    ctx.fillText(text, lx, 16);
  }
  if (hover && hover >= F_MIN && hover <= F_MAX) {
    // the nearest computed point to the pointer
    let i = 0;
    for (let j = 1; j < r.freqs.length; j++) if (Math.abs(Math.log(r.freqs[j] / hover)) < Math.abs(Math.log(r.freqs[i] / hover))) i = j;
    const f = r.freqs[i];
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x(f), 6);
    ctx.lineTo(x(f), h - 24);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = `${f.toFixed(f < 100 ? 1 : 0)} Hz · wave ${Number.isFinite(r.wave[i]) ? r.wave[i].toFixed(1) : '—'} dB${Number.isFinite(r.room?.[i]) ? ` · room ${r.room[i].toFixed(1)}` : ''}${Number.isFinite(r.modal[i]) ? ` · modal ${r.modal[i].toFixed(1)}` : ''}`;
    const tw = ctx.measureText(label).width + 8;
    const lx = Math.min(w - tw - 2, x(f) + 6);
    ctx.fillStyle = 'rgba(11,13,18,.9)';
    ctx.fillRect(lx, 20, tw, 15);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(label, lx + 4, 31);
  }
}

/** The wave curve at `f`, read off between its computed points on a log axis. */
const waveAt = (r, f) => valueAt(r.freqs, r.wave, f);

/** Any curve at `f`, read off between its computed points on a log axis. */
function valueAt(freqs, vals, f) {
  const i = freqs.findIndex((g) => g >= f);
  if (i < 0) return NaN;
  if (i === 0 || freqs[i] === f) return vals[i];
  const t = Math.log(f / freqs[i - 1]) / Math.log(freqs[i] / freqs[i - 1]);
  return vals[i - 1] + t * (vals[i] - vals[i - 1]);
}

/** 63, 1.2k, 17k — short enough for an axis. */
export function hz(f) {
  if (f >= 1000) return `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k`;
  return f.toFixed(0);
}

function drawEcho(canvas, rep) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!rep) return noData(ctx, w, h);
  const eg = rep.echogram;
  const tMax = Math.min(eg.bins.length * eg.dt, eg.tD + Math.max(0.15, eg.T * 0.8));
  const x = (t) => 30 + (t / tMax) * (w - 36);
  const peak = Math.max(...eg.arrivals.map((a) => a.level));
  const y = (db) => 6 + ((peak - Math.max(peak - 60, db)) / 60) * (h - 30);
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  ctx.font = FONT;
  for (let db = 0; db >= -60; db -= 20) {
    ctx.beginPath();
    ctx.moveTo(30, y(peak + db));
    ctx.lineTo(w, y(peak + db));
    ctx.stroke();
    ctx.fillText(String(db), 2, y(peak + db) + 3);
  }
  for (const ms of [50, 80]) {
    const t = eg.tD + ms / 1000;
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(t), 6);
    ctx.lineTo(x(t), h - 24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${ms}ms`, x(t) + 2, h - 26);
  }
  ctx.fillStyle = 'rgba(245,158,11,.35)';
  for (let i = 0; i < eg.tail.length; i += 4) {
    const e = eg.tail[i] / eg.dt;
    if (!e) continue;
    const t = i * eg.dt;
    if (t > tMax) break;
    const db = 10 * Math.log10(e * 0.001);
    ctx.fillRect(x(t), y(db), 1.5, h - 24 - y(db));
  }
  const ORDER = ['#f8fafc', '#38bdf8', '#a78bfa', '#f472b6', '#64748b'];
  for (const a of eg.arrivals) {
    if (a.t > tMax) continue;
    ctx.fillStyle = ORDER[Math.min(a.order, 4)];
    ctx.fillRect(x(a.t), y(a.level), a.order ? 1.5 : 2.5, h - 24 - y(a.level));
  }
  let acc = 0;
  const sch = new Float64Array(eg.bins.length);
  for (let i = eg.bins.length - 1; i >= 0; i--) sch[i] = acc += eg.bins[i];
  const i0 = Math.floor(eg.tD / eg.dt);
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = i0; i < sch.length && i * eg.dt <= tMax; i += 2) {
    const db = peak + 10 * Math.log10(sch[i] / sch[i0]);
    if (i === i0) ctx.moveTo(x(i * eg.dt), y(db));
    else ctx.lineTo(x(i * eg.dt), y(db));
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = TEXT;
  ctx.fillText(`${(tMax * 1000).toFixed(0)} ms`, w - 46, h - 12);
  ctx.fillText('0', 28, h - 12);
}

function drawIso(el, rep, settings) {
  if (!rep) {
    el.innerHTML = '<div class="tile"><b>—</b><span>no mic</span></div>';
    return;
  }
  const iso = rep.iso;
  const e = rep.energy[settings.band];
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const tiles = [
    ['EDT', `${f(iso.EDT)} s`],
    ['T20', `${f(iso.T20)} s`],
    ['T30', `${f(iso.T30)} s`],
    ['C50', `${f(iso.C50, 1)} dB`],
    ['C80', `${f(iso.C80, 1)} dB`],
    ['D50', `${f(iso.D50 * 100, 0)} %`],
    ['Ts', `${f(iso.Ts, 0)} ms`],
    ['ITDG', `${f(rep.itdgMs, 1)} ms`],
    ['D/R', `${f(e.direct - e.reverb, 1)} dB`],
    ['Modal', `${f(rep.modal, 1)} dB`],
  ];
  el.innerHTML = tiles.map(([k, v]) => `<div class="tile"><b>${v}</b><span>${k}</span></div>`).join('') + `<div class="tile wide"><span>@ ${BANDS[settings.band]} Hz octave · ${rep.firstReflections.length} early reflections</span></div>`;
}

function drawRt(canvas, room, settings) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!room) return;
  const vals = room.perBand;
  const max = Math.max(1, ...vals.map((v) => v.sabine)) * 1.1;
  const y = (t) => h - 18 - (t / max) * (h - 30);
  const tm = 0.3 * (room.V / 100) ** (1 / 3);
  ctx.fillStyle = 'rgba(34,197,94,.15)';
  ctx.fillRect(28, y(tm + 0.05), w - 28, y(tm - 0.05) - y(tm + 0.05));
  ctx.fillStyle = '#22c55e';
  ctx.font = FONT;
  ctx.fillText(`EBU Tm ${tm.toFixed(2)} s`, w - 92, y(tm + 0.05) - 3);
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TEXT;
  for (let t = 0; t <= max; t += max > 2 ? 0.5 : 0.2) {
    ctx.beginPath();
    ctx.moveTo(28, y(t));
    ctx.lineTo(w, y(t));
    ctx.stroke();
    ctx.fillText(t.toFixed(1), 2, y(t) + 3);
  }
  const bw = (w - 30) / vals.length;
  vals.forEach((v, i) => {
    const x = 30 + i * bw;
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 2, y(v.sabine), bw / 2 - 3, h - 18 - y(v.sabine));
    ctx.fillStyle = i === settings.band ? '#38bdf8' : '#0ea5e9';
    ctx.fillRect(x + bw / 2, y(v.eyring), bw / 2 - 3, h - 18 - y(v.eyring));
    ctx.fillStyle = TEXT;
    ctx.fillText(BANDS[i] >= 1000 ? `${BANDS[i] / 1000}k` : String(BANDS[i]), x + bw / 2 - 9, h - 5);
  });
}

function drawPolar(canvas, dev, settings, nameEl) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!dev) {
    nameEl.textContent = '';
    return noData(ctx, w, h, 'Select a device');
  }
  const freq = settings.method === 'energy' ? BANDS[settings.band] : settings.freq;
  nameEl.textContent = `${dev.role || dev.name} · ${freq.toFixed(0)} Hz · Q ${directivityQ(dev, freq).toFixed(1)}`;
  const cx = w / 2;
  const cy = h / 2 + 4;
  const R = Math.min(w, h) / 2 - 12;
  if (R <= 0) return;
  ctx.strokeStyle = GRID;
  for (const db of [0, -6, -12, -18, -24]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * (1 + db / 30), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();
  const probe = { ...dev, _frame: frame(0, 0) };
  const curve = (colour, dirOf) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 360; i += 3) {
      const a = i * (Math.PI / 180);
      const g = Math.max(-30, deviceGain(probe, dirOf(a), freq));
      const r = R * (1 + g / 30);
      const px = cx + Math.sin(a) * r;
      const py = cy - Math.cos(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  curve('#38bdf8', (a) => [Math.cos(a), -Math.sin(a), 0]);
  curve('#f472b6', (a) => [Math.cos(a), 0, Math.sin(a)]);
  ctx.font = FONT;
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('H', 6, 14);
  ctx.fillStyle = '#f472b6';
  ctx.fillText('V', 18, 14);
  ctx.fillStyle = TEXT;
  ctx.fillText('0°', cx - 6, cy - R - 2);
}
