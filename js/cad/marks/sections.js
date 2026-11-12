// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * WHAT THIS APP DRAWS INTO THE CAD FILE — the construction sections: the wall and floor
 * builds, layer by layer, five times true size. Lifted out of cad/marks.js (ROAD-3753).
 */
import { FLOOR_BUILDS, WALL_BUILDS, wallTl } from '../../acoustics/isolation.js';
import { r3, SECTION_LAYER } from './common.js';

// ------------------------------------------------------------------ construction sections

const EXAGGERATE = 5;
const TEXT = 0.04;

function sectionMarks(settings, x0, top0, floorTop = Infinity) {
  const iso = settings.isolation ?? {};
  const items = [];
  const wall = WALL_BUILDS[iso.walls];
  const floor = FLOOR_BUILDS[iso.floor];
  // wall first, the floor under it: the bottom of the drawing's column
  let top = top0;
  const x = x0;
  if (wall?.layers) {
    const tl = wallTl(iso);
    const d = section(wall.layers, 'wall', `WALL BUILD · ${wall.label} · TL ${tl[2]} dB at 500 Hz · drawn ×${EXAGGERATE}`);
    items.push({ kind: 'drawing', layer: SECTION_LAYER, layerColor: '#cbd5e1', name: 'wall', at: [r3(x), r3(top - d.height)], lines: d.lines, texts: d.texts });
    top -= d.height + 0.6;
  }
  top = Math.min(top, floorTop);
  if (floor?.layers) {
    const d = section(floor.layers, 'floor', `FLOOR BUILD · ${floor.label}${floor.f0 || iso.f0 ? ` · f0 ${iso.f0 ?? floor.f0} Hz` : ''} · drawn ×${EXAGGERATE}`);
    items.push({ kind: 'drawing', layer: SECTION_LAYER, layerColor: '#cbd5e1', name: 'floor', at: [r3(x), r3(top - d.height)], lines: d.lines, texts: d.texts });
  }
  return items;
}

/**
 * A build as a section: a wall's layers side by side (room on the left), a
 * floor's stacked (room on top). Each layer outlined and hatched by kind,
 * and listed beside it with its thickness.
 */
function section(layers, orient, title) {
  const lines = [];
  const texts = [];
  const LEN = 1.0;
  const rectLines = (x0, y0, x1, y1) => {
    lines.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
  };
  let pos = 0;
  const total = layers.reduce((s, [, mm]) => s + (mm / 1000) * EXAGGERATE, 0);
  layers.forEach(([name, mm, kind], i) => {
    const t = (mm / 1000) * EXAGGERATE;
    const [x0, y0, x1, y1] = orient === 'wall' ? [pos, 0, pos + t, LEN] : [0, total - pos - t, LEN, total - pos];
    rectLines(r3(x0), r3(y0), r3(x1), r3(y1));
    hatch(lines, kind, x0, y0, x1, y1);
    const label = `${i + 1}. ${name} — ${mm} mm`;
    if (orient === 'wall') texts.push({ text: label, x: r3(total + 0.1), y: r3(LEN - 0.07 * (i + 1)), height: TEXT });
    else texts.push({ text: label, x: r3(LEN + 0.1), y: r3(y0 + (y1 - y0) / 2 - TEXT / 2), height: TEXT });
    pos += t;
  });
  texts.push({ text: title, x: 0, y: r3((orient === 'wall' ? LEN : total) + 0.08), height: TEXT * 1.3 });
  texts.push({ text: orient === 'wall' ? 'ROOM ←' : 'ROOM ↑', x: orient === 'wall' ? -0.3 : LEN + 0.1, y: orient === 'wall' ? r3(LEN / 2) : r3(total + 0.02), height: TEXT });
  // the labels run off to the right: about 0.6 of the text height per character of the longest
  const longest = Math.max(...layers.map(([name, mm], i) => `${i + 1}. ${name} — ${mm} mm`.length));
  const width = Math.max((orient === 'wall' ? total : LEN) + 0.1 + longest * TEXT * 0.6, title.length * TEXT * 1.3 * 0.6);
  return { lines, texts, height: orient === 'wall' ? LEN : total, width };
}

function hatch(lines, kind, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const add = (a, b, c, d) => lines.push([r3(a), r3(b), r3(c), r3(d)]);
  if (kind === 'stud') {
    add(x0, y0, x1, y1);
    add(x0, y1, x1, y0);
  } else if (kind === 'insulation') {
    // a zig-zag along the long side, the way insulation is drawn
    const long = Math.max(w, h);
    const n = Math.max(4, Math.round(long / 0.08));
    for (let i = 0; i < n; i++) {
      if (h >= w) add(i % 2 ? x1 : x0, y0 + (h * i) / n, i % 2 ? x0 : x1, y0 + (h * (i + 1)) / n);
      else add(x0 + (w * i) / n, i % 2 ? y1 : y0, x0 + (w * (i + 1)) / n, i % 2 ? y0 : y1);
    }
  } else if (kind === 'masonry' || kind === 'concrete') {
    const step = 0.08;
    for (let s = -h; s < w; s += step) {
      const a = Math.max(0, s);
      const b = Math.min(w, s + h);
      if (b > a) add(x0 + a, y0 + (a - s), x0 + b, y0 + (b - s));
    }
    if (kind === 'concrete') for (let s = 0; s < w + h; s += step * 2) {
      const a = Math.max(0, s - h);
      const b = Math.min(w, s);
      if (b > a) add(x0 + a, y1 - (s - a), x0 + b, y1 - (s - b));
    }
  } else if (kind === 'isolator') {
    const n = Math.max(2, Math.round(Math.max(w, h) / 0.25));
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n;
      if (h >= w) add(x0, y0 + h * c, x1, y0 + h * c);
      else add(x0 + w * c, y0, x0 + w * c, y1);
    }
  } else if (kind === 'wood') {
    if (h >= w) add(x0 + w / 2, y0, x0 + w / 2, y1);
    else add(x0, y0 + h / 2, x1, y0 + h / 2);
  }
}


export { sectionMarks, hatch };
