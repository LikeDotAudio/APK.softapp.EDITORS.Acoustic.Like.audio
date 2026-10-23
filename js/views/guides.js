// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { nullFractions } from '../acoustics/room.js';
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
