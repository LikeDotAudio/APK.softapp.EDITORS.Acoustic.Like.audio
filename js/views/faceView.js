// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { DEG } from '../acoustics/geometry.js';
import { FACE_COLOURS, dashedLine, dragFrom, drawLabel, drawMic, drawSpeaker, fitCanvas } from './glyphs.js';
import { nullLines } from './guides.js';
import { drawColourBar, gridCanvas, sampleGrid } from './paint.js';
import { planLabel } from './plan.js';

/**
 * FIVE OF THE SIX DRAWINGS
 *
 * The reflected ceiling plan and the four elevations, each looking at its
 * face from inside the room, the way the Dolby Room Design Tool lays out its
 * side and front elevations. A wall's field is painted where the wall is: a
 * wall projects to a straight run in its elevation, so its grid stretches
 * exactly onto that run, splayed or not.
 *
 * Every speaker and mic appears in every view, projected. Dragging one in an
 * elevation moves it along the view's horizontal and sets its height — the one
 * thing the plan cannot.
 */

/** The axis pointing right in each elevation, as seen from inside the room. */
function rightAxis(room, face) {
  const { f, r } = room.frame;
  if (face === 'front') return r;
  if (face === 'back') return { x: -r.x, y: -r.y };
  if (face === 'left') return f;
  return { x: -f.x, y: -f.y };
}

const TITLES = { ceiling: 'Ceiling (reflected plan)', front: 'Front elevation', back: 'Back elevation', left: 'Left elevation', right: 'Right elevation' };

export function createFaceView({ tile, face, store, engine, onDrag }) {
  const canvas = tile.querySelector('canvas');
  const readout = tile.querySelector('.readout');
  let map = null;

  function layout(w, h, room) {
    const pad = 34;
    if (face === 'ceiling') {
      const xs = room.poly.map((p) => p.x);
      const ys = room.poly.map((p) => p.y);
      const u0 = Math.min(...xs);
      const u1 = Math.max(...xs);
      const v0 = Math.min(...ys);
      const v1 = Math.max(...ys);
      return fit(w, h, pad, u0, u1, v0, v1, (p) => ({ u: p.x, v: p.y }), (u, v, d) => ({ x: u, y: v, z: d.z }));
    }
    const ra = rightAxis(room, face);
    const us = room.poly.map((p) => p.x * ra.x + p.y * ra.y);
    return fit(w, h, pad, Math.min(...us), Math.max(...us), 0, room.H, (p) => ({ u: p.x * ra.x + p.y * ra.y, v: p.z }), (u, v, d) => {
      const du = u - (d.x * ra.x + d.y * ra.y);
      return { x: d.x + du * ra.x, y: d.y + du * ra.y, z: Math.max(0.05, Math.min(room.H - 0.05, v)) };
    }, ra);
  }

  function fit(w, h, pad, u0, u1, v0, v1, project, unproject, ra = null) {
    const s = Math.min((w - 2 * pad) / (u1 - u0 || 1), (h - 2 * pad) / (v1 - v0 || 1));
    const ox = (w - s * (u1 - u0)) / 2;
    const oy = (h - s * (v1 - v0)) / 2;
    const toS = (u, v) => ({ x: ox + (u - u0) * s, y: h - oy - (v - v0) * s });
    const toUV = (x, y) => ({ u: u0 + (x - ox) / s, v: v0 + (h - oy - y) / s });
    return { s, u0, u1, v0, v1, toS, toUV, project, unproject, ra };
  }

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const out = engine.out;
    const room = out.room;
    if (!room) return;
    const { state } = store;
    const { show } = state.settings;
    map = layout(w, h, room);
    const { toS } = map;

    const outline = new Path2D();
    if (face === 'ceiling') {
      room.poly.forEach((p, i) => {
        const s = toS(p.x, p.y);
        if (i) outline.lineTo(s.x, s.y);
        else outline.moveTo(s.x, s.y);
      });
      outline.closePath();
    } else {
      const a = toS(map.u0, 0);
      const b = toS(map.u1, room.H);
      outline.rect(a.x, b.y, b.x - a.x, a.y - b.y);
    }
    ctx.fillStyle = '#12151c';
    ctx.fill(outline);

    if (show.field && out.values && out.fieldGrids && out.fieldRoom?.walls.length === room.walls.length) {
      ctx.imageSmoothingEnabled = true;
      if (face === 'ceiling') {
        const g = out.fieldGrids.ceiling;
        const img = gridCanvas(out.values.ceiling, g.nx, g.ny, out.scale);
        const a = toS(g.x0, g.y1);
        const b = toS(g.x0 + g.nx * g.cell, g.y1 - g.ny * g.cell);
        ctx.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y);
      } else {
        out.fieldGrids.walls.forEach((g, i) => {
          if (g.face !== face) return;
          const wall = room.walls[g.wall];
          const ua = wall.a.x * map.ra.x + wall.a.y * map.ra.y;
          const ub = wall.b.x * map.ra.x + wall.b.y * map.ra.y;
          const img = gridCanvas(out.values.walls[i], g.nu, g.nz, out.scale);
          const p = toS(ua, room.H);
          const q = toS(ub, 0);
          ctx.save();
          if (ub < ua) {
            ctx.translate(p.x, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, p.y, p.x - q.x, q.y - p.y);
          } else ctx.drawImage(img, p.x, p.y, q.x - p.x, q.y - p.y);
          ctx.restore();
        });
      }
    }
    ctx.strokeStyle = FACE_COLOURS[face];
    ctx.lineWidth = 1.5;
    ctx.stroke(outline);

    drawGuides(ctx, room, show);
    drawDimensions(ctx, room);
    drawDevices(ctx, state);

    ctx.fillStyle = FACE_COLOURS[face];
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(TITLES[face], 10, 16);
    const mat = face === 'ceiling' ? room.ceiling : room.walls.find((x) => x.face === face)?.material;
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '10px system-ui';
    if (mat) ctx.fillText(mat.name, 10, 29);
    if (show.field && out.scale && state.speakers.length) drawColourBar(ctx, w - 150, h - 26, 140, 8, out.scale, planLabel(state.settings));
  }

  function drawGuides(ctx, room, show) {
    const { toS } = map;
    if (face === 'ceiling') {
      if (show.nulls) {
        const { f, r } = room.frame;
        for (const { n, f: fr, colour } of nullLines(3)) {
          const along = room.frame.front - fr * room.L;
          const across = room.frame.left + fr * room.W;
          const A = (s, q) => toS(s * f.x + q * r.x, s * f.y + q * r.y);
          dashedLine(ctx, A(along, room.frame.left), A(along, room.frame.right), colour, [2, 6], n === 1 ? 1.4 : 1);
          dashedLine(ctx, A(room.frame.front, across), A(room.frame.back, across), colour, [2, 6], n === 1 ? 1.4 : 1);
        }
      }
      return;
    }
    const x0 = toS(map.u0, 0).x;
    const x1 = toS(map.u1, 0).x;
    if (show.guides) {
      const a = toS(map.u0, 0.38 * room.H);
      const b = toS(map.u1, 0.42 * room.H);
      ctx.fillStyle = 'rgba(34,197,94,.13)';
      ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
      drawLabel(ctx, x0 + 62, b.y - 9, 'ears 38–42 % H', '#22c55e');
    }
    if (show.nulls) {
      for (const { n, f, colour } of nullLines(3)) {
        const y = toS(0, f * room.H).y;
        dashedLine(ctx, { x: x0, y }, { x: x1, y }, colour, [2, 6], n === 1 ? 1.4 : 1);
        // the horizontal dimension of this view: width for front/back, length for the sides
        const span = face === 'front' || face === 'back' ? 'W' : 'L';
        const u = map.u0 + f * (map.u1 - map.u0);
        const xs = toS(u, 0).x;
        dashedLine(ctx, { x: xs, y: toS(0, 0).y }, { x: xs, y: toS(0, room.H).y }, colour, [2, 6], n === 1 ? 1.4 : 1);
        if (n === 1) {
          drawLabel(ctx, x1 - 30, y - 9, 'H/2 null', colour);
          drawLabel(ctx, xs, toS(0, room.H).y + 10, `${span}/2`, colour);
        }
      }
    }
  }

  function drawDimensions(ctx, room) {
    const { toS } = map;
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px ui-monospace, monospace';
    const a = toS(map.u0, map.v1);
    const b = toS(map.u1, map.v1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 12);
    ctx.lineTo(b.x, b.y - 12);
    ctx.stroke();
    const horiz = face === 'ceiling' ? 'X' : face === 'front' || face === 'back' ? 'Width' : 'Length';
    ctx.textAlign = 'center';
    ctx.fillText(`${horiz} ${(map.u1 - map.u0).toFixed(2)} m`, (a.x + b.x) / 2, a.y - 16);
    const c = toS(map.u1, map.v0);
    ctx.save();
    ctx.translate(c.x + 14, (c.y + b.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${face === 'ceiling' ? 'Y' : 'Height'} ${(map.v1 - map.v0).toFixed(2)} m`, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function screenAngle(dev) {
    if (face === 'ceiling') return -dev.aim * DEG;
    const fx = Math.cos(dev.aim * DEG) * Math.cos(dev.tilt * DEG);
    const fy = Math.sin(dev.aim * DEG) * Math.cos(dev.tilt * DEG);
    const fz = Math.sin(dev.tilt * DEG);
    return Math.atan2(-fz, fx * map.ra.x + fy * map.ra.y);
  }

  function drawDevices(ctx, state) {
    if (!state.settings.show.devices) return;
    for (const s of state.speakers) {
      const { u, v } = map.project(s);
      const p = map.toS(u, v);
      drawSpeaker(ctx, p.x, p.y, screenAngle(s), s.color, { selected: state.selected?.id === s.id, label: s.role || s.name, size: 8 });
    }
    for (const m of state.mics) {
      const { u, v } = map.project(m);
      const p = map.toS(u, v);
      drawMic(ctx, p.x, p.y, screenAngle(m), { mix: m.mix, selected: state.selected?.id === m.id, label: m.mix ? 'MIX' : m.name, size: 6 });
    }
  }

  function pick(x, y) {
    if (!map) return null;
    let best = null;
    let bestD = 14;
    for (const [kind, list] of [['speaker', store.state.speakers], ['mic', store.state.mics]]) {
      for (const d of list) {
        const { u, v } = map.project(d);
        const p = map.toS(u, v);
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < bestD) {
          bestD = dist;
          best = { kind, dev: d };
        }
      }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const hit = pick(e.clientX - r.left, e.clientY - r.top);
    if (!hit) return;
    store.select({ kind: hit.kind, id: hit.dev.id });
    const dev0 = hit.dev;
    dragFrom(
      e,
      canvas,
      (ev) => {
        const { u, v } = map.toUV(ev.clientX - r.left, ev.clientY - r.top);
        const p = map.unproject(u, v, dev0);
        store.update(hit.kind, dev0.id, face === 'ceiling' ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z: +p.z.toFixed(3) }, true);
        onDrag(true);
      },
      () => {
        store.commit();
        onDrag(false);
      },
    );
  });

  canvas.addEventListener('pointermove', (e) => {
    const out = engine.out;
    if (!map || !out.values || !out.fieldGrids) return;
    const r = canvas.getBoundingClientRect();
    const { u, v } = map.toUV(e.clientX - r.left, e.clientY - r.top);
    let value = NaN;
    if (face === 'ceiling') {
      const g = out.fieldGrids.ceiling;
      value = sampleGrid(out.values.ceiling, g.nx, g.ny, (u - g.x0) / (g.nx * g.cell), (g.y1 - v) / (g.ny * g.cell));
    } else {
      out.fieldGrids.walls.forEach((g, i) => {
        if (g.face !== face) return;
        const wall = out.room.walls[g.wall];
        const ua = wall.a.x * map.ra.x + wall.a.y * map.ra.y;
        const ub = wall.b.x * map.ra.x + wall.b.y * map.ra.y;
        const t = (u - ua) / (ub - ua);
        if (t >= 0 && t <= 1) value = sampleGrid(out.values.walls[i], g.nu, g.nz, t, 1 - v / out.room.H);
      });
    }
    readout.textContent = Number.isFinite(value) ? `${value.toFixed(1)} dB · ${u.toFixed(2)} m, ${v.toFixed(2)} m` : `${u.toFixed(2)} m, ${v.toFixed(2)} m`;
  });
  canvas.addEventListener('pointerleave', () => {
    readout.textContent = '';
  });

  return { render };
}
