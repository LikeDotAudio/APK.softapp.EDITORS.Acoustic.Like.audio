// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { silhouette, silhouetteLoop } from '../acoustics/elevations.js';
import { DEG, pointInPolygon } from '../acoustics/geometry.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { FACE_COLOURS, dashedLine, deviceLabel, dragFrom, drawLabel, drawMic, drawSpeaker, fitCanvas } from './glyphs.js';
import { nullLines } from './guides.js';
import { gridCanvas, sampleGrid } from './paint.js';
import { drawPatch, patchName, shortName } from './treatments.js';

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
 *
 * The treatments painted in the CAD (a QRD, a panel, a cloud) are drawn on
 * their face over the field and the guides, under the devices; clicking one selects it, so
 * the inspector can say what it is and what it does.
 *
 * Clicking anywhere else jumps the CAD to that wall's elevation (the ceiling
 * jumps it back to the plan): the walls are drawn in the same CAD file, and a
 * sloped ceiling or raked floor drawn there is the outline this view shows.
 *
 * The drawing fills its tile; one caption line above it says what and how
 * big. Words go on the drawing only as it grows: the wheel zooms in on the
 * pointer, dragging the empty room pans, and the labels (ears, nulls, the
 * treatments' names, the devices' full names) come in once there is room.
 */

/** Cut a caption to what fits in `max` pixels, so it never runs into the one on the right. */
function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Pixels per drawing before each kind of word is allowed on it: the smaller side of the room as drawn. */
const DETAIL = { guides: 170, patches: 130, names: 260 };
const ZOOM_MAX = 12;
const CAPTION = 18;

/** The axis pointing right in each elevation, as seen from inside the room. */
function rightAxis(room, face) {
  const { f, r } = room.frame;
  if (face === 'front') return r;
  if (face === 'back') return { x: -r.x, y: -r.y };
  if (face === 'left') return f;
  return { x: -f.x, y: -f.y };
}

const TITLES = { plan: 'Plan', ceiling: 'Ceiling (reflected plan)', front: 'Front elevation', back: 'Back elevation', left: 'Left elevation', right: 'Right elevation' };

export function createFaceView({ tile, face, store, engine, onDrag, onJump, onPickPatch }) {
  // looking straight down or up: the plan (the tour draws it on its own, with no CAD under it) and the ceiling
  const top = face === 'plan' || face === 'ceiling';
  const canvas = tile.querySelector('canvas');
  const readout = tile.querySelector('.readout');
  let map = null;
  /** The patches drawn last frame, bottom first, as screen outlines — what a click or hover is tested against. */
  let drawn = [];
  /** The zoom: k = 1 fits the room; above it, (uc, vc) is the drawing point at the middle of the tile. */
  const view = { k: 1, uc: 0, vc: 0 };

  function layout(w, h, room) {
    const pad = 8;
    if (top) {
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
    return fit(w, h, pad, Math.min(...us), Math.max(...us), 0, room.Hmax, (p) => ({ u: p.x * ra.x + p.y * ra.y, v: p.z }), (u, v, d) => {
      const du = u - (d.x * ra.x + d.y * ra.y);
      return { x: d.x + du * ra.x, y: d.y + du * ra.y, z: Math.max(0.05, Math.min(room.Hmax - 0.05, v)) };
    }, ra);
  }

  function fit(w, h, pad, u0, u1, v0, v1, project, unproject, ra = null) {
    // the top keeps clear of the one caption line
    const top = CAPTION + 2;
    const s0 = Math.min((w - 2 * pad) / (u1 - u0 || 1), (h - top - pad) / (v1 - v0 || 1));
    const s = s0 * view.k;
    const cx = w / 2;
    const cy = top + (h - top - pad) / 2;
    const uc = view.k > 1 ? view.uc : (u0 + u1) / 2;
    const vc = view.k > 1 ? view.vc : (v0 + v1) / 2;
    const toS = (u, v) => ({ x: cx + (u - uc) * s, y: cy - (v - vc) * s });
    const toUV = (x, y) => ({ u: uc + (x - cx) / s, v: vc - (y - cy) / s });
    // how big the room is drawn, which decides how many words it can carry
    const detail = Math.min((u1 - u0) * s, (v1 - v0) * s);
    return { s, u0, u1, v0, v1, toS, toUV, project, unproject, ra, detail, cx, cy };
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
    if (top) {
      room.poly.forEach((p, i) => {
        const s = toS(p.x, p.y);
        if (i) outline.lineTo(s.x, s.y);
        else outline.moveTo(s.x, s.y);
      });
      outline.closePath();
    } else if (room.sloped) {
      silhouetteLoop(silhouette(room, face)).forEach((p, i) => {
        const s = toS(p.u, p.z);
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
      ctx.save();
      ctx.clip(outline);
      if (top) {
        const g = out.fieldGrids[face];
        const img = gridCanvas(out.values[face], g.nx, g.ny, out.scale);
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
          const p = toS(ua, room.Hmax);
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
      ctx.restore();
    }
    ctx.strokeStyle = FACE_COLOURS[face] ?? '#d4d4d4';
    ctx.lineWidth = 1.5;
    ctx.stroke(outline);

    drawGuides(ctx, room, show);
    // over the guides too: a panel on the wall is a thing in the room, the guides are only ideas about it
    drawPatches(ctx, room, state, outline);
    drawDevices(ctx, state);
    drawCaption(ctx, w, room, state);
  }

  /** One line: the view's name, its finish, its size in mm, and ✎ when the CAD is drawing it. Zoomed past the edge, it sits on a band. */
  function drawCaption(ctx, w, room, state) {
    if (view.k > 1) {
      ctx.fillStyle = 'rgba(15,18,24,.85)';
      ctx.fillRect(0, 0, w, CAPTION);
    }
    ctx.textBaseline = 'middle';
    const y = CAPTION / 2 + 1;
    const across = (map.u1 - map.u0) * 1000;
    const up = (map.v1 - map.v0) * 1000;
    const size = `${Math.round(across)} × ${Math.round(up)} mm${view.k > 1 ? ` · ${view.k.toFixed(1)}×` : ''}`;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    const editing = state.sheet === face && face !== 'plan';
    const right = editing ? `✎ ${size}` : size;
    // clear of the tile's ⇱ button in the corner
    ctx.fillText(right, w - 30, y);
    const used = ctx.measureText(right).width + 38;
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = FACE_COLOURS[face] ?? '#d4d4d4';
    const title = fitText(ctx, TITLES[face], w - used - 8);
    ctx.fillText(title, 8, y);
    const mat = face === 'ceiling' ? room.ceiling : face === 'plan' ? room.floor : room.walls.find((x) => x.face === face)?.material;
    const x = 8 + ctx.measureText(title).width + 8;
    ctx.font = '10px system-ui';
    ctx.fillStyle = '#7c8696';
    if (mat && w - used - x > 40) ctx.fillText(fitText(ctx, mat.name, w - used - x), x, y);
    ctx.textBaseline = 'alphabetic';
  }

  /** This face's treatments: the ceiling's on the RCP, a wall face's on its elevation. The selected one last, so it sits on top. */
  function drawPatches(ctx, room, state, outline) {
    const sel = state.selected?.kind === 'patch' ? state.selected.id : null;
    const mine = (room.patches ?? []).filter((p) => p.face === (face === 'plan' ? 'floor' : face));
    mine.sort((a, b) => (a.id === sel) - (b.id === sel));
    drawn = [];
    ctx.save();
    ctx.clip(outline);
    for (const p of mine) {
      const pts = p.points3d.map((q) => {
        const { u, v } = map.project(q);
        return map.toS(u, v);
      });
      const label = map.detail >= DETAIL.patches || p.id === sel ? shortName(patchName(p.paletteId, p.material), 18) : '';
      if (drawPatch(ctx, pts, p.material, { alpha: 0.55, selected: p.id === sel, label })) drawn.push({ piece: p, pts });
    }
    ctx.restore();
  }

  function patchAt(x, y) {
    for (let i = drawn.length - 1; i >= 0; i--) if (pointInPolygon(x, y, drawn[i].pts)) return drawn[i].piece;
    return null;
  }

  function drawGuides(ctx, room, show) {
    const { toS } = map;
    if (top) {
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
    const words = map.detail >= DETAIL.guides;
    if (show.guides) {
      const a = toS(map.u0, 0.38 * room.H);
      const b = toS(map.u1, 0.42 * room.H);
      ctx.fillStyle = 'rgba(34,197,94,.13)';
      ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
      if (words) drawLabel(ctx, x0 + 62, b.y - 9, 'ears 38–42 % H', '#22c55e');
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
        if (n === 1 && words) {
          drawLabel(ctx, x1 - 30, y - 9, 'H/2 null', colour);
          drawLabel(ctx, xs, toS(0, room.H).y + 10, `${span}/2`, colour);
        }
      }
    }
  }

  function screenAngle(dev) {
    if (top) return -dev.aim * DEG;
    const fx = Math.cos(dev.aim * DEG) * Math.cos(dev.tilt * DEG);
    const fy = Math.sin(dev.aim * DEG) * Math.cos(dev.tilt * DEG);
    const fz = Math.sin(dev.tilt * DEG);
    return Math.atan2(-fz, fx * map.ra.x + fy * map.ra.y);
  }

  function drawDevices(ctx, state) {
    if (!state.settings.show.devices) return;
    // a small tile gets tags (L, M3, MIX); one made big — maximised, popped out — gets names
    const roomy = map.detail >= DETAIL.names && state.speakers.length + state.mics.length <= 10;
    for (const s of state.speakers) {
      const { u, v } = map.project(s);
      const p = map.toS(u, v);
      drawSpeaker(ctx, p.x, p.y, screenAngle(s), s.color, { selected: state.selected?.id === s.id, label: deviceLabel(s, 'speaker', state, roomy), size: 8 });
    }
    for (const m of state.mics) {
      const { u, v } = map.project(m);
      const p = map.toS(u, v);
      drawMic(ctx, p.x, p.y, screenAngle(m), { mix: m.mix, selected: state.selected?.id === m.id, label: deviceLabel(m, 'mic', state, roomy), size: 6 });
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
    if (!hit) {
      // a device sits on top of a treatment, so it wins; a treatment wins over the wall behind it
      const patch = patchAt(e.clientX - r.left, e.clientY - r.top);
      if (patch) {
        if (onPickPatch) onPickPatch(patch.id);
        else store.select({ kind: 'patch', id: patch.id });
        return;
      }
      // the empty room: a drag pans a zoomed drawing, a click jumps the CAD here
      const at = { x: e.clientX, y: e.clientY, uc: view.uc, vc: view.vc };
      let panned = false;
      dragFrom(
        e,
        canvas,
        (ev) => {
          if (view.k <= 1 || (!panned && Math.hypot(ev.clientX - at.x, ev.clientY - at.y) < 4)) return;
          panned = true;
          view.uc = at.uc - (ev.clientX - at.x) / map.s;
          view.vc = at.vc + (ev.clientY - at.y) / map.s;
          render();
        },
        () => {
          if (!panned) onJump?.();
        },
      );
      return;
    }
    // lost outside the room: the touch brings it to the middle instead of dragging it further off
    if (store.bringIn(hit.kind, hit.dev.id, engine.out.room)) return;
    store.select({ kind: hit.kind, id: hit.dev.id });
    const dev0 = hit.dev;
    dragFrom(
      e,
      canvas,
      (ev) => {
        const { u, v } = map.toUV(ev.clientX - r.left, ev.clientY - r.top);
        const p = map.unproject(u, v, dev0);
        const raw = top ? { x: p.x, y: p.y, z: dev0.z, kind: dev0.kind } : { x: p.x, y: p.y, z: +p.z.toFixed(3), kind: dev0.kind };
        const clamped = engine.out.room ? clampInside(engine.out.room, raw, CLEAR_M) : raw;
        store.update(hit.kind, dev0.id, top ? { x: clamped.x, y: clamped.y } : { x: clamped.x, y: clamped.y, z: clamped.z }, true);
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
    if (!map) return;
    const r = canvas.getBoundingClientRect();
    const patch = patchAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = patch ? 'help' : '';
    const named = patch ? `${patchName(patch.paletteId, patch.material)} · ` : '';
    const { u, v } = map.toUV(e.clientX - r.left, e.clientY - r.top);
    if (!out.values || !out.fieldGrids) {
      readout.textContent = `${named}${u.toFixed(2)} m, ${v.toFixed(2)} m`;
      return;
    }
    let value = NaN;
    if (top) {
      const g = out.fieldGrids[face];
      value = sampleGrid(out.values[face], g.nx, g.ny, (u - g.x0) / (g.nx * g.cell), (g.y1 - v) / (g.ny * g.cell));
    } else {
      out.fieldGrids.walls.forEach((g, i) => {
        if (g.face !== face) return;
        const wall = out.room.walls[g.wall];
        const ua = wall.a.x * map.ra.x + wall.a.y * map.ra.y;
        const ub = wall.b.x * map.ra.x + wall.b.y * map.ra.y;
        const t = (u - ua) / (ub - ua);
        if (t >= 0 && t <= 1) value = sampleGrid(out.values.walls[i], g.nu, g.nz, t, 1 - v / out.room.Hmax);
      });
    }
    readout.textContent = named + (Number.isFinite(value) ? `${value.toFixed(1)} dB · ${u.toFixed(2)} m, ${v.toFixed(2)} m` : `${u.toFixed(2)} m, ${v.toFixed(2)} m`);
  });
  // the wheel zooms about the pointer; all the way out, the room fits again
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!map) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const { u, v } = map.toUV(x, y);
      const k = Math.max(1, Math.min(ZOOM_MAX, view.k * Math.exp(-e.deltaY * 0.0015)));
      const s = (map.s / view.k) * k;
      view.k = k;
      view.uc = u - (x - map.cx) / s;
      view.vc = v + (y - map.cy) / s;
      render();
    },
    { passive: false },
  );
  canvas.addEventListener('dblclick', () => {
    view.k = 1;
    render();
  });
  canvas.addEventListener('pointerleave', () => {
    readout.textContent = '';
  });

  return { render };
}
