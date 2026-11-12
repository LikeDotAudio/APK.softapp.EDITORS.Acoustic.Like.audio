// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { criticalDistance } from '../acoustics/analysis.js';
import { arrangedSpeakers, speakerColour } from '../acoustics/layouts.js';
import { roomGrowth } from '../acoustics/roomFit.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { furnitureHeight, pieceHeight } from '../acoustics/materials.js';
import { partsOf } from '../acoustics/pieces.js';
import { drawRayOverlay } from './rayOverlay.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { patchesFromCad } from '../compute/engine.js';
import { elevationFaceOf } from '../acoustics/elevations.js';
import { isCeilingLayer } from '../acoustics/patches.js';
import { boxSize, MIC_PRESETS, isListener } from '../acoustics/devices.js';
import { deviceLabel, dragFrom, drawLabel, drawMic, drawPerson, drawSpeaker, fitCanvas } from './glyphs.js';
import { gridCanvas } from './paint.js';
import { furnitureLayer } from '../cad/marks.js';
import { openSpeakerDatasheetModal } from '../ui/speakerDatasheetModal.js';
import {
  nearestWall,
  drawWallMarks,
  drawFurnitureItem,
  drawPiecesPlan,
  drawFurniturePreview,
  drawWalls,
  drawPlanGuides,
  drawArrangement,
  drawGrowth,
  drawAimRay,
  drawSnapped,
  drawOrbit,
  drawTurning,
  drawSubMap,
  drawRings,
  drawRays,
} from './plan-draw.js';
import { planWalls } from './plan-walls.js';
import { planDrag } from './plan-drag.js';
export { planLabel, nearestWall, drawFurnitureItem, drawFurniturePreview } from './plan-draw.js';

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
 * so the plan draws its own: the room's walls, as the CAD window is saying
 * them now (cadLink `live`; 'No CAD' when it is not answering — never walls
 * from memory), fitted to the tile, with the same overlay on top — speakers and mics still go down and move here. It
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

  /** The hold-to-orbit drag in progress, for render's read-out: { listener, dist, az, toe, id, partner }. */
  let orbit = null;
  /** A listener being turned (Shift-drag): { id, mark } — the room mark its nose is locked to, for the read-out. */
  let turning = null;
  /** A device being dragged onto the divisions: { along, across } metres in the room's frame, either null. */
  let snapped = null;
  /** Anything being turned after Ctrl-click or the menu's Turn: { kind, id, before } — it follows the pointer until a click sets it. */
  let spinning = null;

  // ── the shared context the parts read (views/plan-walls.js, views/plan-drag.js) ──
  const pv = {
    cad, cadGear, capture, engine, hits, k, onDrag, pxPerMetre, render, store, toScreen, toWorld, view,
    get orbit() {
      return orbit;
    },
    set orbit(v) {
      orbit = v;
    },
    get turning() {
      return turning;
    },
    set turning(v) {
      turning = v;
    },
    get snapped() {
      return snapped;
    },
    set snapped(v) {
      snapped = v;
    },
    get spinning() {
      return spinning;
    },
    set spinning(v) {
      spinning = v;
    },
  };
  Object.assign(pv, planWalls(pv));
  Object.assign(pv, planDrag(pv));
  const {
    drawWallGrips, openMenu, startDrag, startWallEdit,
  } = pv;

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
        el.addEventListener('dblclick', () => {
          if (kind === 'speaker') {
            const dev = store.state.speakers.find((s) => s.id === d.id);
            if (dev) openSpeakerDatasheetModal(dev, { onUpdate: (patch) => store.update('speaker', dev.id, patch) });
          }
        });
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

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const { state } = store;
    const out = engine.out;
    const v = view();
    capture.classList.toggle('on', state.mode !== 'cad');
    capture.dataset.mode = state.mode;
    // popped, the walls are asked of the CAD live: a CAD window that is not answering gets no plan from memory
    if (state.cad.popped && cad?.link && !cad.link.live) {
      hits.hidden = true;
      ctx.fillStyle = '#888';
      ctx.font = '12px system-ui';
      ctx.fillText('No CAD — its window is not answering. The plan comes back when it does (or ⇲ Dock CAD).', 16, 24);
      return;
    }
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
      const tint = speakerColour(s, settings);
      if (show.coverage && s.kind !== 'sub') {
        const half = ((s.pattern === 'horn' ? s.hCov : s.pattern === 'cardioid' ? 180 : 360) / 2) * (Math.PI / 180);
        const r = 2.5 * pxPerMetre();
        const a = (-s.aim * Math.PI) / 180;
        ctx.save();
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r, a - half, a + half);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = tint;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.restore();
      }
      if (show.rc) {
        const rc = criticalDistance(room, s, band) * pxPerMetre();
        ctx.save();
        ctx.strokeStyle = tint;
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
      if (!pieceHeight(p)) continue;
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
      const parts = partsOf(p);
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
      for (const s of state.speakers) if (s.kind !== 'sub' && soloed.has(s)) drawAimRay(ctx, room, s, speakerColour(s, settings), toScreen);
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
        drawSpeaker(ctx, p.x, p.y, (-s.aim * Math.PI) / 180, speakerColour(s, settings), { selected: state.selected?.id === s.id, label: deviceLabel(s, 'speaker', state, roomy), size: Math.max(11, (boxSize(s).w * pxPerMetre()) / 2) });
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

