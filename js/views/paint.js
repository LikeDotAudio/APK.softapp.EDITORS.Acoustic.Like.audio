// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * Colour for the field: Turbo (Google, Apache-2.0 polynomial fit) — the
 * rainbow a room-acoustics render is read in, without jet's false bands.
 */

export function turbo(t) {
  t = Math.max(0, Math.min(1, t));
  const r = 0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
  const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
  const b = 0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
  return [Math.round(255 * Math.max(0, Math.min(1, r))), Math.round(255 * Math.max(0, Math.min(1, g))), Math.round(255 * Math.max(0, Math.min(1, b)))];
}

const LUT = Array.from({ length: 256 }, (_, i) => turbo(i / 255));

export function colourOf(db, scale) {
  const t = (db - (scale.top - scale.range)) / scale.range;
  return LUT[Math.max(0, Math.min(255, Math.round(t * 255)))];
}

export function css([r, g, b], a = 1) {
  return `rgba(${r},${g},${b},${a})`;
}

/** A w×h value grid as a canvas, NaN transparent. Cached on the array it paints. */
export function gridCanvas(values, w, h, scale, alpha = 1) {
  const key = `${scale.top}|${scale.range}|${alpha}`;
  if (values._canvas && values._key === key) return values._canvas;
  const c = values._canvas ?? (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const a = Math.round(alpha * 255);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    const [r, g, b] = colourOf(v, scale);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  Object.defineProperty(values, '_canvas', { value: c, configurable: true, writable: true });
  Object.defineProperty(values, '_key', { value: key, configurable: true, writable: true });
  return c;
}

/** The shared colour scale: the loudest cell anywhere sets the top. */
export function fieldScale(values, rangeDb) {
  let top = -Infinity;
  const scan = (arr) => {
    for (const v of arr) if (v > top) top = v;
  };
  if (values) {
    scan(values.plan);
    scan(values.ceiling);
    scan(values.floor);
    values.walls.forEach(scan);
  }
  if (!Number.isFinite(top)) top = 90;
  return { top: Math.ceil(top), range: rangeDb };
}

/** The scale as a CSS gradient, for a ramp drawn in the DOM rather than on a canvas. */
export function rampGradient() {
  return `linear-gradient(to right, ${Array.from({ length: 17 }, (_, i) => css(LUT[Math.round((i / 16) * 255)])).join(', ')})`;
}

/** Value of grid `values` (w×h, row 0 at the top) at fractional position (fx, fy) ∈ [0,1]². */
export function sampleGrid(values, w, h, fx, fy) {
  const i = Math.floor(fx * w);
  const j = Math.floor(fy * h);
  if (i < 0 || j < 0 || i >= w || j >= h) return NaN;
  return values[j * w + i];
}
