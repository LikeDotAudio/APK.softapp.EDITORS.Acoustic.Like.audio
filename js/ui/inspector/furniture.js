// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Furniture and Symmetry tabs: the furniture rows, the mirror, the windows part and the room library.
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { button, check, download, h, num, row, select } from '../dom.js';
import { lookup, pieceHeight, PRODUCTS } from '../../acoustics/materials.js';
import { inFrame } from '../../acoustics/room.js';
import { BAND_HEADS, cap, fmt } from './common.js';
import { swatch } from '../../views/treatments.js';
import { METRES_PER_UNIT } from '../../cad/cadLink.js';
import { GLASS_TYPES, makeWindow } from '../../acoustics/windows.js';
import { grabBag, planArea, ROOM_LIBRARY } from '../../acoustics/roomLibrary.js';

export function furnitureTab(ins) {
  const { cad, drawRoom, engine, render, S, set, store } = ins;

  /**
   * Everything placed in the room, a row each: what it is, where it stands —
   * x, y and its distance from the front and left walls — how it is turned,
   * its size, and what it is made of, its absorption band by band.
   */
  function furniturePane() {
    const room = engine.out.room;
    if (!room) return [h('h3', {}, 'Furniture'), h('p', { class: 'hint' }, 'Draw the room first.')];
    const { selected } = S();
    const placed = (room.patches ?? []).filter((p) => p.surface === 'floor' && pieceHeight(p) > 0);
    const rows = placed.map((p) => {
      const at = p.at ?? centreOf(p.points3d);
      const f = inFrame(room, at);
      const prod = PRODUCTS.find((x) => x.id === p.paletteId);
      return { id: p.id, name: prod?.name ?? p.material.name, at, f, rotation: p.rotation ?? 0, size: prod ? [...prod.size, pieceHeight(p)] : null, mat: p.material };
    });
    if (!rows.length) return [h('h3', {}, 'Furniture'), h('p', { class: 'hint' }, 'Nothing placed yet — + Furniture on the toolbar, or a product from the CAD’s palette.')];
    const csv = () => {
      const head = ['name', 'x m', 'y m', 'from front m', 'from left m', 'rotation °', 'w m', 'd m', 'h m', 'material', ...BAND_HEADS.map((b) => `α ${b}`)];
      const line = (r) => [r.name, fmt(r.at.x), fmt(r.at.y), fmt(r.f.fromFront), fmt(r.f.fromLeft), fmt(r.rotation, 1), ...(r.size ? r.size.map((v) => fmt(v)) : ['', '', '']), r.mat.name, ...r.mat.alpha.map((a) => fmt(a))];
      return [head, ...rows.map(line)].map((l) => l.map((v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    };
    return [
      h('h3', {}, `Furniture · ${rows.length} placed`),
      h(
        'table',
        { class: 'grid furniture' },
        h('tr', {}, h('th', { title: 'plan coordinates, metres' }, 'x, y'), h('th', { title: 'from the front wall, from the left wall, metres' }, 'front · left'), h('th', {}, 'turn'), h('th', { title: 'width × depth × height, metres' }, 'size')),
        ...rows.flatMap((r) => [
          h('tr', { class: `name${selected?.id === r.id ? ' on' : ''}`, onclick: () => store.select({ kind: 'patch', id: r.id }) }, h('td', { colspan: 4, title: r.name }, swatch(r.mat), ` ${r.name}`)),
          h(
            'tr',
            { class: `at${selected?.id === r.id ? ' on' : ''}`, onclick: () => store.select({ kind: 'patch', id: r.id }) },
            h('td', { class: 'mono' }, `${fmt(r.at.x)}, ${fmt(r.at.y)}`),
            h('td', { class: 'mono' }, `${fmt(r.f.fromFront)} · ${fmt(r.f.fromLeft)}`),
            h('td', { class: 'mono' }, `${fmt(r.rotation, 0)}°`),
            h('td', { class: 'mono' }, r.size ? r.size.map((v) => fmt(v)).join(' × ') : '—'),
          ),
          h('tr', { class: 'sub' }, h('td', { colspan: 4, title: 'absorption coefficient α, 125 Hz – 4 kHz' }, `${r.mat.name} · α ${r.mat.alpha.map((a, i) => `${BAND_HEADS[i]} ${fmt(a)}`).join(' · ')}`)),
        ]),
      ),
      h('div', { class: 'actions' }, button('⬇ CSV', () => download('furniture.csv', csv(), 'text/csv'), { title: 'The list as a spreadsheet: every piece, where it stands, its turn, its size and its absorption by band' })),
    ];
  }

  /** The middle of a piece with no anchor of its own: the mean of its outline. */
  const centreOf = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

  /** The room's symmetry in one place: which walls match and which side leads, the CAD's mirror, and the pairs placed about it. */
  function symmetryPane() {
    const { settings } = S();
    const mix = S().mics.find((m) => m.mix);
    const room = engine.out.room;
    const mirror = S().cad.mirror;
    return [
      h('h3', {}, 'Symmetry'),
      ...symmetryPart().slice(1),
      h('h4', {}, 'The CAD mirror'),
      h('p', { class: 'stat' }, mirror ? `Virtual Mirror ${mirror.enabled ? 'ON' : 'off'} at x = ${fmt(mirror.xMetres)} m${mirror.axes?.length > 1 ? ` (${mirror.axes.length} axes)` : ''}` : 'CAD has not reported a mirror yet.'),
      row('Place in mirrored pairs', check(settings.symmetric, (v) => set({ symmetric: v }))),
      row('Speakers follow the mixer', check(settings.followListener, (v) => set({ followListener: v }))),
      row('Console at the mixer’s nose', check(settings.console?.follow !== false, (v) => set({ console: { ...settings.console, follow: v } })), num(settings.console?.people ?? 2, (v) => set({ console: { ...settings.console, people: Math.max(0, v) } }), { step: 0.5, min: 0, unit: 'people clear' })),
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
    ];
  }

  /** The room's symmetry, as the designer defines it: which walls match, and which side leads. */
  function symmetryPart() {
    const { settings } = S();
    const sym = { sides: 'off', front: 'off', back: 'off', ...settings.symmetry };
    const put = (key, v) => set({ symmetry: { ...sym, [key]: v } });
    const halves = [{ value: 'off', label: 'off' }, { value: 'left', label: 'left half leads' }, { value: 'right', label: 'right half leads' }];
    return [
      h('h4', {}, 'Symmetry'),
      row('Side walls', select(sym.sides, [{ value: 'off', label: 'off' }, { value: 'left', label: 'left wall leads, right matches' }, { value: 'right', label: 'right wall leads, left matches' }], (v) => put('sides', v))),
      row('Front wall', select(sym.front, halves, (v) => put('front', v))),
      row('Back wall', select(sym.back, halves, (v) => put('back', v))),
      h('p', { class: 'hint' }, 'What is painted and divided on the leading side is drawn mirrored onto the other — the side walls the same distance from the front, a front or back wall about its own centre line — and the room hears the copies. Leave the matching side bare: anything drawn there stays as well.'),
    ];
  }

  /**
   * The room's glass: each window's wall, where along it, the pane's size and
   * sill, and the casing round it — the frame takes wall too, and whatever
   * hangs beside a window has to clear it. Drawn into the elevation, heard as glass.
   */
  function windowsPart() {
    const layer = engine.out.planLayer;
    if (!layer || !engine.out.room) return [];
    const all = S().settings.windows ?? {};
    const list = (all[layer] ?? []).map(makeWindow);
    const put = (next) => set({ windows: { ...all, [layer]: next } });
    const up = (i, patch) => put(list.map((w, j) => (j === i ? { ...w, ...patch } : w)));
    const faces = ['front', 'back', 'left', 'right'].map((f) => ({ value: f, label: cap(f) }));
    const glass = GLASS_TYPES.map((id) => ({ value: id, label: lookup(id).name }));
    const room = engine.out.room;
    return [
      h('h4', {}, `Windows · ${list.length}`),
      ...list.flatMap((w, i) => [
        h('h5', {}, `GLASS-${i + 1}`),
        row('Wall', select(w.face, faces, (v) => up(i, { face: v })), num(w.at, (v) => up(i, { at: v }), { unit: 'm from its left', min: 0, step: 0.05 })),
        row('Glass', num(w.w, (v) => up(i, { w: v }), { unit: 'm wide', min: 0.2, step: 0.05 }), num(w.h, (v) => up(i, { h: v }), { unit: 'm tall', min: 0.2, step: 0.05 })),
        row('Height', num(w.sill, (v) => up(i, { sill: v }), { unit: 'm sill', min: 0, step: 0.05 }), h('em', { class: 'sub' }, ` top ${fmt(w.sill + w.h, 2)} m`)),
        row('Casing', num(w.casing, (v) => up(i, { casing: v }), { unit: 'm each side', min: 0, step: 0.01 })),
        row('Pane', select(w.glass, glass, (v) => up(i, { glass: v }))),
        w.sill + w.h + w.casing > (room.Hmax ?? room.H) ? h('p', { class: 'hint warn' }, 'The casing runs past the ceiling.') : '',
        h('div', { class: 'actions' }, button('Remove', () => put(list.filter((_, j) => j !== i)))),
      ]),
      h('div', { class: 'actions' }, button('＋ Window', () => put([...list, makeWindow({ at: room.W / 2 }, list.length)]))),
      h('p', { class: 'hint' }, 'Each window is drawn on its wall’s elevation: the pane painted as glass, the casing round it as wood, both heard by the room. Width is true along the wall, even on a splay. Turn them off above to leave the walls plain.'),
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

  return { furniturePane, symmetryPane, windowsPart, libraryPart };
}
