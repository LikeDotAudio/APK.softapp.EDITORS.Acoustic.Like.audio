// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Acoustics tab: a transducer’s or a wall’s acoustics, a mic’s form, the mirror-pair button, the reflections table.
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { button, check, h, num, row, select, text } from '../dom.js';
import { MIC_PATTERNS, SPEAKER_PATTERNS } from '../../acoustics/patterns.js';
import { pickupCard, transducerCard } from '../../views/transducer.js';
import { speakerColour } from '../../acoustics/layouts.js';
import { MIC_PRESETS, MOUNTS, newId } from '../../acoustics/devices.js';
import { fmt, HOW_TO_TREAT, rule38, sbirHint, surfaceLabel } from './common.js';
import { openSpeakerDatasheetModal } from '../speakerDatasheetModal.js';
import { lookup } from '../../acoustics/materials.js';
import { BAND_LABELS, BANDS } from '../../acoustics/bands.js';
import { inFrame } from '../../acoustics/room.js';
import { mirrorDevice } from '../../acoustics/symmetry.js';

export function acousticsTab(ins) {
  const { acousticTree, engine, render, S, showWall, store } = ins;
  // the other parts' functions, looked up when called
  const driveRows = (...a) => ins.driveRows(...a);

  /**
   * THE ACOUSTICS TAB, in two: TRANSDUCER — how the selected speaker sounds
   * (its drive, range, pattern and coverage, crossover, delay and mount) with
   * what it looks like and how it throws under it, or a mic's pickup — and
   * WALL — what the selected surface does to sound: its finish with the
   * treatments mixed in, band by band, and its share of the room's absorption.
   * The half shown follows what is picked; a press on the other one holds
   * until the pick changes.
   */
  function acousticsPane() {
    const sel = S().selected;
    const auto = sel?.kind === 'wall' ? 'Wall' : 'Transducer';
    const view = ins.acoustics.view && ins.acoustics.for === sel?.id ? ins.acoustics.view : auto;
    const pick = (v) => {
      ins.acoustics = { view: v, for: sel?.id };
      render();
    };
    return [
      h('nav', { class: 'subtabs' }, ...['Transducer', 'Wall'].map((v) => h('button', { class: v === view ? 'on' : '', onclick: () => pick(v) }, `${v} acoustics`))),
      ...(view === 'Wall' ? wallAcoustics(sel) : transducerAcoustics(sel)),
    ];
  }

  function transducerAcoustics(sel) {
    if (sel?.kind === 'mic') {
      const m = S().mics.find((x) => x.id === sel.id);
      if (m) return [h('h3', {}, `Transducer · ${m.name}`), row('Pattern', select(m.pattern, MIC_PATTERNS.map((x) => ({ value: x, label: x })), (v) => store.update('mic', m.id, { pattern: v }))), pickupCard(m)];
    }
    const d = sel?.kind === 'speaker' ? S().speakers.find((x) => x.id === sel.id) : null;
    if (!d) {
      const pickOne = (kind, label) => (x) => h('button', { class: 'dev', style: `--c:${kind === 'speaker' ? speakerColour(x, S().settings) : x.mix ? '#ff3b3b' : '#ddd'}`, onclick: () => store.select({ kind, id: x.id }) }, label(x));
      const tree = acousticTree({ room: false, speaker: pickOne('speaker', (x) => x.role || x.name), mic: pickOne('mic', (x) => x.name) });
      return [h('h3', {}, 'Transducer acoustics'), h('p', { class: 'hint' }, 'Pick a speaker to see how it sounds, or a mic for its pickup:'), tree];
    }
    const up = (patch) => store.update('speaker', d.id, patch);
    const room = engine.out.room;
    return [
      h('h3', {}, `Transducer · ${d.role || d.name}`),
      ...driveRows(d, up),
      row('Range low (−10 dB)', num(d.fLow ?? 0, (v) => up({ fLow: v }), { step: 1, unit: 'Hz (0 = none)', min: 0 })),
      row('Range high (−10 dB)', num(d.fHigh ?? 0, (v) => up({ fHigh: v }), { step: 100, unit: 'Hz (0 = none)', min: 0 })),
      row('Pattern', select(d.pattern, SPEAKER_PATTERNS.map((p) => ({ value: p, label: p })), (v) => up({ pattern: v }))),
      row('H coverage', num(d.hCov, (v) => up({ hCov: v }), { step: 5, unit: '°', min: 10, max: 360 })),
      row('V coverage', num(d.vCov, (v) => up({ vCov: v }), { step: 5, unit: '°', min: 10, max: 360 })),
      row('Omni below', num(d.omniBelow, (v) => up({ omniBelow: v }), { step: 10, unit: 'Hz', min: 0 })),
      row('Crossover', num(d.fCross ?? 0, (v) => up({ fCross: v }), { step: 10, unit: 'Hz (0 = typical; under 1 kHz = three-way)', min: 0 })),
      row('Low-pass', num(d.lowpass, (v) => up({ lowpass: v }), { step: 10, unit: 'Hz (0 = off)', min: 0 })),
      row('Delay', num(d.delayMs, (v) => up({ delayMs: v }), { step: 0.1, unit: 'ms', min: 0 })),
      row('Mount', select(d.mount, Object.entries(MOUNTS).map(([value, m]) => ({ value, label: m.label })), (v) => up({ mount: v }))),
      d.mount === 'free' && room ? h('p', { class: 'hint' }, sbirHint(d, room)) : '',
      h('div', { class: 'actions', style: 'margin-top: 6px; margin-bottom: 6px;' },
        button('📊 Open Speaker Datasheet & Simulation…', () => openSpeakerDatasheetModal(d, {
          onUpdate: (patch) => up(patch),
        })),
      ),
      (() => {
        const card = transducerCard(d, speakerColour(d, S().settings));
        card.style.cursor = 'pointer';
        card.title = 'Click to open full Speaker Datasheet & Simulation';
        card.onclick = () => openSpeakerDatasheetModal(d, { onUpdate: (patch) => up(patch) });
        return card;
      })(),
    ];
  }

  /** One surface's acoustics: α and sabins per band, what of the room's absorption it holds, its scattering, the treatments on it. */
  function wallAcoustics(sel) {
    const room = engine.out.room;
    if (!room) return [h('h3', {}, 'Wall acoustics'), h('p', { class: 'hint' }, 'No room yet.')];
    const surfaces = room.surfaces ?? [];
    const n = sel?.kind === 'wall' ? room.walls.findIndex((w) => w.key === sel.id) : -1;
    const key = n >= 0 ? `wall:${room.walls[n].i}` : ins.acoustics.surface;
    const sf = surfaces.find((x) => x.key === key);
    const choose = (k) => {
      if (k.startsWith('wall:')) return showWall(room.walls[+k.slice(5)]?.key);
      ins.acoustics = { view: 'Wall', for: sel?.id, surface: k };
      render();
    };
    const picker = h('div', { class: 'actions' }, ...surfaces.map((x) => h('button', { class: x.key === key ? 'on' : '', onclick: () => choose(x.key) }, surfaceLabel(room, x.key))));
    if (!sf) return [h('h3', {}, 'Wall acoustics'), h('p', { class: 'hint' }, 'Pick a surface — or a wall on the plan in Walls mode:'), picker];
    const m = sf.material;
    const base = lookup(m.base);
    const pieces = (room.patches ?? []).filter((p) => (sf.key.startsWith('wall:') ? p.surface === 'wall' && `wall:${p.wall}` === sf.key : p.surface === sf.key));
    const bandRows = BANDS.map((_, b) => {
      const A = sf.area * m.alpha[b];
      const share = room.perBand[b].A + room.perBand[b].Aobj > 0 ? (100 * A) / (room.perBand[b].A + room.perBand[b].Aobj) : 0;
      return h(
        'tr',
        {},
        h('td', {}, BAND_LABELS[b]),
        h('td', {}, fmt(m.alpha[b])),
        h('td', {}, h('span', { class: 'abar', style: `--v:${Math.round(m.alpha[b] * 100)}%` })),
        h('td', {}, fmt(A, 1)),
        h('td', {}, `${fmt(share, 0)} %`),
        h('td', {}, fmt(m.scatter[b])),
      );
    });
    return [
      h('h3', {}, `Wall acoustics · ${surfaceLabel(room, sf.key)}`),
      picker,
      h('p', { class: 'stat' }, `${fmt(sf.area, 1)} m² of ${base?.name ?? m.name}${m.patched > 0 ? `, ${fmt((100 * m.patched) / sf.area, 0)} % treated (${fmt(m.patched, 1)} m²)` : ''} · ${fmt(sf.area / room.perBand[0].S * 100, 0)} % of the room's surface`),
      h(
        'table',
        { class: 'grid wall-bands' },
        h('tr', {}, h('th', {}, 'band'), h('th', { title: 'absorption coefficient, the treatments mixed in' }, 'α'), h('th', {}, ''), h('th', { title: 'α × area, m² (metric sabins)' }, 'sabins'), h('th', { title: 'of all the room’s absorption in this band, furniture included' }, 'of room'), h('th', { title: 'scattering coefficient' }, 's')),
        ...bandRows,
      ),
      pieces.length
        ? [h('h4', {}, 'Treatments on it'), h('ul', {}, ...pieces.map((p) => h('li', {}, `${p.material.name} · ${fmt(p.area, 2)} m²`)))]
        : h('p', { class: 'hint' }, 'Nothing treats it yet. ' + HOW_TO_TREAT),
      sf.key.startsWith('wall:') ? h('p', { class: 'hint' }, 'Its finish is picked on Inspect, with the wall selected.') : '',
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
      row('Who', select(d.kind, Object.entries(MIC_PRESETS).map(([value, p]) => ({ value, label: p.tier ? `${p.label} — tier ${p.tier}` : p.label })), (v) => up({ kind: v, name: MIC_PRESETS[v].label, ...(MIC_PRESETS[v].tier ? { tier: MIC_PRESETS[v].tier, weight: MIC_PRESETS[v].weight } : { tier: undefined, weight: undefined }) }))),
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

  return { acousticsPane, micForm, mirrorPairButton };
}
