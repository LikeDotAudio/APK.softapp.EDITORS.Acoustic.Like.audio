// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { DEG } from '../acoustics/geometry.js';
import { css, colourOf } from './paint.js';
import { fitCanvas } from './glyphs.js';

/**
 * THE ROOM IN 3-D
 *
 * The same six fields, folded back into the box: a cut-away seen from outside,
 * the walls between you and the room left off so the far ones and the floor
 * show their surface field — the Treble-style picture of standing waves on
 * the boundaries. No library: each face is drawn as its grid of cells, a few
 * thousand quads, painter-sorted, on a plain 2-D canvas, so the app runs from
 * the OS with nothing to fetch.
 *
 * Drag to orbit, wheel to zoom. Ceiling shows when the camera is under it.
 */

export function createView3d({ canvas, store, engine }) {
  const cam = { yaw: -55, pitch: 32, dist: 1.9 };

  function basis(room) {
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: room.H / 2 };
    const size = Math.max(room.L, room.W, room.H);
    const yaw = (cam.yaw + store.state.settings.frontDeg - 90) * DEG;
    const pitch = cam.pitch * DEG;
    const eye = {
      x: c.x + Math.cos(pitch) * Math.cos(yaw) * size * cam.dist * -1,
      y: c.y + Math.cos(pitch) * Math.sin(yaw) * size * cam.dist * -1,
      z: c.z + Math.sin(pitch) * size * cam.dist,
    };
    const fwd = norm({ x: c.x - eye.x, y: c.y - eye.y, z: c.z - eye.z });
    const right = norm(cross(fwd, { x: 0, y: 0, z: 1 }));
    const up = cross(right, fwd);
    return { c, eye, fwd, right, up, size };
  }

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const out = engine.out;
    const room = out.room;
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, w, h);
    if (!room) return;
    const B = basis(room);
    const focal = Math.min(w, h) * 1.1;
    const proj = (p) => {
      const d = { x: p.x - B.eye.x, y: p.y - B.eye.y, z: p.z - B.eye.z };
      const zc = dot(d, B.fwd);
      return { x: w / 2 + (dot(d, B.right) / zc) * focal, y: h / 2 - (dot(d, B.up) / zc) * focal, depth: zc };
    };

    const faces = [];
    const values = out.values;
    const grids = out.fieldGrids;
    const ok = values && grids && out.fieldRoom?.walls.length === room.walls.length;
    const scale = out.scale;
    const show = store.state.settings.show.field && ok && store.state.speakers.length > 0;

    const plane = (g, vals, z, kind) => {
      const step = Math.max(1, Math.round(g.nx / 70));
      for (let j = 0; j < g.ny; j += step)
        for (let i = 0; i < g.nx; i += step) {
          const v = vals[j * g.nx + i];
          if (Number.isNaN(v)) continue;
          const x = g.x0 + i * g.cell;
          const y = g.y1 - j * g.cell;
          const s = g.cell * step;
          faces.push({ pts: [{ x, y, z }, { x: x + s, y, z }, { x: x + s, y: y - s, z }, { x, y: y - s, z }], fill: css(colourOf(v, scale)), kind });
        }
    };

    if (show) plane(grids.floor, values.floor, 0, 'floor');
    else faces.push({ pts: room.poly.map((p) => ({ ...p, z: 0 })), fill: '#1b2130', kind: 'floor' });
    if (B.eye.z < room.H) {
      if (show) plane(grids.ceiling, values.ceiling, room.H, 'ceiling');
      else faces.push({ pts: room.poly.map((p) => ({ ...p, z: room.H })), fill: '#1b2130', kind: 'ceiling' });
    }

    room.walls.forEach((wall, wi) => {
      const facing = (B.eye.x - wall.a.x) * wall.nIn.x + (B.eye.y - wall.a.y) * wall.nIn.y;
      if (facing < 0) return;
      const g = grids?.walls[wi];
      if (!show || !g) {
        faces.push({ pts: [{ ...wall.a, z: 0 }, { ...wall.b, z: 0 }, { ...wall.b, z: room.H }, { ...wall.a, z: room.H }], fill: '#202838', kind: 'wall' });
        return;
      }
      const vals = values.walls[wi];
      const step = Math.max(1, Math.round(g.nu / 60));
      for (let j = 0; j < g.nz; j += step)
        for (let i = 0; i < g.nu; i += step) {
          const t0 = i / g.nu;
          const t1 = Math.min(1, (i + step) / g.nu);
          const z1 = room.H * (1 - j / g.nz);
          const z0 = Math.max(0, room.H * (1 - (j + step) / g.nz));
          const P = (t, z) => ({ x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t, z });
          const v = vals[j * g.nu + i];
          faces.push({ pts: [P(t0, z0), P(t1, z0), P(t1, z1), P(t0, z1)], fill: Number.isNaN(v) ? '#202838' : css(colourOf(v, scale)), kind: 'wall' });
        }
    });

    for (const f of faces) {
      f.s = f.pts.map(proj);
      f.depth = f.s.reduce((a, p) => a + p.depth, 0) / f.s.length;
    }
    faces.sort((a, b) => b.depth - a.depth);
    for (const f of faces) {
      if (f.s.some((p) => p.depth <= 0.01)) continue;
      ctx.beginPath();
      f.s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      if (!show) {
        ctx.strokeStyle = '#334155';
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    for (const z of [0, room.H]) {
      ctx.beginPath();
      room.poly.forEach((p, i) => {
        const s = proj({ ...p, z });
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    for (const p of room.poly) {
      const a = proj({ ...p, z: 0 });
      const b = proj({ ...p, z: room.H });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const { state } = store;
    const devices = [
      ...state.speakers.map((d) => ({ d, colour: d.color, r: 6, label: d.role || d.name })),
      ...state.mics.map((d) => ({ d, colour: d.mix ? '#ff3b3b' : '#e5e7eb', r: 5, label: d.mix ? 'MIX' : d.name })),
    ]
      .map((o) => ({ ...o, s: proj(o.d), base: proj({ ...o.d, z: 0 }) }))
      .sort((a, b) => b.s.depth - a.s.depth);
    for (const o of devices) {
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(o.base.x, o.base.y);
      ctx.lineTo(o.s.x, o.s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (o.d.aim !== undefined) {
        const L = B.size * 0.08;
        const tip = proj({
          x: o.d.x + Math.cos(o.d.aim * DEG) * Math.cos(o.d.tilt * DEG) * L,
          y: o.d.y + Math.sin(o.d.aim * DEG) * Math.cos(o.d.tilt * DEG) * L,
          z: o.d.z + Math.sin(o.d.tilt * DEG) * L,
        });
        ctx.strokeStyle = o.colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(o.s.x, o.s.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      ctx.fillStyle = o.colour;
      ctx.strokeStyle = state.selected?.id === o.d.id ? '#fff' : '#000';
      ctx.lineWidth = state.selected?.id === o.d.id ? 2 : 1;
      ctx.beginPath();
      ctx.arc(o.s.x, o.s.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(o.label, o.s.x + 8, o.s.y - 6);
    }
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '11px system-ui';
    ctx.fillText('3-D cut-away · drag to orbit · wheel to zoom', 10, h - 10);
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const { yaw, pitch } = cam;
    const move = (ev) => {
      cam.yaw = yaw - (ev.clientX - x0) * 0.4;
      cam.pitch = Math.max(-10, Math.min(85, pitch + (ev.clientY - y0) * 0.3));
      render();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.dist = Math.max(0.8, Math.min(5, cam.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
      render();
    },
    { passive: false },
  );

  return { render };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
