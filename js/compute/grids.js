// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { heightsAtXY } from '../acoustics/elevations.js';
import { pointInPolygon } from '../acoustics/geometry.js';

/**
 * WHERE THE FIELD IS SAMPLED
 *
 * One grid per surface the views paint: the plan slice (at ear height, by
 * default the mix position's), the floor and ceiling, and one per wall. Cells
 * are square and the same size on every face, so the six views read as one
 * room rather than six resolutions.
 *
 * Rows run top-down — the plan's row 0 is its largest y, a wall's is the
 * ceiling — so a grid drops straight into ImageData.
 *
 * A room cut by drawn elevations is gridded to its highest point (Hmax); a
 * wall cell above that wall's ceiling or below its floor is NaN, and the floor
 * and ceiling grids follow the surface — each point sits just off the floor or
 * ceiling above it, sloped or not.
 */

export function buildGrids(room, sliceZ, res) {
  const Hmax = room.Hmax ?? room.H;
  const cell = Math.max(room.L, room.W, Hmax) / res;
  const xs = room.poly.map((p) => p.x);
  const ys = room.poly.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const nx = Math.max(2, Math.ceil((Math.max(...xs) - x0) / cell));
  const ny = Math.max(2, Math.ceil((y1 - Math.min(...ys)) / cell));
  const plane = (kind, z) => ({ kind, x0, y1, cell, nx, ny, z });
  return {
    cell,
    plan: plane('plan', sliceZ),
    floor: plane('floor', 0.02),
    ceiling: plane('ceiling', Hmax - 0.02),
    walls: room.walls.map((w) => ({
      kind: 'wall',
      wall: w.i,
      face: w.face,
      nu: Math.max(2, Math.ceil(w.len / cell)),
      nz: Math.max(2, Math.ceil(Hmax / cell)),
    })),
  };
}

/** Sample points of a grid, xyz interleaved; NaN where a plan cell falls outside the room. */
export function gridPoints(room, g) {
  const Hmax = room.Hmax ?? room.H;
  if (g.kind === 'wall') {
    const w = room.walls[g.wall];
    const out = new Float64Array(g.nu * g.nz * 3);
    const spans = Array.from({ length: g.nu }, (_, i) => heightsAtXY(room, w.a.x + (w.b.x - w.a.x) * ((i + 0.5) / g.nu), w.a.y + (w.b.y - w.a.y) * ((i + 0.5) / g.nu)));
    for (let j = 0; j < g.nz; j++) {
      const z = Hmax * (1 - (j + 0.5) / g.nz);
      for (let i = 0; i < g.nu; i++) {
        const t = (i + 0.5) / g.nu;
        const k = (j * g.nu + i) * 3;
        const inside = z >= spans[i].floor && z <= spans[i].ceiling;
        out[k] = inside ? w.a.x + (w.b.x - w.a.x) * t + w.nIn.x * 0.02 : NaN;
        out[k + 1] = w.a.y + (w.b.y - w.a.y) * t + w.nIn.y * 0.02;
        out[k + 2] = z;
      }
    }
    return out;
  }
  const out = new Float64Array(g.nx * g.ny * 3);
  for (let j = 0; j < g.ny; j++) {
    const y = g.y1 - (j + 0.5) * g.cell;
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.cell;
      const k = (j * g.nx + i) * 3;
      let inside = pointInPolygon(x, y, room.poly);
      let z = g.z;
      if (inside && room.sloped) {
        const h = heightsAtXY(room, x, y);
        if (g.kind === 'floor') z = h.floor + 0.02;
        else if (g.kind === 'ceiling') z = h.ceiling - 0.02;
        else inside = z >= h.floor && z <= h.ceiling;
      }
      out[k] = inside ? x : NaN;
      out[k + 1] = y;
      out[k + 2] = z;
    }
  }
  return out;
}
