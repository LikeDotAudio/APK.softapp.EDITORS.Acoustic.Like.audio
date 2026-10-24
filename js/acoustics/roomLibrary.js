// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * FIFTY-ONE ROOMS TO PLAY WITH
 *
 * Plans of the kinds of room studios are actually built in, at real sizes:
 * the spare bedroom and the garage, the rooms drawn to a published ratio, the
 * control-room schools (LEDE, RFZ, non-environment, the splayed hexagon), live
 * rooms from a vocal booth to a scoring stage, and the mix rooms of film and
 * broadcast. They are TYPES — the shape and size such a room usually has —
 * not surveys of any one studio, so treat a name as "a room like this".
 *
 * Except one studio's own rooms: TANDA in Saskatoon — control rooms Tanda A
 * and Tanda B (B under construction), each with its live room and iso booth —
 * traced off the studio's floor plan (`traced`). The plan has no scale, so
 * TANDA_PX_PER_M is read off the furniture drawn in it (a mixer's chair, the
 * consoles, the couches) and the heights are a studio's usual; set either from
 * a survey and every Tanda room follows. Studio 2 is drawn as it is being
 * built — symmetrical — rather than as the plan sketches it.
 *
 * A room may carry `windows` (acoustics/windows.js): its glass, drawn into its
 * elevations with their casings when the room is picked, and editable after.
 *
 * Every plan is in metres with the listener facing +Y (the front wall at the
 * top, frontDeg 90), centred on x = 0 and starting at y = 0, wound counter-
 * clockwise. `h` is the ceiling height. Picking one draws it into the CAD as
 * a closed loop on a layer of its own, where it becomes the room.
 */

import { pointInPolygon } from './geometry.js';
import { NOSE_M, PERSON_M } from './console.js';

const FT = 0.3048;

/** A shoebox w wide, l long. */
const rect = (w, l) => [[-w / 2, 0], [w / 2, 0], [w / 2, l], [-w / 2, l]];

/** Side walls turning in over the last `d` metres to a front wall `fw` wide — the classic splayed front. */
const splayFront = (w, l, fw, d) => [[-w / 2, 0], [w / 2, 0], [w / 2, l - d], [fw / 2, l], [-fw / 2, l], [-w / 2, l - d]];

/** Splayed at both ends: a front `fw` wide over `fd`, a back `bw` wide over `bd` — the hexagon control room. */
const hexagon = (w, l, fw, fd, bw, bd) => [[-bw / 2, 0], [bw / 2, 0], [w / 2, bd], [w / 2, l - fd], [fw / 2, l], [-fw / 2, l], [-w / 2, l - fd], [-w / 2, bd]];

/** Narrow at the front, wide at the back (RFZ), or the other way round. */
const trapezoid = (backW, frontW, l) => [[-backW / 2, 0], [backW / 2, 0], [frontW / 2, l], [-frontW / 2, l]];

/** A shoebox with its four corners cut `c` back — the octagon live room. */
const octagon = (w, l, c) => [[-w / 2 + c, 0], [w / 2 - c, 0], [w / 2, c], [w / 2, l - c], [w / 2 - c, l], [-w / 2 + c, l], [-w / 2, l - c], [-w / 2, c]];

/** Side walls opening outward 1:10 from the front, so no two walls are parallel. */
const splayedSides = (w, l, flare = 0.1) => trapezoid(w + flare * l, w, l);

/** A shoebox whose back wall is not square: `skew` metres longer on the right than on the left. */
const skewedBack = (w, l, skew) => [[-w / 2, 0], [w / 2, -skew], [w / 2, l], [-w / 2, l]];

/** A pentagon pointing forward: the fan-shaped room, sides converging to a front point `tip` deep. */
const fan = (w, l, tip) => [[-w / 2, 0], [w / 2, 0], [w / 2, l - tip], [0, l], [-w / 2, l - tip]];

/** An L: the full width w for the back `lb` metres, then a narrower wn on the left for the rest. */
const ell = (w, l, wn, lb) => [[-w / 2, 0], [w / 2, 0], [w / 2, lb], [-w / 2 + wn, lb], [-w / 2 + wn, l], [-w / 2, l]];

const ft = (pts) => pts.map(([x, y]) => [x * FT, y * FT]);

/**
 * A plan traced off a drawing in pixels (x right, y down), `pxPerM` to the
 * metre, turned so the drawing's `front` side ('up', 'down', 'left' or
 * 'right') is the front wall — then centred on x = 0 from y = 0 and wound
 * counter-clockwise like the rest.
 */
function traced(px, pxPerM, front) {
  const turn = { up: ([u, v]) => [u, -v], down: ([u, v]) => [-u, v], left: ([u, v]) => [-v, -u], right: ([u, v]) => [v, u] }[front];
  const pts = px.map((p) => turn(p).map((c) => c / pxPerM));
  const xs = pts.map(([x]) => x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y0 = Math.min(...pts.map(([, y]) => y));
  const out = pts.map(([x, y]) => [+(x - cx).toFixed(3), +(y - y0).toFixed(3)]);
  return planArea(out) < 0 ? out.reverse() : out;
}

/** Tanda's floor plan (studio_layout_large.jpg, 700 × 1279 px): pixels to the metre, from the chairs, consoles and couches drawn in it. */
const TANDA_PX_PER_M = 60;
const tanda = (px, front) => traced(px, TANDA_PX_PER_M, front);

export const ROOM_LIBRARY = [
  // ---------------------------------------------------------------- home and project
  { id: 'bedroom', group: 'Home & project', name: 'Spare-bedroom studio', note: '3.0 × 3.6 m, plasterboard on studs', h: 2.4, poly: rect(3.0, 3.6) },
  { id: 'box-room', group: 'Home & project', name: 'Box room', note: 'the smallest room anyone mixes in', h: 2.4, poly: rect(2.7, 3.0) },
  { id: 'garage-single', group: 'Home & project', name: 'Single-garage conversion', note: 'long and narrow — the length modes stack', h: 2.4, poly: rect(3.0, 5.5) },
  { id: 'garage-double', group: 'Home & project', name: 'Double-garage conversion', note: 'square in plan: two dimensions share their modes', h: 2.7, poly: rect(5.5, 5.5) },
  { id: 'basement', group: 'Home & project', name: 'Basement studio', note: 'low ceiling, concrete all round', h: 2.3, poly: rect(4.5, 6.0) },
  { id: 'addition', group: 'Home & project', name: 'House-addition control room', note: 'clipped front corners for the speakers, as a home build often does', h: 2.7, poly: hexagon(4.5, 5.5, 3.1, 0.7, 4.5, 0) },
  { id: 'loft', group: 'Home & project', name: 'L-shaped loft', note: 'a stairwell takes a corner out of it', h: 2.4, poly: ell(5.0, 6.5, 3.2, 3.5) },
  { id: 'podcast', group: 'Home & project', name: 'Podcast room', note: 'two hosts, one table', h: 2.5, poly: rect(3.0, 3.5) },

  // ---------------------------------------------------------------- rooms drawn to a ratio
  { id: 'bolt', group: 'Ratio rooms', name: 'Louden-ratio room 1 : 1.4 : 1.9', note: 'height 2.7 m; Louden’s best ratio, inside Bolt’s area of even modes', h: 2.7, poly: rect(2.7 * 1.4, 2.7 * 1.9) },
  { id: 'sepmeyer', group: 'Ratio rooms', name: 'Sepmeyer A 1 : 1.14 : 1.39', note: 'height 2.7 m', h: 2.7, poly: rect(2.7 * 1.14, 2.7 * 1.39) },
  { id: 'golden', group: 'Ratio rooms', name: 'Golden-ratio room 1 : 1.62 : 2.62', note: 'height 2.5 m', h: 2.5, poly: rect(2.5 * 1.62, 2.5 * 2.62) },
  { id: 'bs1116', group: 'Ratio rooms', name: 'Reference listening room', note: '35 m², 2.8 m — the size ITU-R BS.1116 and EBU Tech 3276 ask for', h: 2.8, poly: rect(5.4, 6.5) },

  // ---------------------------------------------------------------- control rooms
  { id: 'lede', group: 'Control rooms', name: 'LEDE control room', note: 'live end, dead end: splayed, absorbent front', h: 3.0, poly: splayFront(5.5, 6.5, 3.6, 1.6) },
  { id: 'rfz', group: 'Control rooms', name: 'RFZ trapezoid control room', note: 'front walls angled so first reflections miss the mix seat', h: 3.0, poly: trapezoid(6.2, 3.8, 6.5) },
  { id: 'non-env', group: 'Control rooms', name: 'Non-environment control room', note: 'big, hard front wall; everything else absorbs', h: 3.4, poly: splayFront(6.5, 7.5, 4.6, 1.2) },
  { id: 'hexagon-400', group: 'Control rooms', name: 'Hexagonal control room, 400 sq ft', note: '22 ft wide, 10 ft ceiling — the splayed hexagon of a two-room studio plan', h: 10 * FT, poly: ft(hexagon(22, 20, 13, 5, 18, 3)) },
  { id: 'hexagon-500', group: 'Control rooms', name: 'Hexagonal control room, 500 sq ft', note: 'the larger room off a big live floor, 16 ft ceiling', h: 16 * FT, poly: ft(hexagon(24, 23, 14, 6, 20, 3)) },
  { id: 'splay-sides', group: 'Control rooms', name: 'Splayed-wall control room', note: 'side walls opening 1 : 10 — no parallel pair', h: 3.0, poly: splayedSides(4.8, 6.0) },
  { id: 'london', group: 'Control rooms', name: 'Large splayed control room', note: 'a deep room with a splayed front and an angled back corner, as the old London rooms were rebuilt', h: 3.6, poly: [[-3.8, 0], [2.6, 0], [3.8, 1.2], [3.8, 6.6], [2.4, 8.4], [-2.4, 8.4], [-3.8, 6.6]] },
  { id: 'cr-220', group: 'Control rooms', name: 'Small splayed control room, 220 sq ft', note: '14 × 17 ft, 10 ft ceiling, the front corners angled for the speakers', h: 10 * FT, poly: ft(splayFront(14, 17, 9, 4)) },
  { id: 'client-cr', group: 'Control rooms', name: 'Control room with client seating', note: 'deep enough for two rows behind the console', h: 3.5, poly: hexagon(8.0, 9.0, 5.0, 1.5, 8.0, 0) },
  { id: 'mix-small', group: 'Control rooms', name: 'Small mix room, angled front', note: '3.6 × 4.2 m with the front corners cut', h: 2.6, poly: hexagon(3.6, 4.2, 2.4, 0.6, 3.6, 0) },
  { id: 'v-back', group: 'Control rooms', name: 'Control room with a V back wall', note: 'widest mid-room, the rear wall folded to a point behind the couch', h: 3.4, poly: ft([[-6, 0], [0, -1.5], [6, 0], [9, 6], [8, 13], [5, 16], [-5, 16], [-8, 13], [-9, 6]]) },
  { id: 'pentagon-37', group: 'Control rooms', name: 'Rotated pentagon control room, 37 m²', note: 'no wall parallel to another, the mix seat on the long diagonal', h: 3.2, poly: [[-2.6, 0], [2.9, 0.6], [3.4, 4.6], [0.2, 7.2], [-3.6, 4.4]] },
  { id: 'cr-12', group: 'Control rooms', name: 'Compact splayed control room, 12 m²', note: 'side walls angled in toward the speakers', h: 2.7, poly: hexagon(3.3, 4.1, 2.2, 0.5, 2.7, 0.4) },
  { id: 'wide-splayed', group: 'Control rooms', name: 'Wide control room, splayed front and back', note: 'wider than deep, every corner angled — the inner room built inside a box', h: 3.2, poly: hexagon(6.5, 5.5, 4.5, 1.0, 5.5, 0.5) },
  { id: 'mastering', group: 'Control rooms', name: 'Mastering room', note: 'long, symmetrical, tall', h: 3.2, poly: rect(5.0, 7.0) },
  { id: 'broadcast', group: 'Control rooms', name: 'TV audio control room', note: 'wide and shallow behind a picture window', h: 3.0, poly: rect(6.0, 5.0) },
  { id: 'radio', group: 'Control rooms', name: 'Radio studio', note: 'presenter and guests round one desk', h: 2.7, poly: rect(3.5, 4.0) },

  // ---------------------------------------------------------------- live rooms
  { id: 'vocal-booth', group: 'Live rooms', name: 'Vocal booth', note: 'one singer, very dead', h: 2.4, poly: rect(1.5, 1.8) },
  { id: 'drum-booth', group: 'Live rooms', name: 'Drum room', note: 'room for a kit and a pair of overheads', h: 2.7, poly: rect(2.4, 3.0) },
  { id: 'iso-angled', group: 'Live rooms', name: 'Iso booth, one angled wall', note: 'a corner cut off by the door', h: 2.7, poly: [[-1.2, 0], [1.2, 0], [1.2, 2.4], [-0.4, 2.4], [-1.2, 1.6]] },
  { id: 'iso-trapezoid', group: 'Live rooms', name: 'Trapezoid iso booth', note: 'narrowing to the glass', h: 2.7, poly: trapezoid(2.8, 2.0, 2.4) },
  { id: 'rehearsal', group: 'Live rooms', name: 'Rehearsal room', note: 'loud band, hard walls', h: 3.0, poly: rect(6.0, 5.0) },
  { id: 'live-small', group: 'Live rooms', name: 'Small live room', note: 'a band, tight', h: 3.0, poly: rect(5.0, 6.0) },
  { id: 'octagon', group: 'Live rooms', name: 'Octagonal tracking room', note: 'corners cut to break up the axial modes', h: 3.6, poly: octagon(6.0, 6.0, 1.5) },
  { id: 'fan', group: 'Live rooms', name: 'Fan-shaped tracking room', note: 'a pentagon pointing at the glass — rooms paired back to back on one floor', h: 3.5, poly: fan(7.0, 8.0, 2.2) },
  { id: 'live-floor', group: 'Live rooms', name: 'Large live floor, 2200 sq ft', note: '55 × 36 ft, the back wall out of square, 16 ft ceiling', h: 16 * FT, poly: ft(skewedBack(55, 36, 3)) },
  { id: 'live-300', group: 'Live rooms', name: 'Trapezoid live floor, 300 sq ft', note: '17 ft at the back narrowing to 15 ft, 10 ft ceiling', h: 10 * FT, poly: ft(trapezoid(17, 15, 19)) },
  { id: 'angled-live', group: 'Live rooms', name: 'Angled live room', note: 'glass walls on the diagonal to the control room and booths', h: 4.0, poly: [[-4.5, 0], [3.0, 0], [4.5, 1.5], [4.5, 10], [-1.0, 10], [-4.5, 6.5]] },
  { id: 'bunker-live', group: 'Live rooms', name: 'Underground live space, 32 ft wide', note: 'corners cut for bass traps, angled glass walls down to the control room', h: 14 * FT, poly: ft([[-5, 0], [5, 0], [16, 6], [16, 24], [11, 30], [-11, 30], [-16, 24], [-16, 6]]) },
  { id: 'chapel', group: 'Live rooms', name: 'Converted chapel', note: 'tall, long, stone — a room people record in for its reverb', h: 8, poly: rect(10, 18) },
  { id: 'scoring', group: 'Live rooms', name: 'Orchestral scoring stage', note: 'a full orchestra and its reverb', h: 10, poly: rect(18, 28) },

  // ---------------------------------------------------------------- immersive and film
  { id: 'atmos-home', group: 'Immersive & film', name: 'Home Atmos mix room', note: 'the minimum a 7.1.4 fits in', h: 2.7, poly: rect(4.5, 5.5) },
  { id: 'dub-stage', group: 'Immersive & film', name: 'Film dubbing stage', note: 'a mixing theatre: screen wall, console mid-room', h: 7, poly: rect(12, 16) },

  // ---------------------------------------------------------------- Tanda, Saskatoon: the studio's own rooms, traced off its plan
  // control rooms face the console's front wall; the live rooms and booths face their glass
  { id: 'tanda-a', group: 'Tanda, Saskatoon', name: 'Tanda A — control room', note: 'chamfered front, the back wall a diffuser folded in two', h: 3.0, poly: tanda([[460, 187], [672, 172], [685, 237], [677, 310], [690, 370], [674, 447], [462, 427], [430, 385], [430, 247]], 'left') },
  { id: 'tanda-a-studio-1', group: 'Tanda, Saskatoon', name: 'Tanda A — Studio 1', note: 'the live room with the grand, glass to Tanda A', h: 3.6, live: true, poly: tanda([[15, 15], [405, 20], [402, 455], [12, 502]], 'right') },
  { id: 'tanda-a-iso-1', group: 'Tanda, Saskatoon', name: 'Tanda A — ISO 1', note: 'the booth over Tanda A, glass down into it', h: 2.7, live: true, poly: tanda([[415, 18], [692, 18], [690, 145], [420, 178]], 'down') },
  { id: 'tanda-b', group: 'Tanda, Saskatoon', name: 'Tanda B — control room', note: 'under construction: the big angled room, couch at the back, an alcove off the glass', h: 3.2, poly: tanda([[160, 615], [277, 570], [300, 602], [377, 630], [397, 585], [500, 545], [572, 715], [572, 800], [500, 965], [400, 950], [382, 887], [290, 950], [165, 910], [130, 830], [130, 720], [165, 660]], 'left') },
  // built symmetrical, not as traced: the plan's 4.65 m width and 4.95 m depth, the front folded to a point on the centre line, a big pane in each fold
  { id: 'tanda-b-studio-2', group: 'Tanda, Saskatoon', name: 'Tanda B — Studio 2', note: 'under construction: the second live room, symmetrical, its front folded into two big windows — glass to ISO 2 and to Tanda B', h: 3.0, live: true, poly: fan(4.65, 4.95, 0.9), windows: [{ face: 'front', at: 4.65 / 4, w: 1.8, h: 1.4, sill: 0.8, casing: 0.1 }, { face: 'front', at: (3 * 4.65) / 4, w: 1.8, h: 1.4, sill: 0.8, casing: 0.1 }] },
  { id: 'tanda-b-iso-2', group: 'Tanda, Saskatoon', name: 'Tanda B — ISO 2', note: 'under construction: the booth beside Tanda B', h: 2.7, live: true, poly: tanda([[5, 762], [95, 760], [160, 912], [5, 968]], 'right') },
];

export function roomById(id) {
  return ROOM_LIBRARY.find((r) => r.id === id) ?? null;
}

/** One room picked at random — the grab bag. `not` keeps it from picking the one already drawn. */
export function grabBag(not = null, random = Math.random) {
  const pool = ROOM_LIBRARY.filter((r) => r.id !== not);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Floor area of a plan, m². */
export function planArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * WHAT A ROOM COMES WITH
 *
 * A studio is not an empty box: a library room is drawn furnished the way such
 * a room is used, and with its people in it. In the room's own frame (front at
 * +Y, as the plans are), from what kind of room it is and how big:
 *
 *   mix rooms (control, home, ratio, immersive)
 *        the desk at the mix seat — a plain desk under 4 m wide, a 2.4 m
 *        console under 6.5 m, a 3.2 m large-format above — the MIXER at 38 %
 *        of the length from the front; behind a console, where it fits, the
 *        PRODUCER DESK just behind the mixer's chair and the PRODUCER seated
 *        at it (a metre behind the mixer, no desk, otherwise), a CONSOLE
 *        CLIENT at the desk's end; in a room deep enough, a couch at the back
 *        with the ENTOURAGE on it, and a rack beside the desk where it fits.
 *   podcast and radio
 *        one desk mid-room, the hosts either side of it.
 *   live rooms and booths
 *        nobody mixes in them: a single listener where a player would stand.
 *
 * And every room has a way in: a DOOR in the back wall, behind the listener,
 * at its right-hand end so it clears the couch — a plain one in a home room,
 * a sealed acoustic door anywhere built as a studio.
 *
 * Returns { furniture: [{ paletteId, x, y, rotation }], seats: [{ kind, x, y,
 * z, aim, mix? }], door: { paletteId, x, y, w, h } } — products from
 * materials.js, seats as listener tiers (devices.js MIC_PRESETS), the door's
 * centre where it meets the floor on the back wall. Pure: main.js offsets it
 * to where the room is drawn, and hangs the door on the back elevation.
 */
export function furnish(room) {
  const xs = room.poly.map(([x]) => x);
  const ys = room.poly.map(([, y]) => y);
  const W = Math.max(...xs) - Math.min(...xs);
  const y0 = Math.min(...ys);
  const L = Math.max(...ys) - y0;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const front = y0 + L;
  const furniture = [];
  const seats = [];
  const ear = 1.2;
  const face = 90;
  const door = doorOf(room);
  if (room.group === 'Live rooms' || room.live) {
    seats.push({ kind: 'mixer', x: cx, y: y0 + L * 0.5, z: room.id.includes('booth') || room.id.includes('iso') ? 1.6 : ear, aim: face, mix: true });
    return { furniture, seats, door };
  }
  if (room.id === 'podcast' || room.id === 'radio') {
    const y = y0 + L * 0.5;
    furniture.push({ paletteId: 'desk-1800x900', x: cx, y, rotation: 0 });
    seats.push({ kind: 'mixer', x: cx, y: y - 0.85, z: ear, aim: face, mix: true }, { kind: 'client', x: cx, y: y + 0.85, z: ear, aim: face + 180 });
    return { furniture, seats, door };
  }
  const mixY = front - 0.38 * L;
  const desk = W < 4 ? { id: 'desk-1800x900', w: 1.8, d: 0.9 } : W < 6.5 ? { id: 'console-2400x1000', w: 2.4, d: 1.0 } : { id: 'console-3200x1200', w: 3.2, d: 1.2 };
  // the console at the mixer's nose, two people clear (console.js)
  const deskY = mixY + NOSE_M + 2 * PERSON_M + desk.d / 2;
  furniture.push({ paletteId: desk.id, x: cx, y: deskY, rotation: 0 });
  seats.push({ kind: 'mixer', x: cx, y: mixY, z: ear, aim: face, mix: true });
  // where the console is the mixer's, the producer has a desk of their own: just behind the mixer's chair, the producer one person behind it
  const pDesk = { id: 'producer-desk-1800x600', d: 0.6 };
  const pDeskY = mixY - PERSON_M - pDesk.d / 2;
  const withDesk = desk.id !== 'desk-1800x900' && pDeskY - pDesk.d / 2 - NOSE_M - PERSON_M > y0 + 0.5;
  const producerY = withDesk ? pDeskY - pDesk.d / 2 - NOSE_M - PERSON_M : mixY - 1.0;
  if (withDesk) furniture.push({ paletteId: pDesk.id, x: cx, y: pDeskY, rotation: 0 });
  if (producerY > y0 + 0.5) seats.push({ kind: 'producer', x: cx, y: producerY, z: ear + 0.1, aim: face });
  if (W >= 3.6) seats.push({ kind: 'client', x: cx + desk.w / 2 - 0.2, y: mixY + 0.05, z: ear, aim: face });
  if (W - desk.w >= 1.6) furniture.push({ paletteId: 'rack-600x800', x: cx - desk.w / 2 - 0.5, y: deskY - 0.3, rotation: 0 });
  // a couch at the back, if there is room behind the producer for it — and beside the door, which comes first
  const couch = W < 5 ? { id: 'couch-2000x900', w: 2.0, d: 0.9 } : { id: 'couch-2400x1000', w: 2.4, d: 1.0 };
  const couchY = y0 + 0.25 + couch.d / 2;
  const clearOfDoor = !door || Math.abs(door.x - cx) >= couch.w / 2 + door.w / 2;
  if (producerY - couchY > 1.0 && W >= couch.w + 0.6 && clearOfDoor) {
    furniture.push({ paletteId: couch.id, x: cx, y: couchY, rotation: 0 });
    for (const dx of [-couch.w / 4, couch.w / 4]) seats.push({ kind: 'entourage', x: cx + dx, y: couchY, z: 1.0, aim: face });
  }
  // an odd plan (an L, a fan) can leave a piece outside: it is left out, never the mixer
  const inside = (p) => pointInPolygon(p.x, p.y, room.poly.map(([x, y]) => ({ x, y })));
  return { furniture: furniture.filter(inside), seats: seats.filter((s) => s.mix || inside(s)), door };
}

const DOOR_CLEAR = 0.15;

/**
 * The door: on the squarest wall facing back (outward within 45° of −Y, the
 * walls the back elevation draws) that it fits, the longer of a tie, its far
 * edge DOOR_CLEAR in from that wall's right-hand corner. Null only for a plan with no back wall it fits.
 */
function doorOf(room) {
  const [paletteId, w, h] = room.group === 'Home & project' ? ['door-900x2100', 0.9, 2.1] : ['door-acoustic-1000x2100', 1.0, 2.1];
  let best = null;
  room.poly.forEach((a, i) => {
    const b = room.poly[(i + 1) % room.poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // wound counter-clockwise, so the outward normal is the edge turned clockwise
    const backward = -(a[0] - b[0]) / len;
    if (backward < Math.SQRT1_2 || len < w + 2 * DOOR_CLEAR) return;
    // squarest first: the elevation draws a splayed wall foreshortened, so a door-sized block there stretches 1/cos
    const better = !best || backward > best.backward + 1e-6 || (backward > best.backward - 1e-6 && (len > best.len + 1e-9 || (len > best.len - 1e-9 && b[0] > best.b[0])));
    if (better) best = { a, b, len, backward };
  });
  if (!best) return null;
  const { a, b, len } = best;
  const s = (len - DOOR_CLEAR - w / 2) / len;
  return { paletteId, x: a[0] + (b[0] - a[0]) * s, y: a[1] + (b[1] - a[1]) * s, w, h };
}
