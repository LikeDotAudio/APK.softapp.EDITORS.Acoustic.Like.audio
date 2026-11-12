// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE PLAN — what the pointer does to a thing on it: turn, spin, the right-click menu, drag (onto the divisions), drag the CAD's gear, hold to orbit.
 * Lifted out of createPlanView (plan.js, ROAD-3753): `pv` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { consoleOf } from '../acoustics/console.js';
import { patchesFromCad } from '../compute/engine.js';
import { wrap } from './plan-draw.js';
import { openSpeakerDatasheetModal } from '../ui/speakerDatasheetModal.js';
import { isListener } from '../acoustics/devices.js';
import { dragFrom } from './glyphs.js';
import { noseMarks, snapNose } from '../acoustics/layouts.js';
import { snapToDivisions } from './guides.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { mirrorName } from '../acoustics/symmetry.js';
import { DEG } from '../acoustics/geometry.js';

export function planDrag(pv) {
  const { cad, cadGear, engine, hits, k, onDrag, pxPerMetre, render, store, toWorld } = pv;

  const HOLD_MS = 380;

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
    pv.spinning = { kind, id, before: t.angle(), dev: t.dev };
    const sheet = document.createElement('div');
    sheet.className = 'spin';
    sheet.title = `Turning it${t.step > 1 ? ` in ${t.step}° steps (Alt: free)` : ''}: click to set · Esc to cancel`;
    hits.parentElement.appendChild(sheet);
    const end = (keep) => {
      sheet.remove();
      window.removeEventListener('keydown', key, true);
      if (!keep) t.set(pv.spinning.before, true);
      pv.spinning = null;
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
      ...(kind === 'speaker' ? [
        ['📄 Speaker Datasheet & Simulation…', () => {
          const dev = store.state.speakers.find((s) => s.id === id);
          if (dev) openSpeakerDatasheetModal(dev, { onUpdate: (patch) => store.update('speaker', id, patch) });
        }],
      ] : []),
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
    if ((e.ctrlKey || e.metaKey) && !pv.spinning) return startSpin(el);
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
      pv.orbit = beginOrbit(dev, listener);
      render();
    }, HOLD_MS) : 0;
    const wheel = (ev) => {
      if (!held) return;
      ev.preventDefault();
      pv.orbit.toe += ev.deltaY < 0 ? 1 : -1;
      applyOrbit(pv.orbit, pv.orbit.last ?? { x: dev.x, y: dev.y }, ev.shiftKey);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    dragFrom(
      e,
      el,
      (ev) => {
        if (!held && !moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        moved = true;
        const p = toWorld(ev.clientX, ev.clientY);
        if (held) applyOrbit(pv.orbit, p, ev.shiftKey);
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
            pv.turning = { id, mark: snap.mark };
            store.update(kind, id, { aim: snap.aim }, true);
          } else store.update(kind, id, { aim: Math.round(aim) }, true);
        } else {
          let target = { x: origin.x + p.x - start.x, y: origin.y + p.y - start.y, z: dev.z ?? 0, kind: dev.kind };
          // speakers and mics settle onto the recommended divisions, crossings first (Alt: free)
          pv.snapped = null;
          if (kind !== 'furniture' && engine.out.room && !ev.altKey) {
            const s = snapToDivisions(engine.out.room, target, { reach: 18 / pxPerMetre(), lineReach: 8 / pxPerMetre() });
            target = { ...target, x: s.x, y: s.y };
            if (s.along !== null || s.across !== null) pv.snapped = { along: s.along, across: s.across };
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
        pv.orbit = null;
        pv.turning = null;
        pv.snapped = null;
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


  return { openMenu, showMenu, startDrag };
}
