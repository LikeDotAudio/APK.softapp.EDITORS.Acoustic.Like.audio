// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { heightsAtXY } from '../acoustics/elevations.js';
import { DEG, pointInPolygon } from '../acoustics/geometry.js';
import { arrangedSpeakers } from '../acoustics/layouts.js';
import { rayPaths } from '../acoustics/rayPaths.js';
import { firstReflections, heatOf } from '../acoustics/reflectionPanels.js';
import { css, colourOf, turbo } from './paint.js';
import { fitCanvas } from './glyphs.js';
import { drawPatch } from './treatments.js';

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
 * A room cut by elevations drawn in the CAD is drawn as cut: every floor and
 * ceiling cell at its own height, every wall up to the ceiling above it.
 *
 * The treatments painted in the CAD sit on their surfaces as tinted panels,
 * lifted a few millimetres into the room and sorted by their nearest corner,
 * so the grid of field cells under one never paints over it.
 *
 * With a mix seat, each speaker's first reflections (the plan's rays, in 3-D):
 * box → bounce → seat, and a glow where each lands on a surface you can see —
 * the first Fresnel zone, hot when the bounce arrives nearly as loud as the
 * direct sound, cool when the box's pattern or a treatment tames it. The
 * highlighted arrangement soloes its own speakers'; select a speaker to see
 * only its own, labelled.
 */

export function createView3d({ canvas, store, engine }) {
  const cam = { yaw: -55, pitch: 32, dist: 1.9 };

  function basis(room) {
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: room.Hmax / 2 };
    const size = Math.max(room.L, room.W, room.Hmax);
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
    // ray tracing draws the paths over plain surfaces: the field under them would only fight them
    const tracing = store.state.settings.view === 'rays';
    const show = !tracing && store.state.settings.show.field && ok && store.state.speakers.length > 0;

    const level = (kind, x, y) => (room.sloped ? heightsAtXY(room, x, y)[kind] : kind === 'floor' ? 0 : room.H);
    /** A floor or ceiling as cells; `vals` null paints them flat. Each corner sits at its surface's height. */
    const plane = (g, vals, kind) => {
      const step = Math.max(1, Math.round(g.nx / 70));
      for (let j = 0; j < g.ny; j += step)
        for (let i = 0; i < g.nx; i += step) {
          const x = g.x0 + i * g.cell;
          const y = g.y1 - j * g.cell;
          const s = g.cell * step;
          let v = NaN;
          if (vals) {
            v = vals[j * g.nx + i];
            if (Number.isNaN(v)) continue;
          } else if (!pointInPolygon(x + s / 2, y - s / 2, room.poly)) continue;
          const P = (px, py) => ({ x: px, y: py, z: level(kind, px, py) });
          faces.push({ pts: [P(x, y), P(x + s, y), P(x + s, y - s), P(x, y - s)], fill: vals ? css(colourOf(v, scale)) : '#1b2130', kind });
        }
    };
    const cells = grids ?? out.grids;

    if (show) plane(grids.floor, values.floor, 'floor');
    else if (room.sloped && cells) plane(cells.floor, null, 'floor');
    else faces.push({ pts: room.poly.map((p) => ({ ...p, z: 0 })), fill: '#1b2130', kind: 'floor' });
    if (B.eye.z < room.Hmax) {
      if (show) plane(grids.ceiling, values.ceiling, 'ceiling');
      else if (room.sloped && cells) plane(cells.ceiling, null, 'ceiling');
      else faces.push({ pts: room.poly.map((p) => ({ ...p, z: room.H })), fill: '#1b2130', kind: 'ceiling' });
    }

    room.walls.forEach((wall, wi) => {
      const facing = (B.eye.x - wall.a.x) * wall.nIn.x + (B.eye.y - wall.a.y) * wall.nIn.y;
      if (facing < 0) return;
      const g = grids?.walls[wi];
      const P = (t, z) => ({ x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t, z });
      const span = (t) => {
        const p = P(t, 0);
        return room.sloped ? heightsAtXY(room, p.x, p.y) : { floor: 0, ceiling: room.H };
      };
      if (!show || !g) {
        const n = room.sloped ? 12 : 1;
        for (let i = 0; i < n; i++) {
          const a = span(i / n);
          const b = span((i + 1) / n);
          faces.push({ pts: [P(i / n, a.floor), P((i + 1) / n, b.floor), P((i + 1) / n, b.ceiling), P(i / n, a.ceiling)], fill: '#202838', kind: 'wall' });
        }
        return;
      }
      const vals = values.walls[wi];
      const step = Math.max(1, Math.round(g.nu / 60));
      for (let j = 0; j < g.nz; j += step)
        for (let i = 0; i < g.nu; i += step) {
          const t0 = i / g.nu;
          const t1 = Math.min(1, (i + step) / g.nu);
          const sp = span((t0 + t1) / 2);
          const z1 = Math.min(sp.ceiling, room.Hmax * (1 - j / g.nz));
          const z0 = Math.max(sp.floor, room.Hmax * (1 - (j + step) / g.nz));
          if (z1 <= z0) continue;
          const v = vals[j * g.nu + i];
          faces.push({ pts: [P(t0, z0), P(t1, z0), P(t1, z1), P(t0, z1)], fill: Number.isNaN(v) ? '#202838' : css(colourOf(v, scale)), kind: 'wall' });
        }
    });

    // the treatments: inward off their surface, so they are in front of it whichever way it is cut
    const lift = B.size * 0.004;
    const sel = store.state.selected?.kind === 'patch' ? store.state.selected.id : null;
    for (const p of room.patches ?? []) {
      let n;
      if (p.surface === 'floor') n = { x: 0, y: 0, z: 1 };
      else if (p.surface === 'ceiling') {
        if (B.eye.z >= room.Hmax) continue;
        n = { x: 0, y: 0, z: -1 };
      } else {
        const wall = room.walls[p.wall];
        if (!wall || (B.eye.x - wall.a.x) * wall.nIn.x + (B.eye.y - wall.a.y) * wall.nIn.y < 0) continue;
        n = { x: wall.nIn.x, y: wall.nIn.y, z: 0 };
      }
      faces.push({ pts: p.points3d.map((q) => ({ x: q.x + n.x * lift, y: q.y + n.y * lift, z: q.z + n.z * lift })), patch: p, selected: p.id === sel });
    }

    for (const f of faces) {
      f.s = f.pts.map(proj);
      // a patch by its nearest corner: after every cell of the surface it lies on, never before one
      f.depth = f.patch ? Math.min(...f.s.map((p) => p.depth)) - lift : f.s.reduce((a, p) => a + p.depth, 0) / f.s.length;
    }
    faces.sort((a, b) => b.depth - a.depth);
    for (const f of faces) {
      if (f.s.some((p) => p.depth <= 0.01)) continue;
      if (f.patch) {
        drawPatch(ctx, f.s, f.patch.material, { alpha: show ? 0.55 : 0.7, selected: f.selected });
        continue;
      }
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
    // the floor's and ceiling's edges, traced along each wall so a slope bends them
    const steps = room.sloped ? 16 : 1;
    for (const kind of ['floor', 'ceiling']) {
      ctx.beginPath();
      let first = true;
      for (const wall of room.walls)
        for (let i = 0; i <= steps; i++) {
          const x = wall.a.x + ((wall.b.x - wall.a.x) * i) / steps;
          const y = wall.a.y + ((wall.b.y - wall.a.y) * i) / steps;
          const s = proj({ x, y, z: level(kind, x, y) });
          if (first) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
          first = false;
        }
      ctx.closePath();
      ctx.stroke();
    }
    for (const p of room.poly) {
      const a = proj({ ...p, z: level('floor', p.x, p.y) });
      const b = proj({ ...p, z: level('ceiling', p.x, p.y) });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const { state } = store;
    const mix = state.mics.find((m) => m.mix);
    if (tracing) drawRays(ctx, proj, room, state, mix, w);
    else if (state.settings.show.rays && mix) {
      const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
      const rays = firstReflections(room, arrangedSpeakers(state.speakers, state.settings).filter((sp) => !picked || sp.id === picked), mix, state.settings.band ?? 2);
      const labelled = picked || rays.length <= 12;
      const seen = (r) => {
        if (r.surface === 'ceiling') return B.eye.z < room.Hmax;
        if (r.surface === 'floor') return B.eye.z > 0;
        const wall = room.walls[r.wall];
        return (B.eye.x - wall.a.x) * wall.nIn.x + (B.eye.y - wall.a.y) * wall.nIn.y >= 0;
      };
      for (const r of rays) {
        if (!seen(r)) continue;
        const wall = r.surface === 'wall' ? room.walls[r.wall] : null;
        const along = wall ? { x: wall.t.x, y: wall.t.y, z: 0 } : { x: 1, y: 0, z: 0 };
        const across = wall ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
        const radius = Math.min(1.2, r.zone);
        const ring = Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const [ca, sa] = [Math.cos(a) * radius, Math.sin(a) * radius];
          return proj({ x: r.hit.x + along.x * ca + across.x * sa, y: r.hit.y + along.y * ca + across.y * sa, z: r.hit.z + along.z * ca + across.z * sa });
        });
        const c = proj(r.hit);
        if (c.depth <= 0.01 || ring.some((q) => q.depth <= 0.01)) continue;
        const heat = heatOf(r);
        const rgb = turbo(heat);
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(2, ...ring.map((q) => Math.hypot(q.x - c.x, q.y - c.y))));
        g.addColorStop(0, css(rgb, 0.35 + 0.55 * heat));
        g.addColorStop(0.5, css(rgb, 0.15 + 0.3 * heat));
        g.addColorStop(1, css(rgb, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ring.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.fill();
        const a = proj(r.speaker);
        const m = proj(mix);
        ctx.strokeStyle = css(rgb, labelled ? 0.85 : 0.4);
        ctx.lineWidth = labelled ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        ctx.fillStyle = css(rgb);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (labelled) {
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillText(`+${r.delayMs.toFixed(1)} ms · ${r.db.toFixed(0)} dB${r.treated ? ' · treated' : ''}`, c.x + 6, c.y - 6);
        }
      }
    }
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

/** How far below the direct sound a path is still drawn, dB. */
const RAY_FLOOR_DB = 40;

/**
 * Ray tracing: every specular path up to the order the field is computed to
 * (3 at most — beyond that the picture is a haze), from each speaker of the
 * arrangement (the selected one alone when one is) to the mix seat, at the
 * current frequency. Colour and weight are the path's level against the
 * direct sound, so moving the frequency or sweeping shows which bounces
 * carry the low end and which the treatments take out at the top.
 */
function drawRays(ctx, proj, room, state, mix, w) {
  const { settings } = state;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#e5e7eb';
  const freq = settings.freq;
  const title = `RAY TRACING · ${freq < 1000 ? `${freq} Hz` : `${(freq / 1000).toFixed(1)} kHz`}`;
  if (!mix) {
    ctx.fillText(`${title} · place a mix seat to trace to`, 10, 18);
    return;
  }
  const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
  const order = Math.min(3, settings.maxOrder ?? 3);
  const paths = rayPaths(room, arrangedSpeakers(state.speakers, settings).filter((sp) => !picked || sp.id === picked), mix, freq, order).filter((p) => p.db > -RAY_FLOOR_DB);
  for (const p of paths) {
    const pts = p.pts.map(proj);
    if (pts.some((q) => q.depth <= 0.01)) continue;
    const heat = Math.max(0, Math.min(1, 1 + p.db / RAY_FLOOR_DB));
    const rgb = p.order ? turbo(heat) : [255, 255, 255];
    ctx.strokeStyle = css(rgb, 0.12 + 0.8 * heat * heat);
    ctx.lineWidth = p.order ? 0.6 + 1.6 * heat : 2;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.fillStyle = css(rgb, 0.3 + 0.6 * heat);
    for (const q of pts.slice(1, -1)) ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(`${title} · ${paths.length} paths to ${order}${order === 1 ? 'st' : order === 2 ? 'nd' : 'rd'} order within ${RAY_FLOOR_DB} dB of direct`, 10, 18);
  // the key: colour is the path's level against the direct sound
  const kw = Math.min(160, w - 20);
  for (let i = 0; i < kw; i++) {
    ctx.fillStyle = css(turbo(i / kw));
    ctx.fillRect(10 + i, 26, 1, 6);
  }
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(`−${RAY_FLOOR_DB} dB`, 10, 43);
  ctx.fillText('0 dB = direct', 10 + kw - 62, 43);
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
