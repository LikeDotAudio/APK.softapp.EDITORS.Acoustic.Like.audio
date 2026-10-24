// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { angleDiff, DEG } from './geometry.js';
import { clampInside, CLEAR_M } from './inRoom.js';

/**
 * IMMERSIVE LAYOUTS
 *
 * Reference azimuths and elevations from the public ITU-R BS.2051 / BS.775
 * tables, with the tolerance windows a designer checks a room against. The
 * Dolby Atmos Room Design Tool (Dolby's own spreadsheet, not reproduced here)
 * is what certifies a room; this places a starting layout and shows how far
 * the drawn one strays from it. Two rules from its release notes are kept:
 * L/C/R sit in a line at the front of the working space, and 5.1.4 rears are
 * notionally at 135°.
 *
 * Azimuth is positive to the listener's LEFT (ITU), so a name beginning with L
 * has a positive one, and every L has an R that is its mirror image — the pair
 * the CAD's Virtual Mirror keeps symmetrical.
 *
 * Elevation windows: a speaker at ear height may sit ±10°, a height speaker
 * 30–55°, unless it names its own `elRange` — 22.2 (BS.2051 System H, NHK's
 * Super Hi-Vision layout) has a top layer, a voice of god straight up, and a
 * bottom layer below the ears. `lfe` lists the subwoofers by bearing: one for
 * every .1, two for a .2; an `under` sub stands on the floor at the mains'
 * radius, below them, rather than just inside it.
 */

const pair = (base, az, el, range, extra = {}) => [
  { name: `L${base}`, az, el, range, side: 'L', ...extra },
  { name: `R${base}`, az: -az, el, range, side: 'R', ...extra },
];

const ONE_LFE = [{ name: 'LFE', az: -15 }];
const BED_FRONT = [{ name: 'C', az: 0, el: 0, range: [0, 0], side: 'C', line: true }, ...pair('', 30, 0, [22, 30], { line: true })];
const UNDER_LR = [{ name: 'LFE1', az: 30, under: true }, { name: 'LFE2', az: -30, under: true }];
const TOPS_4 = [...pair('tf', 45, 45, [30, 55]), ...pair('tr', 135, 45, [110, 150])];

/** No arrangement: every speaker is placed by hand, and every one of them sounds. */
export const NO_LAYOUT = 'none';

export const LAYOUTS = {
  // one box on the centre line, straight ahead: a mono check, a talkback, a single wedge
  '1.0': { label: 'Mono 1.0', speakers: [{ name: 'C', az: 0, el: 0, range: [0, 0], side: 'C', line: true }] },
  '2.0': { label: 'Stereo 2.0', speakers: pair('', 30, 0, [22, 30]) },
  // floor subs right under the mains: one between them on the centre line, or one beneath each
  '2.1': { label: 'Stereo 2.1', speakers: pair('', 30, 0, [22, 30]), lfe: [{ name: 'LFE', az: 0, under: true }] },
  '2.2': { label: 'Stereo 2.2', speakers: pair('', 30, 0, [22, 30]), lfe: UNDER_LR },
  '5.1': { label: '5.1', speakers: [...BED_FRONT, ...pair('s', 110, 0, [100, 120])], lfe: ONE_LFE },
  '5.2': { label: '5.2', speakers: [...BED_FRONT, ...pair('s', 110, 0, [100, 120])], lfe: UNDER_LR },
  '5.1.4': { label: '5.1.4', speakers: [...BED_FRONT, ...pair('s', 135, 0, [110, 135]), ...TOPS_4], lfe: ONE_LFE },
  '5.2.4': { label: '5.2.4', speakers: [...BED_FRONT, ...pair('s', 135, 0, [110, 135]), ...TOPS_4], lfe: UNDER_LR },
  '7.1': { label: '7.1', speakers: [...BED_FRONT, ...pair('ss', 90, 0, [90, 110]), ...pair('rs', 150, 0, [135, 150])], lfe: ONE_LFE },
  '7.1.4': { label: '7.1.4', speakers: [...BED_FRONT, ...pair('ss', 90, 0, [90, 110]), ...pair('rs', 150, 0, [135, 150]), ...TOPS_4], lfe: ONE_LFE },
  '7.2.4': { label: '7.2.4', speakers: [...BED_FRONT, ...pair('ss', 90, 0, [90, 110]), ...pair('rs', 150, 0, [135, 150]), ...TOPS_4], lfe: UNDER_LR },
  '9.1.6': {
    label: '9.1.6',
    speakers: [
      ...BED_FRONT,
      ...pair('w', 60, 0, [50, 70]),
      ...pair('ss', 90, 0, [90, 110]),
      ...pair('rs', 150, 0, [135, 150]),
      ...pair('tf', 45, 45, [30, 55]),
      ...pair('tm', 90, 45, [65, 100]),
      ...pair('tr', 135, 45, [110, 150]),
    ],
    lfe: ONE_LFE,
  },
  '22.2': {
    label: '22.2 (NHK)',
    speakers: [
      // middle layer, at the ears
      { name: 'C', az: 0, el: 0, range: [0, 0], side: 'C' },
      ...pair('c', 30, 0, [22, 30]),
      ...pair('', 60, 0, [45, 60]),
      ...pair('s', 90, 0, [90, 90]),
      ...pair('b', 135, 0, [110, 135]),
      { name: 'BC', az: 180, el: 0, range: [180, 180], side: 'C' },
      // top layer
      { name: 'TpFC', az: 0, el: 40, range: [0, 0], side: 'C', elRange: [30, 45] },
      ...pair('tf', 45, 40, [30, 45], { elRange: [30, 45] }),
      ...pair('ts', 90, 40, [90, 90], { elRange: [30, 45] }),
      ...pair('tb', 135, 40, [110, 135], { elRange: [30, 45] }),
      { name: 'TpBC', az: 180, el: 40, range: [180, 180], side: 'C', elRange: [30, 45] },
      { name: 'TpC', az: 0, el: 90, range: [0, 0], side: 'C', elRange: [80, 90], top: true },
      // bottom layer
      { name: 'BtFC', az: 0, el: -20, range: [0, 0], side: 'C', elRange: [-30, -15] },
      ...pair('bf', 52, -20, [45, 60], { elRange: [-30, -15] }),
    ],
    lfe: [
      { name: 'LFE1', az: 45 },
      { name: 'LFE2', az: -45 },
    ],
  },
};

/** The elevation window a reference speaker is checked against. */
export const elWindow = (s) => s.elRange ?? (s.el === 0 ? [-10, 10] : [30, 55]);

/**
 * The speakers the highlighted arrangement soloes: those whose role is one of
 * its own (2.0 picks L and R out of a 7.1.4). Every speaker when no
 * arrangement is shown, or when none of them carries one of its roles.
 */
export function arrangedSpeakers(speakers, settings) {
  const layout = LAYOUTS[settings.layout?.preset];
  if (!layout || settings.show?.arrangement === false) return speakers;
  const roles = new Set([...layout.speakers, ...(layout.lfe ?? [])].map((s) => s.name));
  const picked = speakers.filter((s) => roles.has(s.role));
  return picked.length ? picked : speakers;
}

/**
 * The speakers that SOUND, and that the views draw solid: the highlighted
 * arrangement's and nothing else — 2.0 is two boxes, whatever else is in the
 * room. A box from another arrangement or placed by hand is muted and drawn
 * as a ghost until the arrangement is hidden (or it is given one of its roles).
 * The field, the meters and the response all hear these.
 */
export function soundingSpeakers(speakers, settings) {
  return arrangedSpeakers(speakers, settings);
}

/**
 * Where the arrangement faces: the room's front turned by the layout's
 * `rotate` (degrees, CCW seen from above). The whole array — its centre
 * offset, its references, its check — turns with it, so it can be swung to
 * suit a desk that does not face the room's front wall square.
 */
export const arrayFront = (settings) => settings.frontDeg + (settings.layout?.rotate ?? 0);

/**
 * The marks a listener's nose snaps to as it turns: the room's front, and
 * square-on to every wall (a splayed corner too). They are the room's, so
 * they stay put while the arrangement swings round with the seat.
 * [{ deg, name }], world degrees CCW from +x, one per direction.
 */
export function noseMarks(room, frontDeg) {
  const marks = [{ deg: wrap180(frontDeg), name: 'the front' }];
  for (const w of room?.walls ?? []) {
    const deg = wrap180(Math.atan2(-w.nIn.y, -w.nIn.x) / DEG);
    if (!marks.some((m) => Math.abs(angleDiff(m.deg, deg)) < 0.5)) marks.push({ deg, name: `${w.face} wall, square-on` });
  }
  return marks;
}

/**
 * Snap a nose's bearing: onto a mark within `tol`°, else onto the 15° steps
 * from the front within `stepTol`°, else to the whole degree. { aim, mark }
 * where `mark` names what it locked to, null when free.
 */
export function snapNose(aim, marks, frontDeg, { tol = 6, step = 15, stepTol = 3 } = {}) {
  let best = null;
  for (const m of marks) {
    const d = Math.abs(angleDiff(aim, m.deg));
    if (d <= tol && (!best || d < best.d)) best = { d, m };
  }
  if (best) return { aim: +best.m.deg.toFixed(1), mark: best.m.name };
  const off = angleDiff(aim, frontDeg);
  const stepped = Math.round(off / step) * step;
  if (Math.abs(off - stepped) <= stepTol) return { aim: +wrap180(frontDeg + stepped).toFixed(1), mark: `${Math.abs(stepped)}° ${stepped > 0 ? 'left' : stepped < 0 ? 'right' : ''} of the front`.replace(/ +of/, ' of') };
  return { aim: Math.round(wrap180(aim)), mark: null };
}

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** The mains, L C R; every other speaker of an arrangement is a surround or a height. */
export const isMain = (role) => role === 'L' || role === 'C' || role === 'R';

/**
 * The arrangement's centre: the mix seat moved by `offset` — millimetres to
 * the listener's right, toward the front and up ({ right, front, up }). Every
 * arrangement is placed around, drawn from and checked against this point, so
 * an array can sit off the seat (a producer's desk behind the mixer's chair).
 */
export function layoutCentre(seat, frontDeg, offset = {}) {
  const f = { x: Math.cos(frontDeg * DEG), y: Math.sin(frontDeg * DEG) };
  const r = { x: f.y, y: -f.x };
  const right = (offset.right ?? 0) / 1000;
  const front = (offset.front ?? 0) / 1000;
  return { x: seat.x + r.x * right + f.x * front, y: seat.y + r.y * right + f.y * front, z: (seat.z ?? 1.2) + (offset.up ?? 0) / 1000 };
}

/**
 * Speaker positions for `layout` around the mix position. Bearings are world
 * degrees CCW from +x; the listener faces `frontDeg`. Heights clamp under the
 * ceiling, and the check table reports the elevation the room actually allows.
 * When `room` is provided, speakers are clamped inside the walls with clearance.
 */
export function layoutPositions(layout, mix, frontDeg, radius, ceiling, room = null) {
  const out = [];
  for (const s of LAYOUTS[layout].speakers) {
    const bearing = frontDeg + s.az;
    const rh = radius * Math.cos(s.el * DEG);
    let x = mix.x + rh * Math.cos(bearing * DEG);
    let y = mix.y + rh * Math.sin(bearing * DEG);
    let z = Math.max(0.1, Math.min(mix.z + radius * Math.sin(s.el * DEG), ceiling - 0.15));
    let aim = bearing + 180;
    let tilt = -Math.atan2(z - mix.z, rh) / DEG;
    if (room) {
      const c = clampInside(room, { x, y, z }, CLEAR_M, mix);
      x = c.x;
      y = c.y;
      z = c.z;
      const dx = x - mix.x;
      const dy = y - mix.y;
      const distH = Math.hypot(dx, dy);
      aim = (Math.atan2(mix.y - y, mix.x - x) / DEG + 360) % 360;
      tilt = -Math.atan2(z - mix.z, distH || 1e-6) / DEG;
    }
    out.push({
      role: s.name,
      side: s.side,
      x,
      y,
      z,
      aim,
      tilt,
    });
  }
  for (const sub of LAYOUTS[layout].lfe ?? []) {
    const bearing = frontDeg + sub.az;
    const r = radius * (sub.under ? 1 : 0.9);
    let x = mix.x + r * Math.cos(bearing * DEG);
    let y = mix.y + r * Math.sin(bearing * DEG);
    let z = 0.3;
    let aim = bearing + 180;
    if (room) {
      const c = clampInside(room, { x, y, z, kind: 'sub' }, CLEAR_M, mix);
      x = c.x;
      y = c.y;
      z = c.z;
      aim = (Math.atan2(mix.y - y, mix.x - x) / DEG + 360) % 360;
    }
    out.push({ role: sub.name, side: 'C', x, y, z, aim, tilt: 0, sub: true });
  }
  return out;
}

/**
 * The array moved to `next` (a new radius, centre offset or rotation), the
 * speakers placed in it carried along: they scale about the old centre by the
 * radius ratio, turn by the change in rotation, then cross to the new centre,
 * so each keeps its bearing from the listener and keeps aiming at them. A sub
 * stays on the floor, a height speaker under the ceiling.
 * When `room` is provided, carried speakers are clamped inside the room.
 * Returns [{ id, x, y, z, aim }] for the speakers that move; none without a seat.
 */
export function carryArray(speakers, settings, mix, next, ceiling = Infinity, room = null) {
  // with no arrangement there is no array to carry: boxes placed by hand stay where they were put
  if (!mix || !LAYOUTS[settings.layout?.preset]) return [];
  const layout = settings.layout;
  const turn = (next.rotate ?? 0) - (layout.rotate ?? 0);
  const a = layoutCentre(mix, arrayFront(settings), layout.offset);
  const b = layoutCentre(mix, settings.frontDeg + (next.rotate ?? 0), next.offset);
  const k = (next.radius ?? 2) / (layout.radius ?? 2);
  const [cos, sin] = [Math.cos(turn * DEG), Math.sin(turn * DEG)];
  return arrangedSpeakers(speakers, settings)
    .filter((s) => s.role)
    .map((s) => {
      const [dx, dy] = [(s.x - a.x) * k, (s.y - a.y) * k];
      let x = b.x + dx * cos - dy * sin;
      let y = b.y + dx * sin + dy * cos;
      let z = s.kind === 'sub' ? s.z : Math.max(0.1, Math.min(b.z + (s.z - a.z) * k, ceiling - 0.15));
      if (room) {
        const c = clampInside(room, { x, y, z, kind: s.kind }, CLEAR_M, b);
        x = c.x;
        y = c.y;
        z = c.z;
      }
      return {
        id: s.id,
        x,
        y,
        z,
        ...(turn && s.aim != null ? { aim: +(((s.aim + turn) % 360 + 360) % 360).toFixed(1) } : {}),
      };
    });
}

/** Each layout speaker's actual angles, distance, and the delay/trim that would align it. */
export function layoutCheck(speakers, mix, frontDeg, layout) {
  const ref = new Map(LAYOUTS[layout]?.speakers.map((s) => [s.name, s]) ?? []);
  const rows = speakers
    .filter((s) => ref.has(s.role))
    .map((s) => {
      const dx = s.x - mix.x;
      const dy = s.y - mix.y;
      const rh = Math.hypot(dx, dy);
      let az = Math.atan2(dy, dx) / DEG - frontDeg;
      az = ((az + 540) % 360) - 180;
      const el = Math.atan2(s.z - mix.z, rh) / DEG;
      const dist = Math.hypot(rh, s.z - mix.z);
      const want = ref.get(s.role);
      const absAz = Math.abs(az);
      const [lo, hi] = want.range;
      // straight overhead, azimuth means nothing
      const azOk = want.top || (want.side === 'C' ? Math.abs(angleDiff(az, want.az)) <= 2 : absAz >= lo - 1 && absAz <= hi + 1 && Math.sign(az) === Math.sign(want.az));
      const [elLo, elHi] = elWindow(want);
      const elOk = el >= elLo - 1 && el <= elHi + 1;
      return { id: s.id, role: s.role, az, el, dist, want, ok: azOk && elOk };
    });
  const far = Math.max(0, ...rows.map((r) => r.dist));
  for (const r of rows) {
    r.delayMs = ((far - r.dist) / 343) * 1000;
    r.trimDb = -20 * Math.log10(far / r.dist);
  }
  return rows;
}
