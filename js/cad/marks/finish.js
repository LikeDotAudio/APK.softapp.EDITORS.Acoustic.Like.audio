// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — labels, panels and finishes: every wall's
 * label, the first-reflection panels and their details, the finish schedule with its
 * callouts and detail drawings. Lifted out of cad/marks.js (ROAD-3753).
 */
import { ELEVATION_FACES, ELEVATION_LAYER } from '../../acoustics/elevations.js';
import { elevationOrigin } from '../../acoustics/patches.js';
import { material, PRODUCTS } from '../../acoustics/materials.js';
import { bboxOf, mm, r3 } from './common.js';
import { panelOptions, panelProduct, reflectionPanels } from '../../acoustics/reflectionPanels.js';
import { detailBuild, wallRegions } from '../../acoustics/wallPlan.js';
import { hatch } from './sections.js';

// ------------------------------------------------------------------ labels

function labelMarks(room, settings, planLayer) {
  const items = [];
  const size = Math.max(0.05, Math.min(0.25, Math.max(room.L, room.W) / 60));
  for (const face of ELEVATION_FACES) {
    const prof = room.profiles?.find((p) => p.face === face);
    if (!prof) continue;
    const origin = elevationOrigin(room, face);
    const top = Math.max(...prof.pts.map((p) => p.z));
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    const mat = material(settings.faceMaterials[face]);
    items.push({ kind: 'text', layer: ELEVATION_LAYER[face], at: [origin.x, origin.y + top + size * 0.8], text: `${face.toUpperCase()} WALL · ${mm(span)} × ${mm(top)} mm · ${mat.name}`, height: size });
  }
  const b = bboxOf(room.poly);
  items.push({ kind: 'text', layer: planLayer ?? '0', at: [b.x0, b.y1 + size * 0.8], text: `PLAN · ${mm(room.L)} × ${mm(room.W)} mm · ceiling ${mm(room.H)} mm · ${room.area.toFixed(1)} m² · ${room.V.toFixed(1)} m³`, height: size });
  return items;
}

// ------------------------------------------------------------------ panels

function panelMarks(room, state, mix) {
  const ap = state.settings.autoPanels ?? {};
  const ceilingOn = state.settings.cadMarks?.ceilingPanels !== false;
  const panels = reflectionPanels(room, state.speakers, mix, panelOptions(ap, ceilingOn));
  const items = [];
  const text = 0.04;
  for (const p of panels) {
    const layer = p.kind === 'ceiling' ? 'Ceiling' : ELEVATION_LAYER[p.face];
    const paletteId = panelProduct(p, ap);
    items.push({ kind: 'fill', layer, paletteId, points: p.sheet.map((c) => [c.x, c.y]) });
    const x0 = Math.min(...p.sheet.map((c) => c.x));
    const y1 = Math.max(...p.sheet.map((c) => c.y));
    items.push({ kind: 'text', layer, at: [x0, y1 + text * 0.5], text: `${p.name} · ${p.speaker}`, height: text });
  }
  for (const face of ELEVATION_FACES) {
    const mine = panels.filter((p) => p.face === face);
    if (mine.length) items.push(panelDetails(room, face, mine, (p) => PRODUCTS.find((x) => x.id === panelProduct(p, ap))?.name ?? panelProduct(p, ap)));
  }
  return items;
}

/**
 * A wall's panels set out for whoever hangs them, on its elevation: every
 * panel's two edges dimensioned from the wall's left corner along a baseline
 * below the floor (staggered in rows so the figures never sit on each other),
 * each one's centre marked and its bottom's height written in it, and beside
 * the elevation a schedule — name, the speaker it answers, its size, where its
 * left edge and its bottom are, what it is (`product(panel)`, its name). All in mm.
 */
function panelDetails(room, face, panels, product) {
  const origin = elevationOrigin(room, face);
  const span = face === 'left' || face === 'right' ? room.L : room.W;
  const size = Math.max(0.035, Math.min(0.15, Math.max(room.L, room.W) / 100));
  const lines = [];
  const texts = [];
  const rows = 3;
  const base = -size * 2;
  lines.push([0, base, r3(span), base]);
  lines.push([0, 0, 0, r3(base - size * 0.6)]);
  const sorted = [...panels].sort((a, b) => Math.min(...a.sheet.map((c) => c.x)) - Math.min(...b.sheet.map((c) => c.x)));
  const rel = (p) => {
    const xs = p.sheet.map((c) => c.x - origin.x);
    const ys = p.sheet.map((c) => c.y - origin.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  sorted.forEach((p, i) => {
    const b = rel(p);
    const y = base - size * 1.6 * (i % rows);
    // the two edges dropped to the baseline, and their distance from the corner
    for (const x of [b.x0, b.x1]) lines.push([r3(x), r3(b.y0), r3(x), r3(y - size * 0.4)]);
    texts.push({ text: `${p.name.split('-')[1]}: ${mm(b.x0)}–${mm(b.x1)}`, x: r3(b.x0), y: r3(y - size * 1.3), height: size * 0.8 });
    // the centre, crossed
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const k = Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.15;
    lines.push([r3(cx - k), r3(cy), r3(cx + k), r3(cy)], [r3(cx), r3(cy - k), r3(cx), r3(cy + k)]);
    texts.push({ text: `↑ ${mm(b.y0)}`, x: r3(b.x0 + size * 0.3), y: r3(b.y0 + size * 0.3), height: size * 0.7 });
  });
  // the schedule beside the elevation, top down — the column of drawings above and below leaves no room under it
  const sx = r3(span + size * 4);
  let y = (room.Hmax ?? room.H) - size * 1.1;
  texts.push({ text: `PANEL SCHEDULE · ${face.toUpperCase()} WALL · ${sorted.length} panel${sorted.length === 1 ? '' : 's'} · from the left corner and the floor, mm`, x: sx, y: r3(y), height: size * 1.1 });
  for (const p of sorted) {
    const b = rel(p);
    y -= size * 1.5;
    texts.push({ text: `${p.name} · ${p.behind ? 'behind' : 'answers'} ${p.speaker} · ${p.treatment ?? 'absorber'} · ${mm(b.x1 - b.x0)} × ${mm(b.y1 - b.y0)} · left edge ${mm(b.x0)} · bottom ${mm(b.y0)} · centre ${mm((b.x0 + b.x1) / 2)} / ${mm((b.y0 + b.y1) / 2)} · ${product(p)}`, x: sx, y: r3(y), height: size * 0.85 });
  }
  return { kind: 'drawing', layer: ELEVATION_LAYER[face], name: `panel-details-${face}`, at: [r3(origin.x), r3(origin.y)], lines, texts };
}

// ------------------------------------------------------------------ finishes

/**
 * Every wall's regions as the user finished them, on its elevation: a tag in
 * each — its code and what it is, boxed — and beside the elevation, under the
 * panel schedule when there is one, the FINISH SCHEDULE. `patches` are the
 * user's own on the elevation layers (not this app's marks), in sheet metres.
 */
function finishMarks(room, settings, patches, panelItems) {
  const items = [];
  const size = Math.max(0.035, Math.min(0.15, Math.max(room.L, room.W) / 100));
  for (const face of ELEVATION_FACES) {
    const origin = elevationOrigin(room, face);
    if (!origin) continue;
    const span = face === 'left' || face === 'right' ? room.L : room.W;
    const top = room.Hmax ?? room.H;
    // tagged left to right, then top down (acoustics/wallPlan.js, which the wall builder reads too)
    const regions = wallRegions(room, face, patches);
    if (!regions.length) continue;
    const lines = [];
    const texts = [];
    regions.forEach((r) => {
      const short = r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name;
      const w = Math.max(r.tag.length, short.length) * size * 0.62 + size;
      const h = size * 2.4;
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      const bx = cx - w / 2;
      const by = cy - h / 2;
      lines.push([r3(bx), r3(by), r3(bx + w), r3(by)], [r3(bx + w), r3(by), r3(bx + w), r3(by + h)], [r3(bx + w), r3(by + h), r3(bx), r3(by + h)], [r3(bx), r3(by + h), r3(bx), r3(by)]);
      texts.push({ text: r.tag, x: r3(bx + size * 0.5), y: r3(by + h - size * 1.05), height: size * 0.85 });
      texts.push({ text: short, x: r3(bx + size * 0.5), y: r3(by + size * 0.35), height: size * 0.7 });
    });
    // beside the elevation, under the panel schedule if this wall has one
    const panelRows = panelItems.find((it) => it.kind === 'drawing' && it.name === `panel-details-${face}`)?.texts.filter((t) => / · answers /.test(t.text)).length ?? 0;
    const sx = r3(span + size * 4);
    let y = top - size * 1.1 - (panelRows ? (panelRows + 1) * size * 1.5 + size * 2 : 0);
    texts.push({ text: `FINISH SCHEDULE · ${face.toUpperCase()} WALL · ${regions.length} region${regions.length === 1 ? '' : 's'} · x from the wall's centre line, z from the floor, mm`, x: sx, y: r3(y), height: size * 1.1 });
    const mid = span / 2;
    const signed = (v) => (v > 0 ? `+${mm(v)}` : `${mm(v)}`);
    for (const r of regions) {
      const mat = material(r.p.paletteId);
      y -= size * 1.5;
      texts.push({ text: `${r.tag} · ${r.name} · ${r.how} · ${mm(r.x1 - r.x0)} × ${mm(r.y1 - r.y0)} · x ${signed(r.x0 - mid)} → ${signed(r.x1 - mid)} · z ${mm(r.y0)} → ${mm(r.y1)} · ${r.area.toFixed(2)} m² · α125 ${mat.alpha[0].toFixed(2)} α500 ${mat.alpha[2].toFixed(2)} α2k ${mat.alpha[4].toFixed(2)} · s ${mat.scatter[3].toFixed(2)}`, x: sx, y: r3(y), height: size * 0.85 });
    }
    const wallArea = room.walls.filter((w) => w.face === face).reduce((s, w) => s + (w.area ?? 0), 0);
    const left = Math.max(0, wallArea - regions.reduce((s, r) => s + r.area, 0));
    y -= size * 1.5;
    texts.push({ text: `BASE · ${material(settings.faceMaterials[face]).name} · the rest of the wall · ${left.toFixed(2)} m²`, x: sx, y: r3(y), height: size * 0.85 });
    // the details: one per build on this wall, each region of it called out
    const details = [];
    regions.forEach((r, i) => {
      const build = detailBuild(r.p.paletteId);
      if (!build) return;
      let d = details.find((x) => x.paletteId === r.p.paletteId);
      if (!d) details.push((d = { paletteId: r.p.paletteId, n: details.length + 1, build, name: r.name, regions: [] }));
      d.regions.push(r);
      calloutBubble(lines, texts, r, d.n, i, size);
    });
    y -= size * 3;
    for (const d of details) y = detailDrawing(lines, texts, d, sx, y, mid, size);
    items.push({ kind: 'drawing', layer: ELEVATION_LAYER[face], name: `finish-schedule-${face}`, at: [r3(origin.x), r3(origin.y)], lines, texts });
  }
  return items;
}

/** A circle as line segments, for a drawing that is lines and words. */
function circleLines(lines, cx, cy, rad, n = 20) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const b = ((i + 1) / n) * 2 * Math.PI;
    lines.push([r3(cx + rad * Math.cos(a)), r3(cy + rad * Math.sin(a)), r3(cx + rad * Math.cos(b)), r3(cy + rad * Math.sin(b))]);
  }
}

/**
 * A region's section callout on its elevation: a dashed cut across it a
 * quarter of the way up (clear of its tag), arrowheads at both ends, and a
 * leader out past the wall's left edge to a bubble — the detail's number over
 * D and the number. Bubbles alternate between two columns so neighbours clear.
 */
function calloutBubble(lines, texts, r, n, i, size) {
  const y = r.y0 + (r.y1 - r.y0) * 0.25;
  const x0 = r.x0 + size * 0.3;
  const x1 = r.x1 - size * 0.3;
  const dash = size * 0.9;
  for (let x = x0; x < x1; x += dash * 1.5) lines.push([r3(x), r3(y), r3(Math.min(x1, x + dash)), r3(y)]);
  for (const [x, dir] of [[x0, 1], [x1, -1]]) lines.push([r3(x), r3(y), r3(x + dir * size * 0.5), r3(y + size * 0.35)], [r3(x), r3(y), r3(x + dir * size * 0.5), r3(y - size * 0.35)]);
  const rad = size * 1.2;
  const bx = -size * (3 + (i % 2) * 3);
  lines.push([r3(bx + rad), r3(y), r3(x0), r3(y)]);
  circleLines(lines, bx, y, rad);
  lines.push([r3(bx - rad), r3(y), r3(bx + rad), r3(y)]);
  texts.push({ text: String(n), x: r3(bx - size * 0.3), y: r3(y + size * 0.2), height: size * 0.75 });
  texts.push({ text: `D${n}`, x: r3(bx - size * 0.45), y: r3(y - size * 0.85), height: size * 0.55 });
}

/**
 * DETAIL Dn under the schedule, its top at `top`: the section through the
 * first bay of that build, true size — the wall behind (masonry), a 45 mm
 * frame member at each division line, the build between them hatched, its
 * face — labelled beside, the width and depth dimensioned in mm, and each
 * edge's place from the wall's centre line. Returns where the next one starts.
 */
function detailDrawing(lines, texts, d, x, top, mid, size) {
  const r = d.regions[0];
  const W = r.x1 - r.x0;
  const D = d.build.depth;
  const wall = 0.1;
  const frame = Math.min(0.045, W / 6);
  const y0 = top - size * 2 - wall - D;
  const rect = (a, b, c, e) => lines.push([r3(a), r3(b), r3(c), r3(b)], [r3(c), r3(b), r3(c), r3(e)], [r3(c), r3(e), r3(a), r3(e)], [r3(a), r3(e), r3(a), r3(b)]);
  const signed = (v) => (v > 0 ? `+${mm(v)}` : `${mm(v)}`);
  texts.push({ text: `DETAIL D${d.n} · section through ${d.regions.map((q) => q.tag).join(', ')} · ${d.name} · plan section, true size, mm`, x: r3(x), y: r3(top - size * 1.1), height: size * 0.95 });
  // the wall behind, the frame at each division line, the build between, the face
  rect(x - 0.05, y0 + D, x + W + 0.05, y0 + D + wall);
  hatch(lines, 'masonry', x - 0.05, y0 + D, x + W + 0.05, y0 + D + wall);
  for (const fx of [x, x + W - frame]) {
    rect(fx, y0, fx + frame, y0 + D);
    hatch(lines, 'stud', fx, y0, fx + frame, y0 + D);
  }
  if (d.build.infill === 'wells') {
    const n = Math.max(2, Math.round((W - 2 * frame) / 0.05));
    const step = (W - 2 * frame) / n;
    for (let k = 0; k <= n; k++) lines.push([r3(x + frame + k * step), r3(y0), r3(x + frame + k * step), r3(y0 + D)]);
    for (let k = 0; k < n; k++) {
      const depth = D * (0.25 + 0.75 * (((k * k) % 7) / 6));
      lines.push([r3(x + frame + k * step), r3(y0 + D - depth), r3(x + frame + (k + 1) * step), r3(y0 + D - depth)]);
    }
  } else hatch(lines, d.build.infill, x + frame, y0, x + W - frame, y0 + D);
  lines.push([r3(x), r3(y0), r3(x + W), r3(y0)]);
  // what each layer is, beside it
  const lx = x + W + 0.12;
  const label = (text, ly) => {
    lines.push([r3(x + W + 0.02), r3(ly), r3(lx - 0.02), r3(ly)]);
    texts.push({ text, x: r3(lx), y: r3(ly - size * 0.3), height: size * 0.7 });
  };
  label('wall behind', y0 + D + wall / 2);
  label(`${d.name} · ${mm(D)} deep`, y0 + D / 2);
  label(d.build.face, y0);
  texts.push({ text: `frame ${mm(frame)} × ${mm(D)} at the division lines`, x: r3(x), y: r3(y0 + D + wall + size * 0.3), height: size * 0.6 });
  // the width under it, ticked at the division lines, each edge from the centre line
  const dy = y0 - size * 1.4;
  lines.push([r3(x), r3(dy), r3(x + W), r3(dy)]);
  for (const ex of [x, x + W]) lines.push([r3(ex), r3(dy - size * 0.4), r3(ex), r3(y0)]);
  texts.push({ text: `${mm(W)}`, x: r3(x + W / 2 - size), y: r3(dy + size * 0.2), height: size * 0.7 });
  texts.push({ text: signed(r.x0 - mid), x: r3(x - size * 0.5), y: r3(dy - size * 1.3), height: size * 0.65 });
  texts.push({ text: signed(r.x1 - mid), x: r3(x + W - size * 0.5), y: r3(dy - size * 1.3), height: size * 0.65 });
  return dy - size * 3;
}


export { labelMarks, panelMarks, finishMarks, circleLines };
