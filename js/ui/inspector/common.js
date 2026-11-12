// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — what its tabs share and nothing of their state: the tab list, the
 * material options, the number and band formats, the α spark, surface names and keys, and
 * the speaker helpers (aim, snap to a wall, the 38 % rule, the SBIR hint). Lifted out of
 * inspector.js (ROAD-3753).
 */
import { MATERIALS } from '../../acoustics/materials.js';
import { BANDS, C } from '../../acoustics/bands.js';
import { h } from '../dom.js';
import { DEG, distToSegment } from '../../acoustics/geometry.js';
import { fromFrame } from '../../acoustics/room.js';

const TABS = ['Room', 'Inspect', 'Acoustics', 'Build', 'Treatments', 'Furniture', 'Symmetry', 'Materials', 'Field', 'Layout', 'Subs', 'Advisor', 'File'];

const HOW_TO_TREAT = 'Treatments are placed in the CAD: click a wall’s elevation (or the ceiling) to open its drawing, pick a finish or a product from the Acoustic palette, then drag a region to fill it or click to drop a product. Each lands on that surface and mixes into its α and s.';

const MATERIAL_OPTIONS = [...new Set(MATERIALS.map((m) => m.category))].map((group) => ({
  group,
  items: MATERIALS.filter((m) => m.category === group).map((m) => ({ value: m.id, label: `${m.name} · α ${m.alpha.map((a) => a.toFixed(2)).join(' ')}` })),
}));

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const BAND_HEADS = BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b)));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Six octave bands of α as six bars: the shape of a material at a glance. */
const spark = (alpha) => h('span', { class: 'spark', title: `α ${alpha.map((a) => a.toFixed(2)).join(' ')}` }, ...alpha.map((a) => h('i', { style: `height:${Math.max(1, Math.round(a * 100))}%` })));

/** A surface's name as a person says it: 'left', or 'left 2' when the face has several walls. */
function surfaceLabel(room, key) {
  if (!key.startsWith('wall:')) return key;
  const i = +key.slice(5);
  const face = room.walls[i]?.face ?? '?';
  const same = room.walls.filter((w) => w.face === face);
  return same.length > 1 ? `${face} ${same.indexOf(room.walls[i]) + 1}` : face;
}

const surfaceKey = (piece) => (piece.surface === 'wall' ? `wall:${piece.wall}` : piece.surface);

/** Which CAD sheet shows a treatment: a wall's elevation, else the plan. */
const sheetOf = (face) => (['front', 'back', 'left', 'right', 'ceiling'].includes(face) ? face : 'plan');

function aimAt(d, target) {
  const dx = target.x - d.x;
  const dy = target.y - d.y;
  const aim = Math.atan2(dy, dx) / DEG;
  const tilt = Math.atan2(target.z - d.z, Math.hypot(dx, dy)) / DEG;
  return { aim: +aim.toFixed(1), tilt: +tilt.toFixed(1) };
}

function snapToWall(d, room) {
  let best = null;
  for (const w of room.walls) {
    const dist = distToSegment(d, w.a, w.b);
    if (!best || dist < best.dist) best = { w, dist };
  }
  const { w } = best;
  const t = Math.max(0, Math.min(1, ((d.x - w.a.x) * w.t.x + (d.y - w.a.y) * w.t.y) / w.len));
  return { x: w.a.x + w.t.x * w.len * t, y: w.a.y + w.t.y * w.len * t, aim: +(Math.atan2(w.nIn.y, w.nIn.x) / DEG).toFixed(1), mount: 'flush' };
}

function rule38(room, store) {
  const p = fromFrame(room, 0.38 * room.L, 0.5 * room.W);
  return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +(0.4 * room.H).toFixed(2), aim: store.state.settings.frontDeg };
}

function sbirHint(d, room) {
  let behind = Infinity;
  const fx = Math.cos(d.aim * DEG);
  const fy = Math.sin(d.aim * DEG);
  for (const w of room.walls) if (fx * w.nIn.x + fy * w.nIn.y > 0.5) behind = Math.min(behind, distToSegment(d, w.a, w.b));
  if (!Number.isFinite(behind)) return '';
  return `Free-standing ${behind.toFixed(2)} m in front of a wall: SBIR cancellation near ${(C / (4 * behind)).toFixed(0)} Hz. Flush mounting removes it and adds up to +6 dB below ${d.omniBelow || 300} Hz.`;
}

export { TABS, HOW_TO_TREAT, MATERIAL_OPTIONS, fmt, BAND_HEADS, cap, spark, surfaceLabel, surfaceKey, sheetOf, aimAt, snapToWall, rule38, sbirHint };
