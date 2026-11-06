// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * AIM IN THE PLACEMENT (acoustics-3)
 *
 * A speaker, mic or listener faces somewhere: `aim`, a plan bearing in
 * degrees (0 = +x, 90 = +y, the sheet's frame), and `tilt`, degrees above
 * the horizon. In IFC that is the occurrence's own IfcAxis2Placement3D:
 *
 *   RefDirection (local x) = where it points:   (cos t·cos a, cos t·sin a, sin t)
 *   Axis         (local z) = its up, tilted:    (−sin t·cos a, −sin t·sin a, cos t)
 *
 * so a viewer that draws the box along its local x draws it aimed, and the
 * two vectors are always perpendicular (the placement's WHERE rule).
 * `aimTilt` is the inverse; straight up or down (|t| = 90°) the bearing is
 * read off the tilted up vector instead, so even that comes back.
 */

const DEG = Math.PI / 180;

/** Round to 12 significant figures: what survives a trip through a REAL and a unit scale, exactly. */
export const sig = (x) => (Number.isFinite(x) ? Number(Number(x).toPrecision(12)) : x);

/** A bearing in [0, 360). */
export const bearing = (deg) => {
  const b = ((deg % 360) + 360) % 360;
  return b === 360 ? 0 : b;
};

/** (aim, tilt) in degrees → { ref, axis }, two unit vectors. */
export function aimAxes(aim = 0, tilt = 0) {
  const a = aim * DEG;
  const t = tilt * DEG;
  const clean = (v) => v.map((c) => (Math.abs(c) < 1e-15 ? 0 : sig(c)));
  return {
    ref: clean([Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)]),
    axis: clean([-Math.sin(t) * Math.cos(a), -Math.sin(t) * Math.sin(a), Math.cos(t)]),
  };
}

/** { ref, axis } (either may be missing: IFC's defaults are x and z) → { aim, tilt } in degrees, aim in [0, 360). */
export function aimTilt(ref = [1, 0, 0], axis = [0, 0, 1]) {
  const n = Math.hypot(...ref) || 1;
  const d = ref.map((c) => c / n);
  const tilt = Math.asin(Math.max(-1, Math.min(1, d[2]))) / DEG;
  const flat = Math.hypot(d[0], d[1]);
  let aim;
  if (flat > 1e-9) aim = Math.atan2(d[1], d[0]) / DEG;
  else {
    // pointing straight up or down: the up vector leans away from the bearing
    const s = Math.sign(d[2]) || 1;
    aim = Math.atan2(-axis[1] * s, -axis[0] * s) / DEG;
  }
  return { aim: round6(bearing(aim)), tilt: round6(tilt) };
}

/** Degrees to a millionth: the precision an aim is kept to. */
export const round6 = (x) => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 360 ? 0 : Object.is(r, -0) ? 0 : r;
};

/** Metres → mm, to 0.1 mm (the house unit, at the IFC boundary). */
export const mm = (m) => {
  const r = Math.round(m * 10000) / 10;
  return Object.is(r, -0) ? 0 : r;
};

/** mm → metres, the overlay's own unit. */
export const metres = (v) => sig(v / 1000);
