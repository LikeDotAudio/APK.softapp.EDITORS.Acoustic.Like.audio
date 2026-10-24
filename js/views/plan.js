// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from '../acoustics/bands.js';
import { criticalDistance } from '../acoustics/analysis.js';
import { DEG, mirrorPoint, segmentCross } from '../acoustics/geometry.js';
import { LAYOUTS } from '../acoustics/layouts.js';
import { fromFrame } from '../acoustics/room.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { MIC_PRESETS, isListener } from '../acoustics/devices.js';
import { mirrorName } from '../acoustics/symmetry.js';
import { FACE_COLOURS, dashedLine, dragFrom, drawLabel, drawMic, drawPerson, drawSpeaker, fitCanvas } from './glyphs.js';
import { nullLines } from './guides.js';
import { drawColourBar, gridCanvas } from './paint.js';

/**
 * THE PLAN IS THE CAD
 *
 * This view draws nothing of the drawing itself: the CAD does, live, in the
 * iframe underneath. What sits on top is ours — the field slice at ear
 * height, the speakers and mics, their reflections and guides — laid exactly
 * over the sheet using the transform the CAD's bridge sends every time it
 * pans or zooms. Drawing the room, editing it and mirroring it stay the CAD's
 * job; the overlay follows.
 *
 * While the CAD is on one of the walls' elevations (same file, another layer)
 * the overlay stands aside: there is no plan under it to lay anything on.
 *
 * The overlay takes no pointer events except on what it owns: a device can be
 * dragged (Shift-drag turns it), anywhere else the CAD gets the mouse. In a
 * placing mode a capture sheet covers the plan for the one click.
 *
 * With the CAD popped out into its own window there is no sheet under us,
 * so the plan draws its own: the room's walls, fitted to the tile, with the
 * same overlay on top — speakers and mics still go down and move here.
 */

export function createPlanView({ tile, iframe, store, engine, onDrag }) {
  const canvas = tile.querySelector('canvas.overlay');
  const capture = tile.querySelector('.capture');
  const hits = tile.querySelector('.hits');

  /** The CAD's own transform, or — popped out — one that fits the room to this tile. */
  function view() {
    if (!store.state.cad.popped) return store.state.cad.view;
    const room = engine.out.room;
    if (!room) return null;
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const width = tile.clientWidth;
    const height = tile.clientHeight;
    const ppm = Math.max(1, Math.min((width - 80) / Math.max(x1 - x0, 0.1), (height - 80) / Math.max(y1 - y0, 0.1)));
    return { zoom: ppm * k(), panX: width / 2 - ((x0 + x1) / 2) * ppm, panY: height / 2 + ((y0 + y1) / 2) * ppm, rect: { left: 0, top: 0, width, height } };
  }

  const k = () => METRES_PER_UNIT[store.state.cad.view?.units ?? store.state.cad.geometry?.units ?? 'm'] ?? 1;

  function toScreen(x, y) {
    const v = view();
    if (!v) return { x: NaN, y: NaN };
    const off = iframe.offsetLeft;
    const offY = iframe.offsetTop;
    return { x: off + v.rect.left + (x / k()) * v.zoom + v.panX, y: offY + v.rect.top - (y / k()) * v.zoom + v.panY };
  }
  function toWorld(sx, sy) {
    const v = view();
    const b = tile.getBoundingClientRect();
    const px = sx - b.left - iframe.offsetLeft - v.rect.left;
    const py = sy - b.top - iframe.offsetTop - v.rect.top;
    return { x: ((px - v.panX) / v.zoom) * k(), y: (-(py - v.panY) / v.zoom) * k() };
  }
  const pxPerMetre = () => {
    const v = view();
    return v ? v.zoom / k() : 1;
  };

  capture.addEventListener('pointerdown', (e) => {
    if (!view()) return;
    const p = toWorld(e.clientX, e.clientY);
    const room = engine.out.room;
    const { mode, placeKind } = store.state;
    if (mode === 'place-speaker') store.addSpeaker(placeKind.speaker, { x: p.x, y: p.y, z: placeKind.speaker === 'sub' ? 0.3 : 1.2 }, { aim: store.state.settings.frontDeg + 180 });
    else if (mode === 'place-mic') store.addMic(placeKind.mic, { x: p.x, y: p.y, z: room ? +(room.H * 0.4).toFixed(2) : 1.2 }, { aim: store.state.settings.frontDeg });
    if (!e.shiftKey) store.setMode('cad');
  });

  /** Hit targets: one absolutely-placed div per device, the only things here that take the mouse. */
  function syncHits() {
    const { speakers, mics } = store.state;
    const want = [...speakers.map((d) => ['speaker', d]), ...mics.map((d) => ['mic', d])];
    const seen = new Set();
    for (const [kind, d] of want) {
      seen.add(d.id);
      let el = hits.querySelector(`[data-id="${d.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hit';
        el.dataset.id = d.id;
        el.dataset.kind = kind;
        el.title = kind === 'speaker' ? 'Drag to move · Shift-drag to aim · press and HOLD to swing it round the listener (its partner mirrors, the wheel toes it in)' : 'Drag to move · Shift-drag to turn';
        el.addEventListener('pointerdown', (e) => startDrag(e, el));
        hits.appendChild(el);
      }
      const p = toScreen(d.x, d.y);
      el.style.transform = `translate(${p.x - 12}px, ${p.y - 12}px)`;
      el.style.display = Number.isFinite(p.x) ? '' : 'none';
    }
    for (const el of [...hits.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  /** The hold-to-orbit drag in progress, for render's read-out: { listener, dist, az, toe, id, partner }. */
  let orbit = null;
  const HOLD_MS = 380;

  function startDrag(e, el) {
    e.preventDefault();
    e.stopPropagation();
    const kind = el.dataset.kind;
    const id = el.dataset.id;
    store.select({ kind, id });
    const list = kind === 'speaker' ? store.state.speakers : store.state.mics;
    const dev = list.find((d) => d.id === id);
    const start = toWorld(e.clientX, e.clientY);
    const origin = { x: dev.x, y: dev.y };
    const sx = e.clientX;
    const sy = e.clientY;
    const listener = store.state.mics.find((m) => m.mix) ?? store.state.mics.find(isListener);
    let held = false;
    let moved = false;
    // Press and hold a speaker: it swings round the listener instead of sliding.
    const timer = kind === 'speaker' && listener ? setTimeout(() => {
      if (moved) return;
      held = true;
      el.classList.add('holding');
      orbit = beginOrbit(dev, listener);
      render();
    }, HOLD_MS) : 0;
    const wheel = (ev) => {
      if (!held) return;
      ev.preventDefault();
      orbit.toe += ev.deltaY < 0 ? 1 : -1;
      applyOrbit(orbit, orbit.last ?? { x: dev.x, y: dev.y }, ev.shiftKey);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    dragFrom(
      e,
      el,
      (ev) => {
        if (!held && !moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        moved = true;
        const p = toWorld(ev.clientX, ev.clientY);
        if (held) applyOrbit(orbit, p, ev.shiftKey);
        else if (ev.shiftKey) {
          const aim = (Math.atan2(p.y - dev.y, p.x - dev.x) * 180) / Math.PI;
          store.update(kind, id, { aim: Math.round(aim) }, true);
        } else store.update(kind, id, { x: origin.x + p.x - start.x, y: origin.y + p.y - start.y }, true);
        onDrag(true);
      },
      () => {
        clearTimeout(timer);
        el.removeEventListener('wheel', wheel);
        el.classList.remove('holding');
        orbit = null;
        store.commit();
        onDrag(false);
      },
    );
  }

  /** The speaker's partner across the listener: its pair, else the speaker whose role is its mirror (L ↔ R). */
  function beginOrbit(dev, listener) {
    const others = store.state.speakers.filter((s) => s.id !== dev.id);
    const partner = (dev.pairId && others.find((s) => s.pairId === dev.pairId)) || (dev.role && mirrorName(dev.role) !== dev.role && others.find((s) => s.role === mirrorName(dev.role))) || null;
    const facing = listener.aim ?? store.state.settings.frontDeg;
    const bearing = Math.atan2(dev.y - listener.y, dev.x - listener.x) / DEG;
    // keep whatever toe-in it has now, relative to pointing straight at the listener
    const toe = Math.round(((dev.aim - (bearing + 180) + 540) % 360) - 180);
    return { listener, facing, id: dev.id, z: dev.z, partner: partner?.id ?? null, name: dev.role || dev.name, toe, dist: Math.hypot(dev.x - listener.x, dev.y - listener.y), az: wrap(bearing - facing) };
  }

  /** Put the held speaker at the pointer's angle and distance from the listener, aimed at the ears; its partner mirrored. */
  function applyOrbit(o, p, coarse) {
    const L = o.listener;
    o.last = p;
    const step = coarse ? 5 : 1;
    o.az = Math.round(wrap(Math.atan2(p.y - L.y, p.x - L.x) / DEG - o.facing) / step) * step;
    o.dist = Math.max(0.3, Math.round(Math.hypot(p.x - L.x, p.y - L.y) / 0.05) * 0.05);
    const place = (az, toe) => {
      const b = (o.facing + az) * DEG;
      const x = L.x + o.dist * Math.cos(b);
      const y = L.y + o.dist * Math.sin(b);
      return { x: +x.toFixed(3), y: +y.toFixed(3), aim: +wrap(o.facing + az + 180 + toe).toFixed(1), tilt: +(Math.atan2(L.z - o.z, o.dist) / DEG).toFixed(1) };
    };
    const patches = [{ id: o.id, ...place(o.az, o.toe) }];
    if (o.partner) patches.push({ id: o.partner, ...place(-o.az, -o.toe) });
    store.updateMany('speaker', patches, true);
  }

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const { state } = store;
    const out = engine.out;
    const v = view();
    capture.classList.toggle('on', state.mode !== 'cad');
    capture.dataset.mode = state.mode;
    if (!v || !out.room) {
      ctx.fillStyle = '#888';
      ctx.font = '12px system-ui';
      ctx.fillText(state.cad.connected ? 'Waiting for the CAD view…' : 'Loading CAD.Like.audio…', 16, 24);
      return;
    }
    // On an elevation the sheet under us is a wall, not the plan: our plan-frame overlay would land on it.
    // The ceiling sheet is the plan with another layer current: the overlay still fits it.
    const onPlan = state.cad.popped || state.sheet === 'plan' || state.sheet === 'ceiling';
    hits.hidden = !onPlan;
    if (!onPlan) return;
    const room = out.room;
    const { settings } = state;
    const show = settings.show;
    const left = iframe.offsetLeft + v.rect.left;
    const top = iframe.offsetTop + v.rect.top;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, v.rect.width, v.rect.height);
    ctx.clip();

    if (state.cad.popped) drawWalls(ctx, room, toScreen);

    if (show.field && out.values && out.fieldGrids) {
      const g = out.fieldGrids.plan;
      const img = gridCanvas(out.values.plan, g.nx, g.ny, out.scale, 0.62);
      const a = toScreen(g.x0, g.y1);
      const b = toScreen(g.x0 + g.nx * g.cell, g.y1 - g.ny * g.cell);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y);
    }

    if (out.virtual) {
      ctx.save();
      ctx.strokeStyle = '#7dd3fc';
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      room.poly.forEach((p, i) => {
        const s = toScreen(p.x, p.y);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      const c = toScreen(room.poly[0].x, room.poly[0].y);
      drawLabel(ctx, c.x + 80, c.y + 14, 'virtual room — draw a closed plan in the CAD', '#7dd3fc');
    }

    // The CAD draws the floor's treatments itself; the selected one is only outlined, so the list and the sheet meet.
    const sel = state.selected?.kind === 'patch' ? state.selected.id : null;
    for (const p of sel ? room.patches ?? [] : []) {
      if (p.id !== sel || p.surface !== 'floor') continue;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      p.points3d.forEach((q, i) => {
        const s = toScreen(q.x, q.y);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (show.guides || show.nulls) drawPlanGuides(ctx, room, show, toScreen);
    if (out.subs?.cells?.length) drawSubMap(ctx, out.subs, toScreen, pxPerMetre());

    const mix = state.mics.find((m) => m.mix);
    if (show.arrangement !== false) drawArrangement(ctx, room, settings, mix, toScreen, pxPerMetre());
    const band = settings.band;
    for (const s of state.speakers) {
      const p = toScreen(s.x, s.y);
      if (show.coverage && s.kind !== 'sub') {
        const half = ((s.pattern === 'horn' ? s.hCov : s.pattern === 'cardioid' ? 180 : 360) / 2) * (Math.PI / 180);
        const r = 2.5 * pxPerMetre();
        const a = (-s.aim * Math.PI) / 180;
        ctx.save();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r, a - half, a + half);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = s.color;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.restore();
      }
      if (show.rc) {
        const rc = criticalDistance(room, s, band) * pxPerMetre();
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rc, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (show.rings && state.selected?.id === s.id) drawRings(ctx, s, p, pxPerMetre(), settings);
      // Every box's reflections at once is a hairball: the selected speaker's, labelled, or all of them faint.
      const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
      if (show.rays && mix && (!picked || picked === s.id)) drawRays(ctx, room, s, mix, toScreen, Boolean(picked));
    }

    if (show.devices) {
      for (const s of state.speakers) {
        const p = toScreen(s.x, s.y);
        drawSpeaker(ctx, p.x, p.y, (-s.aim * Math.PI) / 180, s.color, { selected: state.selected?.id === s.id, label: s.role || s.name });
      }
      for (const m of state.mics) {
        const p = toScreen(m.x, m.y);
        const ang = (-m.aim * Math.PI) / 180;
        const label = m.mix ? `MIX · ${m.name}` : m.name;
        if (isListener(m)) drawPerson(ctx, p.x, p.y, ang, { ppm: pxPerMetre(), colour: MIC_PRESETS[m.kind].colour, mix: m.mix, selected: state.selected?.id === m.id, label });
        else drawMic(ctx, p.x, p.y, ang, { mix: m.mix, selected: state.selected?.id === m.id, label });
      }
    }
    if (orbit) drawOrbit(ctx, orbit, toScreen, pxPerMetre());
    ctx.restore();

    if (show.field && out.scale && state.speakers.length) {
      drawColourBar(ctx, left + 12, top + v.rect.height - 34, 180, 10, out.scale, planLabel(settings));
    }
    syncHits();
  }

  return { render, toScreen };
}

const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export function planLabel(settings) {
  if (settings.method === 'energy') return `energy ${BANDS[settings.band] >= 1000 ? `${BANDS[settings.band] / 1000}k` : BANDS[settings.band]} Hz`;
  return `${settings.method} ${settings.freq.toFixed(0)} Hz`;
}

/** The room as the CAD would show it, for when the CAD is in another window. */
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
  const seat = mix ?? fromFrame(room, 0.38 * room.L, 0.5 * room.W);
  const r = settings.layout.radius ?? 2;
  const c = toScreen(seat.x, seat.y);
  const at = (az, k = 1) => {
    const b = (settings.frontDeg + az) * DEG;
    return toScreen(seat.x + r * k * Math.cos(b), seat.y + r * k * Math.sin(b));
  };
  ctx.save();
  ctx.strokeStyle = '#fde047';
  ctx.fillStyle = 'rgba(253, 224, 71, 0.10)';
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
    drawLabel(ctx, p.x, p.y - 10, `${s.name} ${Math.abs(s.az)}°`, '#fde047');
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
  drawLabel(ctx, c.x, c.y + r * ppm + 14, `${layout.label} · r ${r.toFixed(1)} m${mix ? '' : ' · no mix mic: seat at 38 %'}`, '#fde047');
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
  drawLabel(ctx, p.x, p.y - 22, `${o.name} · ${Math.abs(o.az)}° ${o.az > 0 ? 'left' : o.az < 0 ? 'right' : 'centre'} · ${o.dist.toFixed(2)} m · toe ${o.toe > 0 ? '+' : ''}${o.toe}°${o.partner ? ' · partner mirrored' : ''}`, '#22d3ee');
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
