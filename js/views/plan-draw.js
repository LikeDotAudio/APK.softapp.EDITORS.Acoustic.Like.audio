// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE PLAN — what it draws on its overlay: the wall marks, the furniture and its
 * preview, the walls popped out, the guides, the arrangement, the growth, aim rays,
 * the snap, the orbit, the turn, the sub map, the rings and the rays; and the plan's
 * label and nearest wall. Plain functions of what they are given. Lifted out of
 * plan.js (ROAD-3753); plan.js still exports planLabel, nearestWall,
 * drawFurnitureItem and drawFurniturePreview.
 */
import { BANDS, C } from '../acoustics/bands.js';
import { dashedLine, drawLabel, FACE_COLOURS } from './glyphs.js';
import { ACCENT } from '../brand.js';
import { PRODUCTS } from '../acoustics/materials.js';
import { pieceFootprint, piecesOf, pieceTop } from '../acoustics/pieces.js';
import { rgba } from './treatments.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { fromFrame } from '../acoustics/room.js';
import { goodFractions, nullLines } from './guides.js';
import { activeSet, arrayFront, layoutCentre, LAYOUTS, setColour } from '../acoustics/layouts.js';
import { DEG, mirrorPoint, segmentCross } from '../acoustics/geometry.js';

const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export function planLabel(settings) {
  if (settings.method === 'energy') return `energy ${BANDS[settings.band] >= 1000 ? `${BANDS[settings.band] / 1000}k` : BANDS[settings.band]} Hz`;
  return `${settings.method} ${settings.freq.toFixed(0)} Hz`;
}

/** The room as the CAD would show it, for when the CAD is in another window. */
/** The wall nearest p (metres) within `reach` metres, or null. */
export function nearestWall(room, p, reach) {
  let best = null;
  for (const w of room.walls) {
    const s = Math.max(0, Math.min(w.len, (p.x - w.a.x) * w.t.x + (p.y - w.a.y) * w.t.y));
    const d = Math.hypot(p.x - (w.a.x + w.t.x * s), p.y - (w.a.y + w.t.y * s));
    if (d <= reach && (!best || d < best.d)) best = { w, d };
  }
  return best?.w ?? null;
}

/**
 * The walls as things to touch: in Walls mode each one outlined and numbered,
 * the picked one lit with its length and what it was told it is; and always,
 * every opening — the space to the next piece of wall — with its width.
 */
function drawWallMarks(ctx, room, state, toScreen) {
  const picking = state.mode === 'pick-wall';
  const picked = state.selected?.kind === 'wall' ? state.selected.id : null;
  const at = (w, s) => toScreen(w.a.x + w.t.x * s, w.a.y + w.t.y * s);
  ctx.save();
  ctx.lineCap = 'round';
  room.walls.forEach((w, n) => {
    const on = w.key === picked;
    if (!on && !picking) return;
    const a = toScreen(w.a.x, w.a.y);
    const b = toScreen(w.b.x, w.b.y);
    ctx.strokeStyle = on ? '#ffffff' : 'rgba(125, 211, 252, .7)';
    ctx.lineWidth = on ? 5 : 3;
    ctx.shadowColor = on ? '#fff' : 'transparent';
    ctx.shadowBlur = on ? 8 : 0;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const m = at(w, w.len / 2);
    const text = `${n + 1} · ${w.face.toUpperCase()} · ${Math.round(w.len * 1000)} mm${on && w.note ? ` · ${w.note}` : ''}`;
    drawLabel(ctx, m.x + w.nIn.x * 16, m.y - w.nIn.y * 16, on ? text : String(n + 1), on ? '#ffffff' : '#7dd3fc', { force: on });
  });
  ctx.shadowBlur = 0;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  for (const w of room.walls) {
    for (const o of w.openings ?? []) {
      const a = at(w, o.from);
      const b = at(w, o.to);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      drawLabel(ctx, (a.x + b.x) / 2 + w.nIn.x * 14, (a.y + b.y) / 2 - w.nIn.y * 14, `opening ${Math.round(o.width * 1000)} mm`, ACCENT, { force: true });
    }
  }
  ctx.restore();
}

export function drawFurnitureItem(ctx, f, toScreen, ppm, selected = false) {
  const prod = PRODUCTS.find((p) => p.id === f.paletteId) || { name: f.paletteId, size: [1.8, 0.9] };
  const [wMetres, dMetres] = prod.size || [1.8, 0.9];
  const p = toScreen(f.x, f.y);
  if (!Number.isFinite(p.x)) return;
  const wPx = wMetres * ppm;
  const dPx = dMetres * ppm;
  const ang = (-(f.rotation || 0) * Math.PI) / 180;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);

  ctx.fillStyle = selected ? 'rgba(251, 191, 36, 0.25)' : 'rgba(30, 34, 42, 0.88)';
  ctx.strokeStyle = selected ? '#fbbf24' : 'rgba(251, 191, 36, 0.75)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  if (selected) {
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-wPx / 2, -dPx / 2, wPx, dPx, 3);
  else ctx.rect(-wPx / 2, -dPx / 2, wPx, dPx);
  ctx.fill();
  ctx.stroke();

  if (wPx > 24 && dPx > 16) {
    ctx.beginPath();
    ctx.strokeStyle = selected ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(-wPx / 2 + 2, -dPx / 2 + 2, wPx - 4, dPx - 4, 2);
    else ctx.rect(-wPx / 2 + 2, -dPx / 2 + 2, wPx - 4, dPx - 4);
    ctx.stroke();
  }
  const parts = piecesOf(f.paletteId);
  if (parts) drawPiecesPlan(ctx, parts, ppm);

  ctx.restore();

  const label = prod.name.replace(/ \d+×\d+.*$/, '');
  drawLabel(ctx, p.x, p.y, label, selected ? '#fbbf24' : '#e5e7eb', { force: selected });
}

/**
 * A product's pieces seen from above (acoustics/pieces.js), in its own frame
 * already set on the canvas: lowest first, so a cymbal shows over its drum.
 */
function drawPiecesPlan(ctx, parts, ppm) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  for (const pc of [...parts].sort((a, b) => pieceTop(a) - pieceTop(b))) {
    const pts = pieceFootprint(pc);
    // the canvas runs y down: the product's +y (away from the player) is up the screen
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * ppm, -y * ppm) : ctx.moveTo(x * ppm, -y * ppm)));
    ctx.closePath();
    ctx.fillStyle = rgba(pc.colour, 0.55);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFurniturePreview(ctx, paletteId, pos, room, toScreen, ppm) {
  const at = room ? clampInside(room, pos, CLEAR_M) : pos;
  const prod = PRODUCTS.find((p) => p.id === paletteId) || { name: paletteId, size: [1.8, 0.9] };
  const [wMetres, dMetres] = prod.size || [1.8, 0.9];
  const p = toScreen(at.x, at.y);
  if (!Number.isFinite(p.x)) return;
  const wPx = wMetres * ppm;
  const dPx = dMetres * ppm;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-wPx / 2, -dPx / 2, wPx, dPx, 4);
  else ctx.rect(-wPx / 2, -dPx / 2, wPx, dPx);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawLabel(ctx, p.x, p.y + dPx / 2 + 14, `+ ${prod.name}`, '#fbbf24', { force: true });
}

function drawWalls(ctx, room, toScreen) {
  ctx.save();
  ctx.strokeStyle = '#d4d4d4';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const w of room.walls) {
    const a = toScreen(w.a.x, w.a.y);
    const b = toScreen(w.b.x, w.b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlanGuides(ctx, room, show, toScreen) {
  const seg = (f1, l1, f2, l2) => [toScreen(...xy(fromFrame(room, f1, l1))), toScreen(...xy(fromFrame(room, f2, l2)))];
  const xy = (p) => [p.x, p.y];
  if (show.nulls) {
    for (const { n, f, colour } of nullLines(3)) {
      const [a, b] = seg(f * room.L, 0, f * room.L, room.W);
      dashedLine(ctx, a, b, colour, [2, 6], n === 1 ? 1.4 : 1);
      const [c, d] = seg(0, f * room.W, room.L, f * room.W);
      dashedLine(ctx, c, d, colour, [2, 6], n === 1 ? 1.4 : 1);
    }
  }
  if (show.guides) {
    // the recommended divisions, clear of every axial null up to n = 3 — where a drag settles
    for (const f of goodFractions(3)) {
      const [a, b] = seg(f * room.L, 0, f * room.L, room.W);
      dashedLine(ctx, a, b, '#4ade80', [1, 5], 1);
      const [c, d] = seg(0, f * room.W, room.L, f * room.W);
      dashedLine(ctx, c, d, '#4ade80', [1, 5], 1);
    }
    const [a, b] = seg(0.38 * room.L, 0, 0.38 * room.L, room.W);
    dashedLine(ctx, a, b, '#22c55e', [10, 4], 2);
    drawLabel(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, '38 % — ears here', '#22c55e');
    const [c, d] = seg(0, room.W / 2, room.L, room.W / 2);
    dashedLine(ctx, c, d, '#94a3b8', [14, 4, 2, 4], 1);
  }
}

/**
 * The speaker arrangement's references from the seat: a spoke to every
 * speaker's ideal bearing at the preset's radius, its tolerance window as a
 * shaded wedge, and the ring at ear height joined up — for stereo, the
 * listening triangle (±30°); for 5.1, the ring at 0, ±30° and ±110°.
 */
function drawArrangement(ctx, room, settings, mix, toScreen, ppm) {
  const layout = LAYOUTS[settings.layout?.preset];
  if (!layout) return;
  const seat = layoutCentre(mix ?? fromFrame(room, 0.38 * room.L, 0.5 * room.W), arrayFront(settings), settings.layout.offset);
  const r = settings.layout.radius ?? 2;
  const c = toScreen(seat.x, seat.y);
  const tint = setColour(settings, activeSet(settings));
  const at = (az, k = 1) => {
    const b = (arrayFront(settings) + az) * DEG;
    return toScreen(seat.x + r * k * Math.cos(b), seat.y + r * k * Math.sin(b));
  };
  ctx.save();
  ctx.strokeStyle = tint;
  ctx.fillStyle = tint;
  for (const s of layout.speakers) {
    if (s.top) continue;
    if (s.side !== 'C') {
      // the window this speaker may sit in
      const sign = Math.sign(s.az);
      const [lo, hi] = s.range;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      for (let a = lo; a <= hi + 1e-9; a += Math.max(1, (hi - lo) / 8)) {
        const p = at(sign * a, 1.06);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.1;
      ctx.fill();
    }
    const p = at(s.az);
    ctx.globalAlpha = s.el === 0 ? 0.9 : 0.45;
    ctx.setLineDash(s.el === 0 ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawLabel(ctx, p.x, p.y - 10, `${s.name} ${Math.abs(s.az)}°`, tint);
  }
  ctx.setLineDash([]);
  const bed = layout.speakers.filter((s) => s.el === 0).sort((a, b) => a.az - b.az);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  bed.forEach((s, i) => {
    const p = at(s.az);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  if (bed.length > 2) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * ppm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, c.x, c.y + r * ppm + 14, `${layout.label} · r ${r.toFixed(1)} m${mix ? '' : ' · no mix mic: seat at 38 %'}`, tint);
}

const GROW = '#f59e0b';

/**
 * The room the array would need (acoustics/roomFit.js), dashed: every wall
 * of a face that must move, set out by that face's growth, joined back to
 * where it stands now, and the move written on it.
 */
function drawGrowth(ctx, room, g, toScreen) {
  if (!g.any) return;
  const labelled = new Set();
  for (const w of room.walls) {
    const d = g[w.face];
    if (!d) continue;
    const out = (p) => ({ x: p.x - w.nIn.x * d, y: p.y - w.nIn.y * d });
    const b = { x: w.a.x + w.t.x * w.len, y: w.a.y + w.t.y * w.len };
    const [A, B, A2, B2] = [w.a, b, out(w.a), out(b)].map((p) => toScreen(p.x, p.y));
    dashedLine(ctx, A2, B2, GROW, [6, 4], 1.5);
    dashedLine(ctx, A, A2, GROW, [2, 3]);
    dashedLine(ctx, B, B2, GROW, [2, 3]);
    if (labelled.has(w.face)) continue;
    labelled.add(w.face);
    drawLabel(ctx, (A2.x + B2.x) / 2, (A2.y + B2.y) / 2, `${w.face} wall +${d.toFixed(2)} m`, GROW, { force: true });
  }
  if (g.up) {
    const c = toScreen(room.poly.reduce((t, p) => t + p.x, 0) / room.poly.length, room.poly.reduce((t, p) => t + p.y, 0) / room.poly.length);
    drawLabel(ctx, c.x, c.y - 24, `ceiling +${g.up.toFixed(2)} m`, GROW, { force: true });
  }
}

/** A device's aim as a ray out to the first wall it meets, its bearing written where it lands. */
function drawAimRay(ctx, room, d, colour, toScreen) {
  const far = { x: d.x + 1000 * Math.cos(d.aim * DEG), y: d.y + 1000 * Math.sin(d.aim * DEG) };
  let t = 1;
  for (const w of room?.walls ?? []) {
    const hit = segmentCross(d, far, w.a, w.b);
    if (hit && hit.t > 1e-6) t = Math.min(t, hit.t);
  }
  if (t === 1) return;
  const a = toScreen(d.x, d.y);
  const b = toScreen(d.x + (far.x - d.x) * t, d.y + (far.y - d.y) * t);
  ctx.save();
  ctx.globalAlpha = 0.7;
  dashedLine(ctx, a, b, colour, [5, 4], 1);
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
  drawLabel(ctx, b.x, b.y - 10, `${Math.round(wrap(d.aim))}°`, colour);
}

/** The division lines a dragged device has settled onto, across the whole room, and the crossing ringed. */
function drawSnapped(ctx, room, s, toScreen) {
  const at = (f, l) => {
    const p = fromFrame(room, f, l);
    return toScreen(p.x, p.y);
  };
  ctx.save();
  if (s.along !== null) dashedLine(ctx, at(s.along, 0), at(s.along, room.W), '#4ade80', [6, 3], 1.5);
  if (s.across !== null) dashedLine(ctx, at(0, s.across), at(room.L, s.across), '#4ade80', [6, 3], 1.5);
  if (s.along !== null && s.across !== null) {
    const c = at(s.along, s.across);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(ctx, c.x, c.y + 20, `${Math.round((s.along / room.L) * 100)} % × ${Math.round((s.across / room.W) * 100)} %`, '#4ade80', { force: true });
  }
  ctx.restore();
}

/** The hold-to-orbit read-out: the circle the speaker rides, its spoke and its partner's, angle, distance and toe. */
function drawOrbit(ctx, o, toScreen, ppm) {
  const c = toScreen(o.listener.x, o.listener.y);
  const at = (az) => {
    const b = (o.facing + az) * DEG;
    return toScreen(o.listener.x + o.dist * Math.cos(b), o.listener.y + o.dist * Math.sin(b));
  };
  ctx.save();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, o.dist * ppm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // the line the listener faces, which the partner mirrors across
  const f = at(0);
  dashedLine(ctx, c, f, '#94a3b8', [2, 4], 1);
  const p = at(o.az);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  if (o.partner) {
    const q = at(-o.az);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.restore();
  drawLabel(ctx, p.x, p.y - 22, `${o.name} · ${Math.abs(o.az)}° ${o.az > 0 ? 'left' : o.az < 0 ? 'right' : 'centre'} · ${o.dist.toFixed(2)} m · toe ${o.toe > 0 ? '+' : ''}${o.toe}°${o.partner ? ' · partner mirrored' : ''}`, '#22d3ee', { force: true });
}

/** The turn read-out: the nose's line out across the room, and the mark it is locked to. */
function drawTurning(ctx, t, m, toScreen, ppm) {
  if (!m) return;
  const c = toScreen(m.x, m.y);
  const b = (m.aim ?? 0) * DEG;
  const far = toScreen(m.x + 30 * Math.cos(b), m.y + 30 * Math.sin(b));
  const colour = t.mark ? '#fde047' : '#94a3b8';
  dashedLine(ctx, c, far, colour, t.mark ? [] : [3, 4], t.mark ? 1.5 : 1);
  const at = toScreen(m.x + Math.cos(b) * Math.max(0.6, 40 / ppm), m.y + Math.sin(b) * Math.max(0.6, 40 / ppm));
  drawLabel(ctx, at.x, at.y - 12, `${Math.round(wrap(m.aim ?? 0))}°${t.mark ? ` · ${t.mark}` : ''}`, colour, { force: true });
}

/** The sub crawl's map: every tried position as a square, green good → red bad, the best five numbered. */
function drawSubMap(ctx, subs, toScreen, ppm) {
  const scores = subs.cells.map((c) => c.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const size = Math.max(3, (subs.step ?? 0.25) * ppm);
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (const c of subs.cells) {
    const t = hi > lo ? (c.score - lo) / (hi - lo) : 0;
    ctx.fillStyle = `hsl(${120 * (1 - t)}, 75%, 45%)`;
    const p = toScreen(c.x, c.y);
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  (subs.best ?? []).forEach((b, i) => {
    const p = toScreen(b.x, b.y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(ctx, p.x, p.y - 14, `SUB #${i + 1}`, '#bbf7d0');
  });
  ctx.restore();
}

function drawRings(ctx, s, p, ppm, settings) {
  const steps = [0.5, 1, 2, 5, 10, 20];
  const step = steps.find((m) => m * ppm >= 60) ?? 20;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.setLineDash([1, 3]);
  for (let r = step; r <= step * 6; r += step) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * ppm, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(ctx, p.x + r * ppm * 0.707, p.y - r * ppm * 0.707, `${r} m · ${((r / C) * 1000).toFixed(1)} ms · −${(20 * Math.log10(r)).toFixed(0)} dB`, '#cbd5e1');
  }
  ctx.restore();
}

/** First-order wall reflections from one speaker to the mix position, labelled with their extra delay. */
function drawRays(ctx, room, s, mic, toScreen, labelled) {
  const direct = Math.hypot(s.x - mic.x, s.y - mic.y, s.z - mic.z);
  for (const w of room.walls) {
    const side = (s.x - w.a.x) * w.nIn.x + (s.y - w.a.y) * w.nIn.y;
    if (side <= 0) continue;
    const img = mirrorPoint(s, w.a, w.nIn);
    const hit = segmentCross(img, mic, w.a, w.b);
    if (!hit) continue;
    const P = { x: w.a.x + (w.b.x - w.a.x) * hit.u, y: w.a.y + (w.b.y - w.a.y) * hit.u };
    const path = Math.hypot(Math.hypot(img.x - mic.x, img.y - mic.y), s.z - mic.z);
    const a = toScreen(s.x, s.y);
    const b = toScreen(P.x, P.y);
    const c = toScreen(mic.x, mic.y);
    ctx.save();
    ctx.strokeStyle = FACE_COLOURS[w.face];
    ctx.globalAlpha = labelled ? 0.85 : 0.3;
    ctx.lineWidth = labelled ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.fillStyle = FACE_COLOURS[w.face];
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (labelled) drawLabel(ctx, b.x, b.y - 10, `+${(((path - direct) / C) * 1000).toFixed(1)} ms`, FACE_COLOURS[w.face]);
  }
}

export { wrap, drawWallMarks, drawPiecesPlan, drawWalls, drawPlanGuides, drawArrangement, GROW, drawGrowth, drawAimRay, drawSnapped, drawOrbit, drawTurning, drawSubMap, drawRings, drawRays };
