// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from '../acoustics/bands.js';
import { criticalDistance } from '../acoustics/analysis.js';
import { DEG, mirrorPoint, segmentCross } from '../acoustics/geometry.js';
import { arrangedSpeakers, arrayFront, LAYOUTS, layoutCentre, noseMarks, snapNose } from '../acoustics/layouts.js';
import { fromFrame } from '../acoustics/room.js';
import { roomGrowth } from '../acoustics/roomFit.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { PRODUCTS, furnitureHeight } from '../acoustics/materials.js';
import { pieceFootprint, pieceTop, piecesOf } from '../acoustics/pieces.js';
import { rgba } from './treatments.js';
import { drawRayOverlay } from './rayOverlay.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { patchesFromCad } from '../compute/engine.js';
import { elevationFaceOf } from '../acoustics/elevations.js';
import { isCeilingLayer } from '../acoustics/patches.js';
import { consoleOf } from '../acoustics/console.js';
import { boxSize, MIC_PRESETS, isListener } from '../acoustics/devices.js';
import { mirrorName } from '../acoustics/symmetry.js';
import { FACE_COLOURS, dashedLine, deviceLabel, dragFrom, drawLabel, drawMic, drawPerson, drawSpeaker, fitCanvas } from './glyphs.js';
import { goodFractions, nullLines, snapToDivisions } from './guides.js';
import { gridCanvas } from './paint.js';
import { gripAt, gripsOf, othersThan, snapPoint } from './wallGrips.js';
import { furnitureLayer } from '../cad/marks.js';

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
 * same overlay on top — speakers and mics still go down and move here. It
 * zooms and pans as the elevations do: the wheel about the pointer, a drag
 * on the empty plan pans, a double-click fits the room again.
 */

export function createPlanView({ tile, iframe, store, engine, onDrag, cad = null }) {
  const canvas = tile.querySelector('canvas.overlay');
  const capture = tile.querySelector('.capture');
  const hits = tile.querySelector('.hits');

  let hoverPos = null;

  capture.addEventListener('pointermove', (e) => {
    if (store.state.mode === 'place-furniture' || store.state.mode === 'place-speaker' || store.state.mode === 'place-mic') {
      hoverPos = toWorld(e.clientX, e.clientY);
      render();
    }
  });

  capture.addEventListener('pointerleave', () => {
    if (hoverPos) {
      hoverPos = null;
      render();
    }
  });

  /** Popped out, the plan's own zoom: k = 1 fits the room; above it, (cx, cy) metres is the point at the middle of the tile. */
  const own = { k: 1, cx: 0, cy: 0 };
  const ZOOM_MAX = 12;

  /** The CAD's own transform, or — popped out — one that fits the room to this tile, zoomed and panned as the user left it. */
  function view() {
    if (!store.state.cad.popped) return store.state.cad.view;
    const room = engine.out.room;
    if (!room) return null;
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const width = tile.clientWidth;
    const height = tile.clientHeight;
    const ppm = Math.max(1, Math.min((width - 80) / Math.max(x1 - x0, 0.1), (height - 80) / Math.max(y1 - y0, 0.1))) * own.k;
    const cx = own.k > 1 ? own.cx : (x0 + x1) / 2;
    const cy = own.k > 1 ? own.cy : (y0 + y1) / 2;
    return { zoom: ppm * k(), panX: width / 2 - cx * ppm, panY: height / 2 + cy * ppm, rect: { left: 0, top: 0, width, height } };
  }

  // popped out: the wheel zooms about the pointer (not over a device — a held speaker's wheel toes it in)
  tile.addEventListener(
    'wheel',
    (e) => {
      if (!store.state.cad.popped || e.target.closest?.('.hit') || !engine.out.room) return;
      e.preventDefault();
      const at = toWorld(e.clientX, e.clientY);
      const b = tile.getBoundingClientRect();
      const before = pxPerMetre() / own.k;
      own.k = Math.max(1, Math.min(ZOOM_MAX, own.k * Math.exp(-e.deltaY * 0.0015)));
      const ppm = before * own.k;
      own.cx = at.x - (e.clientX - b.left - tile.clientWidth / 2) / ppm;
      own.cy = at.y + (e.clientY - b.top - tile.clientHeight / 2) / ppm;
      render();
    },
    { passive: false },
  );
  // popped out: a drag on the empty plan pans it once zoomed; a double-click fits the room again
  tile.addEventListener('pointerdown', (e) => {
    if (!store.state.cad.popped || own.k <= 1 || e.button !== 0 || e.target.closest?.('.hit, .capture.on, .plan-menu, button')) return;
    const start = { x: e.clientX, y: e.clientY, cx: own.cx, cy: own.cy };
    dragFrom(
      e,
      tile,
      (ev) => {
        const ppm = pxPerMetre();
        own.cx = start.cx - (ev.clientX - start.x) / ppm;
        own.cy = start.cy + (ev.clientY - start.y) / ppm;
        render();
      },
      () => {},
    );
  });
  tile.addEventListener('dblclick', (e) => {
    if (!store.state.cad.popped || e.target.closest?.('.hit')) return;
    own.k = 1;
    render();
  });

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
    if (mode === 'pick-wall') {
      if (e.button !== 0) return;
      // touch a wall: the nearest one within a finger's width, kept picked so the next touch moves on
      const pick = () => {
        const w = room && nearestWall(room, p, 14 / pxPerMetre());
        store.select(w ? { kind: 'wall', id: w.key } : null);
      };
      if (!startWallEdit(e, pick)) pick();
      return;
    }
    if (mode === 'place-speaker') {
      const at = room ? clampInside(room, p, CLEAR_M) : p;
      store.addSpeaker(placeKind.speaker, { x: at.x, y: at.y, z: placeKind.speaker === 'sub' ? 0.3 : 1.2 }, { aim: store.state.settings.frontDeg + 180 });
    } else if (mode === 'place-mic') {
      const at = room ? clampInside(room, p, CLEAR_M) : p;
      store.addMic(placeKind.mic, { x: at.x, y: at.y, z: room ? +(room.H * 0.4).toFixed(2) : 1.2 }, { aim: store.state.settings.frontDeg });
    } else if (mode === 'place-furniture') {
      const at = room ? clampInside(room, p, CLEAR_M) : p;
      const paletteId = placeKind.furniture || 'desk-1800x900';
      // with the CAD there, the piece is ONE block in the drawing — gear on the plan, like a library room's; only
      // without it is it kept here (both at once was two couches in one place, each counted in the room)
      if (cad?.link) cad.link.place(furnitureLayer(paletteId), [{ paletteId, at: [+(at.x / k()).toFixed(4), +(at.y / k()).toFixed(4)], rotation: 0 }]);
      else store.addFurniture(paletteId, { x: at.x, y: at.y, z: 0 }, 0);
    }
    hoverPos = null;
    if (!e.shiftKey) {
      store.setMode('cad');
      if (cad?.link) cad.link.arm(null);
    }
  });

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
      ctx.fillStyle = g.refs.length > 1 ? '#7dd3fc' : '#f4902c';
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

  /**
   * The gear the CAD holds on the plan — a library room's console, desks, rack
   * and couch, placed into the drawing as blocks — as { id, x, y, rotation,
   * paletteId }: products that stand on the floor, not already one of this
   * app's own furniture.
   */
  function cadGear() {
    const own = new Set((store.state.furniture ?? []).map((f) => f.cadId).filter(Boolean));
    return patchesFromCad(store.state.cad.geometry)
      .filter((p) => p.at && furnitureHeight(p.paletteId) && !own.has(p.id) && !elevationFaceOf(p.layer) && !isCeilingLayer(p.layer))
      .map((p) => ({ id: p.id, x: p.at.x, y: p.at.y, rotation: p.rotation ?? 0, paletteId: p.paletteId }));
  }

  /** Hit targets: one absolutely-placed div per device, the only things here that take the mouse. */
  function syncHits() {
    const { speakers, mics, furniture = [] } = store.state;
    const want = [
      ...speakers.map((d) => ['speaker', d]),
      ...mics.map((d) => ['mic', d]),
      ...furniture.map((d) => ['furniture', d]),
      ...(cad?.link ? cadGear().map((d) => ['gear', d]) : []),
    ];
    const seen = new Set();
    for (const [kind, d] of want) {
      seen.add(d.id);
      let el = hits.querySelector(`[data-id="${d.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hit';
        el.dataset.id = d.id;
        el.dataset.kind = kind;
        el.addEventListener('pointerdown', (e) => startDrag(e, el));
        el.addEventListener('contextmenu', (e) => openMenu(e, el));
        hits.appendChild(el);
      }
      const locked = store.isLocked(d.id);
      el.classList.toggle('locked', locked);
      el.classList.toggle('mix', kind === 'mic' && Boolean(d.mix));
      el.title = locked
        ? 'Locked — right-click to unlock'
        : (kind === 'speaker'
          ? 'Drag to move — it settles onto the recommended divisions, crossings first (Alt: free) · Shift-drag to aim · Ctrl-click to turn it (click to set, Esc to cancel) · press and HOLD to swing it round the listener (its partner mirrors, the wheel toes it in)'
          : kind === 'furniture' || kind === 'gear'
          ? `Drag to move · Shift-drag to turn · Ctrl-click to turn it with the pointer${kind === 'furniture' ? ' · Del / Backspace to remove' : ' — it lives in the CAD drawing'}`
          : 'Drag to move — it settles onto the recommended divisions (Alt: free) · Shift-drag to turn — the nose snaps to the front and square-on to each wall (Alt: free) · Ctrl-click to turn it with the pointer in 15° steps (click to set, Alt: free, Esc to cancel)') + ' · right-click to turn, lock or remove';
      const p = toScreen(d.x, d.y);
      el.style.transform = `translate(${p.x - 12}px, ${p.y - 12}px)`;
      el.style.display = Number.isFinite(p.x) ? '' : 'none';
    }
    for (const el of [...hits.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  /** The hold-to-orbit drag in progress, for render's read-out: { listener, dist, az, toe, id, partner }. */
  let orbit = null;
  /** A listener being turned (Shift-drag): { id, mark } — the room mark its nose is locked to, for the read-out. */
  let turning = null;
  /** A device being dragged onto the divisions: { along, across } metres in the room's frame, either null. */
  let snapped = null;
  const HOLD_MS = 380;
  /** Anything being turned after Ctrl-click or the menu's Turn: { kind, id, before } — it follows the pointer until a click sets it. */
  let spinning = null;

  /**
   * How a thing on the plan turns: { at(), angle(), set(deg, live), step } —
   * a speaker or mic by its aim, a piece of furniture by its rotation (its
   * CAD block with it), the CAD's gear in the drawing. A speaker turns by
   * the degree, for its toe-in; the rest click round in 15° steps.
   */
  function turner(kind, id) {
    if (kind === 'speaker' || kind === 'mic') {
      const dev = () => (kind === 'mic' ? store.state.mics : store.state.speakers).find((d) => d.id === id);
      if (!dev()) return null;
      return { dev, angle: () => dev()?.aim ?? 0, set: (aim, live) => store.update(kind, id, { aim }, live), step: kind === 'mic' ? 15 : 1 };
    }
    if (kind === 'furniture') {
      const dev = () => (store.state.furniture ?? []).find((f) => f.id === id);
      if (!dev()) return null;
      return {
        dev,
        angle: () => dev()?.rotation ?? 0,
        set: (rotation, live) => {
          const f = dev();
          store.updateFurniture(id, { rotation }, live);
          if (cad?.link && f?.cadId) cad.link.move([{ id: f.cadId, at: [+(f.x / k()).toFixed(4), +(f.y / k()).toFixed(4)], rotation }]);
        },
        step: 15,
      };
    }
    if (kind === 'gear' && cad?.link) {
      const dev = () => cadGear().find((g) => g.id === id);
      if (!dev()) return null;
      return {
        dev,
        angle: () => dev()?.rotation ?? 0,
        set: (rotation) => {
          const g = dev();
          if (!g) return;
          freeConsole(id);
          cad.link.move([{ id, at: [+(g.x / k()).toFixed(4), +(g.y / k()).toFixed(4)], rotation }]);
        },
        step: 15,
      };
    }
    return null;
  }

  /** The console that keeps to the mixer's nose stops following once it is moved or turned by hand — said in the warning. */
  function freeConsole(id) {
    const mix = store.state.mics.find((m) => m.mix);
    const { settings } = store.state;
    if (!mix || settings.console?.follow === false || consoleOf(patchesFromCad(store.state.cad.geometry), mix)?.id !== id) return;
    store.setSettings({ console: { ...settings.console, follow: false } });
    store.tell('⚠ The console no longer keeps to the mixer’s nose — you moved it by hand. Undo puts it back to following (Layout → Console at the mixer’s nose).');
  }

  /** Turn a thing by a fixed step (the menu's 90°s), one undo step. */
  function turnBy(kind, id, by) {
    const t = turner(kind, id);
    if (!t) return;
    t.set(Math.round(wrap(t.angle() + by)), false);
    render();
  }

  /**
   * Ctrl-click (⌘ on a Mac) anything on the plan, or the menu's Turn: it
   * turns to face the pointer, no button held, until a click sets it; Esc
   * puts the old angle back. A speaker turns by the degree, for its toe-in;
   * the rest click round in 15° steps (Alt: free). The plan sits over the
   * CAD's iframe, which would swallow the pointer, so a sheet over the tile
   * takes it while the thing turns.
   */
  function startSpin(el) {
    const { kind, id } = el.dataset;
    const t = turner(kind, id);
    if (!t) return;
    store.select(kind === 'gear' ? { kind: 'patch', id } : { kind, id });
    spinning = { kind, id, before: t.angle(), dev: t.dev };
    const sheet = document.createElement('div');
    sheet.className = 'spin';
    sheet.title = `Turning it${t.step > 1 ? ` in ${t.step}° steps (Alt: free)` : ''}: click to set · Esc to cancel`;
    hits.parentElement.appendChild(sheet);
    const end = (keep) => {
      sheet.remove();
      window.removeEventListener('keydown', key, true);
      if (!keep) t.set(spinning.before, true);
      spinning = null;
      store.commit();
      onDrag(false);
      render();
    };
    const key = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      end(false);
    };
    sheet.addEventListener('pointermove', (ev) => {
      const s = t.dev();
      const p = toWorld(ev.clientX, ev.clientY);
      if (!s || Math.hypot(p.x - s.x, p.y - s.y) < 1e-3) return;
      const deg = (Math.atan2(p.y - s.y, p.x - s.x) * 180) / Math.PI;
      const by = ev.altKey ? 1 : t.step;
      const angle = Math.round(deg / by) * by;
      if (angle !== t.angle()) t.set(angle, true);
      onDrag(true);
    });
    sheet.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      end(true);
    });
    window.addEventListener('keydown', key, true);
    render();
  }

  /**
   * Right-click anything on the plan — a speaker, a mic, a couch, a console:
   * Turn swings it 90° either way or round with the pointer, Lock holds it
   * where it is (no drag, no turn, no Delete), Remove takes it out. The CAD's
   * gear is turned and removed in the drawing, one undo step there.
   */
  function openMenu(e, el) {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    const { kind, id } = el.dataset;
    store.select(kind === 'gear' ? { kind: 'patch', id } : { kind, id });
    const locked = store.isLocked(id);
    showMenu(e, [
      ['↺ Turn 90° left', () => turnBy(kind, id, 90), locked],
      ['↻ Turn 90° right', () => turnBy(kind, id, -90), locked],
      ['⟳ Turn with the pointer…', () => startSpin(el), locked],
      [locked ? '🔓 Unlock' : '🔒 Lock', () => store.setLocked(id, !locked)],
      ['✕ Remove', () => (kind === 'gear' ? cad?.link?.remove([id]) : store.remove(kind, id)), locked],
    ]);
  }

  /** A small menu at the pointer: [[label, act, disabled?], …]; any click elsewhere or Esc closes it. */
  function showMenu(e, entries) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'plan-menu';
    for (const [label, act, disabled = false] of entries) {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener('click', () => {
        closeMenu();
        act();
      });
      menu.appendChild(b);
    }
    const box = hits.parentElement.getBoundingClientRect();
    menu.style.left = `${e.clientX - box.left}px`;
    menu.style.top = `${e.clientY - box.top}px`;
    hits.parentElement.appendChild(menu);
    setTimeout(() => {
      window.addEventListener('pointerdown', outside, true);
      window.addEventListener('keydown', escape, true);
    });
  }
  const outside = (ev) => {
    if (!ev.target.closest?.('.plan-menu')) closeMenu();
  };
  const escape = (ev) => {
    if (ev.key === 'Escape') closeMenu();
  };
  function closeMenu() {
    hits.parentElement.querySelector('.plan-menu')?.remove();
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', escape, true);
  }

  function startDrag(e, el) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = el.dataset.kind;
    const id = el.dataset.id;
    if (store.isLocked(id)) {
      store.select(kind === 'gear' ? { kind: 'patch', id } : { kind, id });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !spinning) return startSpin(el);
    if (kind === 'gear') return startGearDrag(e, el);
    // lost outside the room: the touch brings it to the middle instead of dragging it further off
    if (store.bringIn(kind, id, engine.out.room)) return;
    store.select({ kind, id });
    const list = kind === 'speaker' ? store.state.speakers : kind === 'furniture' ? (store.state.furniture ?? []) : store.state.mics;
    const dev = list.find((d) => d.id === id);
    if (!dev) return;
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
          if (kind === 'furniture') {
            const rot = ev.altKey ? Math.round(aim) : Math.round(aim / 15) * 15;
            store.updateFurniture(id, { rotation: rot }, true);
            if (cad?.link && dev.cadId) {
              cad.link.move([{ id: dev.cadId, at: [+(dev.x / k()).toFixed(4), +(dev.y / k()).toFixed(4)], rotation: rot }]);
            }
          } else if (kind === 'mic') {
            // a listener's nose snaps to the room's marks (Alt turns it freely)
            const { settings } = store.state;
            const snap = ev.altKey ? { aim: Math.round(aim), mark: null } : snapNose(aim, noseMarks(engine.out.room, settings.frontDeg), settings.frontDeg);
            turning = { id, mark: snap.mark };
            store.update(kind, id, { aim: snap.aim }, true);
          } else store.update(kind, id, { aim: Math.round(aim) }, true);
        } else {
          let target = { x: origin.x + p.x - start.x, y: origin.y + p.y - start.y, z: dev.z ?? 0, kind: dev.kind };
          // speakers and mics settle onto the recommended divisions, crossings first (Alt: free)
          snapped = null;
          if (kind !== 'furniture' && engine.out.room && !ev.altKey) {
            const s = snapToDivisions(engine.out.room, target, { reach: 18 / pxPerMetre(), lineReach: 8 / pxPerMetre() });
            target = { ...target, x: s.x, y: s.y };
            if (s.along !== null || s.across !== null) snapped = { along: s.along, across: s.across };
          }
          const clamped = engine.out.room ? clampInside(engine.out.room, target, CLEAR_M) : target;
          if (kind === 'furniture') {
            store.updateFurniture(id, { x: clamped.x, y: clamped.y }, true);
            if (cad?.link && dev.cadId) {
              cad.link.move([{ id: dev.cadId, at: [+(clamped.x / k()).toFixed(4), +(clamped.y / k()).toFixed(4)], rotation: dev.rotation ?? 0 }]);
            }
          } else {
            store.update(kind, id, { x: clamped.x, y: clamped.y }, true);
          }
        }
        onDrag(true);
      },
      () => {
        clearTimeout(timer);
        el.removeEventListener('wheel', wheel);
        el.classList.remove('holding');
        orbit = null;
        turning = null;
        snapped = null;
        store.commit();
        onDrag(false);
      },
    );
  }

  /**
   * Drag a piece of the CAD's gear: it moves in the drawing (the bridge's
   * `move`), Shift turns it in 15° steps (Alt: free). The console that keeps
   * to the mixer's nose stops following once it is dragged by hand — said in
   * the warning, whose Undo puts it back to following.
   */
  function startGearDrag(e, el) {
    const id = el.dataset.id;
    const gear = cadGear().find((g) => g.id === id);
    if (!gear) return;
    store.select({ kind: 'patch', id });
    const start = toWorld(e.clientX, e.clientY);
    let rotation = gear.rotation;
    let freed = false;
    dragFrom(
      e,
      el,
      (ev) => {
        const p = toWorld(ev.clientX, ev.clientY);
        if (!freed) {
          freed = true;
          freeConsole(id);
        }
        let at = { x: gear.x, y: gear.y };
        if (ev.shiftKey) {
          const aim = (Math.atan2(p.y - gear.y, p.x - gear.x) * 180) / Math.PI;
          rotation = ev.altKey ? Math.round(aim) : Math.round(aim / 15) * 15;
        } else {
          const target = { x: gear.x + p.x - start.x, y: gear.y + p.y - start.y, z: 0.5 };
          at = engine.out.room ? clampInside(engine.out.room, target, CLEAR_M) : target;
        }
        cad.link.move([{ id, at: [+(at.x / k()).toFixed(4), +(at.y / k()).toFixed(4)], rotation }]);
        onDrag(true);
      },
      () => onDrag(false),
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
      let x = L.x + o.dist * Math.cos(b);
      let y = L.y + o.dist * Math.sin(b);
      if (engine.out.room) {
        const c = clampInside(engine.out.room, { x, y, z: o.z }, CLEAR_M, L);
        x = c.x;
        y = c.y;
      }
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
      drawLabel(ctx, c.x + 80, c.y + 14, `virtual room — draw the plan's walls in the CAD (a gap up to ${Math.round((settings.maxOpening ?? 4) * 1000)} mm is an opening)`, '#7dd3fc');
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

    drawWallMarks(ctx, room, state, toScreen);
    if (state.mode === 'pick-wall') drawWallGrips(ctx);

    if (show.guides || show.nulls) drawPlanGuides(ctx, room, show, toScreen);
    if (out.subs?.cells?.length) drawSubMap(ctx, out.subs, toScreen, pxPerMetre());

    const mix = state.mics.find((m) => m.mix);
    if (show.arrangement !== false) drawArrangement(ctx, room, settings, mix, toScreen, pxPerMetre());
    drawGrowth(ctx, room, roomGrowth(room, arrangedSpeakers(state.speakers, settings)), toScreen);
    const band = settings.band;
    const soloed = new Set(arrangedSpeakers(state.speakers, settings));
    for (const s of state.speakers) {
      // a box outside the highlighted arrangement is muted: no coverage, R_c or rays, only its ghost below
      if (!soloed.has(s) && state.selected?.id !== s.id) continue;
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
      // Every box's reflections at once is a hairball: the selected speaker's, labelled, or the highlighted arrangement's faint.
      const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
      if (show.rays && mix && (picked ? picked === s.id : soloed.has(s))) drawRays(ctx, room, s, mix, toScreen, Boolean(picked));
    }

    // ray tracing over the plan, seen from above (views/rayOverlay.js)
    if (show.trace) drawRayOverlay(ctx, (q) => toScreen(q.x, q.y), room, state);

    // Placed furniture (desks, consoles, racks, couches) — under the people and the boxes, so they stay in reach
    const placedFurniture = state.furniture ?? [];
    for (const f of placedFurniture) {
      drawFurnitureItem(ctx, f, toScreen, pxPerMetre(), state.selected?.kind === 'furniture' && state.selected.id === f.id);
    }
    for (const p of room.patches ?? []) {
      if (p.surface !== 'floor') continue;
      if (!furnitureHeight(p.paletteId)) continue;
      if (placedFurniture.some((f) => f.cadId === p.id)) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(38, 38, 45, 0.75)';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      p.points3d.forEach((q, i) => {
        const s = toScreen(q.x, q.y);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const parts = p.at ? piecesOf(p.paletteId) : null;
      if (parts) {
        const c = toScreen(p.at.x, p.at.y);
        ctx.translate(c.x, c.y);
        ctx.rotate((-(p.rotation ?? 0) * Math.PI) / 180);
        drawPiecesPlan(ctx, parts, pxPerMetre());
      }
      ctx.restore();
    }
    if (show.devices) {
      // under the glyphs: where each one points, out to the wall it faces
      for (const s of state.speakers) if (s.kind !== 'sub' && soloed.has(s)) drawAimRay(ctx, room, s, s.color, toScreen);
      for (const m of state.mics) drawAimRay(ctx, room, m, MIC_PRESETS[m.kind].colour, toScreen);
      // names when the plan is big and uncrowded, tags (L, M3, MIX, E2) when it is not
      const roomy = pxPerMetre() >= 60 && state.speakers.length + state.mics.length <= 10;
      // the selected device and the mix seat label first: where labels collide, the first drawn keeps its label
      const first = (list) => [...list].sort((a, b) => (b.id === state.selected?.id) - (a.id === state.selected?.id) || (b.mix ? 1 : 0) - (a.mix ? 1 : 0));
      for (const m of first(state.mics)) {
        const p = toScreen(m.x, m.y);
        const ang = (-m.aim * Math.PI) / 180;
        const label = deviceLabel(m, 'mic', state, roomy);
        if (isListener(m)) drawPerson(ctx, p.x, p.y, ang, { ppm: pxPerMetre(), colour: MIC_PRESETS[m.kind].colour, mix: m.mix, selected: state.selected?.id === m.id, label });
        else drawMic(ctx, p.x, p.y, ang, { mix: m.mix, selected: state.selected?.id === m.id, label });
      }
      for (const s of first(state.speakers)) {
        const p = toScreen(s.x, s.y);
        // at true size: the glyph is 2·size across the front, never smaller than it always was
        ctx.globalAlpha = soloed.has(s) || state.selected?.id === s.id ? 1 : 0.25;
        drawSpeaker(ctx, p.x, p.y, (-s.aim * Math.PI) / 180, s.color, { selected: state.selected?.id === s.id, label: deviceLabel(s, 'speaker', state, roomy), size: Math.max(11, (boxSize(s).w * pxPerMetre()) / 2) });
        ctx.globalAlpha = 1;
      }
      // the people again over the boxes, the mix seat last of all: what you grab is what you see (their labels are down already)
      for (const m of [...state.mics].sort((a, b) => (a.mix ? 1 : 0) - (b.mix ? 1 : 0))) {
        const p = toScreen(m.x, m.y);
        const ang = (-m.aim * Math.PI) / 180;
        if (isListener(m)) drawPerson(ctx, p.x, p.y, ang, { ppm: pxPerMetre(), colour: MIC_PRESETS[m.kind].colour, mix: m.mix, selected: state.selected?.id === m.id });
        else drawMic(ctx, p.x, p.y, ang, { mix: m.mix, selected: state.selected?.id === m.id });
      }
    }

    if (state.mode === 'place-furniture' && hoverPos) {
      drawFurniturePreview(ctx, state.placeKind?.furniture || 'desk-1800x900', hoverPos, room, toScreen, pxPerMetre());
    }

    if (orbit) drawOrbit(ctx, orbit, toScreen, pxPerMetre());
    if (snapped) drawSnapped(ctx, room, snapped, toScreen);
    if (turning) drawTurning(ctx, turning, state.mics.find((m) => m.id === turning.id), toScreen, pxPerMetre());
    if (spinning) {
      const d = spinning.dev();
      if (d) drawTurning(ctx, { mark: null }, { x: d.x, y: d.y, aim: d.aim ?? d.rotation }, toScreen, pxPerMetre());
    }
    ctx.restore();

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
  ctx.strokeStyle = '#f4902c';
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
      drawLabel(ctx, (a.x + b.x) / 2 + w.nIn.x * 14, (a.y + b.y) / 2 - w.nIn.y * 14, `opening ${Math.round(o.width * 1000)} mm`, '#f4902c', { force: true });
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
  const at = (az, k = 1) => {
    const b = (arrayFront(settings) + az) * DEG;
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
