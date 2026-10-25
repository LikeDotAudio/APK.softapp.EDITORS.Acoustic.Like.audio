// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';

/**
 * THE MATERIALS, CHARTED
 *
 * What the Materials tab draws over its table: a dial to choose by what a
 * finish should DO — reflect on one side, absorb on the other, five steps
 * between — a graph laying the chosen ones' α over each other band by band,
 * and a little α curve on every row. α is 0–1 everywhere (materials.js caps
 * it at 0.99), so a curve on one row reads against the next.
 *
 * Colours: the dial is a diverging scale — blue reflects, red absorbs, a
 * grey middle that does neither much; the graph's lines take categorical
 * slots in a fixed order, the slot staying with the material while it is
 * plotted (validated on the panel #252526: dataviz validate_palette.js).
 */

const NS = 'http://www.w3.org/2000/svg';
const BAND_HEADS = BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b)));
/** The graph's line colours, in the order they are handed out. */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

/**
 * What a material does, as one number: its mean α over 250 Hz – 2 kHz, the
 * four bands a noise reduction coefficient (NRC) averages.
 */
export const nrc = (m) => (m.alpha[1] + m.alpha[2] + m.alpha[3] + m.alpha[4]) / 4;

/** The dial's steps, reflect → absorb: each takes the materials whose NRC is below `to`. */
export const INTENTS = [
  { id: 'reflect', label: 'Reflect', to: 0.1, colour: '#3987e5', hint: 'hard and live: drywall, glass, plaster, wood — and diffusers, which reflect by scattering' },
  { id: 'mostly-reflect', label: 'Mostly reflect', to: 0.3, colour: '#2b5f9e', hint: 'takes the edge off: carpet, thin fabric, membranes that absorb low' },
  { id: 'balanced', label: 'Balanced', to: 0.55, colour: '#57574f', hint: 'as much back as it soaks up' },
  { id: 'mostly-absorb', label: 'Mostly absorb', to: 0.8, colour: '#a14646', hint: 'thin panels, heavy drapes' },
  { id: 'absorb', label: 'Absorb', to: Infinity, colour: '#e66767', hint: 'thick porous panels and traps' },
];

/** The dial step a material falls in. */
export const intentOf = (m) => INTENTS.find((s) => nrc(m) < s.to);

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};
const div = (cls, ...kids) => {
  const d = document.createElement('div');
  d.className = cls;
  for (const c of kids.flat()) if (c != null) d.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return d;
};

/**
 * The dial: a half ring, Reflect at the left end and Absorb at the right,
 * one equal slice per step (a control, not a measure — each slice says how
 * many materials it holds). Clicking a slice picks it, clicking it again
 * lets go: onPick(id | null).
 */
export function intentDial(materials, picked, onPick) {
  const counts = new Map(INTENTS.map((s) => [s.id, 0]));
  for (const m of materials) counts.set(intentOf(m).id, counts.get(intentOf(m).id) + 1);
  const W = 320;
  const cx = W / 2;
  const cy = 150;
  const R = 140;
  const r = 78;
  const gap = 0.012;
  const svg = el('svg', { class: 'intent-dial', viewBox: `0 0 ${W} 160`, role: 'group', 'aria-label': 'Choose materials by what they do: reflect on the left, absorb on the right' });
  const pt = (rad, a) => [cx - rad * Math.cos(a), cy - rad * Math.sin(a)];
  INTENTS.forEach((s, i) => {
    const a0 = (i / INTENTS.length) * Math.PI + gap;
    const a1 = ((i + 1) / INTENTS.length) * Math.PI - gap;
    const on = picked === s.id;
    const grow = on ? 6 : 0;
    const [x0, y0] = pt(R + grow, a0);
    const [x1, y1] = pt(R + grow, a1);
    const [x2, y2] = pt(r, a1);
    const [x3, y3] = pt(r, a0);
    const n = counts.get(s.id);
    const slice = el('path', {
      d: `M${x0} ${y0}A${R + grow} ${R + grow} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 0 0 ${x3} ${y3}Z`,
      fill: s.colour,
      'fill-opacity': picked && !on ? 0.35 : 1,
      stroke: on ? '#f4f4f4' : 'none',
      'stroke-width': 1.5,
      class: 'slice',
      tabindex: 0,
      role: 'button',
      'aria-pressed': String(on),
    }, el('title', {}, `${s.label} · ${n} material${n === 1 ? '' : 's'} · NRC ${i ? INTENTS[i - 1].to : 0}${Number.isFinite(s.to) ? `–${s.to}` : '+'} — ${s.hint}`));
    const pick = () => onPick(on ? null : s.id);
    slice.addEventListener('click', pick);
    slice.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    svg.append(slice);
    // the count on the slice, the name outside it
    const mid = (a0 + a1) / 2;
    const [tx, ty] = pt((R + r) / 2, mid);
    svg.append(el('text', { x: tx, y: ty + 4, 'text-anchor': 'middle', class: 'count' }, String(n)));
  });
  svg.append(el('text', { x: cx - R, y: cy + 8, 'text-anchor': 'start', class: 'end' }, '◀ reflect'));
  svg.append(el('text', { x: cx + R, y: cy + 8, 'text-anchor': 'end', class: 'end' }, 'absorb ▶'));
  const s = INTENTS.find((x) => x.id === picked);
  svg.append(el('text', { x: cx, y: cy - 22, 'text-anchor': 'middle', class: 'pick' }, s ? s.label : 'What should it do?'));
  svg.append(el('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'sub' }, s ? `${counts.get(s.id)} materials` : 'pick a slice'));
  return svg;
}

/** A row's α curve, 125 Hz – 4 kHz on a fixed 0–1 scale; coloured when the material is on the graph. */
export function alphaSpark(alpha, colour = null) {
  const W = 84;
  const H = 22;
  const X = (i) => 3 + (i / (alpha.length - 1)) * (W - 6);
  const Y = (a) => H - 2 - a * (H - 4);
  const line = alpha.map((a, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(a).toFixed(1)}`).join('');
  return el(
    'svg',
    { class: 'alpha-spark', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `α ${alpha.map((a, i) => `${BAND_HEADS[i]} ${a.toFixed(2)}`).join(', ')}` },
    el('path', { d: `M${X(0)} ${Y(0)}${line.replace(/^M/, 'L')}L${X(alpha.length - 1)} ${Y(0)}Z`, fill: colour ?? '#9aa4b2', 'fill-opacity': 0.12 }),
    el('path', { d: `M${X(0)} ${Y(0.5)}H${X(alpha.length - 1)}`, stroke: '#3a3a3d', 'stroke-dasharray': '2 2' }),
    el('path', { d: line, fill: 'none', stroke: colour ?? '#9aa4b2', 'stroke-width': colour ? 2 : 1.5, 'stroke-linejoin': 'round' }),
  );
}

/**
 * The graph: α by octave band for each material in `series` ([{ id, name,
 * alpha, colour }]), and behind them, faint, the spread of the dial's
 * picked step (`envelope`: { lo, hi, colour, label } per band). A crosshair
 * snaps to the nearest band and reads every line there; the legend names
 * each, and its ✕ takes one off (onRemove(id)).
 */
export function alphaGraph(series, envelope, onRemove) {
  const W = 400;
  const H = 200;
  const m = { l: 30, r: series.length <= 4 ? 96 : 12, t: 12, b: 22 };
  const X = (i) => m.l + (i / (BANDS.length - 1)) * (W - m.l - m.r);
  const Y = (a) => m.t + (1 - a) * (H - m.t - m.b);
  const svg = el('svg', { class: 'alpha-graph', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Absorption α by octave band for ${series.map((s) => s.name).join(', ') || 'no material yet'}` });
  // recessive grid and axes
  for (const a of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(el('path', { d: `M${m.l} ${Y(a)}H${W - m.r}`, stroke: a ? '#333336' : '#55555a', 'stroke-width': 1 }));
    svg.append(el('text', { x: m.l - 6, y: Y(a) + 4, 'text-anchor': 'end', class: 'tick' }, a.toFixed(2).replace(/0$/, '')));
  }
  BANDS.forEach((_, i) => svg.append(el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, BAND_HEADS[i])));
  svg.append(el('text', { x: m.l, y: m.t - 1, class: 'tick' }, 'α'));
  if (envelope) {
    const top = envelope.hi.map((a, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(a)}`).join('');
    const bottom = envelope.lo.map((a, i) => `L${X(i)} ${Y(a)}`).reverse().join('');
    svg.append(el('path', { d: `${top}${bottom}Z`, fill: envelope.colour, 'fill-opacity': 0.16 }, el('title', {}, `${envelope.label}: the spread of every material in it`)));
  }
  for (const s of series) {
    svg.append(el('path', { d: s.alpha.map((a, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(a)}`).join(''), fill: 'none', stroke: s.colour, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  // direct labels at the right end when there are few enough to read, nudged apart
  if (series.length && series.length <= 4) {
    const ends = series.map((s) => ({ s, y: Y(s.alpha[s.alpha.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    for (const e of ends) svg.append(el('text', { x: W - m.r + 6, y: e.y + 4, class: 'label' }, e.s.name.length > 14 ? `${e.s.name.slice(0, 13)}…` : e.s.name));
  }
  // the crosshair and its markers, drawn on hover
  const hair = el('g', { class: 'hair', visibility: 'hidden' });
  svg.append(hair);
  const hit = el('rect', { x: m.l - 10, y: m.t, width: W - m.l - m.r + 20, height: H - m.t - m.b, fill: 'transparent' });
  svg.append(hit);

  const wrap = div('alpha-graph-wrap');
  const tip = div('alpha-tip');
  tip.hidden = true;
  const move = (e) => {
    if (!series.length && !envelope) return;
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(BANDS.length - 1, Math.round(((vx - m.l) / (W - m.l - m.r)) * (BANDS.length - 1))));
    hair.replaceChildren(el('path', { d: `M${X(i)} ${m.t}V${H - m.b}`, stroke: '#9aa4b2', 'stroke-width': 1 }), ...series.map((s) => el('circle', { cx: X(i), cy: Y(s.alpha[i]), r: 4, fill: s.colour, stroke: '#252526', 'stroke-width': 2 })));
    hair.setAttribute('visibility', 'visible');
    // values lead, names follow; every line at this band
    tip.replaceChildren(div('head', `${BAND_HEADS[i]}Hz`));
    for (const s of [...series].sort((a, b) => b.alpha[i] - a.alpha[i])) {
      const key = div('key');
      key.style.borderColor = s.colour;
      tip.append(div('row', key, div('v', s.alpha[i].toFixed(2)), div('n', s.name)));
    }
    if (envelope) tip.append(div('row', div('v', `${envelope.lo[i].toFixed(2)}–${envelope.hi[i].toFixed(2)}`), div('n', envelope.label)));
    tip.hidden = false;
    const left = (X(i) / W) * box.width;
    tip.style.left = `${Math.min(left + 12, box.width - 170)}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => {
    hair.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });

  const legend = div('alpha-legend');
  for (const s of series) {
    const key = div('key');
    key.style.borderColor = s.colour;
    const x = document.createElement('button');
    x.textContent = '✕';
    x.title = `Take ${s.name} off the graph`;
    x.addEventListener('click', () => onRemove(s.id));
    legend.append(div('item', key, s.name, x));
  }
  if (!series.length) legend.append(div('empty', 'Click a material below to plot its α here — up to six at once.'));
  wrap.append(svg, tip, legend);
  return wrap;
}

/** The spread of a set of materials' α, band by band: { lo, hi }. */
export function spread(materials) {
  return {
    lo: BANDS.map((_, i) => Math.min(...materials.map((m) => m.alpha[i]))),
    hi: BANDS.map((_, i) => Math.max(...materials.map((m) => m.alpha[i]))),
  };
}
