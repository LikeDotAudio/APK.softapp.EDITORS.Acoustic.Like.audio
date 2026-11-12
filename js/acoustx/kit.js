// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * ACOUSTIC X — the kit every window shares: the classic constants, the tiny
 * DOM kit (h, group, readout), the stylesheet, the title-bar glyph and the
 * canvas kit (colours, axes, ticks). Nothing here holds a window's state.
 * Lifted out of acoustx.js (ROAD-3752).
 */
import { findAbsorber } from './database.js';
import { material as baseMaterial } from '../acoustics/materials.js';
import { topicFor } from './topics.js';

const material = (id) => findAbsorber(id) ?? baseMaterial(id);

const FT = 3.28084;
const FACES6 = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];
const FACE_LABEL = { floor: 'Floor', ceiling: 'Ceiling', front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall' };
export const ACX_LABEL = "Acoustic X (classic) — in the style of Pilchner-Schoustal's 1998 program";
const SVG = 'http://www.w3.org/2000/svg';
const FONT = '10px "MS Sans Serif", Tahoma, "Microsoft Sans Serif", Arial, sans-serif';

// ── tiny DOM kit ───────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'for') el.htmlFor = v;
    else if (k in el && !k.startsWith('data-')) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
/** Opens the topic pop-up for a legend; set by createAcousticX. */
let openTopic = null;
/**
 * A fieldset. When topics.js has a topic for its legend, the legend grows a
 * 📖 button that opens its history and sources.
 */
const group = (legend, ...kids) => {
  const topic = topicFor(legend);
  const book = topic ? h('button', { class: 'acx-topic', title: 'History and sources', onclick: (e) => (e.stopPropagation(), openTopic?.(legend, e.currentTarget)) }, '📖') : null;
  return h('fieldset', {}, h('legend', {}, legend, book), ...kids);
};
/** A sunken read-only value. Its own class: the app's .readout is absolutely placed, and must never reach in here. */
const readout = (title) => h('span', { class: 'acx-ro', title });
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function injectCss() {
  if (document.querySelector('link[data-acx]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('../../css/acoustx.css', import.meta.url).href, 'data-acx': '1' }));
}

/** A generic loudspeaker glyph for the title bars — not the original program's icon. */
function icon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('class', 'ico');
  s.innerHTML = '<rect x="1.5" y="5.5" width="4" height="5" fill="#c0c0c0" stroke="#000"/><path d="M5.5 5.5 L10.5 1.5 L10.5 14.5 L5.5 10.5 Z" fill="#ffff00" stroke="#000"/><path d="M12.5 5 Q14.5 8 12.5 11" fill="none" stroke="#fff" stroke-width="1.2"/>';
  return s;
}

// ── canvas kit: black panels, grey grid and text, the original's colours ──

const COL = { grid: '#3c3c3c', text: '#a8a8a8', title: '#d0d0d0', frame: '#808080', green: '#00c000', lime: '#40ff40', red: '#ff2020', orange: '#ffa000', yellow: '#ffff00', grey: '#909090', white: '#ffffff', cyan: '#00ffff', purple: '#b040ff' };

function prep(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.round(r.width);
  const hh = Math.round(r.height);
  if (w < 20 || hh < 20) return null;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hh * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, hh);
  ctx.font = FONT;
  ctx.lineWidth = 1;
  return { ctx, w, h: hh };
}

/**
 * Grid, ticks and titles; returns the value → pixel maps. `xticks` are
 * [{ v, label }]; a categorical axis passes `cats` (labels) instead and gets
 * `slot(i)` → { x, w }.
 */
function axes(ctx, w, hh, o) {
  const pad = { l: 36, r: 10, t: 18, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = hh - pad.t - pad.b;
  const X = (v) => pad.l + (o.xlog ? Math.log(v / o.x0) / Math.log(o.x1 / o.x0) : (v - o.x0) / (o.x1 - o.x0)) * iw;
  const Xinv = (px) => (o.xlog ? o.x0 * (o.x1 / o.x0) ** ((px - pad.l) / iw) : o.x0 + ((px - pad.l) / iw) * (o.x1 - o.x0));
  const Y = (v) => pad.t + (1 - (clamp(v, o.y0, o.y1) - o.y0) / (o.y1 - o.y0)) * ih;
  const slot = (i) => ({ x: pad.l + (i * iw) / o.cats.length, w: iw / o.cats.length });
  ctx.strokeStyle = COL.grid;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  for (const v of o.yticks ?? []) {
    ctx.moveTo(pad.l, Math.round(Y(v)) + 0.5);
    ctx.lineTo(w - pad.r, Math.round(Y(v)) + 0.5);
  }
  for (const t of o.xticks ?? []) {
    ctx.moveTo(Math.round(X(t.v)) + 0.5, pad.t);
    ctx.lineTo(Math.round(X(t.v)) + 0.5, hh - pad.b);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.text;
  ctx.textAlign = 'right';
  for (const v of o.yticks ?? []) ctx.fillText(o.fmtY ? o.fmtY(v) : String(v), pad.l - 4, Y(v) + 3);
  ctx.textAlign = 'center';
  for (const t of o.xticks ?? []) ctx.fillText(t.label, X(t.v), hh - pad.b + 12);
  if (o.cats) o.cats.forEach((c, i) => ctx.fillText(c, slot(i).x + slot(i).w / 2, hh - pad.b + 12));
  ctx.strokeStyle = COL.frame;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, iw, ih);
  ctx.fillStyle = COL.title;
  ctx.textAlign = 'left';
  ctx.fillText(o.title ?? '', pad.l, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = COL.text;
  if (o.xLabel) ctx.fillText(o.xLabel, w - pad.r, hh - 3);
  ctx.textAlign = 'left';
  return { X, Xinv, Y, slot, pad, iw, ih };
}

/** Integer ticks for a count axis: a 1-2-5 step giving about six of them, and the top rounded up to one. */
function countTicks(maxV) {
  const raw = Math.max(1, maxV / 6);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((k) => k * p).find((k) => k >= raw));
  const max = Math.ceil(maxV / step) * step;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

const FREQ_TICKS = [16, 31.5, 63, 125, 250, 500, 1000].map((v) => ({ v, label: v >= 1000 ? `${v / 1000}k` : String(v) }));

/** createAcousticX sets the topic pop-up's opener here (group()'s 📖 calls it). */
export function setOpenTopic(fn) {
  openTopic = fn;
}

export { material, FT, FACES6, FACE_LABEL, SVG, FONT, h, group, readout, fmt, clamp, injectCss, icon, COL, prep, axes, countTicks, FREQ_TICKS };
