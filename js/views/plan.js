// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from '../acoustics/bands.js';
import { criticalDistance } from '../acoustics/analysis.js';
import { mirrorPoint, segmentCross } from '../acoustics/geometry.js';
import { fromFrame } from '../acoustics/room.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { FACE_COLOURS, dashedLine, dragFrom, drawLabel, drawMic, drawSpeaker, fitCanvas } from './glyphs.js';
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
 */

export function createPlanView({ tile, iframe, store, engine, onDrag }) {
  const canvas = tile.querySelector('canvas.overlay');
  const capture = tile.querySelector('.capture');
  const hits = tile.querySelector('.hits');

  const k = () => METRES_PER_UNIT[store.state.cad.view?.units ?? store.state.cad.geometry?.units ?? 'm'] ?? 1;

  function toScreen(x, y) {
    const v = store.state.cad.view;
    if (!v) return { x: NaN, y: NaN };
    const off = iframe.offsetLeft;
    const offY = iframe.offsetTop;
    return { x: off + v.rect.left + (x / k()) * v.zoom + v.panX, y: offY + v.rect.top - (y / k()) * v.zoom + v.panY };
  }
  function toWorld(sx, sy) {
    const v = store.state.cad.view;
    const b = tile.getBoundingClientRect();
    const px = sx - b.left - iframe.offsetLeft - v.rect.left;
    const py = sy - b.top - iframe.offsetTop - v.rect.top;
    return { x: ((px - v.panX) / v.zoom) * k(), y: (-(py - v.panY) / v.zoom) * k() };
  }
  const pxPerMetre = () => (store.state.cad.view ? store.state.cad.view.zoom / k() : 1);

  capture.addEventListener('pointerdown', (e) => {
    if (!store.state.cad.view) return;
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
        el.title = 'Drag to move · Shift-drag to aim';
        el.addEventListener('pointerdown', (e) => startDrag(e, el));
        hits.appendChild(el);
      }
      const p = toScreen(d.x, d.y);
      el.style.transform = `translate(${p.x - 12}px, ${p.y - 12}px)`;
      el.style.display = Number.isFinite(p.x) ? '' : 'none';
    }
    for (const el of [...hits.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

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
    dragFrom(
      e,
      el,
      (ev) => {
        const p = toWorld(ev.clientX, ev.clientY);
        if (ev.shiftKey) {
          const aim = (Math.atan2(p.y - dev.y, p.x - dev.x) * 180) / Math.PI;
          store.update(kind, id, { aim: Math.round(aim) }, true);
        } else store.update(kind, id, { x: origin.x + p.x - start.x, y: origin.y + p.y - start.y }, true);
        onDrag(true);
      },
      () => {
        store.commit();
        onDrag(false);
      },
    );
  }

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const { state } = store;
    const out = engine.out;
    const v = state.cad.view;
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
    const onPlan = state.sheet === 'plan' || state.sheet === 'ceiling';
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

    const mix = state.mics.find((m) => m.mix);
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
        drawMic(ctx, p.x, p.y, (-m.aim * Math.PI) / 180, { mix: m.mix, selected: state.selected?.id === m.id, label: m.mix ? `MIX · ${m.name}` : m.name });
      }
    }
    ctx.restore();

    if (show.field && out.scale && state.speakers.length) {
      drawColourBar(ctx, left + 12, top + v.rect.height - 34, 180, 10, out.scale, planLabel(settings));
    }
    syncHits();
  }

  return { render, toScreen };
}

export function planLabel(settings) {
  if (settings.method === 'energy') return `energy ${BANDS[settings.band] >= 1000 ? `${BANDS[settings.band] / 1000}k` : BANDS[settings.band]} Hz`;
  return `${settings.method} ${settings.freq.toFixed(0)} Hz`;
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
