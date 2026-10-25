// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { PRODUCTS } from '../acoustics/materials.js';

/**
 * HOW A TREATMENT LOOKS
 *
 * A patch painted in the CAD — a QRD, a panel, a carpet — is drawn the same
 * way in every view that is ours (the elevations, the ceiling, the 3-D room,
 * the swatches in the inspector): its material's colour, see-through so the
 * field still reads under it, and a stroke pattern that says what KIND of
 * thing it is even where the colours run together:
 *
 *   absorbers, resonators, ceiling tiles   a grid — the CAD's GRID hatch
 *   diffusers                              vertical wells
 *   glass                                  a pale sheen across the corner
 *   masonry                                diagonals — the CAD's ANSI31
 *
 * Everything else is a plain tint. The patterns are drawn in screen pixels,
 * not metres, so a small panel and a whole wall of carpet read alike at any
 * zoom.
 *
 * A patch that runs across two walls comes back as two pieces with one id;
 * groupPatches folds them back into the one thing the designer placed. That
 * and the naming are plain functions, tested in tests/views.test.mjs.
 */

const productById = new Map(PRODUCTS.map((p) => [p.id, p]));

/** What the designer picked from the palette: the product's name for a block, else the finish's. */
export function patchName(paletteId, mat) {
  return productById.get(paletteId)?.name ?? mat?.name ?? String(paletteId);
}

/** A label short enough for a canvas: the name up to its first comma or bracket, capped. */
export function shortName(name, max = 22) {
  const s = String(name ?? '').split(/[,(]/)[0].trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * The pieces on the room (room.patches) folded back into what was placed:
 * [{ id, paletteId, material, name, faces, area, pieces }] in the order first
 * seen. `faces` lists each face once, in the order the pieces arrived.
 */
export function groupPatches(pieces = []) {
  const byId = new Map();
  for (const p of pieces) {
    let g = byId.get(p.id);
    if (!g) {
      g = { id: p.id, paletteId: p.paletteId, material: p.material, name: patchName(p.paletteId, p.material), faces: [], area: 0, pieces: [] };
      byId.set(p.id, g);
    }
    if (!g.faces.includes(p.face)) g.faces.push(p.face);
    g.area += p.area;
    g.pieces.push(p);
  }
  return [...byId.values()];
}

const PATTERN = { Absorber: 'grid', Resonator: 'grid', Ceiling: 'grid', Diffuser: 'wells', Glass: 'sheen', Masonry: 'diagonal' };

/** Which stroke pattern a material category draws with ('plain' for none). */
export const patternOf = (category) => PATTERN[category] ?? 'plain';

/** '#rrggbb' + alpha → rgba(), so a material's catalogue colour can be laid see-through. */
export function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return `rgba(160,160,160,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Fill and stroke one patch given its outline in screen pixels. `alpha` is the
 * tint's opacity; `selected` draws it lifted, white-edged; `label` is written
 * along its top when the patch is big enough to hold it. Returns the outline
 * as a Path2D, so a caller can reuse it.
 */
/** A screen, switched on: opaque over the field, lit from its top corner down to its foot, a sheen across it. */
function screenFace(ctx, path, pts) {
  const [a, , c] = pts;
  const lit = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
  lit.addColorStop(0, '#1e3a8a');
  lit.addColorStop(0.55, '#0e7490');
  lit.addColorStop(1, '#0b1220');
  ctx.fillStyle = lit;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const sheen = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,.18)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill(path);
  ctx.restore();
}

export function drawPatch(ctx, pts, mat, { alpha = 0.4, selected = false, label = '' } = {}) {
  if (!pts || pts.length < 3 || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const path = new Path2D();
  pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
  path.closePath();
  const colour = mat?.color ?? '#a0a0a0';
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }

  ctx.save();
  if (mat?.id === 'led-wall') screenFace(ctx, path, pts);
  else {
    ctx.fillStyle = rgba(colour, alpha);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    strokePattern(ctx, patternOf(mat?.category), colour, x0, y0, x1, y1);
    ctx.restore();
  }
  if (selected) {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
  }
  if (mat?.category === 'Opening') ctx.setLineDash([4, 3]);
  // a dark rim first: the field under a patch is every colour there is, and the patch's own edge must read on all of them
  ctx.strokeStyle = 'rgba(8,10,14,.85)';
  ctx.lineWidth = selected ? 4.5 : 3;
  ctx.stroke(path);
  ctx.shadowBlur = selected ? 8 : 0;
  ctx.strokeStyle = selected ? '#ffffff' : rgba(colour, 1);
  ctx.lineWidth = selected ? 2 : 1.4;
  ctx.stroke(path);
  ctx.restore();

  if (label) {
    ctx.save();
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    // cut to fit, and only where it then still says something: a label hanging off a small block hides what it names
    let text = label;
    while (text.length > 4 && ctx.measureText(text).width + 6 > x1 - x0) text = `${text.slice(0, -2)}…`;
    const tw = ctx.measureText(text).width + 6;
    if (tw <= x1 - x0 && y1 - y0 >= 13) {
      const cx = (x0 + x1) / 2;
      // along the top edge, not the middle: devices sit at ear height, mid-panel, and would cover it
      const cy = y0 + 9;
      ctx.fillStyle = 'rgba(10,12,18,.72)';
      ctx.fillRect(cx - tw / 2, cy - 7, tw, 14);
      ctx.fillStyle = selected ? '#fff' : '#e5e7eb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
    }
    ctx.restore();
  }
  return path;
}

function strokePattern(ctx, kind, colour, x0, y0, x1, y1) {
  if (kind === 'plain') return;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (kind === 'grid') {
    ctx.strokeStyle = rgba(colour, 0.75);
    for (let x = Math.floor(x0 / 6) * 6; x <= x1; x += 6) {
      ctx.moveTo(x + 0.5, y0);
      ctx.lineTo(x + 0.5, y1);
    }
    for (let y = Math.floor(y0 / 6) * 6; y <= y1; y += 6) {
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x1, y + 0.5);
    }
  } else if (kind === 'wells') {
    // wells of the depths a QRD uses, as bars of differing weight
    ctx.strokeStyle = rgba(colour, 0.9);
    let i = 0;
    for (let x = Math.floor(x0 / 5) * 5; x <= x1; x += 5, i++) {
      ctx.lineWidth = [1, 2.5, 1.5, 3, 1.5, 2.5, 1][i % 7];
      ctx.moveTo(x + 0.5, y0);
      ctx.lineTo(x + 0.5, y1);
      ctx.stroke();
      ctx.beginPath();
    }
  } else if (kind === 'diagonal') {
    ctx.strokeStyle = rgba(colour, 0.8);
    for (let d = x0 - (y1 - y0); d <= x1; d += 7) {
      ctx.moveTo(d, y1);
      ctx.lineTo(d + (y1 - y0), y0);
    }
  } else if (kind === 'sheen') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(220,240,255,.0)');
    g.addColorStop(0.35, 'rgba(220,240,255,.45)');
    g.addColorStop(0.45, 'rgba(220,240,255,.08)');
    g.addColorStop(0.6, 'rgba(220,240,255,.3)');
    g.addColorStop(1, 'rgba(220,240,255,.0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    return;
  }
  ctx.stroke();
}

/** A small square swatch of a material, drawn the way its patches are, for the inspector's lists. */
export function swatch(mat, size = 14) {
  const c = document.createElement('canvas');
  const dpr = globalThis.devicePixelRatio || 1;
  c.width = c.height = Math.round(size * dpr);
  c.className = 'swatch';
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawPatch(ctx, [{ x: 0.5, y: 0.5 }, { x: size - 0.5, y: 0.5 }, { x: size - 0.5, y: size - 0.5 }, { x: 0.5, y: size - 0.5 }], mat, { alpha: 0.7 });
  return c;
}
