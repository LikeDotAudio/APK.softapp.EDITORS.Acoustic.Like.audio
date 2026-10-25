// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, C } from './bands.js';
import { mirrorPoint, pointInPolygon, segmentCross } from './geometry.js';
import { furnitureTops, specular } from './images.js';
import { deviceGain } from './patterns.js';
import { elevationOrigin, faceCoords } from './patches.js';
import { heightsAtXY } from './elevations.js';
import { furnitureHeight, lookup } from './materials.js';

/**
 * WHERE THE PANELS GO
 *
 * The first thing a room is treated for: the first reflections. For every
 * speaker (subs excepted — below 120 Hz a panel does nothing) and the mix
 * position, the point on each wall where the mirror path lands — the image of
 * the speaker in that wall, joined to the seat, crosses the wall there — and
 * the point on the ceiling the same way. A panel centred on each is what a
 * designer puts up first ("the mirror trick").
 *
 * The height on a wall: the path rises or falls evenly from the box to the
 * ears, so the hit sits at the fraction of the plan path already travelled.
 * A panel is clamped onto its wall — whole, between the floor and the ceiling.
 *
 * Each panel comes back twice over: where it is in the room (`at`, metres,
 * plan; `z`), and where it is drawn in the CAD (`sheet`, the four corners on
 * the wall's elevation in sheet metres — the frame patches.js reads painted
 * patches in, so a panel drawn there lands back where it was computed; or in
 * plan for the ceiling). Named per face, left to right as the elevation shows
 * it: LEFT-1, LEFT-2 …, and labelled with the speaker it answers.
 *
 * What each panel IS rides along as `treatment`, for whoever picks the product:
 *
 *   absorber  the mirror points on the walls, and the wall BEHIND each box
 *             (`front`): there a free-standing box's rear radiation — all of
 *             a dipole's back lobe, most of anything's bass and low mids —
 *             comes straight back, smearing the image and colouring it. One
 *             panel w × h centred on the box's foot on that wall, at its
 *             height. A flush or corner-mounted box IS in that wall and has
 *             nothing behind it to treat.
 *   diffuser  with `diffuse`, the side walls' mirror points become diffusers
 *             spread over the band the literature puts them in — 305 mm under
 *             the ears to 914 mm over them (diffuserBand) — so the side
 *             reflections come back scattered rather than taken out, and the
 *             room stays alive. `ceiling: 'diffuser'` does the same over the
 *             seat: the frontal bounce off the ceiling sent to the sides
 *             instead of into the heads.
 */

/** Where side-wall diffusers go: from 305 mm under the ears to 914 mm over them (1 ft and 3 ft), kept between floor and ceiling. */
export const DIFFUSER_BELOW = 0.305;
export const DIFFUSER_ABOVE = 0.914;

export function diffuserBand(room, mix) {
  const hts = heightsAtXY(room, mix.x, mix.y);
  return { lo: Math.max(hts.floor, mix.z - DIFFUSER_BELOW), hi: Math.min(hts.ceiling, mix.z + DIFFUSER_ABOVE) };
}

/** The wall straight behind a box — its inward normal along the box's aim — and the box's foot on it: { wall, at, d }, or null. */
export function wallBehind(room, s) {
  const a = (s.aim ?? 0) * (Math.PI / 180);
  const f = { x: Math.cos(a), y: Math.sin(a) };
  let best = null;
  for (const wall of room.walls) {
    if (f.x * wall.nIn.x + f.y * wall.nIn.y < 0.5) continue;
    const d = (s.x - wall.a.x) * wall.nIn.x + (s.y - wall.a.y) * wall.nIn.y;
    if (!(d > 0)) continue;
    const at = { x: s.x - wall.nIn.x * d, y: s.y - wall.nIn.y * d };
    const u = (at.x - wall.a.x) * wall.t.x + (at.y - wall.a.y) * wall.t.y;
    if (u < 0 || u > wall.len) continue;
    if (!best || d < best.d) best = { wall, at, d };
  }
  return best;
}

/**
 * The panel options from the settings (settings.autoPanels): the wall behind
 * each box is treated unless `front` is false; side-wall diffusers only when
 * `sideDiffusers` is on; the ceiling a diffuser when its chosen product is one.
 */
export function panelOptions(ap = {}, ceilingOn = true) {
  const ceilingDiffuses = lookup(ap.ceiling ?? 'cloud-1200')?.category === 'Diffuser';
  return { w: ap.w ?? 0.6, h: ap.h ?? 1.2, front: ap.front !== false, diffuse: ap.sideDiffusers === true, ceiling: ceilingOn ? (ceilingDiffuses ? 'diffuser' : true) : false };
}

/** The product a panel is drawn as: the chosen wall panel, ceiling product or side diffuser (a 1200 × 600 QRD unless one is chosen). */
export function panelProduct(p, ap = {}) {
  if (p.kind === 'ceiling') return ap.ceiling ?? 'cloud-1200';
  return p.treatment === 'diffuser' ? ap.diffuser ?? 'qrd-1200x600' : ap.wall ?? 'panel-1200x600x100';
}

export function reflectionPanels(room, speakers, mix, { w = 0.6, h = 1.2, cw = 1.2, ch = 1.2, ceiling = true, front = false, diffuse = false } = {}) {
  if (!room || !mix) return [];
  const out = [];
  const band = diffuse ? diffuserBand(room, mix) : null;
  for (const s of speakers) {
    if (s.kind === 'sub') continue;
    for (const wall of room.walls) {
      const side = (s.x - wall.a.x) * wall.nIn.x + (s.y - wall.a.y) * wall.nIn.y;
      if (side <= 0) continue;
      const img = mirrorPoint(s, wall.a, wall.nIn);
      const hit = segmentCross(img, mix, wall.a, wall.b);
      if (!hit) continue;
      const at = { x: wall.a.x + (wall.b.x - wall.a.x) * hit.u, y: wall.a.y + (wall.b.y - wall.a.y) * hit.u };
      const q = Math.hypot(at.x - img.x, at.y - img.y) / Math.hypot(mix.x - img.x, mix.y - img.y);
      const hts = heightsAtXY(room, at.x, at.y);
      const sideWall = wall.face === 'left' || wall.face === 'right';
      if (band && sideWall && band.hi > band.lo) {
        const sheet = onElevation(room, wall, at, (band.lo + band.hi) / 2, w, band.hi - band.lo);
        if (sheet) out.push({ kind: 'wall', treatment: 'diffuser', face: wall.face, wall: wall.i, speaker: s.role || s.name, at, z: (band.lo + band.hi) / 2, sheet });
        continue;
      }
      const z = Math.max(hts.floor + h / 2, Math.min(hts.ceiling - h / 2, s.z + (mix.z - s.z) * q));
      const sheet = onElevation(room, wall, at, z, w, h);
      if (sheet) out.push({ kind: 'wall', treatment: 'absorber', face: wall.face, wall: wall.i, speaker: s.role || s.name, at, z, sheet });
    }
    if (front && (s.mount ?? 'free') === 'free') {
      const back = wallBehind(room, s);
      if (back) {
        const hts = heightsAtXY(room, back.at.x, back.at.y);
        const z = Math.max(hts.floor + h / 2, Math.min(hts.ceiling - h / 2, s.z));
        const sheet = onElevation(room, back.wall, back.at, z, w, h);
        if (sheet) out.push({ kind: 'wall', treatment: 'absorber', behind: true, face: back.wall.face, wall: back.wall.i, speaker: s.role || s.name, at: back.at, z, sheet });
      }
    }
    if (!ceiling) continue;
    const top = heightsAtXY(room, mix.x, mix.y).ceiling;
    const up = top - s.z + (top - mix.z);
    if (up <= 0) continue;
    const q = (top - s.z) / up;
    const at = { x: s.x + (mix.x - s.x) * q, y: s.y + (mix.y - s.y) * q };
    const { f, r } = room.frame;
    // a cloud is laid square to the room
    const corner = (a, b) => ({ x: at.x + r.x * a + f.x * b, y: at.y + r.y * a + f.y * b });
    out.push({ kind: 'ceiling', treatment: ceiling === 'diffuser' ? 'diffuser' : 'absorber', face: 'ceiling', wall: null, speaker: s.role || s.name, at, z: top, sheet: [corner(-cw / 2, -ch / 2), corner(cw / 2, -ch / 2), corner(cw / 2, ch / 2), corner(-cw / 2, ch / 2)] });
  }
  // names: per face, in the order the elevation reads left to right
  const byFace = new Map();
  for (const p of out) {
    if (!byFace.has(p.face)) byFace.set(p.face, []);
    byFace.get(p.face).push(p);
  }
  for (const [face, list] of byFace) {
    list.sort((a, b) => Math.min(...a.sheet.map((c) => c.x)) - Math.min(...b.sheet.map((c) => c.x)));
    list.forEach((p, i) => (p.name = `${face.toUpperCase()}-${i + 1}`));
  }
  return out;
}

/** A panel w × h centred at `at`, z on `wall`, as its four corners on that face's elevation (sheet metres). */
function onElevation(room, wall, at, z, w, h) {
  const origin = elevationOrigin(room, wall.face);
  if (!origin) return null;
  const tOf = faceCoords(room, wall.face);
  const span = wall.face === 'left' || wall.face === 'right' ? room.L : room.W;
  // where along the wall the panel's two edges are, kept on the wall
  const half = Math.min(w / 2, wall.len / 2);
  const u = Math.max(half, Math.min(wall.len - half, (at.x - wall.a.x) * wall.t.x + (at.y - wall.a.y) * wall.t.y));
  const edge = (k) => ({ x: wall.a.x + wall.t.x * (u + k), y: wall.a.y + wall.t.y * (u + k) });
  // sheet x from the face's span t: the inverse of wallPieces' d → t
  const sx = (p) => {
    const t = tOf(p).t;
    const d = wall.face === 'left' || wall.face === 'back' ? span - t : t;
    return origin.x + d;
  };
  const x0 = sx(edge(-half));
  const x1 = sx(edge(half));
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (hi - lo < 1e-6) return null;
  const y0 = origin.y + z - h / 2;
  const y1 = origin.y + z + h / 2;
  return [{ x: lo, y: y0 }, { x: hi, y: y0 }, { x: hi, y: y1 }, { x: lo, y: y1 }];
}

/**
 * THE FIRST REFLECTIONS THEMSELVES — what the panels answer, as rays
 *
 * For each speaker (subs excepted) and the mix seat: every first-order bounce
 * off a wall, the ceiling and the floor, as a point in the room (`hit`, x y z
 * metres), its path, its delay behind the direct sound, and how hot it lands
 * at the seat — `db` relative to the direct sound: the box's pattern toward
 * the bounce against toward the seat, the extra spreading, and what the
 * surface keeps in the mirror direction in `band` (a treatment over the spot
 * is what it keeps, so a panel cools its own spot). `zone` is the radius of
 * the first Fresnel zone at that band — the patch of surface that does the
 * reflecting, the size the heat spot is drawn.
 *
 * Unlike the panels, a wall hit is not clamped: a bounce that would land
 * above the ceiling or under the floor is not a wall reflection, and is left out.
 */
export function firstReflections(room, speakers, mix, band = 2) {
  if (!room || !mix) return [];
  const freq = BANDS[band];
  const lambda = C / freq;
  const out = [];
  for (const s of speakers) {
    if (s.kind === 'sub') continue;
    const direct = Math.hypot(s.x - mix.x, s.y - mix.y, s.z - mix.z);
    if (direct < 1e-6) continue;
    const toSeat = deviceGain(s, [mix.x - s.x, mix.y - s.y, mix.z - s.z], freq);
    const add = (surface, wall, face, hit, mat, patch) => {
      const d1 = Math.hypot(hit.x - s.x, hit.y - s.y, hit.z - s.z);
      const d2 = Math.hypot(mix.x - hit.x, mix.y - hit.y, mix.z - hit.z);
      const path = d1 + d2;
      const keep = Math.max(1e-6, specular(patch?.material ?? mat, band));
      const db = deviceGain(s, [hit.x - s.x, hit.y - s.y, hit.z - s.z], freq) - toSeat + 20 * Math.log10(direct / path) + 10 * Math.log10(keep);
      out.push({ speaker: s, name: s.role || s.name, surface, wall, face, hit, path, delayMs: ((path - direct) / C) * 1000, db, treated: patch ?? null, zone: Math.sqrt((lambda * d1 * d2) / path) });
    };
    for (const wall of room.walls) {
      const side = (s.x - wall.a.x) * wall.nIn.x + (s.y - wall.a.y) * wall.nIn.y;
      if (side <= 0) continue;
      const img = mirrorPoint(s, wall.a, wall.nIn);
      const cross = segmentCross(img, mix, wall.a, wall.b);
      if (!cross) continue;
      const at = { x: wall.a.x + (wall.b.x - wall.a.x) * cross.u, y: wall.a.y + (wall.b.y - wall.a.y) * cross.u };
      const z = s.z + (mix.z - s.z) * cross.t;
      const hts = heightsAtXY(room, at.x, at.y);
      if (z < hts.floor || z > hts.ceiling) continue;
      const u = (at.x - wall.a.x) * wall.t.x + (at.y - wall.a.y) * wall.t.y;
      const patch = (room.patches ?? []).find((p) => p.surface === 'wall' && p.wall === wall.i && pointInPolygon(u, z, p.points3d.map((q) => ({ x: (q.x - wall.a.x) * wall.t.x + (q.y - wall.a.y) * wall.t.y, y: q.z }))));
      add('wall', wall.i, wall.face, { ...at, z }, wall.material, patch);
    }
    // ceiling and floor as flat at their height over the seat — the mirror is horizontal
    const { floor, ceiling } = heightsAtXY(room, mix.x, mix.y);
    const tops = furnitureTops(room);
    const mirrorAt = (level) => {
      const a = Math.abs(level - s.z);
      const b = Math.abs(level - mix.z);
      if (a + b < 1e-6 || (s.z - level) * (mix.z - level) <= 0) return null;
      const q = a / (a + b);
      return { x: s.x + (mix.x - s.x) * q, y: s.y + (mix.y - s.y) * q, z: level };
    };
    for (const [surface, level, mat] of [['ceiling', ceiling, room.ceiling], ['floor', floor, room.floor]]) {
      const hit = mirrorAt(level);
      if (!hit || !pointInPolygon(hit.x, hit.y, room.poly)) continue;
      // the floor under a console never hears the box: the console's top takes that bounce, below
      if (surface === 'floor' && tops.some((t) => pointInPolygon(hit.x, hit.y, t.poly))) continue;
      const patch = (room.patches ?? []).find((p) => p.surface === surface && !(surface === 'floor' && furnitureHeight(p.paletteId)) && pointInPolygon(hit.x, hit.y, p.points3d));
      add(surface, null, surface, hit, mat, patch);
    }
    // the console bounce: the mirror laid on the desk — a top under both the box and the ears, the spot inside its outline
    for (const t of tops) {
      const hit = mirrorAt(t.z);
      if (!hit || s.z <= t.z || !pointInPolygon(hit.x, hit.y, t.poly)) continue;
      add('console', null, 'console', hit, t.material, null);
    }
  }
  return out;
}

/** What a wall is at a point on it — the patch painted there, else what the wall is faced with: { material, patch }. */
export function finishAt(room, wall, at, z) {
  const u = (at.x - wall.a.x) * wall.t.x + (at.y - wall.a.y) * wall.t.y;
  const patch = (room.patches ?? []).find((p) => p.surface === 'wall' && p.wall === wall.i && pointInPolygon(u, z, p.points3d.map((q) => ({ x: (q.x - wall.a.x) * wall.t.x + (q.y - wall.a.y) * wall.t.y, y: q.z }))));
  return { material: patch?.material ?? lookup(wall.material.base) ?? wall.material, patch: patch ?? null };
}

/** A reflection's heat, 0 (20 dB under the direct sound, or quieter) to 1 (as loud as it). */
export const heatOf = (r) => Math.max(0, Math.min(1, (r.db + 20) / 20));
