// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { fromFrame, inFrame, nullFractions } from '../acoustics/room.js';
import { NULL_COLOURS } from './glyphs.js';

/**
 * The lines a designer draws over a plan before placing anything: the 38 %
 * listening line, the centre line, and the axial-mode nulls of each dimension
 * — n = 1 at ½, n = 2 at ¼ and ¾, n = 3 at ⅙, ½, ⅚ — where a seat loses that
 * mode's bass. Returned as segments in the dimension's own fractions so the
 * plan, the ceiling and the elevations can each draw them in their frame.
 */

export function nullLines(nMax = 3) {
  const out = [];
  for (let n = 1; n <= nMax; n++) for (const f of nullFractions(n)) out.push({ n, f, colour: NULL_COLOURS[n - 1] });
  return out;
}

/**
 * The divisions worth standing on: where no axial mode up to nMax nulls. A
 * seat at fraction f of a dimension hears mode n at |cos(nπf)| of its
 * pressure; the worst of those is how destructive f is. Its best spots
 * between the nulls (not the walls themselves) are the recommended
 * divisions — for n ≤ 3, ⅕, ⅓, ⅔ and ⅘.
 */
export function goodFractions(nMax = 3, step = 1 / 3600) {
  const worst = (f) => Math.min(...Array.from({ length: nMax }, (_, i) => Math.abs(Math.cos((i + 1) * Math.PI * f))));
  const out = [];
  for (let f = step; f < 1 - step / 2; f += step) {
    const s = worst(f);
    if (s > 0.05 && s >= worst(f - step) && s > worst(f + step)) out.push(+f.toFixed(4));
  }
  return out;
}

/**
 * Where a dragged speaker or mic lands near the plan's divisions: lengthwise
 * the recommended ones and the 38 % line, across them and the centre line.
 * Onto a crossing within `reach` metres first, else onto one line within
 * `lineReach`, else where it was. `along` / `across` name the lines it took
 * (metres from the front / left wall), null when free on that axis.
 */
export function snapToDivisions(room, p, { reach, lineReach, nMax = 3 }) {
  const good = goodFractions(nMax);
  const alongs = [...good.map((f) => f * room.L), 0.38 * room.L];
  const acrosses = [...good.map((f) => f * room.W), 0.5 * room.W];
  const q = inFrame(room, p);
  const near = (vs, v) => vs.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), Infinity);
  const a = near(alongs, q.fromFront);
  const c = near(acrosses, q.fromLeft);
  let along = null;
  let across = null;
  if (Math.hypot(a - q.fromFront, c - q.fromLeft) <= reach) [along, across] = [a, c];
  else {
    if (Math.abs(a - q.fromFront) <= lineReach) along = a;
    if (Math.abs(c - q.fromLeft) <= lineReach) across = c;
  }
  return { ...fromFrame(room, along ?? q.fromFront, across ?? q.fromLeft), along, across };
}
