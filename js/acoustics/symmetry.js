// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SYMMETRY IS THE CAD'S MIRROR
 *
 * This app keeps no centre line of its own. The CAD's Virtual Mirror is a
 * vertical axis x = X on the sheet; the bridge sends it, and a device that has
 * a `pairId` keeps a twin reflected across it. Move either and the other
 * follows — the same rule Symmetrical Mode applies to geometry in the CAD,
 * applied to what this app adds on top.
 *
 * A vertical axis is a left/right mirror only when the room faces ±y (the
 * default: the front wall at the top of the sheet). The advisor says so when
 * it does not.
 */

/** Reflect a plan bearing (deg) across a vertical axis. */
export const mirrorBearing = (deg) => (((180 - deg) % 360) + 360) % 360;

const SWAP = { L: 'R', R: 'L' };

/** Role names `Ltf` ↔ `Rtf`, `L` ↔ `R`, and a trailing ` L` / ` R` on a free name; anything else unchanged. */
export function mirrorName(name) {
  if (!name) return name;
  if (/^[LR](s|ss|rs|w|tf|tm|tr)?$/.test(name)) return SWAP[name[0]] + name.slice(1);
  return name.replace(/ ([LR])$/, (_, side) => ` ${SWAP[side]}`);
}

export function mirrorDevice(dev, axisX) {
  return {
    ...dev,
    x: 2 * axisX - dev.x,
    aim: mirrorBearing(dev.aim),
    side: SWAP[dev.side] ?? dev.side,
    role: dev.role ? mirrorName(dev.role) : dev.role,
    name: mirrorName(dev.name),
  };
}

/**
 * After `changed` moved or changed, bring its twin into line. Keeps the twin's
 * own id, pair and selection, and its monitor channel (mute, solo, Ø, trim);
 * everything physical comes from the mirror.
 */
export function syncTwin(list, changed, axisX) {
  if (!changed.pairId || axisX == null) return list;
  return list.map((d) => {
    if (d.id === changed.id || d.pairId !== changed.pairId) return d;
    const m = mirrorDevice(changed, axisX);
    // its channel on the monitor controller is its own: muting L does not mute R
    return { ...m, id: d.id, pairId: d.pairId, mute: d.mute, solo: d.solo, invert: d.invert, trimDb: d.trimDb };
  });
}
