// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/** Plane geometry in metres, y up — the CAD's convention, so nothing flips between us. */

export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function ensureCCW(poly) {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

export function centroid(poly) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
    a += c;
  }
  if (Math.abs(a) < 1e-12) return { x: poly[0].x, y: poly[0].y };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Drop vertices that sit on the line through their neighbours (within `eps` metres). */
export function simplifyPolygon(poly, eps = 1e-3) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const p = poly[i];
    const next = poly[(i + 1) % poly.length];
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const d = Math.abs((next.x - prev.x) * (prev.y - p.y) - (prev.x - p.x) * (next.y - prev.y)) / len;
    if (d > eps && Math.hypot(p.x - prev.x, p.y - prev.y) > eps) out.push(p);
  }
  return out.length >= 3 ? out : poly;
}

export function isConvex(poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/** Mirror a point across the infinite line through a wall (n is its unit normal). */
export function mirrorPoint(p, a, n) {
  const d = (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  return { x: p.x - 2 * d * n.x, y: p.y - 2 * d * n.y };
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Where segment p→q crosses segment a→b: { t along p→q, u along a→b }, or null. */
export function segmentCross(p, q, a, b) {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

export const DEG = Math.PI / 180;

/** Signed smallest difference a − b in degrees, in (−180, 180]. */
export function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
