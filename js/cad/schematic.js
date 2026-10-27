// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { ACOUSTX_SPEAKER_PRESETS, boxSize, isListener, SPEAKER_PRESETS } from '../acoustics/devices.js';
import { activeSet, LAYOUTS, setLayout, setOf, SPEAKER_SETS } from '../acoustics/layouts.js';
import { masterDb, monitorOf, NOISES } from '../acoustics/monitor.js';
import { isRack, rackOf, rackPlan } from '../acoustics/rack.js';

/**
 * THE SYSTEM AS A SCHEMATIC
 *
 * A room with a dozen boxes in three sets is a wiring job before it is an
 * acoustic one, so the room draws its own signal flow, left to right:
 *
 *   SOURCES          the playback, a channel per role any set uses, and the
 *                    controller's noise generator
 *   MONITOR CTRL     volume, dim, mute and which set is live — a bus out per
 *                    set, A B C
 *   per set          a channel strip per box: trim, delay, polarity, mute and
 *                    solo as the controller has them, and a sub's low-pass —
 *                    the bass management — on its own strip
 *   SPEAKERS         each box by its role and its model, how it is driven,
 *                    and the box itself drawn beside it: its front at 1:2,
 *                    every box at the one scale so they compare, its drivers
 *                    where they are and its size in mm under it
 *   MEASUREMENT      the mics that are not people, into the inputs
 *   RACKS            each rack in the room, U by U: what is in it and what
 *                    is free
 *
 * Everything is read from the room as it stands (state, room.patches), so it
 * is drawn again when a box is added, a set changes or a rack fills. One
 * drawing in sheet metres, its origin the bottom-left, for marks.js to place.
 */

const T = 0.09; // the text height, metres on the sheet
const ROW = 0.42; // one channel
const BOX_H = 0.32;
const COL = { src: 0, ctrl: 2.8, strip: 5.5, spk: 8.7, box: 12.3, end: 14 };
/** The boxes' fronts are drawn at this scale: 1:2. */
const BOX_SCALE = 0.5;
const WIDE = { src: 2.2, ctrl: 2.0, strip: 2.6, spk: 3.4 };
/** A line of text cut to what fits `w` metres at `height` (a CAD glyph is about 0.7 of its height wide). */
const fit = (s, w, height) => {
  const n = Math.floor(w / (0.7 * height));
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
};

/**
 * A speaker's front, as line work centred on (cx, cy) at BOX_SCALE, y down:
 * the cabinet, and its drivers — a coaxial as one cone with the horn in its
 * throat, a horn's mouth over its woofer, a sub one big cone, anything else a
 * woofer and a dome. Driver sizes from the spec where it says ("12\""), the
 * heights from the box's woofer and acoustic centre where it has them.
 * Returns the box's drawn { w, h }.
 */
export function boxFront(s, cx, cy, lines) {
  const size = boxSize(s);
  const w = size.w * BOX_SCALE;
  const h = size.h * BOX_SCALE;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const rect = (x, y, rw, rh) => lines.push([x, y, x + rw, y], [x + rw, y, x + rw, y + rh], [x + rw, y + rh, x, y + rh], [x, y + rh, x, y]);
  const ring = (x, y, r) => {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 2 * Math.PI;
      const b = ((i + 1) / 20) * 2 * Math.PI;
      lines.push([x + r * Math.cos(a), y + r * Math.sin(a), x + r * Math.cos(b), y + r * Math.sin(b)]);
    }
  };
  rect(x0, y0, w, h);
  const spec = String(s.driver ?? SPEAKER_PRESETS[s.kind]?.driver ?? '');
  const inches = parseFloat(spec.match(/(\d+(?:\.\d+)?)\s*"/)?.[1]);
  // a cone is about 0.8 of its nominal size across; with no size given, as big as the baffle allows
  const fits = Math.min(w * 0.42, h * 0.3);
  const cone = Number.isFinite(inches) ? Math.min(fits * 1.15, (inches * 0.0254 * 0.8 * BOX_SCALE) / 2) : fits;
  // heights in the box are from its bottom, metres; y runs down here
  const at = (z) => y0 + h - z * BOX_SCALE;
  const sub = s.kind === 'sub' || (s.lowpass > 0 && !(s.fHigh > 0));
  if (sub) {
    ring(cx, cy, Math.min(w, h) * 0.4);
    ring(cx, cy, Math.min(w, h) * 0.12);
  } else if (/coax/i.test(spec)) {
    const y = Number.isFinite(s.wooferHeight) ? at(s.wooferHeight) : cy + h * 0.1;
    ring(cx, y, cone);
    ring(cx, y, cone * 0.35);
    ring(cx, y, cone * 0.12);
  } else {
    const wy = Number.isFinite(s.wooferHeight) ? at(s.wooferHeight) : y0 + h * 0.68;
    const ty = Number.isFinite(s.centerHeight) ? at(s.centerHeight) : y0 + h * 0.24;
    const woofer = Math.min(cone, Math.abs(wy - ty) * 0.9 || cone, (y0 + h - wy) * 0.9);
    ring(cx, wy, woofer);
    ring(cx, wy, woofer * 0.3);
    if (s.pattern === 'horn') {
      // the horn's mouth, flaring from its throat
      const mw = w * 0.7;
      const mh = Math.min(h * 0.22, Math.max(0.01, (wy - woofer - y0) * 0.85));
      rect(cx - mw / 2, ty - mh / 2, mw, mh);
      lines.push([cx - mw / 2, ty - mh / 2, cx - mw * 0.08, ty - mh * 0.12], [cx + mw / 2, ty - mh / 2, cx + mw * 0.08, ty - mh * 0.12], [cx - mw / 2, ty + mh / 2, cx - mw * 0.08, ty + mh * 0.12], [cx + mw / 2, ty + mh / 2, cx + mw * 0.08, ty + mh * 0.12]);
    } else ring(cx, ty, Math.max(0.003, 0.016 * BOX_SCALE)); // a 1" dome in its surround
  }
  return { w, h, size };
}

const modelOf = (s) => SPEAKER_PRESETS[s.kind]?.label ?? ACOUSTX_SPEAKER_PRESETS[s.kind]?.label ?? s.kind ?? '';
const signed = (v) => `${v > 0 ? '+' : ''}${(+v).toFixed(1)}`;

/** Which boxes each set wires, in the order its layout names them; a set's boxes outside its layout after them. */
export function setChannels(speakers, settings) {
  const out = [];
  for (const k of Object.keys(SPEAKER_SETS)) {
    const layout = setLayout(settings, k);
    const mine = speakers.filter((s) => setOf(s) === k);
    if (!mine.length) continue;
    const roles = LAYOUTS[layout?.preset] ? [...LAYOUTS[layout.preset].speakers, ...(LAYOUTS[layout.preset].lfe ?? [])].map((s) => s.name) : [];
    const rank = (s) => (roles.includes(s.role) ? roles.indexOf(s.role) : roles.length);
    out.push({ set: k, preset: layout?.preset ?? '—', live: k === activeSet(settings), speakers: [...mine].sort((a, b) => rank(a) - rank(b)) });
  }
  return out;
}

/**
 * The schematic for this state: { lines: [[x1, y1, x2, y2]], texts: [{ text,
 * x, y, height }], w, h } in sheet metres, origin bottom-left. `pieces` are
 * the room's patches, for the racks.
 */
export function schematicDrawing(state, pieces = []) {
  const { settings } = state;
  const lines = [];
  const texts = [];
  let y = 0; // grows DOWN while laying out; flipped at the end
  const text = (s, x, yy, height = T) => texts.push({ text: String(s), x, y: yy, height });
  const box = (x, yy, w, hh, title, sub) => {
    lines.push([x, yy, x + w, yy], [x + w, yy, x + w, yy + hh], [x + w, yy + hh, x, yy + hh], [x, yy + hh, x, yy]);
    text(fit(title, w - 0.12, T), x + 0.06, yy + 0.06 + T);
    if (sub) text(fit(sub, w - 0.12, T * 0.8), x + 0.06, yy + 0.1 + 2 * T, T * 0.8);
  };
  /** A wire from (x1, y1) to (x2, y2), square: across, then down, then across. */
  const wire = (x1, y1, x2, y2) => {
    const xm = (x1 + x2) / 2;
    if (Math.abs(y1 - y2) < 1e-6) return lines.push([x1, y1, x2, y2]);
    lines.push([x1, y1, xm, y1], [xm, y1, xm, y2], [xm, y2, x2, y2]);
  };

  text('SYSTEM SCHEMATIC · signal flow, as the room stands', 0, y + T * 1.6, T * 1.6);
  y += 0.5;
  for (const [name, x] of [['SOURCES', COL.src], ['MONITOR CONTROLLER', COL.ctrl], ['CHANNELS', COL.strip], ['SPEAKERS', COL.spk], [`THE BOXES · 1:${1 / BOX_SCALE}`, COL.box]]) text(name, x, y, T * 1.1);
  y += 0.2;

  const sets = setChannels(state.speakers ?? [], settings);
  const m = monitorOf(settings);
  const top = y;

  // the speakers, set by set: a strip and a box per channel, a bus label per set
  const busY = {};
  for (const g of sets) {
    text(`${g.set} SET · ${g.preset}${g.live ? ' · LIVE' : ''} · ${SPEAKER_SETS[g.set].title.split('—')[1]?.trim() ?? ''}`, COL.strip, y + T, T * 0.9);
    y += 0.2;
    const ys = [];
    for (const s of g.speakers) {
      const drawn = boxSize(s).h * BOX_SCALE;
      const rowH = Math.max(ROW, drawn + 0.22);
      y += (rowH - ROW) / 2;
      const mid = y + BOX_H / 2;
      ys.push(mid);
      const bass = s.lowpass > 0 ? ` · LPF ${Math.round(s.lowpass)} Hz` : '';
      const flags = [s.invert ? 'Ø' : '', s.mute ? 'MUTE' : '', s.solo ? 'SOLO' : ''].filter(Boolean).join(' ');
      box(COL.strip, y, WIDE.strip, BOX_H, `${g.set}·${s.role ?? s.name}  trim ${signed(s.trimDb ?? 0)} dB${flags ? `  ${flags}` : ''}`, `delay ${(s.delayMs ?? 0).toFixed(2)} ms${bass}`);
      const drive = s.drive === 'spl' ? `${Math.round(s.level ?? 0)} dB SPL @1 m` : `${s.watts ?? '?'} W · ${s.sensitivity ?? '?'} dB/W`;
      box(COL.spk, y, WIDE.spk, BOX_H, `${s.name}`, `${modelOf(s)} · ${drive}`);
      wire(COL.strip + WIDE.strip, mid, COL.spk, mid);
      const front = boxFront(s, COL.box + 0.3, mid, lines);
      text(`${Math.round(front.size.w * 1000)} × ${Math.round(front.size.h * 1000)} mm`, COL.box + 0.3 + front.w / 2 + 0.08, mid + T * 0.3, T * 0.7);
      y += ROW + (rowH - ROW) / 2;
    }
    busY[g.set] = { ys, first: ys[0], last: ys[ys.length - 1] };
    y += 0.15;
  }
  const bottom = Math.max(y, top + 3 * ROW);

  // the controller, its busses fanning out to each set's strips
  const ctrlH = Math.max(BOX_H * 2.4, 0.3 + sets.length * 0.25);
  const ctrlY = top + Math.max(0, (bottom - top) / 2 - ctrlH / 2);
  box(COL.ctrl, ctrlY, WIDE.ctrl, ctrlH, 'MONITOR CTRL', `vol ${signed(masterDb(m))} dB${m.dim ? ` · dim ${m.dimDb} dB` : ''}${m.mute ? ' · MUTE' : ''}`);
  sets.forEach((g, i) => {
    const yb = ctrlY + 0.45 + i * 0.22;
    text(`${g.set}${g.live ? ' ●' : ''}`, COL.ctrl + WIDE.ctrl - 0.32, yb + T / 2, T * 0.9);
    for (const ys of busY[g.set].ys) wire(COL.ctrl + WIDE.ctrl, yb, COL.strip, ys);
  });

  // the sources: playback, a line per role any set uses, and the noise
  const roles = [...new Set(sets.flatMap((g) => g.speakers.map((s) => s.role ?? s.name)))];
  const srcH = Math.max(BOX_H, 0.25 + roles.length * 0.12);
  const srcY = ctrlY - Math.max(0, srcH - ctrlH) / 2;
  box(COL.src, srcY, WIDE.src, srcH, 'PLAYBACK / DAW', `${roles.length} ch: ${roles.join(' ')}`);
  wire(COL.src + WIDE.src, srcY + srcH / 2, COL.ctrl, ctrlY + 0.2);
  const noiseY = srcY + srcH + 0.25;
  box(COL.src, noiseY, WIDE.src, BOX_H, 'NOISE GEN', `${NOISES[m.noise]?.label ?? m.noise} · cal ${m.calDb} dB`);
  wire(COL.src + WIDE.src, noiseY + BOX_H / 2, COL.ctrl, ctrlY + ctrlH - 0.1);

  // measurement mics into the inputs
  const meas = (state.mics ?? []).filter((x) => !isListener(x));
  let leftY = Math.max(noiseY + BOX_H + 0.4, ctrlY + ctrlH + 0.4);
  if (meas.length) {
    text('MEASUREMENT', COL.src, leftY, T * 1.1);
    leftY += 0.15;
    const inY = leftY + (meas.length * ROW) / 2 - BOX_H / 2;
    box(COL.ctrl, inY, WIDE.ctrl, BOX_H, 'MIC INPUTS', `${meas.length} in`);
    for (const x of meas) {
      box(COL.src, leftY, WIDE.src, BOX_H, x.name ?? 'Mic', x.pattern ?? 'omni');
      wire(COL.src + WIDE.src, leftY + BOX_H / 2, COL.ctrl, inY + BOX_H / 2);
      leftY += ROW;
    }
  }

  // the racks, U by U, top down as they stand
  let rackY = Math.max(bottom, leftY) + 0.4;
  const racks = pieces.filter((p) => p.surface === 'floor' && isRack(p.paletteId));
  const seen = new Set();
  let rackX = COL.src;
  let rackBottom = rackY;
  for (const p of racks) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const rack = p.rack ?? rackOf(settings.racks, p.id, p.paletteId);
    const plan = p.rackPlan ?? rackPlan(rack);
    const rowH = 0.13;
    const hh = 0.3 + plan.units * rowH;
    const w = 2.6;
    box(rackX, rackY, w, hh, `RACK ${p.id.replace(/^block:/, '#')} · ${plan.units} U`, `${plan.used} U used · ${plan.free} U free · rails ${Math.round(plan.railDepth)} mm`);
    for (let u = plan.units; u >= 1; u--) {
      const yy = rackY + 0.3 + (plan.units - u) * rowH;
      lines.push([rackX + 0.3, yy, rackX + w - 0.05, yy]);
      const s = plan.slots[u - 1];
      const it = s.item;
      const label = !it ? '· free' : it.top === u ? `${it.name} · ${it.units} U · ${it.reach == null ? 'depth ?' : `${Math.round(it.reach)} mm${it.fits === false ? ' TOO DEEP' : ''}`}` : '';
      text(String(u), rackX + 0.06, yy + rowH * 0.8, rowH * 0.6);
      if (label) text(label, rackX + 0.34, yy + rowH * 0.8, rowH * 0.6);
    }
    rackBottom = Math.max(rackBottom, rackY + hh);
    rackX += w + 0.4;
    if (rackX > COL.end) {
      rackX = COL.src;
      rackY = rackBottom + 0.3;
    }
  }
  if (!racks.length && !sets.length) text('No speakers and no racks in the room yet.', COL.src, top + T, T);

  const h = Math.max(rackBottom, rackY, leftY, bottom) + 0.2;
  const w = Math.max(COL.end, rackX);
  // flip: the CAD's y is up, the origin at the bottom-left
  return {
    lines: lines.map(([a, b, c, d]) => [r3(a), r3(h - b), r3(c), r3(h - d)]),
    texts: texts.map((t) => ({ ...t, x: r3(t.x), y: r3(h - t.y) })),
    w,
    h,
  };
}

const r3 = (v) => Math.round(v * 1000) / 1000;
