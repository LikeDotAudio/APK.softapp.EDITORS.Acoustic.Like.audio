// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, BAND_LABELS, C } from '../acoustics/bands.js';
import { MIC_PRESETS, MOUNTS, SPEAKER_PRESETS, SPEAKER_SPEC, makeSpeaker, newId, speakerLevel, wattsFor } from '../acoustics/devices.js';
import { DEG, distToSegment } from '../acoustics/geometry.js';
import { DEFAULT_ISOLATION, FLOOR_BUILDS, SETTINGS_BUILDS, WALL_BUILDS, floorF0, floorLoss, houseLeak, sharedFaces, wallTl } from '../acoustics/isolation.js';
import { LAYOUTS, layoutPositions } from '../acoustics/layouts.js';
import { MATERIALS, PRODUCTS, lookup } from '../acoustics/materials.js';
import { MIC_PATTERNS, SPEAKER_PATTERNS } from '../acoustics/patterns.js';
import { allModes, fromFrame, inFrame, schroeder } from '../acoustics/room.js';
import { ROOM_LIBRARY, grabBag, planArea } from '../acoustics/roomLibrary.js';
import { subCrawl } from '../acoustics/subDesigner.js';
import { mirrorDevice } from '../acoustics/symmetry.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { selectedDevice } from '../model/store.js';
import { groupPatches, shortName, swatch } from '../views/treatments.js';
import { button, check, download, h, num, row, select, slider, text } from './dom.js';

/**
 * THE INSPECTOR
 *
 * Every parameter the engine reads is editable here, nothing hidden behind a
 * default: each speaker's level, pattern, coverage, low-frequency behaviour,
 * mount, delay; each mic's pattern and role; the room's height, front and six
 * surfaces; the field method, frequency, band, order and resolution; the
 * layout preset and the mirror. Tabs keep it to one screen.
 *
 * The treatments are the exception: they are painted in the CAD and live in
 * the drawing, so here they are read, not edited — what each surface ends up
 * made of, every treatment with its bands, and the catalogue the CAD's
 * palette blocks stand for.
 */

const TABS = ['Inspect', 'Room', 'Build', 'Treatments', 'Materials', 'Field', 'Layout', 'Subs', 'Advisor', 'File'];

const HOW_TO_TREAT = 'Treatments are placed in the CAD: click a wall’s elevation (or the ceiling) to open its drawing, pick a finish or a product from the Acoustic palette, then drag a region to fill it or click to drop a product. Each lands on that surface and mixes into its α and s.';

const MATERIAL_OPTIONS = [...new Set(MATERIALS.map((m) => m.category))].map((group) => ({
  group,
  items: MATERIALS.filter((m) => m.category === group).map((m) => ({ value: m.id, label: `${m.name} · α ${m.alpha.map((a) => a.toFixed(2)).join(' ')}` })),
}));

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const BAND_HEADS = BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b)));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Six octave bands of α as six bars: the shape of a material at a glance. */
const spark = (alpha) => h('span', { class: 'spark', title: `α ${alpha.map((a) => a.toFixed(2)).join(' ')}` }, ...alpha.map((a) => h('i', { style: `height:${Math.max(1, Math.round(a * 100))}%` })));

/** A surface's name as a person says it: 'left', or 'left 2' when the face has several walls. */
function surfaceLabel(room, key) {
  if (!key.startsWith('wall:')) return key;
  const i = +key.slice(5);
  const face = room.walls[i]?.face ?? '?';
  const same = room.walls.filter((w) => w.face === face);
  return same.length > 1 ? `${face} ${same.indexOf(room.walls[i]) + 1}` : face;
}

const surfaceKey = (piece) => (piece.surface === 'wall' ? `wall:${piece.wall}` : piece.surface);

/** Which CAD sheet shows a treatment: a wall's elevation, else the plan. */
const sheetOf = (face) => (['front', 'back', 'left', 'right', 'ceiling'].includes(face) ? face : 'plan');

export function createInspector({ root, store, engine, cad, jumpTo, drawRoom, onSubs = () => {} }) {
  let tab = 'Inspect';
  let pending = false;

  root.addEventListener('focusout', () => {
    if (pending) setTimeout(render, 0);
  });

  function render() {
    // the inspector may be in a window of its own: ask its own document what has focus
    const active = root.ownerDocument.activeElement;
    if (root.contains(active) && active !== root.ownerDocument.body && active.tagName !== 'BUTTON') {
      pending = true;
      return;
    }
    pending = false;
    const scroll = root.querySelector('.body')?.scrollTop ?? 0;
    const popBtn = root.querySelector(':scope > .popbtn');
    root.replaceChildren(
      ...(popBtn ? [popBtn] : []),
      h('nav', { class: 'tabs' }, TABS.map((t) => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; render(); } }, t, t === 'Advisor' ? badge() : t === 'Treatments' ? warnBadge() : ''))),
      h('div', { class: 'body' }, ...PANES[tab]()),
    );
    root.querySelector('.body').scrollTop = scroll;
  }

  function badge() {
    const n = engine.out.advice.filter((a) => a.level === 'warn').length;
    return n ? h('i', { class: 'badge' }, String(n)) : '';
  }

  /** A treatment the room could not place is worth a look, the way an advisor warning is. */
  function warnBadge() {
    const n = engine.out.room?.patchWarnings?.length ?? 0;
    return n ? h('i', { class: 'badge', title: `${n} treatment${n > 1 ? 's' : ''} not placed` }, String(n)) : '';
  }

  const S = () => store.state;
  const set = (patch) => store.setSettings(patch);

  // ------------------------------------------------------------------ Inspect
  function inspectPane() {
    const { speakers, mics, selected } = S();
    const dev = selectedDevice(S());
    const list = h(
      'div',
      { class: 'devlist' },
      ...speakers.map((d) => item('speaker', d, `🔊 ${d.role || d.name}`, d.color)),
      ...mics.map((d) => item('mic', d, `${d.mix ? '🎧' : '🎤'} ${d.name}`, d.mix ? '#ff3b3b' : '#ddd')),
    );
    function item(kind, d, label, colour) {
      return h('button', { class: `dev ${selected?.id === d.id ? 'on' : ''}`, style: `--c:${colour}`, onclick: () => store.select({ kind, id: d.id }) }, label, d.pairId ? h('i', { title: 'Mirrored pair' }, '⇋') : '');
    }
    const add = h(
      'div',
      { class: 'adders' },
      select(S().placeKind.speaker, Object.entries(SPEAKER_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => store.setPlaceKind('speaker', v)),
      button('＋ Speaker', () => store.setMode('place-speaker')),
      select(S().placeKind.mic, Object.entries(MIC_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => store.setPlaceKind('mic', v)),
      button('＋ Mic', () => store.setMode('place-mic')),
    );
    const parts = [h('h3', {}, 'Devices'), add, list];
    if (selected?.kind === 'patch') parts.push(...patchDetails(selected.id, true));
    else if (!dev) parts.push(h('p', { class: 'hint' }, 'Pick ＋ Speaker or ＋ Mic, then click on the plan. Drag to move, Shift-drag to aim; drag in an elevation to set height. Click a treatment in an elevation to see what it is.'));
    else parts.push(...(selected.kind === 'speaker' ? speakerForm(dev) : micForm(dev)));
    return parts;
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

  function speakerForm(d) {
    const up = (patch) => store.update('speaker', d.id, patch);
    const mix = S().mics.find((m) => m.mix);
    const room = engine.out.room;
    return [
      h('h3', {}, `Speaker · ${d.role || d.name}`),
      row('Name', text(d.name, (v) => up({ name: v }))),
      row('Role', text(d.role ?? '', (v) => up({ role: v || undefined }))),
      row('Preset', select(d.kind, Object.entries(SPEAKER_PRESETS).map(([value, p]) => ({ value, label: p.label })), (v) => {
        const p = SPEAKER_PRESETS[v];
        up({ kind: v, drive: 'power', ...Object.fromEntries(SPEAKER_SPEC.map((k) => [k, p[k]])) });
      })),
      h('h4', {}, 'Position'),
      row('X', num(d.x, (v) => up({ x: v }), { unit: 'm' })),
      row('Y', num(d.y, (v) => up({ y: v }), { unit: 'm' })),
      row('Z (acoustic centre)', num(d.z, (v) => up({ z: v }), { unit: 'm', min: 0 })),
      row('Aim', num(d.aim, (v) => up({ aim: v }), { step: 1, unit: '°' })),
      row('Tilt', num(d.tilt, (v) => up({ tilt: v }), { step: 1, unit: '°', min: -90, max: 90 })),
      h('h4', {}, 'Acoustics'),
      ...driveRows(d, up),
      row('Range low (−10 dB)', num(d.fLow ?? 0, (v) => up({ fLow: v }), { step: 1, unit: 'Hz (0 = none)', min: 0 })),
      row('Range high (−10 dB)', num(d.fHigh ?? 0, (v) => up({ fHigh: v }), { step: 100, unit: 'Hz (0 = none)', min: 0 })),
      row('Pattern', select(d.pattern, SPEAKER_PATTERNS.map((p) => ({ value: p, label: p })), (v) => up({ pattern: v }))),
      row('H coverage', num(d.hCov, (v) => up({ hCov: v }), { step: 5, unit: '°', min: 10, max: 360 })),
      row('V coverage', num(d.vCov, (v) => up({ vCov: v }), { step: 5, unit: '°', min: 10, max: 360 })),
      row('Omni below', num(d.omniBelow, (v) => up({ omniBelow: v }), { step: 10, unit: 'Hz', min: 0 })),
      row('Low-pass', num(d.lowpass, (v) => up({ lowpass: v }), { step: 10, unit: 'Hz (0 = off)', min: 0 })),
      row('Delay', num(d.delayMs, (v) => up({ delayMs: v }), { step: 0.1, unit: 'ms', min: 0 })),
      row('Mount', select(d.mount, Object.entries(MOUNTS).map(([value, m]) => ({ value, label: m.label })), (v) => up({ mount: v }))),
      row('Colour', h('input', { type: 'color', value: d.color, onchange: (e) => up({ color: e.target.value }) })),
      h(
        'div',
        { class: 'actions' },
        mix ? button('Aim at mix', () => up(aimAt(d, mix))) : '',
        room ? button('Flush into nearest wall', () => up(snapToWall(d, room))) : '',
        d.pairId ? button('Unpair', () => store.unpair('speaker', d.id)) : mirrorPairButton('speaker', d),
        button('Delete', () => store.remove('speaker', d.id), { class: 'danger' }),
      ),
      d.mount === 'free' && room ? h('p', { class: 'hint' }, sbirHint(d, room)) : '',
    ];
  }

  function micForm(d) {
    const up = (patch) => store.update('mic', d.id, patch);
    const room = engine.out.room;
    const rep = engine.out.reports?.[d.id];
    const p = room ? inFrame(room, d) : null;
    return [
      h('h3', {}, `Microphone · ${d.name}`),
      row('Name', text(d.name, (v) => up({ name: v }))),
      row('Mix position', check(d.mix, (v) => up({ mix: v }))),
      row('Pattern', select(d.pattern, MIC_PATTERNS.map((x) => ({ value: x, label: x })), (v) => up({ pattern: v }))),
      h('h4', {}, 'Position'),
      row('X', num(d.x, (v) => up({ x: v }), { unit: 'm' })),
      row('Y', num(d.y, (v) => up({ y: v }), { unit: 'm' })),
      row('Z (ears)', num(d.z, (v) => up({ z: v }), { unit: 'm', min: 0 })),
      row('Aim', num(d.aim, (v) => up({ aim: v }), { step: 1, unit: '°' })),
      row('Tilt', num(d.tilt, (v) => up({ tilt: v }), { step: 1, unit: '°' })),
      p ? h('p', { class: 'hint' }, `${fmt((p.fromFront / room.L) * 100, 1)} % of L from the front · ${fmt((p.fromLeft / room.W) * 100, 1)} % of W · ${fmt((d.z / room.H) * 100, 1)} % of H`) : '',
      h(
        'div',
        { class: 'actions' },
        room ? button('Place by 38 % rule', () => up(rule38(room, store))) : '',
        d.pairId ? button('Unpair', () => store.unpair('mic', d.id)) : mirrorPairButton('mic', d),
        button('Delete', () => store.remove('mic', d.id), { class: 'danger' }),
      ),
      rep ? reflectionsTable(rep) : '',
    ];
  }

  function mirrorPairButton(kind, d) {
    const ax = store.axis();
    if (ax == null || d.mix) return '';
    return button('Mirror across CAD axis', () => {
      const pairId = newId('p');
      store.update(kind, d.id, { pairId, side: d.x < ax ? 'L' : 'R' });
      const fresh = (kind === 'speaker' ? S().speakers : S().mics).find((x) => x.id === d.id);
      store.append(kind, [{ ...mirrorDevice(fresh, ax), id: newId(kind[0]), pairId, mix: false }]);
    });
  }

  function reflectionsTable(rep) {
    return h(
      'div',
      {},
      h('h4', {}, `Early arrivals @ ${BANDS[S().settings.band]} Hz`),
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'from'), h('th', {}, 'order'), h('th', {}, '+ms'), h('th', {}, 'dB rel')),
        ...rep.firstReflections.map((a) => {
          const spk = S().speakers.find((s) => s.id === a.speaker);
          const via = [...a.img.walls.map((i) => engine.out.room.walls[i]?.face), ...Array(a.img.floor).fill('floor'), ...Array(a.img.ceiling).fill('ceiling')].join('→');
          return h('tr', {}, h('td', {}, `${spk?.role || spk?.name || ''} ${via}`), h('td', {}, String(a.order)), h('td', {}, fmt(a.delayMs, 1)), h('td', {}, fmt(a.relDb, 1)));
        }),
      ),
    );
  }

  // --------------------------------------------------------------------- Room
  function roomPane() {
    const { settings } = S();
    const out = engine.out;
    const room = out.room;
    const parts = [h('h3', {}, 'Room'), ...libraryPart()];
    const rooms = out.rooms;
    if (rooms.length)
      parts.push(row('Plan loop', select(settings.roomId ?? rooms[0].id, rooms.map((r, i) => ({ value: r.id, label: `Loop ${i + 1} · ${r.area.toFixed(1)} m² · layer ${r.layerId}` })), (v) => set({ roomId: +v }))));
    else {
      parts.push(h('p', { class: 'hint' }, 'No closed loop on the CAD sheet yet — using a virtual room. Draw the plan as a closed polyline in the CAD and it becomes the room.'));
      parts.push(row('Virtual width', num(settings.virtualRoom.w, (v) => set({ virtualRoom: { ...settings.virtualRoom, w: v } }), { unit: 'm', min: 1 })));
      parts.push(row('Virtual length', num(settings.virtualRoom.l, (v) => set({ virtualRoom: { ...settings.virtualRoom, l: v } }), { unit: 'm', min: 1 })));
    }
    const drawn = new Set((out.elevations ?? []).map((e) => e.face));
    parts.push(
      row(
        'Drawn in the CAD',
        h(
          'span',
          { class: 'sheets' },
          ...['plan', 'front', 'back', 'left', 'right'].map((f) =>
            button(f === 'plan' ? '⌂ Plan' : `${drawn.has(f) ? '✎' : '＋'} ${f[0].toUpperCase()}${f.slice(1)}`, () => jumpTo?.(f), {
              class: S().sheet === f ? 'on' : '',
              title: f === 'plan' ? 'Jump the CAD to the plan' : drawn.has(f) ? `Jump the CAD to the ${f} elevation` : `Draw the ${f} elevation in the CAD — seeded with the room's outline`,
            }),
          ),
        ),
      ),
      ...(drawn.size ? [h('p', { class: 'hint' }, `Shaped by the ${[...drawn].join(', ')} elevation${drawn.size > 1 ? 's' : ''}: the ceiling height below is used only where no elevation reaches.`)] : []),
      row('Ceiling height', num(settings.roomHeight, (v) => set({ roomHeight: v }), { unit: 'm', min: 1.5, step: 0.05 })),
      row('Front faces', select(settings.frontDeg, [{ value: 90, label: 'Up the sheet (+Y)' }, { value: 270, label: 'Down (−Y)' }, { value: 0, label: 'Right (+X)' }, { value: 180, label: 'Left (−X)' }], (v) => set({ frontDeg: +v }))),
      h('h4', {}, 'Base materials'),
      ...['floor', 'ceiling', 'front', 'back', 'left', 'right'].map((f) => row(f[0].toUpperCase() + f.slice(1), select(settings.faceMaterials[f], MATERIAL_OPTIONS, (v) => store.setFaceMaterial(f, v)))),
    );
    if (!room) return parts;
    parts.push(surfacesTable(room));
    parts.push(
      h('h4', {}, 'Working space'),
      h('p', { class: 'stat' }, `L ${fmt(room.L)} · W ${fmt(room.W)} · H ${fmt(room.H)} m${room.sloped ? ` (mean; ${fmt(room.Hmax)} at the highest)` : ''} · ${fmt(room.area, 1)} m² · ${fmt(room.V, 1)} m³ · ${room.walls.length} walls${room.rect ? ' · rectangle' : room.convex ? ' · convex' : ' · re-entrant'}`),
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'Hz'), ...BANDS.map((b) => h('th', {}, b >= 1000 ? `${b / 1000}k` : String(b)))),
        h('tr', {}, h('td', {}, 'ᾱ'), ...room.perBand.map((p) => h('td', {}, fmt(p.abar)))),
        h('tr', {}, h('td', {}, 'Sabine s'), ...room.perBand.map((p) => h('td', {}, fmt(p.sabine)))),
        h('tr', {}, h('td', {}, 'Eyring s'), ...room.perBand.map((p) => h('td', {}, fmt(p.eyring)))),
        h('tr', {}, h('td', {}, 'R m²'), ...room.perBand.map((p) => h('td', {}, fmt(p.R, 1)))),
      ),
      h('p', { class: 'stat' }, `Schroeder frequency ${fmt(schroeder(room), 0)} Hz — below it, read the modal method.`),
      h('h4', {}, 'Modes to 200 Hz'),
      h(
        'table',
        { class: 'grid modes' },
        h('tr', {}, h('th', {}, 'Hz'), h('th', {}, 'nL nW nH'), h('th', {}, 'type'), h('th', {}, '')),
        ...allModes(room, 200).slice(0, 30).map((m) => h('tr', { class: m.type }, h('td', {}, fmt(m.f, 1)), h('td', {}, `${m.nx} ${m.ny} ${m.nz}`), h('td', {}, m.type), h('td', {}, button('▶', () => set({ freq: +m.f.toFixed(1), method: 'modal' }), { title: 'Show this mode' })))),
      ),
    );
    return parts;
  }

  /** Every surface as the engine sees it: its base, how much of it the treatments cover, and the mix that comes out. */
  function surfacesTable(room) {
    const surfaces = room.surfaces ?? [];
    return h(
      'div',
      {},
      h('h4', {}, 'Surfaces, with treatments mixed in'),
      h(
        'table',
        { class: 'grid surfaces' },
        h('tr', {}, h('th', {}, 'surface'), h('th', {}, 'm²'), h('th', {}, 'treated'), h('th', { title: 'α per octave band, 125 Hz – 4 kHz' }, 'α'), h('th', {}, 'α500'), h('th', {}, 's1k')),
        ...surfaces.map((sf) => {
          const m = sf.material;
          const base = lookup(m.base);
          const pct = sf.area > 0 ? (100 * (m.patched ?? 0)) / sf.area : 0;
          return h(
            'tr',
            { class: m.patched > 0 ? 'treated' : '' },
            h('td', { title: base?.name ?? m.name }, surfaceLabel(room, sf.key), h('div', { class: 'sub' }, shortName(base?.name ?? m.name, 17))),
            h('td', {}, fmt(sf.area, 1)),
            h('td', {}, m.patched > 0 ? [`${fmt(pct, 0)} %`, h('div', { class: 'sub' }, `${fmt(m.patched, 1)} m²`)] : '—'),
            h('td', {}, spark(m.alpha)),
            h('td', {}, fmt(m.alpha[2])),
            h('td', {}, fmt(m.scatter[3])),
          );
        }),
      ),
      (room.patches ?? []).length ? '' : h('p', { class: 'hint' }, 'No treatments yet. ' + HOW_TO_TREAT),
    );
  }

  // --------------------------------------------------------------- Treatments
  function treatmentsPane() {
    const room = engine.out.room;
    const parts = [h('h3', {}, 'Treatments'), h('p', { class: 'hint' }, HOW_TO_TREAT), ...cadMarksPart()];
    if (!room) return parts;
    const warnings = room.patchWarnings ?? [];
    if (warnings.length) parts.push(h('ul', { class: 'advice' }, ...warnings.map((w) => h('li', { class: 'warn' }, h('span', {}, w)))));
    const groups = groupPatches(room.patches);
    if (!groups.length) {
      parts.push(h('p', { class: 'stat' }, 'None placed in this drawing yet.'));
      return parts;
    }
    const sel = S().selected?.kind === 'patch' ? S().selected.id : null;
    const total = groups.reduce((a, g) => a + g.area, 0);
    parts.push(h('p', { class: 'stat' }, `${groups.length} treatment${groups.length > 1 ? 's' : ''} · ${fmt(total, 2)} m² · click one to select it and open its sheet in the CAD`));
    parts.push(
      h(
        'table',
        { class: 'grid treat pick' },
        h('tr', {}, h('th', {}, ''), ...BAND_HEADS.map((b) => h('th', {}, b)), h('th', {}, 's1k')),
        ...groups.flatMap((g) => {
          const pick = () => {
            store.select({ kind: 'patch', id: g.id });
            jumpTo?.(sheetOf(g.faces[0]));
          };
          const rows = [
            h('tr', { class: `name ${g.id === sel ? 'on' : ''}`, onclick: pick }, h('td', { colspan: 8 }, swatch(g.material), ` ${g.name}`, h('span', { class: 'sub' }, ` · ${g.faces.join(' + ')} · ${fmt(g.area, 2)} m²`))),
            h('tr', { class: `vals ${g.id === sel ? 'on' : ''}`, onclick: pick }, h('td', { class: 'sub' }, 'α'), ...g.material.alpha.map((a) => h('td', {}, fmt(a))), h('td', {}, fmt(g.material.scatter[3]))),
          ];
          return rows;
        }),
      ),
    );
    if (sel) parts.push(...patchDetails(sel, false));
    return parts;
  }

  /**
   * One treatment, whole: what it is, the piece on each surface, its bands, and
   * what it adds to the room — area · (α − α of the base it covers), in m².
   */
  function patchDetails(id, withHeading) {
    const room = engine.out.room;
    const g = groupPatches(room?.patches).find((x) => x.id === id);
    if (!g) return [h('h3', {}, 'Treatment'), h('p', { class: 'hint' }, `“${id}” is no longer on any surface of this room — moved off it, or removed in the CAD.`), h('div', { class: 'actions' }, button('Deselect', () => store.select(null)))];
    const m = g.material;
    const product = PRODUCTS.find((p) => p.id === g.paletteId);
    const added = BANDS.map((_, b) =>
      g.pieces.reduce((acc, p) => {
        const base = lookup(room.surfaces?.find((sf) => sf.key === surfaceKey(p))?.material.base);
        return acc + p.area * (m.alpha[b] - (base?.alpha[b] ?? 0));
      }, 0),
    );
    return [
      withHeading ? h('h3', {}, `Treatment · ${g.name}`) : h('h4', {}, `Selected · ${g.name}`),
      h('p', { class: 'stat' }, swatch(m), ` ${m.name} · ${m.category}${product ? ` · ${product.size[0] * 1000}×${product.size[1] * 1000} mm block` : ' · finish'} · ${g.id}`),
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'on'), h('th', {}, 'm²')),
        ...g.pieces.map((p) => h('tr', {}, h('td', {}, surfaceLabel(room, surfaceKey(p))), h('td', {}, fmt(p.area, 3)))),
        g.pieces.length > 1 ? h('tr', {}, h('td', {}, 'total'), h('td', {}, fmt(g.area, 3))) : '',
      ),
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'Hz'), ...BAND_HEADS.map((b) => h('th', {}, b))),
        h('tr', {}, h('td', {}, 'α'), ...m.alpha.map((a) => h('td', {}, fmt(a)))),
        h('tr', {}, h('td', {}, 's'), ...m.scatter.map((a) => h('td', {}, fmt(a)))),
        h('tr', { title: 'Absorption this adds over the surface it covers: area · (α − α base), m² sabins' }, h('td', {}, '+A m²'), ...added.map((a) => h('td', {}, fmt(a, 2)))),
      ),
      h(
        'div',
        { class: 'actions' },
        button(`Show in the CAD · ${cap(sheetOf(g.faces[0]))}`, () => jumpTo?.(sheetOf(g.faces[0]))),
        button('Deselect', () => store.select(null)),
      ),
      h('p', { class: 'hint' }, 'It lives in the CAD drawing: move, resize or delete it there and this follows.'),
    ];
  }

  // ---------------------------------------------------------------- Materials
  function materialsPane() {
    const head = h('tr', {}, h('th', {}, 'α'), ...BAND_HEADS.map((b) => h('th', {}, b)), h('th', {}, 's1k'));
    const matRows = (m, title = m.name, sub = '') => [
      h('tr', { class: 'name' }, h('td', { colspan: 8 }, swatch(m), ` ${title}`, sub ? h('span', { class: 'sub' }, ` · ${sub}`) : '')),
      h('tr', { class: 'vals' }, h('td', {}, ''), ...m.alpha.map((a) => h('td', {}, fmt(a))), h('td', {}, fmt(m.scatter[3]))),
    ];
    const parts = [
      h('h3', {}, 'Materials'),
      h('p', { class: 'hint' }, 'What the blocks in the CAD’s Acoustic palette stand for: α absorption per octave band, s scattering at 1 kHz. Typical published figures, rounded — design intent, not a test report. The swatch is how each is drawn in the elevations and the 3-D room: a grid for absorbers, wells for diffusers, a sheen for glass, diagonals for masonry.'),
      h('h4', {}, 'Products — fixed-size blocks'),
      h('table', { class: 'grid treat' }, head.cloneNode(true), ...PRODUCTS.flatMap((p) => matRows(lookup(p.material), p.name, shortName(lookup(p.material).name, 26)))),
    ];
    for (const cat of [...new Set(MATERIALS.map((m) => m.category))]) {
      parts.push(h('h4', {}, `${cat} — finishes`), h('table', { class: 'grid treat' }, head.cloneNode(true), ...MATERIALS.filter((m) => m.category === cat).flatMap((m) => matRows(m))));
    }
    return parts;
  }

  // -------------------------------------------------------------------- Field
  function fieldPane() {
    const { settings } = S();
    const sh = settings.show;
    const logF = Math.log10(settings.freq);
    const freqNum = num(settings.freq, (v) => set({ freq: Math.max(20, Math.min(2000, v)) }), { step: 1, unit: 'Hz' });
    return [
      h('h3', {}, 'Field'),
      row('Method', select(settings.method, [{ value: 'wave', label: 'Wave — image sources with phase' }, { value: 'energy', label: 'Energy — direct + diffuse, per octave' }, { value: 'modal', label: 'Modal — room modes (rectangle / box)' }], (v) => set({ method: v }))),
      row('Frequency', slider(logF, Math.log10(20), Math.log10(2000), 0.005, (v) => set({ freq: Math.round(10 ** v) })), freqNum),
      row('Octave band', select(settings.band, BAND_LABELS.map((label, value) => ({ value, label })), (v) => set({ band: +v }))),
      row('Reflection order', num(settings.maxOrder, (v) => set({ maxOrder: Math.max(0, Math.min(6, Math.round(v))) }), { step: 1, min: 0, max: 6 })),
      row('Resolution', num(settings.resolution, (v) => set({ resolution: Math.max(16, Math.min(200, Math.round(v))) }), { step: 8, unit: 'cells', min: 16, max: 200 })),
      row('Colour range', num(settings.rangeDb, (v) => set({ rangeDb: Math.max(6, v) }), { step: 3, unit: 'dB', min: 6 })),
      row('Plan slice height', num(settings.sliceHeight ?? NaN, (v) => set({ sliceHeight: v }), { unit: 'm (blank = mix ears)' }), button('auto', () => set({ sliceHeight: null }))),
      row('A-weighting (meter)', check(settings.aWeight, (v) => set({ aWeight: v }))),
      h('p', { class: 'hint' }, `λ at ${settings.freq} Hz = ${fmt(C / settings.freq)} m · ¼λ = ${fmt(C / settings.freq / 4)} m`),
      h('h4', {}, 'Show'),
      h(
        'div',
        { class: 'toggles' },
        check(sh.field, (v) => store.setShow({ field: v }), 'Field'),
        check(sh.devices, (v) => store.setShow({ devices: v }), 'Devices'),
        check(sh.coverage, (v) => store.setShow({ coverage: v }), 'Coverage'),
        check(sh.rays, (v) => store.setShow({ rays: v }), 'Reflections'),
        check(sh.rc, (v) => store.setShow({ rc: v }), 'Critical distance'),
        check(sh.rings, (v) => store.setShow({ rings: v }), 'Distance rings'),
        check(sh.nulls, (v) => store.setShow({ nulls: v }), 'Modal nulls'),
        check(sh.guides, (v) => store.setShow({ guides: v }), '38 % / ear guides'),
      ),
    ];
  }

  // ------------------------------------------------------------------- Layout
  function layoutPane() {
    const { settings } = S();
    const out = engine.out;
    const mix = S().mics.find((m) => m.mix);
    const room = out.room;
    const mirror = S().cad.mirror;
    const parts = [
      h('h3', {}, 'Symmetry — the CAD mirror'),
      h('p', { class: 'stat' }, mirror ? `Virtual Mirror ${mirror.enabled ? 'ON' : 'off'} at x = ${fmt(mirror.xMetres)} m${mirror.axes?.length > 1 ? ` (${mirror.axes.length} axes)` : ''}` : 'CAD has not reported a mirror yet.'),
      row('Place in mirrored pairs', check(settings.symmetric, (v) => set({ symmetric: v }))),
      h(
        'div',
        { class: 'actions' },
        room ? button('Centre CAD mirror on room', () => {
          const xs = room.poly.map((p) => p.x);
          const k = METRES_PER_UNIT[S().cad.geometry?.units ?? 'm'] ?? 1;
          cad.link?.setMirror((Math.min(...xs) + Math.max(...xs)) / 2 / k, true);
        }) : '',
        mix && mirror?.enabled ? button('Mix onto mirror axis', () => store.update('mic', mix.id, { x: mirror.xMetres })) : '',
      ),
      h('h3', {}, 'Immersive layout'),
      row('Preset', select(settings.layout.preset, Object.entries(LAYOUTS).map(([value, l]) => ({ value, label: l.label })), (v) => set({ layout: { ...settings.layout, preset: v } }))),
      row('Radius', num(settings.layout.radius, (v) => set({ layout: { ...settings.layout, radius: v } }), { unit: 'm', min: 0.8, step: 0.1 })),
      row('Box', select(S().placeKind.speaker, Object.entries(SPEAKER_PRESETS).filter(([k]) => k !== 'sub').map(([value, p]) => ({ value, label: p.label })), (v) => store.setPlaceKind('speaker', v))),
      h(
        'div',
        { class: 'actions' },
        mix && room ? button(`Place ${settings.layout.preset} around mix`, () => placeLayout(mix, room)) : h('p', { class: 'hint' }, 'Place a mix-position mic first.'),
      ),
    ];
    if (out.layout.length)
      parts.push(
        h('h4', {}, 'Check against references'),
        h(
          'table',
          { class: 'grid' },
          h('tr', {}, h('th', {}, ''), h('th', {}, 'az°'), h('th', {}, 'want'), h('th', {}, 'el°'), h('th', {}, 'm'), h('th', {}, 'delay'), h('th', {}, 'trim')),
          ...out.layout.map((r) =>
            h(
              'tr',
              { class: r.ok ? 'ok' : 'bad', onclick: () => store.select({ kind: 'speaker', id: r.id }) },
              h('td', {}, `${r.ok ? '✓' : '✗'} ${r.role}`),
              h('td', {}, fmt(r.az, 0)),
              h('td', {}, r.want.side === 'C' ? '0' : `${r.want.range[0]}–${r.want.range[1]}`),
              h('td', {}, fmt(r.el, 0)),
              h('td', {}, fmt(r.dist)),
              h('td', {}, `${fmt(r.delayMs, 2)} ms`),
              h('td', {}, `${fmt(r.trimDb, 1)} dB`),
            ),
          ),
        ),
        h('p', { class: 'hint' }, 'References: ITU-R BS.2051 / BS.775 public tables. Certification is the Dolby Atmos Room Design Tool’s job; this shows how far the drawing is from a starting point.'),
      );
    return parts;
  }

  /** The toolbar's ⤓: place the current preset around the mix seat. False when there is no mix seat or room. */
  function placeCurrentLayout() {
    const mix = S().mics.find((m) => m.mix);
    const room = engine.out.room;
    if (!mix || !room) return false;
    placeLayout(mix, room);
    return true;
  }

  function placeLayout(mix, room) {
    const { settings } = S();
    const ax = store.axis();
    const kind = S().placeKind.speaker === 'sub' ? 'monitor' : S().placeKind.speaker;
    const keep = S().speakers.filter((s) => !s.role);
    const placed = layoutPositions(settings.layout.preset, mix, settings.frontDeg, settings.layout.radius, room.H);
    const pairs = new Map();
    const speakers = placed.map((p) => {
      const s = makeSpeaker(p.sub ? 'sub' : kind, p, { name: p.role, role: p.role, side: p.side, aim: +p.aim.toFixed(1), tilt: +p.tilt.toFixed(1) });
      const base = p.role.slice(1);
      if (settings.symmetric && ax != null && Math.abs(mix.x - ax) < 0.02 && (p.side === 'L' || p.side === 'R')) {
        if (!pairs.has(base)) pairs.set(base, newId('p'));
        s.pairId = pairs.get(base);
      }
      return s;
    });
    store.replaceSpeakers([...keep, ...speakers]);
  }

  /** What this app draws into the CAD file itself, and the panels it puts at the reflection points. */
  function cadMarksPart() {
    const { settings } = S();
    const cm = settings.cadMarks;
    const ap = settings.autoPanels;
    const toggle = (key, label) => check(cm[key], (v) => set({ cadMarks: { ...cm, [key]: v } }), label);
    const products = PRODUCTS.map((p) => ({ value: p.id, label: p.name }));
    return [
      h('h4', {}, 'Drawn into the CAD'),
      h('div', { class: 'checks' }, toggle('panels', 'reflection panels on the walls'), toggle('ceilingPanels', 'clouds at the ceiling reflections'), toggle('labels', 'wall and plan labels'), toggle('cutaways', '3 cut-away views'), toggle('sections', 'wall & floor sections'), toggle('arrangement', 'speaker layout')),
      row('Wall panel', select(ap.wall, products, (v) => set({ autoPanels: { ...ap, wall: v } }))),
      row('Panel size', num(ap.w, (v) => set({ autoPanels: { ...ap, w: v } }), { unit: 'm wide', min: 0.2, step: 0.05 }), num(ap.h, (v) => set({ autoPanels: { ...ap, h: v } }), { unit: 'm tall', min: 0.2, step: 0.05 })),
      row('Ceiling cloud', select(ap.ceiling, products, (v) => set({ autoPanels: { ...ap, ceiling: v } }))),
      h('p', { class: 'hint' }, 'A panel goes wherever a speaker’s first reflection meets a wall on its way to the mix seat, named LEFT-1, RIGHT-2 … on the wall’s elevation. They move when the speakers or the seat move, and the room hears them like any treatment.'),
    ];
  }

  // ------------------------------------------------------------------ Room library
  let libraryPick = ROOM_LIBRARY[0].id;
  function libraryPart() {
    const groups = [...new Set(ROOM_LIBRARY.map((r) => r.group))].map((group) => ({
      group,
      items: ROOM_LIBRARY.filter((r) => r.group === group).map((r) => ({ value: r.id, label: `${r.name} · ${fmt(planArea(r.poly), 1)} m² · ${fmt(r.h, 2)} m` })),
    }));
    const picked = ROOM_LIBRARY.find((r) => r.id === libraryPick);
    return [
      row('Library', select(libraryPick, groups, (v) => { libraryPick = v; render(); })),
      h('p', { class: 'hint' }, `${picked.note}. ${ROOM_LIBRARY.length} studio rooms at real sizes — types, not surveys of any one studio.`),
      h('div', { class: 'actions' }, button('Draw it in the CAD', () => drawRoom?.(libraryPick)), button('🎲 Grab bag', () => drawRoom?.(grabBag(S().settings.lastLibraryRoom).id))),
    ];
  }

  // ------------------------------------------------------------------ Build: floor, walls, and where the room is
  function buildPane() {
    const iso = { ...DEFAULT_ISOLATION, ...S().settings.isolation };
    const setIso = (patch) => set({ isolation: { ...iso, ...patch } });
    const room = engine.out.room;
    const f0 = floorF0(iso);
    const KIND_COLOUR = { board: '#d8d8d2', stud: '#a0703c', insulation: '#f4c542', air: '#334155', masonry: '#8c6f64', concrete: '#9a9a9a', isolator: '#38bdf8', wood: '#b5834c' };
    const stack = (layers) => h('div', { class: 'build' }, ...layers.map(([name, mm, kind]) => h('div', { style: `border-color:${KIND_COLOUR[kind] ?? '#888'}` }, h('span', {}, name), h('span', {}, `${mm} mm`))));
    const parts = [
      h('h3', {}, 'Where the room is'),
      row('Setting', select(iso.setting, Object.entries(SETTINGS_BUILDS).map(([value, label]) => ({ value, label })), (v) => setIso({ setting: v }))),
    ];
    if (iso.setting === 'attached')
      parts.push(row('Shared with the house', h('span', { class: 'sheets' }, ...['front', 'back', 'left', 'right'].map((f) => check(iso.shared[f], (v) => setIso({ shared: { ...iso.shared, [f]: v } }), f)))));
    parts.push(
      h('h3', {}, 'Floor'),
      row('Build', select(iso.floor, Object.entries(FLOOR_BUILDS).map(([value, b]) => ({ value, label: b.label })), (v) => setIso({ floor: v, f0: null }))),
      h('p', { class: 'hint' }, FLOOR_BUILDS[iso.floor]?.note ?? ''),
    );
    if (FLOOR_BUILDS[iso.floor]?.f0) parts.push(row('Natural frequency f0', num(f0, (v) => setIso({ f0: v }), { unit: 'Hz', min: 2, step: 0.5 })));
    if (FLOOR_BUILDS[iso.floor]?.layers) parts.push(stack(FLOOR_BUILDS[iso.floor].layers));
    const isoFreqs = [16, 31.5, 63, 125, 250];
    parts.push(
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'Hz'), ...isoFreqs.map((f) => h('th', {}, String(f)))),
        h('tr', {}, h('td', {}, 'through the floor, dB'), ...isoFreqs.map((f) => {
          const il = floorLoss(f, f0);
          return h('td', { class: il < -0.5 ? 'bad' : il > 10 ? 'ok' : '' }, f0 ? fmt(il, 0) : '0');
        })),
      ),
      h('p', { class: 'hint' }, f0 ? `Isolates above ${fmt(f0 * Math.SQRT2, 0)} Hz, 12 dB per octave; at ${fmt(f0, 0)} Hz it AMPLIFIES — keep it below the lowest note you care about.` : 'Tied to the structure: what the floor carries, the building carries.'),
      h('h3', {}, 'Walls'),
      row('Build', select(iso.walls, Object.entries(WALL_BUILDS).map(([value, b]) => ({ value, label: b.label })), (v) => setIso({ walls: v }))),
    );
    if (WALL_BUILDS[iso.walls]?.layers) parts.push(stack(WALL_BUILDS[iso.walls].layers));
    const tl = wallTl(iso);
    parts.push(h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Hz'), ...BAND_HEADS.map((b) => h('th', {}, b))), h('tr', {}, h('td', {}, 'TL dB'), ...tl.map((v) => h('td', {}, String(v))))));
    const shared = sharedFaces(iso);
    const rep = engine.out.reports?.[engine.out.monitorId];
    if (room && shared.length) {
      const roomDb = rep ? rep.energy.map((e) => e.total) : BANDS.map(() => 100);
      parts.push(
        h('h4', {}, `In the house, through the shared wall${shared.length > 1 ? 's' : ''}`),
        h(
          'table',
          { class: 'grid' },
          h('tr', {}, h('th', {}, ''), ...BAND_HEADS.map((b) => h('th', {}, b))),
          h('tr', {}, h('td', {}, 'room dB'), ...roomDb.map((v) => h('td', {}, fmt(v, 0)))),
          ...houseLeak(room, iso, roomDb).map((r) => h('tr', {}, h('td', {}, `${r.face} · ${fmt(r.area, 1)} m²`), ...r.leak.map((v) => h('td', { class: v > 45 ? 'bad' : v < 30 ? 'ok' : '' }, fmt(v, 0))))),
        ),
        h('p', { class: 'hint' }, `${rep ? 'The room level is what the mix seat hears.' : 'No mic yet: the room is taken as 100 dB in every band.'} The house side is an estimate — L − TL + 10·log(S / 10 m²) — flanking through the structure not included.`),
      );
    }
    parts.push(h('p', { class: 'hint' }, 'The walls and floor are drawn as sections in the CAD (layer “Construction”), and a light build adds its bass absorption to the room.'));
    return parts;
  }

  // ------------------------------------------------------------------ Subs: the sub crawl
  let crawl = null;
  function subsPane() {
    const room = engine.out.room;
    const seats = S().mics;
    const subs = engine.out.subs;
    const parts = [
      h('h3', {}, 'Subwoofer designer'),
      h('p', { class: 'hint' }, 'Tries a sub at every point of a floor grid and hears 20–120 Hz at every mic (the mix seat counts double). Flat = how little the response swings at a seat; even = how alike the seats are. The plan shows the result as a map — green is good.'),
    ];
    if (!room || !seats.length) return [...parts, h('p', { class: 'stat' }, 'Place at least one mic — every listening seat you care about.')];
    parts.push(
      h(
        'div',
        { class: 'actions' },
        button(crawl ? '■ Stop' : subs ? '↻ Run again' : '▶ Find the best spot', () => {
          if (crawl) {
            crawl.aborted = true;
            crawl = null;
            render();
            return;
          }
          const signal = { aborted: false };
          crawl = signal;
          engine.out.subs = { running: true, progress: 0, cells: [], best: [] };
          subCrawl(room, seats, {
            step: Math.max(0.2, Math.max(room.L, room.W) / 24),
            signal,
            onProgress: (done, total) => {
              engine.out.subs.progress = done / total;
              render();
            },
          }).then((res) => {
            if (crawl !== signal) return;
            crawl = null;
            engine.out.subs = res ? { ...res, running: false } : null;
            render();
            onSubs();
          });
          render();
        }),
        subs && !subs.running ? button('Clear map', () => { engine.out.subs = null; render(); onSubs(); }) : '',
      ),
    );
    if (subs?.running) parts.push(h('p', { class: 'stat' }, `crawling… ${fmt(subs.progress * 100, 0)} %`));
    if (subs?.best?.length)
      parts.push(
        h('h4', {}, 'Best places'),
        h(
          'table',
          { class: 'grid' },
          h('tr', {}, h('th', {}, ''), h('th', {}, 'x'), h('th', {}, 'y'), h('th', {}, 'flat'), h('th', {}, 'even'), h('th', {}, '')),
          ...subs.best.map((b, i) => h('tr', {}, h('td', {}, `#${i + 1}`), h('td', {}, fmt(b.x)), h('td', {}, fmt(b.y)), h('td', {}, `${fmt(b.flat, 1)} dB`), h('td', {}, `${fmt(b.even, 1)} dB`), h('td', {}, button('Place sub', () => store.addSpeaker('sub', { x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: 0.3 }, { name: `Sub #${i + 1}` }))))),
        ),
      );
    return parts;
  }

  // ------------------------------------------------------------------ Advisor
  function advisorPane() {
    return [
      h('h3', {}, 'Advisor'),
      h('ul', { class: 'advice' }, ...engine.out.advice.map((a) => h('li', { class: a.level }, h('b', {}, a.title), h('span', {}, a.detail)))),
    ];
  }

  // --------------------------------------------------------------------- File
  function filePane() {
    const input = h('input', {
      type: 'file',
      accept: '.json,application/json',
      onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          store.importDoc(JSON.parse(await f.text()));
        } catch (err) {
          alert(String(err.message || err));
        }
      },
    });
    const name = (S().fileName || 'untitled').replace(/\.[^.]+$/, '');
    return [
      h('h3', {}, 'File'),
      h('p', { class: 'stat' }, `Overlay saved in this browser for “${S().fileName || 'untitled'}”.`),
      h('p', { class: 'hint' }, '💾 Save (Ctrl+S) in the toolbar writes ONE file with the CAD drawing, every speaker and mic, and every setting — open it with 📂 on any machine and the room comes back as it was.'),
      h(
        'div',
        { class: 'actions' },
        button('Export overlay JSON', () => download(`${name}.acoustic.json`, JSON.stringify(store.exportDoc(), null, 2))),
        button('Export positions (AcousticRooms-style)', () =>
          download(
            `${name}.positions.json`,
            JSON.stringify(
              {
                note: 'Source/receiver [x, y, z] in metres, sheet frame; shaped after AcousticRooms metadata, not validated against its schema.',
                sources: S().speakers.map((s) => ({ id: s.id, name: s.role || s.name, position: [s.x, s.y, s.z] })),
                receivers: S().mics.map((m) => ({ id: m.id, name: m.name, position: [m.x, m.y, m.z] })),
              },
              null,
              2,
            ),
          ),
        ),
        h('label', { class: 'button' }, 'Import overlay JSON', input),
        button('Zoom CAD to drawing', () => cad.link?.fit()),
        button('Clear overlay', () => confirm('Remove every speaker and mic from this overlay?') && store.clear(), { class: 'danger' }),
      ),
    ];
  }

  const PANES = { Inspect: inspectPane, Room: roomPane, Build: buildPane, Treatments: treatmentsPane, Materials: materialsPane, Field: fieldPane, Layout: layoutPane, Subs: subsPane, Advisor: advisorPane, File: filePane };

  return {
    render,
    placeLayout: placeCurrentLayout,
    show: (t) => {
      tab = t;
      render();
    },
    /** A treatment clicked in a view: selected, and shown where its details are — unless the Treatments list already is. */
    showPatch: (id) => {
      if (tab !== 'Treatments') tab = 'Inspect';
      store.select({ kind: 'patch', id });
    },
  };
}

function aimAt(d, target) {
  const dx = target.x - d.x;
  const dy = target.y - d.y;
  const aim = Math.atan2(dy, dx) / DEG;
  const tilt = Math.atan2(target.z - d.z, Math.hypot(dx, dy)) / DEG;
  return { aim: +aim.toFixed(1), tilt: +tilt.toFixed(1) };
}

function snapToWall(d, room) {
  let best = null;
  for (const w of room.walls) {
    const dist = distToSegment(d, w.a, w.b);
    if (!best || dist < best.dist) best = { w, dist };
  }
  const { w } = best;
  const t = Math.max(0, Math.min(1, ((d.x - w.a.x) * w.t.x + (d.y - w.a.y) * w.t.y) / w.len));
  return { x: w.a.x + w.t.x * w.len * t, y: w.a.y + w.t.y * w.len * t, aim: +(Math.atan2(w.nIn.y, w.nIn.x) / DEG).toFixed(1), mount: 'flush' };
}

function rule38(room, store) {
  const p = fromFrame(room, 0.38 * room.L, 0.5 * room.W);
  return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +(0.4 * room.H).toFixed(2), aim: store.state.settings.frontDeg };
}

function sbirHint(d, room) {
  let behind = Infinity;
  const fx = Math.cos(d.aim * DEG);
  const fy = Math.sin(d.aim * DEG);
  for (const w of room.walls) if (fx * w.nIn.x + fy * w.nIn.y > 0.5) behind = Math.min(behind, distToSegment(d, w.a, w.b));
  if (!Number.isFinite(behind)) return '';
  return `Free-standing ${behind.toFixed(2)} m in front of a wall: SBIR cancellation near ${(C / (4 * behind)).toFixed(0)} Hz. Flush mounting removes it and adds up to +6 dB below ${d.omniBelow || 300} Hz.`;
}
