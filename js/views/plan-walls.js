// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE PLAN — Walls mode: the room's own lines worked in the CAD from here, and their grips.
 * Lifted out of createPlanView (plan.js, ROAD-3753): `pv` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { gripAt, gripsOf, othersThan, snapPoint } from './wallGrips.js';
import { dragFrom, drawLabel } from './glyphs.js';
import { nearestWall } from './plan-draw.js';
import { ACCENT } from '../brand.js';

export function planWalls(pv) {
  const { cad, capture, engine, k, pxPerMetre, render, store, toScreen, toWorld, view } = pv;
  // the other parts' functions, looked up when called
  const showMenu = (...a) => pv.showMenu(...a);

  /**
   * WALLS MODE WORKS THE ROOM'S OWN LINES, in the CAD, from here (the
   * bridge's `walls`, CAD hostWalls.ts), in drawing units:
   *
   *   drag a corner         it moves, every wall joined to it following; dropped
   *                         on another corner, the two join
   *   Alt-drag a corner     only the picked wall's end (else the first one there)
   *                         comes away — the walls disconnect
   *   drag a wall's middle  the whole wall moves, its neighbours stretching
   *   drag anywhere else,   a new wall is drawn from where you pressed to where
   *   or Shift-drag from a  you let go, joined to the corners it starts and
   *   corner                ends on
   *   click                 picks the wall under it, as before
   *   right-click a wall    Delete wall
   *
   * Everything lands snapped: onto a corner, square to one, else every 10 mm.
   * Returns false when there is nothing to work (no CAD, no plan layer).
   */
  let wallEdit = null;
  function wallContext() {
    const g = store.state.cad.geometry;
    const layerId = engine.out.planLayer;
    const v = view();
    if (!cad?.link || !g || !layerId || !v) return null;
    const reach = 10 / v.zoom;
    return { layerId, grips: gripsOf(g, layerId), reach, grid: 0.01 / k() };
  }
  /** The CAD line of the plan layer nearest `pu` (drawing units) within `reach`: its edge id, or null. */
  function edgeNear(c, pu) {
    let best = null;
    for (const w of store.state.cad.geometry?.walls ?? []) {
      if (w.layerId !== c.layerId) continue;
      const [ax, ay] = w.a;
      const dx = w.b[0] - ax;
      const dy = w.b[1] - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((pu.x - ax) * dx + (pu.y - ay) * dy) / len2));
      const d = Math.hypot(pu.x - (ax + t * dx), pu.y - (ay + t * dy));
      if (d <= c.reach * 1.4 && (!best || d < best.d)) best = { id: w.edgeId, d };
    }
    return best?.id ?? null;
  }
  /** The CAD edge a room wall was read from: the line whose ends are its ends. */
  function edgeOfWall(c, w) {
    const near = (p, q) => Math.hypot(p[0] - q.x / k(), p[1] - q.y / k()) <= c.reach;
    return (store.state.cad.geometry?.walls ?? []).find((g) => g.layerId === c.layerId && ((near(g.a, w.a) && near(g.b, w.b)) || (near(g.a, w.b) && near(g.b, w.a))))?.edgeId ?? null;
  }
  const unitsAt = (ev) => {
    const w = toWorld(ev.clientX, ev.clientY);
    return { x: w.x / k(), y: w.y / k() };
  };
  function startWallEdit(e, pick) {
    const ctx = wallContext();
    if (!ctx) return false;
    const { grips, reach, grid, layerId } = ctx;
    const p0 = unitsAt(e);
    const hit = gripAt(grips, p0, reach);
    const sx = e.clientX;
    const sy = e.clientY;
    const picked = store.state.selected?.kind === 'wall' ? engine.out.room?.walls.find((w) => w.key === store.state.selected.id) : null;
    let moved = false;
    let last = null;
    const send = (op) => cad.link.walls(op);
    const round = (v) => +v.toFixed(4);
    if (hit?.kind === 'corner' && !e.shiftKey) {
      const corner = hit.grip;
      // Alt: just one wall's end comes away — the picked wall's, if it meets here
      const pickedEdge = picked ? edgeOfWall(ctx, picked) : null;
      const mine = corner.refs.find((r) => r.edgeId === pickedEdge);
      const refs = e.altKey ? [mine ?? corner.refs[0]] : corner.refs;
      wallEdit = { kind: 'corner', at: { x: corner.x, y: corner.y }, guides: [] };
      dragFrom(e, capture, (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        if (!moved) {
          moved = true;
          send({ op: 'begin' });
          if (e.altKey) send({ op: 'detach', edgeId: refs[0].edgeId, end: refs[0].end });
        }
        const s = snapPoint(unitsAt(ev), othersThan(grips, corner), { reach, grid });
        wallEdit = { kind: 'corner', at: s, guides: s.guides };
        for (const r of refs) send({ op: 'vertex', edgeId: r.edgeId, end: r.end, to: [round(s.x), round(s.y)] });
        render();
      }, () => {
        if (moved) send({ op: 'end' });
        else pick();
        wallEdit = null;
        render();
      });
      return true;
    }
    if (hit?.kind === 'mid' && !e.shiftKey) {
      const mid = hit.grip;
      last = { x: mid.x, y: mid.y };
      wallEdit = { kind: 'mid', at: last, guides: [] };
      dragFrom(e, capture, (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        if (!moved) {
          moved = true;
          send({ op: 'begin' });
        }
        const q = unitsAt(ev);
        const s = snapPoint({ x: mid.x + q.x - p0.x, y: mid.y + q.y - p0.y }, grips.corners.filter((c) => c.refs.every((r) => r.edgeId !== mid.edgeId)), { reach, grid });
        const by = [round(s.x - last.x), round(s.y - last.y)];
        if (by[0] || by[1]) send({ op: 'edge', edgeId: mid.edgeId, by });
        last = { x: s.x, y: s.y };
        wallEdit = { kind: 'mid', at: last, guides: s.guides };
        render();
      }, () => {
        if (moved) send({ op: 'end' });
        else pick();
        wallEdit = null;
        render();
      });
      return true;
    }
    // a new wall: from the corner pressed (Shift), else from where the press lands, snapped
    const a = hit?.kind === 'corner' ? { x: hit.grip.x, y: hit.grip.y } : snapPoint(p0, grips.corners, { reach, grid });
    dragFrom(e, capture, (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      const b = snapPoint(unitsAt(ev), grips.corners, { reach, grid });
      wallEdit = { kind: 'draw', a, b, guides: b.guides };
      render();
    }, () => {
      const b = wallEdit?.kind === 'draw' ? wallEdit.b : null;
      if (moved && b && Math.hypot(b.x - a.x, b.y - a.y) > reach) send({ op: 'add', a: [round(a.x), round(a.y)], b: [round(b.x), round(b.y)], layer: layerId });
      else if (!moved) pick();
      wallEdit = null;
      render();
    });
    return true;
  }

  // right-click a wall in Walls mode: Delete wall
  capture.addEventListener('contextmenu', (e) => {
    if (store.state.mode !== 'pick-wall') return;
    e.preventDefault();
    const ctx = wallContext();
    if (!ctx) return;
    const edgeId = edgeNear(ctx, unitsAt(e));
    if (edgeId === null) return;
    const room = engine.out.room;
    const w = room && nearestWall(room, toWorld(e.clientX, e.clientY), 14 / pxPerMetre());
    if (w) store.select({ kind: 'wall', id: w.key });
    showMenu(e, [['✕ Delete wall', () => cad.link.walls({ op: 'delete', edgeId })]]);
  });

  /** The grips, and what a drag in Walls mode is doing: the new wall's beam and length, the guides it is squared to. */
  function drawWallGrips(ctx) {
    const c = wallContext();
    if (!c) return;
    const u = (q) => toScreen(q.x * k(), q.y * k());
    ctx.save();
    for (const g of c.grips.corners) {
      const s = u(g);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = g.refs.length > 1 ? '#7dd3fc' : ACCENT;
      ctx.fill();
      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const g of c.grips.mids) {
      const s = u(g);
      ctx.fillStyle = 'rgba(125, 211, 252, .85)';
      ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
    }
    if (wallEdit) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const at = wallEdit.kind === 'draw' ? wallEdit.b : wallEdit.at;
      const s = u(at);
      for (const gd of wallEdit.guides ?? []) {
        ctx.beginPath();
        if (gd.x !== undefined) {
          ctx.moveTo(s.x, 0);
          ctx.lineTo(s.x, ctx.canvas.height);
        } else {
          ctx.moveTo(0, s.y);
          ctx.lineTo(ctx.canvas.width, s.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (wallEdit.kind === 'draw') {
        const a = u(wallEdit.a);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        const len = Math.hypot(wallEdit.b.x - wallEdit.a.x, wallEdit.b.y - wallEdit.a.y) * k();
        drawLabel(ctx, (a.x + s.x) / 2, (a.y + s.y) / 2 - 14, `${Math.round(len * 1000)} mm`, '#ffffff', { force: true });
      }
    }
    ctx.restore();
  }

  return { startWallEdit, drawWallGrips };
}
