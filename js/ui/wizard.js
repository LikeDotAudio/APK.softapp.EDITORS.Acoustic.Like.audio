// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';
import { AIMS, aimCurve, aimFor, faceAreas, rtWith, stiFromRt, stiRating, suggestCoverings } from '../acoustics/intelligibility.js';
import { material } from '../acoustics/materials.js';
import { planArea } from '../acoustics/roomLibrary.js';
import { h } from './dom.js';

/**
 * THE WIZARD
 *
 * The app opened on an empty CAD walks you through a room, five steps, each
 * one doing it for real in the drawing as you go:
 *
 *   1  ROOM      a shape from the library (drawn into the CAD, furnished and
 *                seated), the dice, a session file, or walls of your own.
 *   2  THINGS    furniture dropped on the plan, and the listener seated.
 *   3  SYSTEM    a speaker arrangement placed round the listener.
 *   4  WALLS     what each surface is covered in, held live against the
 *                reverberation the room should have and the speech
 *                intelligibility (STI) that follows from it — with a
 *                suggestion that gets there (acoustics/intelligibility.js).
 *   5  GO        tick what you want to know; Go sets the views, opens the
 *                meters and prints the Acoustic X report of it.
 *
 * Steps 1 and 5 are a dialog over the app; 2–4 a card beside the views, so
 * the plan stays clickable for whatever is being dropped. Nothing here keeps
 * state of its own beyond the step and what is ticked: every choice goes
 * through `act` into the store, the CAD or the toolbar it already has.
 */

const PREF = 'acoustic.wizard';
const STEPS = ['Room', 'Things', 'System', 'Walls', 'Go'];
const FACES = ['front', 'back', 'left', 'right', 'ceiling', 'floor'];
const FACE_LABEL = { front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall', ceiling: 'Ceiling', floor: 'Floor' };

/** What each surface may be covered in, hard to soft. */
const WALL_COVERS = ['concrete-painted', 'brick', 'block-painted', 'plaster', 'gypsum', 'wood-panel', 'glass-heavy', 'curtain-velour', 'drapes', 'slat-resonator', 'perforated-wood', 'diffuser', 'mineral-wool-50', 'absorber-50', 'absorber-100'];
const COVERS = {
  ...Object.fromEntries(['front', 'back', 'left', 'right'].map((f) => [f, WALL_COVERS])),
  ceiling: ['concrete-painted', 'plaster', 'gypsum', 'wood-panel', 'perforated-wood', 'acoustic-tile', 'ceiling-cloud', 'absorber-100'],
  floor: ['concrete-floor', 'wood-floor', 'carpet-pad', 'carpet-felt'],
};

/** The things worth knowing, what each turns on, and the Acoustic X report it belongs to. */
const QUESTIONS = [
  { id: 'speech', icon: '🗣', label: 'Can words be understood?', note: 'C50, D50 and the ISO 3382 set at the listener, the field as energy', meters: ['iso3382', 'echogram'], method: 'energy', view: 'six', report: 'reverb' },
  { id: 'rt', icon: '⏱', label: 'How long does it ring?', note: 'RT60 per octave against the aim — Sabine, Eyring, Fitzroy', meters: ['rt60'], report: 'reverb' },
  { id: 'modes', icon: '〰', label: 'Where does the bass pile up?', note: 'room modes, Bonello, the low end swept', meters: ['response'], method: 'modal', view: '3d', sweep: true, report: 'modal' },
  { id: 'sbir', icon: '🔊', label: 'What do the walls do to the speakers?', note: 'speaker boundary interference, its nulls', meters: ['response'], method: 'wave', report: 'sbir' },
  { id: 'rays', icon: '✳', label: 'Where do the reflections come from?', note: 'every path to the listener, up to 3rd order', meters: ['echogram'], view: '3d', trace: true, report: 'rays' },
  { id: 'cover', icon: '▦', label: 'Is it the same at every seat?', note: 'coverage over the plan, ceiling and walls', meters: ['spl', 'rta'], method: 'energy', view: 'six' },
];

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** A small plan of a library room: its outline fitted in a box. */
function thumb(poly) {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const s = 52 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1e-6);
  const pts = poly.map(([x, y]) => `${(4 + (x - x0) * s).toFixed(1)},${(56 - (y - y0) * s).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.innerHTML = `<polygon points="${pts}" />`;
  return svg;
}

/** The RT per octave as bars, over the aim's band. */
function rtChart(rt, curve) {
  const top = Math.max(1.2, ...rt.map((t) => t * 1.1), ...curve.hi.map((t) => t * 1.1));
  const W = 300;
  const H = 120;
  const bw = W / 6;
  const y = (t) => H - 16 - (t / top) * (H - 26);
  let s = '';
  BANDS.forEach((f, b) => {
    const x = b * bw;
    s += `<rect class="aim" x="${x + 4}" y="${y(curve.hi[b])}" width="${bw - 8}" height="${Math.max(1, y(curve.lo[b]) - y(curve.hi[b]))}"/>`;
    const ok = rt[b] >= curve.lo[b] && rt[b] <= curve.hi[b];
    s += `<rect class="${ok ? 'ok' : 'off'}" x="${x + bw / 2 - 7}" y="${y(rt[b])}" width="14" height="${H - 16 - y(rt[b])}"/>`;
    s += `<text x="${x + bw / 2}" y="${y(rt[b]) - 3}">${rt[b].toFixed(2)}</text>`;
    s += `<text class="hz" x="${x + bw / 2}" y="${H - 3}">${f >= 1000 ? `${f / 1000}k` : f}</text>`;
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rtChart');
  svg.innerHTML = s;
  return svg;
}

export function createWizard({ store, engine, rooms, act }) {
  const S = () => store.state;
  const el = h('div', { id: 'wizard', role: 'dialog', 'aria-label': 'Set up a room', hidden: true });
  const shade = h('div', { id: 'wizardShade', hidden: true });
  document.body.append(shade, el);

  let step = 0;
  let drawingOwn = false;
  let entry = null;
  let aim = null;
  const asked = new Set(['speech', 'rt']);
  let report = true;
  let live = () => {};
  let timer = 0;

  const atStart = () => {
    try {
      return localStorage.getItem(PREF) !== 'off';
    } catch {
      return true;
    }
  };
  const mix = () => S().mics.find((m) => m.mix);
  const room = () => engine.out.room;

  function go(n) {
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    if (step !== 0) drawingOwn = false;
    render();
  }

  // ------------------------------------------------------------------ 1 · the room
  function roomStep() {
    if (drawingOwn)
      return [
        h('p', {}, 'Drag on the plan to draw a wall; drag from a corner to carry on. Close the loop and it is a room.'),
        h('p', { class: 'hint' }, 'Right-click a wall to delete it, drag a corner to move it. Next when the room is closed.'),
        h('p', { class: 'wizLive' }),
      ];
    const cards = [];
    for (const group of [...new Set(rooms.map((r) => r.group))]) {
      cards.push(h('h4', {}, group));
      cards.push(
        h(
          'div',
          { class: 'wizRooms' },
          ...rooms
            .filter((r) => r.group === group)
            .map((r) => {
              const xs = r.poly.map(([x]) => x);
              const ys = r.poly.map(([, y]) => y);
              const dims = `${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} × ${r.h.toFixed(1)} m · ${Math.abs(planArea(r.poly)).toFixed(0)} m²`;
              return h('button', { class: 'wizRoom', title: r.note, onclick: () => pick(r) }, thumb(r.poly), h('b', {}, r.name), h('span', {}, dims));
            }),
        ),
      );
    }
    return [
      h('p', {}, 'Start from a room shape — it is drawn into the CAD, furnished and seated — or draw your own walls.'),
      h(
        'div',
        { class: 'wizActs' },
        h('button', { onclick: () => pick(act.dice()) }, '🎲 Any room'),
        h('button', { onclick: () => ((drawingOwn = true), act.drawOwn(), render()) }, '✏ Draw my own walls'),
        h('button', { onclick: () => (close(false), act.openFile()) }, '📂 Open a session'),
      ),
      h('div', { class: 'wizScroll' }, ...cards),
    ];
  }

  function pick(r) {
    if (!r) return;
    entry = r;
    aim = aimFor(r);
    act.drawRoom(r);
    go(1);
  }

  // ------------------------------------------------------------------ 2 · things in it
  function thingsStep() {
    const seat = h('p', { class: 'wizLive' });
    live = () => {
      const m = mix();
      seat.textContent = m ? `✓ The listener is seated at ${fmt(m.x)}, ${fmt(m.y)} m.` : '⚠ No listener yet — seat one: the system is placed round them.';
      seat.className = `wizLive ${m ? 'ok' : 'warn'}`;
    };
    return [
      h('p', {}, 'Click a thing, then click the plan where it goes. Shift-click keeps dropping. A library room came furnished: drag what is there.'),
      h('div', { class: 'wizGrid' }, ...act.furniture().map(({ id, label, title }) => h('button', { title, onclick: () => act.arm(id) }, label))),
      h('div', { class: 'wizActs' }, h('button', { onclick: act.seat }, '🎤 Seat the listener'), h('button', { onclick: act.mic }, '🎙 ＋ Mic')),
      seat,
    ];
  }

  // ------------------------------------------------------------------ 3 · the system
  function systemStep() {
    const state = h('p', { class: 'wizLive' });
    live = () => {
      const n = S().speakers.length;
      state.textContent = !mix() ? '⚠ Seat the listener first (step 2): the arrangement goes round them.' : n ? `✓ ${n} speaker${n === 1 ? '' : 's'} in the room.` : 'No speakers yet.';
      state.className = `wizLive ${!mix() ? 'warn' : n ? 'ok' : ''}`;
    };
    return [
      h('p', {}, 'Pick an arrangement and it is placed round the listener, at the angles its standard asks for. Drag any box after.'),
      ...act.sets().map((s) =>
        h('div', { class: 'wizSet' }, h('span', {}, s.title), h('div', { class: 'wizGrid' }, ...s.presets.map((p) => h('button', { title: p.label, onclick: () => act.system(s.k, p.id) }, p.id)))),
      ),
      h('div', { class: 'wizActs' }, h('button', { onclick: act.byHand }, '🔊 Place speakers by hand')),
      state,
    ];
  }

  // ------------------------------------------------------------------ 4 · walls and what covers them
  function wallsStep() {
    const r = room();
    if (!r) {
      // the engine may be a moment behind a room just drawn: this step builds itself once it has it
      live = () => room() && render();
      return [h('p', { class: 'wizLive warn' }, '⚠ No room yet — go back to step 1 and draw one.')];
    }
    aim ??= aimFor(entry);
    const selects = {};
    const areas = faceAreas(r);
    const rows = FACES.filter((f) => areas[f] > 0).map((f) => {
      const sel = h('select', {}, ...COVERS[f].map((id) => h('option', { value: id }, material(id).name)));
      sel.addEventListener('change', () => store.setFaceMaterial(f, sel.value));
      selects[f] = sel;
      return h('tr', {}, h('td', {}, h('i', { class: 'swatch' }), FACE_LABEL[f]), h('td', { class: 'stat' }, `${areas[f].toFixed(1)} m²`), h('td', {}, sel));
    });
    const aimSel = h('select', {}, ...AIMS.map((a) => h('option', { value: a.id, title: a.source }, a.label)));
    aimSel.value = aim;
    aimSel.addEventListener('change', () => ((aim = aimSel.value), live()));
    const chart = h('div', { class: 'wizChart' });
    const sti = h('div', { class: 'wizSti' });
    const seat = h('p', { class: 'hint' });
    const suggest = () => {
      const now = room();
      if (!now) return;
      const start = Object.fromEntries(FACES.map((f) => [f, S().settings.faceMaterials[f]]));
      const next = suggestCoverings(now, aimCurve(aim, now.V), COVERS, start);
      for (const f of FACES) if (next[f] && next[f] !== S().settings.faceMaterials[f]) store.setFaceMaterial(f, next[f]);
    };
    live = () => {
      const now = room();
      if (!now) return;
      for (const [f, sel] of Object.entries(selects)) {
        const id = S().settings.faceMaterials[f];
        if (document.activeElement !== sel) {
          // a finish chosen elsewhere that is not on this list still shows, as itself
          if (![...sel.options].some((o) => o.value === id)) sel.append(h('option', { value: id }, material(id).name));
          sel.value = id;
        }
        sel.parentNode.parentNode.querySelector('.swatch').style.background = material(id).color;
      }
      const rt = rtWith(now);
      const curve = aimCurve(aim, now.V);
      chart.replaceChildren(rtChart(rt, curve));
      const v = stiFromRt(rt);
      sti.className = `wizSti ${stiRating(v)}`;
      sti.replaceChildren(h('b', {}, v.toFixed(2)), h('span', {}, `STI · ${stiRating(v)}`), h('small', {}, `RT 500 Hz ${rt[2].toFixed(2)} s · aim ${curve.lo[2].toFixed(2)}–${curve.hi[2].toFixed(2)} s`));
      const iso = engine.out.reports?.[mix()?.id]?.iso;
      seat.textContent = iso ? `At the listener, ${BANDS[S().settings.band]} Hz: C50 ${fmt(iso.C50, 1)} dB · D50 ${fmt(iso.D50 * 100, 0)} % — speech wants C50 above 0 dB, D50 above 50 %.` : 'Seat a listener to read C50 and D50 where they sit.';
    };
    return [
      h('p', {}, 'Every surface and what it is covered in. Harder rings longer and blurs words together; softer is clearer, until the room is dead.'),
      h('label', { class: 'row' }, h('span', {}, 'Aim for'), aimSel),
      h('table', { class: 'wizFaces' }, ...rows),
      h('div', { class: 'wizActs' }, h('button', { class: 'on', onclick: suggest, title: 'Covers each surface with what brings the ringing to the aim, a surface at a time' }, '✨ Suggest coverings'), h('button', { onclick: act.pickWall, title: 'Click one wall on the plan and give it a finish of its own in the inspector' }, '▭ One wall on its own')),
      h('div', { class: 'wizRead' }, sti, chart),
      seat,
      h('p', { class: 'hint' }, 'A wall given a finish of its own (▭) keeps it whatever its face is covered in. Panels, clouds and traps are painted onto the surfaces in the CAD.'),
    ];
  }

  // ------------------------------------------------------------------ 5 · go
  function goStep() {
    const cards = QUESTIONS.map((q) => {
      const b = h('button', { class: `wizAsk${asked.has(q.id) ? ' on' : ''}`, onclick: () => (asked.has(q.id) ? asked.delete(q.id) : asked.add(q.id), b.classList.toggle('on', asked.has(q.id))) }, h('i', {}, q.icon), h('b', {}, q.label), h('span', {}, q.note));
      return b;
    });
    const rep = h('input', { type: 'checkbox', checked: report, onchange: () => (report = rep.checked) });
    return [
      h('p', {}, 'Click the things you want to know, and hit Go.'),
      h('div', { class: 'wizAsks' }, ...cards),
      h('label', { class: 'check' }, rep, ' 📄 and the Acoustic X report of it'),
      h('div', { class: 'wizGo' }, h('button', { class: 'go', onclick: launch }, 'GO ▶')),
    ];
  }

  function launch() {
    const qs = QUESTIONS.filter((q) => asked.has(q.id));
    // the last ticked that has an opinion wins the view and the method; six views beat 3-D, and the rays go over either
    const views = qs.map((q) => q.view).filter(Boolean);
    const view = ['six', '3d'].find((v) => views.includes(v)) ?? '3d';
    const method = qs.map((q) => q.method).filter(Boolean).at(-1) ?? S().settings.method;
    close(false);
    act.go({
      view,
      method,
      trace: qs.some((q) => q.trace),
      meters: [...new Set(qs.flatMap((q) => q.meters))],
      sweep: qs.some((q) => q.sweep),
      report: report ? [...new Set(qs.map((q) => q.report).filter(Boolean))] : [],
    });
  }

  // ------------------------------------------------------------------ the frame
  const BUILD = [roomStep, thingsStep, systemStep, wallsStep, goStep];

  function render() {
    live = () => {};
    const side = step >= 1 && step <= 3 || (step === 0 && drawingOwn);
    el.className = side ? 'side' : 'big';
    shade.hidden = side;
    const body = BUILD[step]();
    if (step === 0 && drawingOwn)
      live = () => {
        const p = el.querySelector('.wizLive');
        const r = room();
        if (p) p.textContent = r && !engine.out.virtual ? `✓ A room: ${r.walls.length} walls, ${fmt(r.V, 0)} m³.` : 'No closed room yet.';
      };
    const pref = h('input', {
      type: 'checkbox',
      checked: atStart(),
      onchange: () => {
        try {
          localStorage.setItem(PREF, pref.checked ? 'on' : 'off');
        } catch {
          // not remembered: it shows again next time
        }
      },
    });
    el.replaceChildren(
      h(
        'header',
        {},
        h('nav', {}, ...STEPS.map((s, i) => h('button', { class: i === step ? 'on' : i < step ? 'done' : '', onclick: () => go(i) }, `${i + 1} ${s}`))),
        h('button', { class: 'x', title: 'Close the wizard (Esc) — 🧭 on the bar brings it back', onclick: () => close() }, '✕'),
      ),
      h('h3', {}, `${step + 1} · ${['Draw the room', 'Drop things in it', 'Drop in the system', 'Walls and what covers them', 'What do you want to know?'][step]}`),
      h('div', { class: 'wizBody' }, ...body),
      h(
        'footer',
        {},
        h('label', { class: 'check', title: 'Open the wizard when the app starts on an empty drawing' }, pref, ' at start'),
        h('i'),
        step > 0 ? h('button', { onclick: () => go(step - 1) }, '◂ Back') : null,
        step < STEPS.length - 1 ? h('button', { class: 'on', onclick: () => go(step + 1) }, step === 0 && !drawingOwn ? 'Skip ▸' : 'Next ▸') : null,
      ),
    );
    live();
  }

  function open(n = 0) {
    el.hidden = false;
    go(n);
    clearInterval(timer);
    // the engine answers after the store: read what it has a few times a second while open
    timer = setInterval(() => live(), 400);
  }

  /** Closed, and — closed on step 1 with nothing drawn — the app's own start: a room by the dice. */
  function close(fallBack = true) {
    if (el.hidden) return;
    el.hidden = true;
    shade.hidden = true;
    clearInterval(timer);
    if (fallBack) act.closed();
  }

  document.addEventListener('keydown', (e) => e.key === 'Escape' && !el.hidden && !shade.hidden && close());
  shade.addEventListener('click', () => close());

  return { open, close, atStart, get isOpen() { return !el.hidden; } };
}
