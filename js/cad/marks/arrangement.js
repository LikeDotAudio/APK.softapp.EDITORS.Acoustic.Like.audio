// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — the speaker arrangement's reference lines
 * from the mix seat. Lifted out of cad/marks.js (ROAD-3753).
 */
import {
  activeSet,
  arrayFront,
  layoutCentre,
  layoutPositions,
  LAYOUTS,
  setColour,
  soundingSpeakers,
} from '../../acoustics/layouts.js';
import { fromFrame } from '../../acoustics/room.js';
import { LAYOUT_LAYER, mm, r3 } from './common.js';
import { DEG } from '../../acoustics/geometry.js';
import { boxSize } from '../../acoustics/devices.js';
import { PRODUCTS } from '../../acoustics/materials.js';
import { furnitureOf } from './blowup.js';

// ------------------------------------------------------------------ arrangement

export function arrangementMarks(room, settings, mix, state = null) {
  const layout = LAYOUTS[settings.layout?.preset];
  if (!layout) return [];
  const seat = layoutCentre(mix ?? { ...fromFrame(room, 0.38 * room.L, 0.5 * room.W), z: 1.2 }, arrayFront(settings), settings.layout.offset);
  const radius = settings.layout.radius ?? 2;
  const ref = layoutPositions(settings.layout.preset, { x: seat.x, y: seat.y, z: seat.z ?? 1.2 }, arrayFront(settings), radius, 99);
  const lines = [];
  const texts = [];
  const rel = (p) => [r3(p.x - seat.x), r3(p.y - seat.y)];
  const bedRefs = layout.speakers.filter((s) => s.el === 0);
  // the ring at ear height, in azimuth order: the triangle for stereo, the circle's polygon for 5.1 and up
  const bed = ref.filter((p) => !p.sub && bedRefs.some((s) => s.name === p.role)).sort((a, b) => azOf(a, seat, settings) - azOf(b, seat, settings));
  for (const p of ref) {
    if (p.sub) continue;
    const [x, y] = rel(p);
    lines.push([0, 0, x, y]);
    texts.push({ text: `${p.role} ${Math.round(azOf(p, seat, settings))}°`, x: r3(x * 1.08), y: r3(y * 1.08), height: 0.06 });
  }
  if (bed.length === 2) {
    // stereo: the equilateral triangle, seat to L to R
    const [a, b] = bed.map(rel);
    lines.push([a[0], a[1], b[0], b[1]]);
  } else for (let i = 0; i < bed.length; i++) {
    const [a, b] = [rel(bed[i]), rel(bed[(i + 1) % bed.length])];
    lines.push([a[0], a[1], b[0], b[1]]);
  }
  // each reference's tolerance window, as two short spokes at its limits
  for (const s of layout.speakers) {
    if (s.side === 'C' || s.top) continue;
    for (const deg of s.range) {
      const az = (s.az > 0 ? deg : -deg) + arrayFront(settings);
      const r0 = radius * 0.8;
      const r1 = radius * 1.05;
      lines.push([r3(r0 * Math.cos(az * DEG)), r3(r0 * Math.sin(az * DEG)), r3(r1 * Math.cos(az * DEG)), r3(r1 * Math.sin(az * DEG))]);
    }
  }
  texts.push({ text: `${layout.label} · r ${mm(radius)} mm`, x: r3(-radius * 0.5), y: r3(-radius - 0.15), height: 0.06 });

  // Room perimeter outline on the layout layer so CAD shows room alignment
  if (room?.poly?.length) {
    for (let i = 0; i < room.poly.length; i++) {
      const p1 = room.poly[i];
      const p2 = room.poly[(i + 1) % room.poly.length];
      lines.push([r3(p1.x - seat.x), r3(p1.y - seat.y), r3(p2.x - seat.x), r3(p2.y - seat.y)]);
    }
  }

  // the arrangement's own boxes (mains, surrounds, heights, subs) with their size and aim — not the muted ones
  for (const s of state ? soundingSpeakers(state.speakers, settings) : []) {
    const dx = s.x - seat.x;
    const dy = s.y - seat.y;
    const sz = boxSize(s);
    const w = sz.w || 0.35;
    const d = sz.d || 0.3;
    const aimRad = (s.aim ?? 90) * DEG;
    const fx = Math.cos(aimRad);
    const fy = Math.sin(aimRad);
    const rx = fy;
    const ry = -fx;
    const hw = w / 2;
    const hd = d / 2;
    const c1 = [dx - hw * rx - hd * fx, dy - hw * ry - hd * fy];
    const c2 = [dx + hw * rx - hd * fx, dy + hw * ry - hd * fy];
    const c3 = [dx + hw * rx + hd * fx, dy + hw * ry + hd * fy];
    const c4 = [dx - hw * rx + hd * fx, dy - hw * ry + hd * fy];
    lines.push([r3(c1[0]), r3(c1[1]), r3(c2[0]), r3(c2[1])]);
    lines.push([r3(c2[0]), r3(c2[1]), r3(c3[0]), r3(c3[1])]);
    lines.push([r3(c3[0]), r3(c3[1]), r3(c4[0]), r3(c4[1])]);
    lines.push([r3(c4[0]), r3(c4[1]), r3(c1[0]), r3(c1[1])]);
    // Aim pointer
    lines.push([r3(dx + hd * fx), r3(dy + hd * fy), r3(dx + (hd + 0.16) * fx), r3(dy + (hd + 0.16) * fy)]);
    const label = s.role || s.name || 'SPK';
    texts.push({ text: label, x: r3(dx - 0.08), y: r3(dy - 0.02), height: 0.07 });
  }

  // Listener seats (MIX, producer P, client C, entourage)
  for (const m of state?.mics ?? []) {
    const dx = m.x - seat.x;
    const dy = m.y - seat.y;
    const k = 0.12;
    lines.push([r3(dx - k), r3(dy), r3(dx + k), r3(dy)]);
    lines.push([r3(dx), r3(dy - k), r3(dx), r3(dy + k)]);
    const tag = m.mix ? 'MIX' : (m.kind === 'producer' ? 'P' : m.kind === 'client' ? 'C' : m.name || 'M');
    texts.push({ text: tag, x: r3(dx - 0.08), y: r3(dy + 0.16), height: 0.07 });
  }

  // Placed furniture (desks, consoles, racks, couches)
  for (const f of state?.furniture ?? []) {
    const prod = PRODUCTS.find((p) => p.id === f.paletteId);
    const [w, d] = prod?.size ?? [1.8, 0.9];
    const dx = f.x - seat.x;
    const dy = f.y - seat.y;
    const rotRad = (f.rotation ?? 0) * DEG;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const hw = w / 2;
    const hd = d / 2;
    const p1 = [dx - hw * cos + hd * sin, dy - hw * sin - hd * cos];
    const p2 = [dx + hw * cos + hd * sin, dy + hw * sin - hd * cos];
    const p3 = [dx + hw * cos - hd * sin, dy + hw * sin + hd * cos];
    const p4 = [dx - hw * cos - hd * sin, dy - hw * sin + hd * cos];
    lines.push([r3(p1[0]), r3(p1[1]), r3(p2[0]), r3(p2[1])]);
    lines.push([r3(p2[0]), r3(p2[1]), r3(p3[0]), r3(p3[1])]);
    lines.push([r3(p3[0]), r3(p3[1]), r3(p4[0]), r3(p4[1])]);
    lines.push([r3(p4[0]), r3(p4[1]), r3(p1[0]), r3(p1[1])]);
    const label = prod?.name?.split(/[,(]/)[0]?.trim() ?? 'Desk';
    texts.push({ text: label, x: r3(dx - 0.2), y: r3(dy), height: 0.07 });
  }
  // and what the CAD has placed — the furnished room's desks, the producer desk, couch and rack — that is not one of those
  for (const f of furnitureOf(room)) {
    if ((state?.furniture ?? []).some((g) => g.cadId === f.id)) continue;
    f.corners.forEach((p, i) => {
      const q = f.corners[(i + 1) % f.corners.length];
      lines.push([r3(p.x - seat.x), r3(p.y - seat.y), r3(q.x - seat.x), r3(q.y - seat.y)]);
    });
    texts.push({ text: f.name, x: r3(f.x - seat.x - 0.2), y: r3(f.y - seat.y), height: 0.07 });
  }

  return [{ kind: 'drawing', layer: LAYOUT_LAYER, layerColor: setColour(settings, activeSet(settings)), name: 'arrangement', at: [seat.x, seat.y], lines, texts }];
}

function azOf(p, seat, settings) {
  let az = Math.atan2(p.y - seat.y, p.x - seat.x) / DEG - arrayFront(settings);
  az = ((az + 540) % 360) - 180;
  return az;
}

