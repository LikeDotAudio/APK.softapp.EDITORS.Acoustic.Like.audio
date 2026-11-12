// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Inspect tab: the tree, a wall’s form, a speaker’s form (its drive, where it sits relative to the listener).
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { selectedDevice } from '../../model/store.js';
import { setOf, speakerColour } from '../../acoustics/layouts.js';
import { outside } from '../../acoustics/inRoom.js';
import { button, h, num, row, select, text } from '../dom.js';
import { MIC_PRESETS, SPEAKER_PRESETS, speakerLevel, speakerSpec, wattsFor } from '../../acoustics/devices.js';
import { aimAt, fmt, MATERIAL_OPTIONS, snapToWall, surfaceLabel } from './common.js';
import { lookup } from '../../acoustics/materials.js';
import { openSpeakerDatasheetModal } from '../speakerDatasheetModal.js';

export function inspectTab(ins) {
  const { acousticTree, colourRow, engine, listClick, render, S, set, store } = ins;
  // the other parts' functions, looked up when called
  const micForm = (...a) => ins.micForm(...a);
  const mirrorPairButton = (...a) => ins.mirrorPairButton(...a);
  const patchDetails = (...a) => ins.patchDetails(...a);

  function inspectPane() {
    const { selected } = S();
    const dev = selectedDevice(S());
    const list = acousticTree({
      speaker: (d) => item('speaker', d, `🔊 ${d.role || d.name}`, speakerColour(d, S().settings)),
      mic: (d) => item('mic', d, `${d.mix ? '🎧' : '🎤'} ${d.name}`, d.mix ? '#ff3b3b' : '#ddd'),
    });
    function item(kind, d, label, colour) {
      const lost = outside(engine.out.room, d);
      return h(
        'button',
        { class: `dev ${selected?.id === d.id ? 'on' : ''} ${lost ? 'lost' : ''}`, style: `--c:${colour}`, title: lost ? 'Outside the room — double-click to bring it to the middle' : '', onclick: () => listClick(kind, d.id) },
        label,
        d.pairId ? h('i', { title: 'Mirrored pair' }, '⇋') : '',
        lost ? h('i', { title: 'Outside the room' }, '⇱') : '',
      );
    }
    const add = h(
      'div',
      { class: 'adders' },
      select(S().placeKind.speaker, Object.entries(SPEAKER_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => store.setPlaceKind('speaker', v)),
      button('＋ Speaker', () => store.setMode('place-speaker')),
      select(S().placeKind.mic, Object.entries(MIC_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => store.setPlaceKind('mic', v)),
      button('＋ Mic', () => store.setMode('place-mic')),
    );
    const parts = [h('h3', {}, 'Acoustic groups'), add, list];
    if (selected?.kind === 'patch') parts.push(...patchDetails(selected.id, true));
    else if (selected?.kind === 'wall') parts.push(...wallForm(selected.id));
    else if (!dev) parts.push(h('p', { class: 'hint' }, 'Pick ＋ Speaker or ＋ Mic, then click on the plan. Drag to move, Shift-drag to aim; drag in an elevation to set height. Click a treatment in an elevation to see what it is. ▭ Walls, then touch a wall, to say what it is.'));
    else parts.push(...(selected.kind === 'speaker' ? speakerForm(dev) : micForm(dev)));
    return parts;
  }

  /**
   * A wall touched on the plan: where it is, how big, the openings in it and
   * what the user says it is — a finish of its own instead of its face's, and
   * a note in their words, both kept under its wallKey in settings.walls.
   */
  function wallForm(key) {
    const room = engine.out.room;
    const n = room?.walls.findIndex((w) => w.key === key) ?? -1;
    if (n < 0) return [h('p', { class: 'hint' }, 'That wall is not in the plan any more.')];
    const w = room.walls[n];
    const told = S().settings.walls?.[key] ?? {};
    const tell = (patch) => {
      const next = { ...told, ...patch };
      for (const k of Object.keys(next)) if (next[k] === '' || next[k] == null) delete next[k];
      const walls = { ...S().settings.walls };
      if (Object.keys(next).length) walls[key] = next;
      else delete walls[key];
      set({ walls });
    };
    const faceMat = S().settings.faceMaterials[w.face];
    const count = room.walls.length;
    const pick = (i) => store.select({ kind: 'wall', id: room.walls[(i + count) % count].key });
    const opening = (o) => `${Math.round(o.width * 1000)} mm wide, ${Math.round(o.from * 1000)}–${Math.round(o.to * 1000)} mm along`;
    return [
      h('h3', {}, `Wall ${n + 1} · ${surfaceLabel(room, `wall:${n}`)}`),
      h('p', { class: 'stat' }, `${Math.round(w.len * 1000)} mm long · ${Math.round((w.area / w.len) * 1000)} mm high · ${fmt(w.area, 1)} m²`),
      row('What it is', select(told.material ?? faceMat, MATERIAL_OPTIONS, (v) => tell({ material: v === faceMat ? '' : v }))),
      told.material ? h('p', { class: 'hint' }, `Its own finish; the rest of the ${w.face} face is ${lookup(faceMat)?.name ?? faceMat}.`) : h('p', { class: 'hint' }, `The ${w.face} face's finish — pick another to make this wall its own.`),
      row('In your words', text(told.note ?? '', (v) => tell({ note: v.trim() }))),
      ...(w.openings.length
        ? [h('h4', {}, 'Openings — the space to the next piece of wall'), h('ul', {}, ...w.openings.map((o) => h('li', {}, opening(o))))]
        : []),
      h('div', { class: 'actions' }, button('◀ Previous wall', () => pick(n - 1)), button('Next wall ▶', () => pick(n + 1))),
    ];
  }

  // Power drive is the datasheet's way — sensitivity × watts, held at max SPL;
  // SPL drive sets the level at 1 m outright. Switching keeps the level heard.
  function driveRows(d, up) {
    const lv = speakerLevel(d);
    const preset = SPEAKER_PRESETS[d.kind] ?? SPEAKER_PRESETS.monitor;
    const toPower = () => {
      const sensitivity = Number.isFinite(d.sensitivity) ? d.sensitivity : preset.sensitivity;
      up({ drive: 'power', sensitivity, watts: +wattsFor({ sensitivity }, lv.level).toPrecision(3) });
    };
    const rows = [row('Drive', select(lv.drive, [{ value: 'power', label: 'Amplifier power' }, { value: 'spl', label: 'SPL at 1 m' }], (v) => (v === 'spl' ? up({ drive: 'spl', level: lv.level }) : toPower())))];
    if (lv.drive === 'power')
      rows.push(
        row('Sensitivity (1 W / 1 m)', num(d.sensitivity, (v) => up({ sensitivity: v }), { step: 0.5, unit: 'dB SPL' })),
        row('Amplifier', num(d.watts, (v) => up({ watts: v }), { step: 1, unit: 'W', min: 0.001 })),
      );
    else rows.push(row('Level @ 1 m', num(d.level, (v) => up({ level: v }), { step: 0.5, unit: 'dB SPL' })));
    rows.push(row('Max SPL @ 1 m', num(d.maxSpl ?? 0, (v) => up({ maxSpl: v || undefined }), { step: 0.5, unit: 'dB SPL (0 = none)', min: 0 })));
    const head = Number.isFinite(lv.headroom) ? (lv.limited ? ` — LIMITING: asks ${lv.demand.toFixed(1)}, ${(-lv.headroom).toFixed(1)} dB over max` : ` · ${lv.headroom.toFixed(1)} dB headroom`) : '';
    rows.push(h('p', { class: lv.limited ? 'hint warn' : 'hint' }, `Makes ${lv.level.toFixed(1)} dB SPL on axis at 1 m${head}.`));
    return rows;
  }

  /**
   * Where a speaker is, said the way a listener says it: so many degrees left
   * or right of where they face, so far away, so high. Editing either moves
   * the box round the listener and keeps it aimed at their ears.
   */
  function relativeRows(d, listener, up) {
    if (!listener) return [];
    const facing = listener.aim ?? S().settings.frontDeg;
    const dist = Math.hypot(d.x - listener.x, d.y - listener.y);
    const az = ((((Math.atan2(d.y - listener.y, d.x - listener.x) * 180) / Math.PI - facing + 180) % 360) + 360) % 360 - 180;
    const el = (Math.atan2(d.z - listener.z, dist) * 180) / Math.PI;
    const move = (azDeg, r) => {
      const b = ((facing + azDeg) * Math.PI) / 180;
      const x = listener.x + r * Math.cos(b);
      const y = listener.y + r * Math.sin(b);
      up({ x: +x.toFixed(3), y: +y.toFixed(3), aim: +(facing + azDeg + 180).toFixed(1), tilt: +((Math.atan2(listener.z - d.z, r) * 180) / Math.PI).toFixed(1) });
    };
    return [
      h('h4', {}, `From the ${listener.name || 'listener'}`),
      row('Angle', num(+az.toFixed(1), (v) => move(v, dist), { step: 1, unit: '° (+ left, − right)' })),
      row('Distance', num(+dist.toFixed(2), (v) => move(az, Math.max(0.2, v)), { step: 0.05, unit: 'm' })),
      h('p', { class: 'stat' }, `elevation ${el.toFixed(1)}° · press and hold it on the plan to swing it round the ${listener.name || 'listener'}`),
    ];
  }

  function speakerForm(d) {
    const up = (patch) => store.update('speaker', d.id, patch);
    const mix = S().mics.find((m) => m.mix);
    const room = engine.out.room;
    const actions = h(
      'div',
      { class: 'actions' },
      mix ? button('Aim at mix', () => up(aimAt(d, mix))) : '',
      room ? button('Flush into nearest wall', () => up(snapToWall(d, room))) : '',
      d.pairId ? button('Unpair', () => store.unpair('speaker', d.id)) : mirrorPairButton('speaker', d),
      button('Delete', () => store.remove('speaker', d.id), { class: 'danger' }),
    );
    return [
      h('h3', {}, `Speaker · ${d.role || d.name}`),
      row('Name', text(d.name, (v) => up({ name: v }))),
      row('Role', text(d.role ?? '', (v) => up({ role: v || undefined }))),
      row('Preset', select(d.kind, Object.entries(SPEAKER_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => {
        // the preset's BIM part, its figures as the library gives them (the preset's offline)
        const { spec, part } = speakerSpec(v);
        up({ kind: v, drive: 'power', ...spec, ...(part ? { part } : {}) });
      })),
      row('Cabinet', num(d.litres ?? SPEAKER_PRESETS[d.kind]?.litres ?? 12, (v) => up({ litres: Math.max(0.5, v) }), { step: 1, min: 0.5, unit: `L${d.driver ? ` · ${d.driver}` : ''}` })),
      SPEAKER_PRESETS[d.kind]?.typical ? h('p', { class: 'hint' }, 'Coverage, sensitivity, max SPL and range are typical figures for this driver, not read off its datasheet — check them against yours.') : '',
      ...relativeRows(d, mix, up),
      h('h4', {}, 'Position'),
      row('X', num(d.x, (v) => up({ x: v }), { unit: 'm' })),
      row('Y', num(d.y, (v) => up({ y: v }), { unit: 'm' })),
      row('Z (acoustic centre)', num(d.z, (v) => up({ z: v }), { unit: 'm', min: 0 })),
      row('Aim', num(d.aim, (v) => up({ aim: v }), { step: 1, unit: '°' })),
      row('Tilt', num(d.tilt, (v) => up({ tilt: v }), { step: 1, unit: '°', min: -90, max: 90 })),
      colourRow(setOf(d)),
      h('div', { class: 'actions', style: 'margin-top: 6px;' },
        button('📊 Open Speaker Datasheet & Simulation…', () => openSpeakerDatasheetModal(d, {
          onUpdate: (patch) => up(patch),
        })),
      ),
      h('p', { class: 'hint' }, 'How it sounds — drive, range, pattern, coverage, mount — is on the ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); ins.tab = 'Acoustics'; render(); } }, 'Acoustics'), ' tab (Transducer).'),
      actions,
    ];
  }

  return { inspectPane, driveRows };
}
