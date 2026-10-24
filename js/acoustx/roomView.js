// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE ROOM VIEW — the classic program's wire-frame of the box
 *
 * Every Acoustic X window can show the room the way the 1997 program's Room
 * View Manager offered it:
 *
 *   Plan View        from above, the front wall at the top
 *   Side Elevation   from the side, the front wall on the left
 *   End Elevation    from the back, looking at the front wall
 *   3-Dimensional    the axonometric the original drew
 *   User View        any angle: turned (yaw), tipped (pitch), moved, zoomed —
 *                    set with the R / M arrows and kept as the preset
 *
 * All orthographic. Points are CLASSIC: X from the left wall, Y from the
 * front wall, Z above the floor. `project(view, dims, user)` turns one into
 * screen-ish units (u right, v down); `fit` scales a set of them into a
 * canvas; `drawBox` draws the room, a metre grid on the floor and the
 * ticks the original's axes carried. Each window draws its own things
 * (speakers, pressure, rays, the polar plot) over that with the same `S`.
 */

const DEG = Math.PI / 180;

export const VIEWS = [
  ['plan', 'Plan View'],
  ['side', 'Side Elevation'],
  ['end', 'End Elevation'],
  ['3d', '3-Dimensional'],
  ['user', 'User View'],
];

/** The User View the program starts with: a three-quarter view from behind and above. */
export const DEFAULT_USER = { yaw: 35, pitch: 30, panX: 0, panY: 0, zoom: 1 };

/** A projector for one view: P → [u, v]. The user view turns about the room's centre. */
export function project(view, dims, user = DEFAULT_USER) {
  const cos30 = Math.cos(Math.PI / 6);
  if (view === 'plan') return (P) => [P.X, P.Y];
  if (view === 'side') return (P) => [P.Y, -P.Z];
  if (view === 'end') return (P) => [P.X, -P.Z];
  if (view === '3d') return (P) => [(P.X - P.Y) * cos30, (P.X + P.Y) * 0.5 - P.Z];
  const c = { X: dims.W / 2, Y: dims.L / 2, Z: dims.H / 2 };
  const cy = Math.cos(user.yaw * DEG);
  const sy = Math.sin(user.yaw * DEG);
  const sp = Math.sin(user.pitch * DEG);
  const cp = Math.cos(user.pitch * DEG);
  return (P) => {
    const x = P.X - c.X;
    const y = P.Y - c.Y;
    const z = P.Z - c.Z;
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    return [x1, y1 * sp - z * cp];
  };
}

/** The eight corners of the box. */
export function corners({ L, W, H }) {
  const out = [];
  for (const X of [0, W]) for (const Y of [0, L]) for (const Z of [0, H]) out.push({ X, Y, Z });
  return out;
}

/**
 * Scale a view into a w × h canvas with `margin` pixels round it: S(P) →
 * [px, py], `k` pixels per metre, and inv(px, py) → [u, v] back again (on the
 * plan, u is X and v is Y — how a click places the listener). The user view's
 * zoom and pan apply on top, so the arrows move the picture, not the room.
 */
export function fit(proj, dims, w, h, { margin = 30, user = null } = {}) {
  const pts = corners(dims).map(proj);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = user?.zoom ?? 1;
  const k = Math.min((w - 2 * margin) / (x1 - x0 || 1), (h - 2 * margin) / (y1 - y0 || 1)) * zoom;
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k + (user?.panX ?? 0);
  const oy = (h - (y1 - y0) * k) / 2 - y0 * k + (user?.panY ?? 0);
  const S = (P) => {
    const [u, v] = proj(P);
    return [ox + u * k, oy + v * k];
  };
  return { S, k, inv: (px, py) => [(px - ox) / k, (py - oy) / k] };
}

/** Line work for an axis-aligned box from (x0, y0, z0) to (x1, y1, z1), drawn with S. */
export function boxPath(ctx, S, x0, x1, y0, y1, z0, z1) {
  const line = (A, B) => {
    const a = S(A);
    const b = S(B);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  };
  const c = (X, Y, Z) => ({ X, Y, Z });
  for (const [Y, Z] of [[y0, z0], [y1, z0], [y0, z1], [y1, z1]]) line(c(x0, Y, Z), c(x1, Y, Z));
  for (const [X, Z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) line(c(X, y0, Z), c(X, y1, Z));
  for (const [X, Y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) line(c(X, Y, z0), c(X, Y, z1));
}

/**
 * The room: a faint floor grid a metre apart, then the box in `colour`. With
 * `axis`, the "Display Axis" lines in grey — the centre listening axis at the
 * listener's height, front wall to back, and each speaker's axis to the
 * listener.
 */
export function drawBox(ctx, S, dims, { colour = '#b040ff', grid = 'rgba(176,64,255,0.28)', axis = null } = {}) {
  const { L, W, H } = dims;
  const line = (A, B) => {
    const a = S(A);
    const b = S(B);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  };
  ctx.save();
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let X = 1; X < W; X++) line({ X, Y: 0, Z: 0 }, { X, Y: L, Z: 0 });
  for (let Y = 1; Y < L; Y++) line({ X: 0, Y, Z: 0 }, { X: W, Y, Z: 0 });
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  boxPath(ctx, S, 0, W, 0, L, 0, H);
  ctx.stroke();
  if (axis) {
    ctx.strokeStyle = '#909090';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    line({ X: axis.listener.X, Y: 0, Z: axis.listener.Z }, { X: axis.listener.X, Y: L, Z: axis.listener.Z });
    for (const s of axis.speakers) line(s, axis.listener);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Turn and move the user view from the Set panel: `mode` 'R' rotates, 'M' moves; dir is ←, →, ↑ or ↓. */
export function nudgeUser(user, mode, dir) {
  const u = { ...user };
  if (mode === 'R') {
    if (dir === 'left') u.yaw -= 15;
    if (dir === 'right') u.yaw += 15;
    if (dir === 'up') u.pitch = Math.min(90, u.pitch + 10);
    if (dir === 'down') u.pitch = Math.max(-90, u.pitch - 10);
  } else {
    if (dir === 'left') u.panX -= 20;
    if (dir === 'right') u.panX += 20;
    if (dir === 'up') u.panY -= 20;
    if (dir === 'down') u.panY += 20;
  }
  u.yaw = ((u.yaw % 360) + 360) % 360;
  return u;
}
