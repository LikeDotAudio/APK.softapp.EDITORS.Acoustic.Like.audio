// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { heightsAtXY } from '../acoustics/elevations.js';
import { DEG, pointInPolygon } from '../acoustics/geometry.js';
import { clampInside, CLEAR_M } from '../acoustics/inRoom.js';
import { boxSize, isListener, MIC_PRESETS } from '../acoustics/devices.js';
import { arrangedSpeakers, soundingSpeakers } from '../acoustics/layouts.js';
import { furnitureHeight } from '../acoustics/materials.js';
import { pieceFootprint, piecesOf } from '../acoustics/pieces.js';
import { talkers, talkPaths } from '../acoustics/talk.js';
import { firstReflections, heatOf } from '../acoustics/reflectionPanels.js';
import { css, colourOf, turbo } from './paint.js';
import { fitCanvas } from './glyphs.js';
import { drawPatch } from './treatments.js';
import { drawRayOverlay } from './rayOverlay.js';

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
 * Ray tracing (views/rayOverlay.js) goes over the room when it is on, in
 * place of the first reflections below, which it contains.
 *
 * With a mix seat, each speaker's first reflections (the plan's rays, in 3-D):
 * box → bounce → seat, and a glow where each lands on a surface you can see —
 * the first Fresnel zone, hot when the bounce arrives nearly as loud as the
 * direct sound, cool when the box's pattern or a treatment tames it. The
 * highlighted arrangement soloes its own speakers'; select a speaker to see
 * only its own, labelled.
 *
 * And the people talk to each other (acoustics/talk.js): a dashed line
 * between every two of them, coloured by the worse of the two ways' STI,
 * labelled both ways round — select one person to see only theirs.
 *
 * The things in the room stand in it as solids, shaded from over the camera's
 * shoulder and sorted in with the cells: each speaker its cabinet at its size
 * (litres), turned and tilted to where it aims, its drivers on the baffle;
 * each listener a seated figure facing the way they face; the furniture and
 * instruments laid on the floor stood up to their height.
 */

/**
 * THE ROOM ARRIVING
 *
 * A room new to the view builds itself up rather than appearing whole: its
 * wireframe, then a floor grid, then the surfaces, then the speakers and
 * listeners, then the treatments — seconds at 1×, `introSpeed()` times
 * faster (the header's Reveal fader); 0 shows it all at once, as does a
 * system that asks for reduced motion.
 */
const INTRO = { wire: [0, 1], grid: [1, 2], surface: [2, 3.2], device: [3.2, 4.2], treat: [4.2, 5.2] };
const INTRO_END = 5.2;

/**
 * `camera()` and `show()` let a caller (the tour, ui/tour.js) hold the camera
 * where it wants it and turn the overlays on or off without touching the
 * page's settings; null leaves the view's own camera and the settings' show.
 * A camera with `fit` ({ band }: the share of the height kept clear at the
 * foot) frames the room to fill the canvas, `zoom` times nearer than that.
 */
export function createView3d({ canvas, store, engine, introSpeed = () => 1, camera = () => null, show: showOver = () => null }) {
  const cam = { yaw: -55, pitch: 32, dist: 1.9 };
  /** When the room on show arrived (ms), and which room that was: a new plan layer starts the reveal again. */
  let introAt = null;
  let introKey = null;
  let introFrame = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** The devices as last drawn, in screen pixels: what a click is tested against. */
  let shown = [];
  /** The camera as last drawn — what a screen point is turned back into a ray with. */
  let seen = null;

  /** The ray from the eye through screen point (sx, sy): { o, d }. */
  function ray(sx, sy) {
    const { B, focal, ox, oy } = seen;
    const a = (sx - ox) / focal;
    const b = -(sy - oy) / focal;
    return { o: B.eye, d: norm({ x: B.fwd.x + B.right.x * a + B.up.x * b, y: B.fwd.y + B.right.y * a + B.up.y * b, z: B.fwd.z + B.right.z * a + B.up.z * b }) };
  }
  /** Where that ray meets the level plane at height z, or null when it runs along it or away. */
  function onLevel(sx, sy, z) {
    const { o, d } = ray(sx, sy);
    if (Math.abs(d.z) < 1e-6) return null;
    const t = (z - o.z) / d.z;
    return t > 0 ? { x: o.x + d.x * t, y: o.y + d.y * t } : null;
  }

  /**
   * Grab a device: it slides across the floor plan at its own height under the
   * pointer; Shift-drag lifts or lowers it instead. One outside the room comes
   * back to the middle first (inRoom.js), as it does in every view.
   */
  function grab(e, hit) {
    if (store.bringIn(hit.kind, hit.id, engine.out.room)) return;
    store.select({ kind: hit.kind, id: hit.id });
    const dev = (hit.kind === 'speaker' ? store.state.speakers : store.state.mics).find((d) => d.id === hit.id);
    if (!dev || !seen) return;
    const r = canvas.getBoundingClientRect();
    const start = onLevel(e.clientX - r.left, e.clientY - r.top, dev.z);
    const off = start ? { x: dev.x - start.x, y: dev.y - start.y } : { x: 0, y: 0 };
    const y0 = e.clientY;
    const z0 = dev.z;
    // metres per pixel at the device's distance, for lifting
    const d0 = { x: dev.x - seen.B.eye.x, y: dev.y - seen.B.eye.y, z: dev.z - seen.B.eye.z };
    const perPx = Math.max(0.001, dot(d0, seen.B.fwd) / seen.focal);
    const H = engine.out.room?.Hmax ?? 3;
    canvas.style.cursor = 'grabbing';
    const move = (ev) => {
      if (ev.shiftKey) {
        const rawZ = Math.max(0.05, Math.min(H - 0.05, z0 - (ev.clientY - y0) * perPx));
        const clamped = engine.out.room ? clampInside(engine.out.room, { x: dev.x, y: dev.y, z: rawZ, kind: dev.kind }, CLEAR_M) : { z: rawZ };
        store.update(hit.kind, hit.id, { z: clamped.z }, true);
        return;
      }
      const p = onLevel(ev.clientX - r.left, ev.clientY - r.top, dev.z);
      if (p) {
        const raw = { x: +(p.x + off.x).toFixed(3), y: +(p.y + off.y).toFixed(3), z: dev.z, kind: dev.kind };
        const clamped = engine.out.room ? clampInside(engine.out.room, raw, CLEAR_M) : raw;
        store.update(hit.kind, hit.id, { x: clamped.x, y: clamped.y }, true);
      }
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.style.cursor = '';
      store.commit();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  }

  function basis(room) {
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: room.Hmax / 2 };
    const size = Math.max(room.L, room.W, room.Hmax);
    const view = camera() ?? cam;
    const yaw = (view.yaw + store.state.settings.frontDeg - 90) * DEG;
    const pitch = view.pitch * DEG;
    const eye = {
      x: c.x + Math.cos(pitch) * Math.cos(yaw) * size * view.dist * -1,
      y: c.y + Math.cos(pitch) * Math.sin(yaw) * size * view.dist * -1,
      z: c.z + Math.sin(pitch) * size * view.dist,
    };
    const fwd = norm({ x: c.x - eye.x, y: c.y - eye.y, z: c.z - eye.z });
    const right = norm(cross(fwd, { x: 0, y: 0, z: 1 }));
    const up = cross(right, fwd);
    return { c, eye, fwd, right, up, size };
  }

  /**
   * The camera on the move: the field is drawn about 70 cells across a face
   * so an orbit keeps up; at rest every cell computed is drawn — a refined
   * field (engine.js) is hundreds of thousands of them.
   */
  let moving = false;
  let settle = 0;
  const still = () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      moving = false;
      render();
    }, 180);
  };

  function render() {
    const { ctx, w, h } = fitCanvas(canvas);
    const out = engine.out;
    const room = out.room;
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, w, h);
    if (!room) return;
    const key = engine.out.planLayer ?? '';
    if (key !== introKey) {
      introKey = key;
      introAt = performance.now();
    }
    const speed = introSpeed();
    const t = reduced || !(speed > 0) || introAt == null ? Infinity : ((performance.now() - introAt) / 1000) * speed;
    const A = Object.fromEntries(Object.entries(INTRO).map(([k, [a, b]]) => [k, Math.max(0, Math.min(1, (t - a) / (b - a)))]));
    cancelAnimationFrame(introFrame);
    if (t < INTRO_END) introFrame = requestAnimationFrame(render);
    const B = basis(room);
    const view = camera() ?? cam;
    let focal = Math.min(w, h) * 1.1;
    let ox = w / 2;
    let oy = h / 2;
    // the tour's camera fills its frame with the room: its corners fitted to the frame, a caption band left at the foot
    if (view.fit) {
      const corners = room.poly.flatMap((p) => [{ ...p, z: 0 }, { ...p, z: room.Hmax }]).map((p) => {
        const d = { x: p.x - B.eye.x, y: p.y - B.eye.y, z: p.z - B.eye.z };
        const zc = Math.max(1e-3, dot(d, B.fwd));
        return { x: dot(d, B.right) / zc, y: dot(d, B.up) / zc };
      });
      const [x0, x1] = [Math.min(...corners.map((c) => c.x)), Math.max(...corners.map((c) => c.x))];
      const [y0, y1] = [Math.min(...corners.map((c) => c.y)), Math.max(...corners.map((c) => c.y))];
      const band = view.fit.band ?? 0;
      focal = Math.min((w * 0.94) / (x1 - x0 || 1), (h * (0.92 - band)) / (y1 - y0 || 1)) * (view.zoom ?? 1);
      ox = w / 2 - ((x0 + x1) / 2) * focal;
      oy = (h * (1 - band)) / 2 + ((y0 + y1) / 2) * focal;
    }
    seen = { B, focal, w, h, ox, oy };
    const proj = (p) => {
      const d = { x: p.x - B.eye.x, y: p.y - B.eye.y, z: p.z - B.eye.z };
      const zc = dot(d, B.fwd);
      return { x: ox + (dot(d, B.right) / zc) * focal, y: oy - (dot(d, B.up) / zc) * focal, depth: zc };
    };

    const faces = [];
    const values = out.values;
    const grids = out.fieldGrids;
    const ok = values && grids && out.fieldRoom?.walls.length === room.walls.length;
    const scale = out.scale;
    const look = { ...store.state.settings.show, ...showOver() };
    const tracing = Boolean(look.trace);
    const show = look.field && ok && store.state.speakers.length > 0;

    const level = (kind, x, y) => (room.sloped ? heightsAtXY(room, x, y)[kind] : kind === 'floor' ? 0 : room.H);
    /** A floor or ceiling as cells; `vals` null paints them flat. Each corner sits at its surface's height. */
    const plane = (g, vals, kind) => {
      const step = moving ? Math.max(1, Math.round(g.nx / 70)) : 1;
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
      const step = moving ? Math.max(1, Math.round(g.nu / 60)) : 1;
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

    // the solids: a face is drawn only when it turns toward the eye
    const light = norm({ x: B.up.x - B.fwd.x * 0.6 - B.right.x * 0.4, y: B.up.y - B.fwd.y * 0.6 - B.right.y * 0.4, z: B.up.z - B.fwd.z * 0.6 - B.right.z * 0.4 });
    const shade = (rgb, n) => css(rgb.map((v) => Math.round(v * (0.35 + 0.65 * Math.max(0, dot(n, light))))));
    const facing = (q, n) => dot({ x: B.eye.x - q.x, y: B.eye.y - q.y, z: B.eye.z - q.z }, n) > 0;
    /** A box about `c` on axes rt (width), f (depth), up (height); `front` paints its +f face, the baffle. */
    function box(c, { rt, f, up }, w, d, h, rgb, extra = {}) {
      const at = (a, b, k) => ({
        x: c.x + (rt.x * a * w + f.x * b * d + up.x * k * h) / 2,
        y: c.y + (rt.y * a * w + f.y * b * d + up.y * k * h) / 2,
        z: c.z + (rt.z * a * w + f.z * b * d + up.z * k * h) / 2,
      });
      const axes = [rt, f, up];
      for (let ax = 0; ax < 3; ax++)
        for (const sgn of [-1, 1]) {
          const n = { x: axes[ax].x * sgn, y: axes[ax].y * sgn, z: axes[ax].z * sgn };
          const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
            const k = [0, 0, 0];
            k[ax] = sgn;
            k[(ax + 1) % 3] = u;
            k[(ax + 2) % 3] = v;
            return at(...k);
          });
          if (!facing(pts[0], n)) continue;
          const baffle = extra.front && ax === 1 && sgn === 1;
          faces.push({ pts, fill: shade(baffle ? extra.front : rgb, n), solid: true, selected: extra.selected, baffle: baffle ? { c: at(0, 1, 0), rt, up, w, h, spk: extra.spk } : null });
        }
    }
    /** An outline on the floor raised between z0 and z1 above it: its sides, its top, its underside when you are below it. `patch` lays its treatment on the top. */
    function raise(base, z0, z1, rgb, selected, patch = null) {
      const lo = base.map((q) => ({ ...q, z: q.z + z0 }));
      const hi = base.map((q) => ({ ...q, z: q.z + z1 }));
      const cx = base.reduce((a, q) => a + q.x, 0) / base.length;
      const cy = base.reduce((a, q) => a + q.y, 0) / base.length;
      lo.forEach((a, i) => {
        const b = lo[(i + 1) % lo.length];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < 1e-6) return;
        let n = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l, z: 0 };
        if (n.x * ((a.x + b.x) / 2 - cx) + n.y * ((a.y + b.y) / 2 - cy) < 0) n = { x: -n.x, y: -n.y, z: 0 };
        if (!facing(a, n)) return;
        faces.push({ pts: [a, b, hi[(i + 1) % hi.length], hi[i]], fill: shade(rgb, n), solid: true, selected });
      });
      if (facing(hi[0], { x: 0, y: 0, z: 1 })) faces.push({ pts: hi, fill: shade(rgb, { x: 0, y: 0, z: 1 }), solid: true, selected, ...(patch ? { patch } : {}) });
      else if (z0 > 0 && facing(lo[0], { x: 0, y: 0, z: -1 })) faces.push({ pts: lo, fill: shade(rgb, { x: 0, y: 0, z: -1 }), solid: true, selected });
    }
    /** A floor patch stood up to `tall`: its top, and every side that faces you. */
    function prism(p, tall, selected) {
      raise(p.points3d, 0, tall, rgbOf(p.material?.color), selected, p);
    }
    /** A placed product drawn as what it is made of (acoustics/pieces.js), turned and set where its block sits. */
    function pieces(p, parts, selected) {
      const th = (p.rotation ?? 0) * DEG;
      const [c, s] = [Math.cos(th), Math.sin(th)];
      const floor = p.points3d[0]?.z ?? 0;
      const W = (x, y, z) => ({ x: p.at.x + x * c - y * s, y: p.at.y + x * s + y * c, z: floor + z });
      const rt = { x: c, y: s, z: 0 };
      const f = { x: -s, y: c, z: 0 };
      const up = { x: 0, y: 0, z: 1 };
      for (const pc of parts) {
        const rgb = rgbOf(pc.colour);
        if (pc.shape === 'box') box(W(pc.x, pc.y, pc.z0 + pc.h / 2), { rt, f, up }, pc.w, pc.d, pc.h, rgb, { selected });
        else if (pc.shape === 'extrude') extrusion(pc, W, pc.axis === 'x' ? [rt, f] : [f, rt], rgb, selected);
        else raise(pieceFootprint(pc).map(([x, y]) => W(x, y, 0)), pc.z0, pc.z1, rgb, selected);
      }
    }
    /** A side outline in (u, z) run along its axis from a to b: both ends, and every face along it that turns to you. */
    function extrusion(pc, W, [along, across], rgb, selected) {
      const P = (t, u, z) => (pc.axis === 'x' ? W(t, u, z) : W(u, t, z));
      const cu = pc.pts.reduce((a, [u]) => a + u, 0) / pc.pts.length;
      const cz = pc.pts.reduce((a, [, z]) => a + z, 0) / pc.pts.length;
      for (const [t, sgn] of [[pc.a, -1], [pc.b, 1]]) {
        const n = { x: along.x * sgn, y: along.y * sgn, z: 0 };
        const pts = pc.pts.map(([u, z]) => P(t, u, z));
        if (facing(pts[0], n)) faces.push({ pts, fill: shade(rgb, n), solid: true, selected });
      }
      pc.pts.forEach(([u0, z0], i) => {
        const [u1, z1] = pc.pts[(i + 1) % pc.pts.length];
        const l = Math.hypot(u1 - u0, z1 - z0);
        if (l < 1e-6) return;
        let [nu, nz] = [(z1 - z0) / l, -(u1 - u0) / l];
        if (nu * ((u0 + u1) / 2 - cu) + nz * ((z0 + z1) / 2 - cz) < 0) [nu, nz] = [-nu, -nz];
        const n = { x: across.x * nu, y: across.y * nu, z: nz };
        const pts = [P(pc.a, u0, z0), P(pc.a, u1, z1), P(pc.b, u1, z1), P(pc.b, u0, z0)];
        if (facing(pts[0], n)) faces.push({ pts, fill: shade(rgb, n), solid: true, selected });
      });
    }
    /** A listener, seated: shins, thighs, torso and head, facing their aim; the ears at the mic. */
    function figure(m, rgb, selected) {
      const f = { x: Math.cos((m.aim ?? 90) * DEG), y: Math.sin((m.aim ?? 90) * DEG), z: 0 };
      const ax = { rt: { x: f.y, y: -f.x, z: 0 }, f, up: { x: 0, y: 0, z: 1 } };
      const at = (fwd, z) => ({ x: m.x + f.x * fwd, y: m.y + f.y * fwd, z });
      const shoulder = m.z - 0.22;
      const hip = Math.max(0.45, m.z - 0.75);
      const body = rgb.map((v) => Math.round(v * 0.7));
      box(at(0.4, hip / 2), ax, 0.3, 0.12, hip, body, { selected });
      box(at(0.2, hip), ax, 0.34, 0.45, 0.14, body, { selected });
      box(at(-0.05, (hip + shoulder) / 2), ax, 0.4, 0.22, shoulder - hip + 0.06, rgb, { selected });
      box(at(0, m.z - 0.18), ax, 0.1, 0.1, 0.1, body, { selected });
      // the head faces the eye, a disc
      const head = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const [ca, sa] = [Math.cos(a) * 0.1, Math.sin(a) * 0.12];
        return { x: m.x + B.right.x * ca + B.up.x * sa, y: m.y + B.right.y * ca + B.up.y * sa, z: m.z + 0.02 + B.right.z * ca + B.up.z * sa };
      });
      faces.push({ pts: head, fill: css([226, 196, 170]), solid: true, selected });
    }

    // the treatments: inward off their surface, so they are in front of it whichever way it is cut
    const lift = B.size * 0.004;
    const sel = store.state.selected?.kind === 'patch' ? store.state.selected.id : null;
    /** Faces pushed from `from` on belong to that stage of the reveal; anything untagged is a surface. */
    const stage = (from, name) => {
      for (let i = from; i < faces.length; i++) faces[i].stage ??= name;
    };
    stage(0, 'surface');
    const treatFrom = faces.length;
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
      const tall = p.surface === 'floor' ? furnitureHeight(p.paletteId) : 0;
      if (tall) {
        const parts = p.at ? piecesOf(p.paletteId) : null;
        if (parts) pieces(p, parts, p.id === sel);
        else prism(p, tall, p.id === sel);
        continue;
      }
      faces.push({ pts: p.points3d.map((q) => ({ x: q.x + n.x * lift, y: q.y + n.y * lift, z: q.z + n.z * lift })), patch: p, selected: p.id === sel });
    }

    stage(treatFrom, 'treat');
    const deviceFrom = faces.length;
    const { state } = store;
    const picked = state.selected?.id;
    // only the highlighted arrangement's boxes stand in the room: 2.0 is two (layouts.js soundingSpeakers)
    const sounding = soundingSpeakers(state.speakers, state.settings);
    for (const s of sounding) {
      const f = { x: Math.cos(s.aim * DEG) * Math.cos(s.tilt * DEG), y: Math.sin(s.aim * DEG) * Math.cos(s.tilt * DEG), z: Math.sin(s.tilt * DEG) };
      const rt = norm({ x: Math.sin(s.aim * DEG), y: -Math.cos(s.aim * DEG), z: 0 });
      const size = boxSize(s);
      box(s, { rt, f, up: cross(rt, f) }, size.w, size.d, size.h, rgbOf(s.color).map((v) => Math.round(v * 0.55)), { front: [24, 27, 34], spk: s, selected: s.id === picked });
    }
    for (const m of state.mics) if (isListener(m) || m.mix) figure(m, rgbOf(MIC_PRESETS[m.kind]?.colour ?? '#ff3b3b'), m.id === picked);
    stage(deviceFrom, 'device');

    for (const f of faces) {
      f.s = f.pts.map(proj);
      // a patch by its nearest corner: after every cell of the surface it lies on, never before one
      f.depth = f.patch && !f.solid ? Math.min(...f.s.map((p) => p.depth)) - lift : f.s.reduce((a, p) => a + p.depth, 0) / f.s.length;
    }
    faces.sort((a, b) => b.depth - a.depth);
    for (const f of faces) {
      if (f.s.some((p) => p.depth <= 0.01)) continue;
      ctx.globalAlpha = A[f.stage];
      if (!ctx.globalAlpha) continue;
      if (f.solid) {
        solid(f);
        continue;
      }
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

    /** A solid's face, its edges, a furniture top's hatch, a baffle's drivers. */
    function solid(f) {
      ctx.beginPath();
      f.s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
      if (f.patch) drawPatch(ctx, f.s, f.patch.material, { alpha: 0.25, selected: f.selected });
      else {
        ctx.strokeStyle = f.selected ? '#ffffff' : 'rgba(0,0,0,.55)';
        ctx.lineWidth = f.selected ? 1.5 : 0.75;
        ctx.stroke();
      }
      if (f.baffle) drivers(f.baffle);
    }
    /** The drivers on a baffle, as the box is built: one cone for a sub, a coaxial's rings, else a woofer under a tweeter or a horn. */
    function drivers({ c, rt, up, w, h, spk }) {
      const on = (u, v) => proj({ x: c.x + rt.x * u + up.x * v, y: c.y + rt.y * u + up.y * v, z: c.z + rt.z * u + up.z * v });
      const ring = (v0, r) => Array.from({ length: 20 }, (_, i) => on(Math.cos((i / 20) * Math.PI * 2) * r, v0 + Math.sin((i / 20) * Math.PI * 2) * r));
      const draw = (pts, fill) => {
        if (pts.some((q) => q.depth <= 0.01)) return;
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = spk.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      const cone = Math.min(w, h) * 0.4;
      if (spk.kind === 'sub') {
        draw(ring(0, cone), '#0e1015');
        draw(ring(0, cone * 0.3), '#2a2f3a');
      } else if (/coax/i.test(spk.driver ?? '')) {
        draw(ring(0, cone), '#0e1015');
        draw(ring(0, cone * 0.35), '#2a2f3a');
        draw(ring(0, cone * 0.12), '#c8ccd4');
      } else {
        draw(ring(-h * 0.17, w * 0.36), '#0e1015');
        draw(ring(-h * 0.17, w * 0.1), '#2a2f3a');
        if (spk.pattern !== 'horn') draw(ring(h * 0.3, w * 0.1), '#2a2f3a');
        else draw([on(-w * 0.36, h * 0.18), on(w * 0.36, h * 0.18), on(w * 0.36, h * 0.42), on(-w * 0.36, h * 0.42)], '#0e1015');
      }
    }

    // the reveal's floor grid, half-metre squares, gone again as the surfaces come in over it
    const gridAlpha = A.grid * (1 - A.surface);
    if (gridAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = gridAlpha * 0.8;
      const outline = room.poly.map((p) => proj({ ...p, z: level('floor', p.x, p.y) }));
      ctx.beginPath();
      outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.75;
      const xs = room.poly.map((p) => p.x);
      const ys = room.poly.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const line = (a, b) => {
        const [p, q] = [proj(a), proj(b)];
        if (p.depth <= 0.01 || q.depth <= 0.01) return;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
      };
      ctx.beginPath();
      for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5) line({ x, y: y0, z: 0 }, { x, y: y1, z: 0 });
      for (let y = Math.ceil(y0 * 2) / 2; y <= y1; y += 0.5) line({ x: x0, y, z: 0 }, { x: x1, y, z: 0 });
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = A.wire;
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
    drawMetreStick(ctx, proj, room, B, level);
    ctx.globalAlpha = A.device;

    const mix = state.mics.find((m) => m.mix);
    if (tracing) drawRayOverlay(ctx, proj, room, state, { key: true, w });
    else if (look.rays && mix) {
      const picked = state.selected?.kind === 'speaker' ? state.selected.id : null;
      const rays = firstReflections(room, arrangedSpeakers(state.speakers, state.settings).filter((sp) => !picked || sp.id === picked), mix, state.settings.band ?? 2);
      const labelled = picked || rays.length <= 12;
      const seen = (r) => {
        if (r.surface === 'ceiling') return B.eye.z < room.Hmax;
        if (r.surface === 'floor') return B.eye.z > 0;
        // a console's top (the console bounce) is a mirror at its height, seen from above it
        const wall = r.surface === 'wall' ? room.walls[r.wall] : null;
        if (!wall) return B.eye.z > (r.hit?.z ?? 0);
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
    if (look.talk !== false) drawTalk(ctx, proj, room, state);
    // what the solids do not say: the stand under a box, a measurement mic's dot and aim, every name
    const person = (m) => isListener(m) || m.mix;
    const devices = [
      ...sounding.map((d) => ({ d, colour: d.color, label: d.role || d.name, under: d.z - boxSize(d).h / 2, top: d.z + boxSize(d).h / 2 })),
      ...state.mics.map((d) => ({ d, colour: d.mix ? '#ff3b3b' : '#e5e7eb', r: person(d) ? 0 : 5, label: d.mix ? 'MIX' : d.name, under: person(d) ? 0 : d.z, top: d.z + (person(d) ? 0.2 : 0) })),
    ]
      .map((o) => ({ ...o, s: proj(o.d), t: proj({ ...o.d, z: o.top }), u: proj({ ...o.d, z: o.under }), base: proj({ ...o.d, z: 0 }) }))
      .sort((a, b) => b.s.depth - a.s.depth);
    shown = devices.map((o) => ({ kind: state.speakers.includes(o.d) ? 'speaker' : 'mic', id: o.d.id, x: o.s.x, y: o.s.y }));
    for (const o of devices) {
      if (o.under > 0.02) {
        ctx.strokeStyle = 'rgba(255,255,255,.3)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(o.base.x, o.base.y);
        ctx.lineTo(o.u.x, o.u.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o.r && o.d.aim !== undefined) {
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
      if (o.r) {
        ctx.fillStyle = o.colour;
        ctx.strokeStyle = state.selected?.id === o.d.id ? '#fff' : '#000';
        ctx.lineWidth = state.selected?.id === o.d.id ? 2 : 1;
        ctx.beginPath();
        ctx.arc(o.s.x, o.s.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(o.label, o.t.x + 6, o.t.y - 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '11px system-ui';
    ctx.fillText('3-D cut-away · drag a device to move it (Shift: up/down) · drag elsewhere to orbit · wheel to zoom', 10, h - 10);
  }

  /** The device drawn nearest a click, within a fingertip; the nearest-to-the-eye wins a tie by being drawn last. */
  function deviceAt(e) {
    const r = canvas.getBoundingClientRect();
    let best = null;
    for (const o of shown) {
      const d = Math.hypot(o.x - (e.clientX - r.left), o.y - (e.clientY - r.top));
      if (d <= 12 && (!best || d <= best.d)) best = { ...o, d };
    }
    return best;
  }
  canvas.addEventListener('dblclick', (e) => {
    const hit = deviceAt(e);
    if (hit) store.bringIn(hit.kind, hit.id, engine.out.room);
  });

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const hit = deviceAt(e);
    if (hit) return grab(e, hit);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const { yaw, pitch } = cam;
    const move = (ev) => {
      cam.yaw = yaw - (ev.clientX - x0) * 0.4;
      cam.pitch = Math.max(-10, Math.min(85, pitch + (ev.clientY - y0) * 0.3));
      moving = true;
      clearTimeout(settle);
      render();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      if (moving) still();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  });
  // a hand over a device: it can be picked up
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    canvas.style.cursor = deviceAt(e) ? 'grab' : '';
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.dist = Math.max(0.8, Math.min(5, cam.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
      moving = true;
      render();
      still();
    },
    { passive: false },
  );

  /** Build the room up again from its wireframe (the Reveal fader moved). */
  function replay() {
    introAt = performance.now();
    render();
  }

  return { render, replay };
}

/**
 * The metre stick, as XYZ: three 1 m arms from the floor corner nearest the
 * eye (the cut-away leaves it open), X and Y along the drawing's own axes
 * turned into the room, Z straight up, each banded every 10 cm like a
 * surveyor's rod so the room's size reads at a glance from any orbit.
 */
const STICK_AXES = [
  { key: 'X', dir: { x: 1, y: 0, z: 0 }, rgb: [239, 68, 68] },
  { key: 'Y', dir: { x: 0, y: 1, z: 0 }, rgb: [34, 197, 94] },
  { key: 'Z', dir: { x: 0, y: 0, z: 1 }, rgb: [59, 130, 246] },
];
// the IEC ratings' colours, bad … excellent (intelligibility.js STI_RATINGS)
const STI_COLOURS = [[0.75, '#22c55e'], [0.6, '#84cc16'], [0.45, '#eab308'], [0.3, '#f97316'], [0, '#ef4444']];
export const stiColour = (sti) => STI_COLOURS.find(([min]) => sti >= min)[1];
const talkMemo = { key: '', paths: [] };

/** Every two people, a dashed line between their heads, its colour the worse way's STI, labelled both ways round. */
function drawTalk(ctx, proj, room, state) {
  const people = talkers(state.mics);
  if (people.length < 2) return;
  // the image sources of every mouth to every ear: worked out again only when the room or a person moves
  const maxOrder = Math.min(state.settings.maxOrder ?? 2, 3);
  const key = JSON.stringify([people.map((p) => [p.id, p.x, p.y, p.z, p.aim]), maxOrder]);
  if (talkMemo.key !== key || talkMemo.room !== room) Object.assign(talkMemo, { key, room, paths: talkPaths(room, people, { maxOrder }) });
  const way = (a, b) => talkMemo.paths.find((p) => p.from === a.id && p.to === b.id);
  const picked = people.find((p) => p.id === state.selected?.id);
  const labelled = picked || people.length <= 5;
  ctx.save();
  // the reveal's fade rides on everything drawn here
  const fade = ctx.globalAlpha;
  ctx.font = '10px ui-monospace, monospace';
  ctx.setLineDash([5, 4]);
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const [a, b] = [people[i], people[j]];
      if (picked && a !== picked && b !== picked) continue;
      const [ab, ba] = [way(a, b), way(b, a)];
      if (!ab || !ba) continue;
      const pa = proj({ ...a, z: a.z + 0.02 });
      const pb = proj({ ...b, z: b.z + 0.02 });
      if (pa.depth <= 0.01 || pb.depth <= 0.01) continue;
      const colour = stiColour(Math.min(ab.sti, ba.sti));
      ctx.strokeStyle = colour;
      ctx.globalAlpha = fade * (labelled ? 0.9 : 0.5);
      ctx.lineWidth = picked ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      if (!labelled) continue;
      // read from the picked person's side: what they are heard at, then what they hear
      const [say, hear, other] = picked === b ? [ba, ab, a] : [ab, ba, b];
      const text = picked ? `${other.name}: heard ${say.sti.toFixed(2)} · hears ${hear.sti.toFixed(2)} · ${say.r.toFixed(1)} m` : `STI ${ab.sti.toFixed(2)} → ← ${ba.sti.toFixed(2)}`;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      ctx.globalAlpha = fade;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(8,10,14,.75)';
      ctx.fillRect(mx - 2, my - 11, ctx.measureText(text).width + 4, 14);
      ctx.fillStyle = colour;
      ctx.fillText(text, mx, my);
      ctx.setLineDash([5, 4]);
    }
  ctx.restore();
}

function drawMetreStick(ctx, proj, room, B, level) {
  const corner = room.poly.reduce((a, p) => (Math.hypot(p.x - B.eye.x, p.y - B.eye.y) < Math.hypot(a.x - B.eye.x, a.y - B.eye.y) ? p : a));
  const o = { x: corner.x, y: corner.y, z: level('floor', corner.x, corner.y) };
  // a horizontal arm points toward the room's middle, so it lies along the floor, not out of the room
  const into = { x: Math.sign(B.c.x - o.x) || 1, y: Math.sign(B.c.y - o.y) || 1, z: 1 };
  const at = (dir, t) => ({ x: o.x + dir.x * into.x * t, y: o.y + dir.y * into.y * t, z: o.z + dir.z * t });
  const base = proj(o);
  if (base.depth <= 0.01) return;
  ctx.font = '10px ui-monospace, monospace';
  for (const { key, dir, rgb } of STICK_AXES) {
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const a = proj(at(dir, i / 10));
      const b = proj(at(dir, (i + 1) / 10));
      if (a.depth <= 0.01 || b.depth <= 0.01) continue;
      ctx.strokeStyle = i % 2 ? '#f1f5f9' : css(rgb);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const tip = proj(at(dir, 1.08));
    ctx.fillStyle = css(rgb);
    const sign = dir.z || (dir.x ? into.x : into.y) > 0 ? '' : '−'; // −X when the arm runs against the drawing's axis
    ctx.fillText(`${sign}${key}`, tip.x - 4, tip.y + 4);
  }
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText('1 m', base.x + 6, base.y + 12);
}

/** '#rrggbb' → [r, g, b]; grey when it is not one. */
function rgbOf(hex) {
  const n = parseInt(String(hex ?? '').replace('#', ''), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [160, 160, 160];
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
