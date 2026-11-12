// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Build, Subs, Advisor and File tabs: floor and walls, the sub designer, the advisor, a measured IR, the file pane.
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import {
  DEFAULT_ISOLATION,
  FLOOR_BUILDS,
  floorF0,
  floorLoss,
  houseLeak,
  SETTINGS_BUILDS,
  sharedFaces,
  WALL_BUILDS,
  wallTl,
} from '../../acoustics/isolation.js';
import { button, check, download, h, num, row, select } from '../dom.js';
import { BAND_HEADS, fmt } from './common.js';
import { BANDS } from '../../acoustics/bands.js';
import { subCrawl } from '../../acoustics/subDesigner.js';
import { optimiseSubs } from '../../acoustics/multiSub.js';
import { analyseIR, parseWav } from '../../acoustics/measure.js';
import { badFile } from '../problem.js';

export function buildTab(ins) {
  const { cad, engine, onSubs, render, S, set, store } = ins;

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
  let tuned = null;
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
    const placed = S().speakers.filter((x) => x.kind === 'sub');
    if (placed.length > 1) {
      parts.push(
        h('h4', {}, `Tune the subs together · ${placed.length} subs`),
        h('p', { class: 'hint' }, 'Keeps every sub where you put it and sets each one’s delay, gain (never a boost) and polarity so their modes cancel across the seats, then one cut-only EQ shared by all of them. The first sub is the reference.'),
        h('div', { class: 'actions' }, button('▶ Tune', () => { tuned = optimiseSubs(room, placed, seats); render(); })),
      );
      if (tuned) {
        const sc = (x) => `flat ${fmt(x.flat, 1)} · even ${fmt(x.even, 1)} dB`;
        parts.push(
          h('p', { class: 'stat' }, `As they stand: ${sc(tuned.before)} → tuned: ${sc(tuned.after)} → with the EQ: ${sc(tuned.eqd)}`),
          h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'sub'), h('th', {}, 'delay'), h('th', {}, 'gain'), h('th', {}, 'polarity')), ...tuned.subs.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, `${fmt(t.delayMs, 2)} ms`), h('td', {}, `${fmt(t.gainDb, 0)} dB`), h('td', {}, t.invert ? 'inverted' : 'normal')))),
          h('p', { class: 'stat' }, tuned.eq.length ? `Shared EQ: ${tuned.eq.map((e) => `${fmt(e.f, 0)} Hz ${fmt(e.gainDb, 1)} dB Q ${fmt(e.q, 1)}`).join(' · ')}` : 'Shared EQ: none needed.'),
          h('div', { class: 'actions' }, button('Apply delays, gains and polarity', () => { store.updateMany('speaker', tuned.subs.map((t) => ({ id: t.id, delayMs: t.delayMs, gainDb: t.gainDb, invert: t.invert }))); tuned = null; })),
        );
      }
    }
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
  let measured = null;
  function advisorPane() {
    return [
      h('h3', {}, 'Advisor'),
      h('ul', { class: 'advice' }, ...engine.out.advice.map((a) => h('li', { class: a.level }, h('b', {}, a.title), h('span', {}, a.detail)))),
      ...measuredPart(),
    ];
  }

  /** A measured impulse response (WAV) read beside the model: decay per octave, the gated response's limit, the modes it rings at. */
  function measuredPart() {
    const input = h('input', {
      type: 'file',
      accept: '.wav,audio/wav,audio/x-wav',
      onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const { fs, channels } = parseWav(await f.arrayBuffer());
          measured = { name: f.name, ...analyseIR(channels[0], fs) };
        } catch (err) {
          badFile(err, f, ['Load a WAV impulse response (PCM or float, as REW or a sweep tool exports it), measured at the mix seat.']);
        }
        render();
      },
    });
    const parts = [h('h4', {}, 'Measured'), h('p', { class: 'hint' }, 'Load an impulse response (WAV, as REW or any sweep tool exports it) measured at the mix seat. It is read on its own terms — the model is not fitted to it.'), h('div', { class: 'actions' }, input)];
    if (!measured) return parts;
    const room = engine.out.room;
    const m = measured;
    parts.push(
      h('p', { class: 'stat' }, `${m.name} · ${m.fs} Hz · T30 ${fmt(m.params.T30, 2)} s · EDT ${fmt(m.params.EDT, 2)} s · C80 ${fmt(m.params.C80, 1)} dB · D50 ${fmt(m.params.D50 * 100, 0)} %`),
      h(
        'table',
        { class: 'grid' },
        h('tr', {}, h('th', {}, 'Hz'), ...m.bands.map((b) => h('th', {}, String(b.f)))),
        h('tr', {}, h('td', {}, 'T30 measured'), ...m.bands.map((b) => h('td', {}, fmt(b.T30, 2)))),
        room ? h('tr', {}, h('td', {}, 'RT60 model'), ...room.perBand.map((b) => h('td', {}, fmt(b.eyring, 2)))) : '',
      ),
      h('p', { class: 'stat' }, `Gated ${m.gateMs} ms after the direct sound: the pseudo-anechoic response holds from ${fmt(m.fGate, 0)} Hz up and claims nothing below. Read at 1/${m.perOctave} octave.`),
      h('p', { class: 'stat' }, m.resonances.length ? `Resonances: ${m.resonances.map((r) => `${fmt(r.f, 1)} Hz +${fmt(r.height, 1)} dB Q ${fmt(r.q, 0)}`).join(' · ')}` : 'No resonance stands 3 dB over its third octave below 300 Hz.'),
    );
    return parts;
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
          badFile(err, f, ['Import a .json this app exported (File tab), or a .acoustic-session.json via Open project.']);
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

  return { buildPane, subsPane, advisorPane, filePane };
}
