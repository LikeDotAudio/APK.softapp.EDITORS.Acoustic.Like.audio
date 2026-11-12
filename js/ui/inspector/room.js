// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE INSPECTOR — the Room, Treatments and Materials tabs: the room, its surfaces, the treatments and their details, the catalogue.
 * Lifted out of createInspector (inspector.js, ROAD-3753): `ins` is its shared context —
 * the closure's state and helpers, and what the other parts return.
 */
import { button, h, num, row, select } from '../dom.js';
import {
  BAND_HEADS,
  cap,
  fmt,
  HOW_TO_TREAT,
  MATERIAL_OPTIONS,
  sheetOf,
  spark,
  surfaceKey,
  surfaceLabel,
} from './common.js';
import { BANDS } from '../../acoustics/bands.js';
import { allModes, schroeder } from '../../acoustics/room.js';
import { lookup, MATERIALS, PRODUCTS } from '../../acoustics/materials.js';
import { groupPatches, shortName, swatch } from '../../views/treatments.js';
import { isRack } from '../../acoustics/rack.js';
import { rackPanel } from '../rackPanel.js';
import { alphaGraph, alphaSpark, intentDial, intentOf, INTENTS, SERIES, spread } from '../alphaChart.js';

export function roomTab(ins) {
  const { engine, jumpTo, render, S, set, showWall, store } = ins;
  // the other parts' functions, looked up when called
  const cadMarksPart = (...a) => ins.cadMarksPart(...a);
  const libraryPart = (...a) => ins.libraryPart(...a);
  const windowsPart = (...a) => ins.windowsPart(...a);

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
      row('Widest opening', num((settings.maxOpening ?? 4) * 1000, (v) => set({ maxOpening: Math.max(0.1, v / 1000) }), { unit: 'mm — wider gaps between wall pieces leave the plan open', min: 100, step: 100 })),
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
        room.objects?.count ? h('tr', { title: 'Sabins the furniture adds as objects in the room — a couch’s sides, a table’s underside — over the footprint already in the floor' }, h('td', {}, '+furn m²'), ...room.perBand.map((p) => h('td', {}, fmt(p.Aobj, 2)))) : '',
      ),
      room.objects?.count ? h('p', { class: 'hint' }, `${room.objects.count} piece${room.objects.count === 1 ? '' : 's'} of furniture standing in the room show ${fmt(room.objects.area, 1)} m² beyond their footprints, and absorb there too: a couch is a deep porous trap that keeps working below 125 Hz, a heavy table a panel that flexes in the bottom octaves.`) : '',
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
            { class: m.patched > 0 ? 'treated' : '', ...(sf.key.startsWith('wall:') ? { onclick: () => showWall(room.walls[+sf.key.slice(5)]?.key), title: 'Show this wall' } : {}) },
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
    const parts = [h('h3', {}, 'Treatments'), h('p', { class: 'hint' }, HOW_TO_TREAT), ...cadMarksPart(), ...windowsPart()];
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
    // a rack is first what is in it: its spaces, what fills them and how deep each goes (ui/rackPanel.js)
    const rackFloor = isRack(g.paletteId) ? g.pieces.find((p) => p.surface === 'floor') : null;
    const rack = rackFloor ? rackPanel(rackFloor, S().settings.racks ?? {}, (racks) => set({ racks }), render) : [];
    return [
      withHeading ? h('h3', {}, `${rackFloor ? 'Rack' : 'Treatment'} · ${g.name}`) : h('h4', {}, `Selected · ${g.name}`),
      ...rack,
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
  /** The dial's picked step (ui/alphaChart.js INTENTS), or null for every material. */
  let matIntent = null;
  /** What is on the α graph: [{ key, name, alpha, colour }] — null until the tab is first opened. */
  let compared = null;

  function materialsPane() {
    const all = [
      ...PRODUCTS.map((p) => ({ key: `p:${p.id}`, name: p.name, m: lookup(p.material), sub: shortName(lookup(p.material).name, 26), product: true })),
      ...MATERIALS.map((m) => ({ key: `m:${m.id}`, name: m.name, m })),
    ];
    // first time in: the room's own finishes (not the room's blends of them with what is on them), so the graph says something before anything is clicked
    if (!compared) {
      const used = [...new Set(Object.values(S().settings.faceMaterials ?? {}))];
      compared = all.filter((x) => !x.product && used.includes(x.m.id)).slice(0, 3).map((x, i) => ({ key: x.key, name: x.name, alpha: x.m.alpha, colour: SERIES[i] }));
    }
    const toggle = (x) => {
      const at = compared.findIndex((c) => c.key === x.key);
      if (at >= 0) compared.splice(at, 1);
      else {
        // the colour stays with the material while it is plotted: the first slot nobody holds
        const free = SERIES.find((c) => !compared.some((q) => q.colour === c));
        if (!free) compared.shift();
        compared.push({ key: x.key, name: x.name, alpha: x.m.alpha, colour: free ?? SERIES.find((c) => !compared.some((q) => q.colour === c)) });
      }
      render();
    };
    const fits = (x) => !matIntent || intentOf(x.m).id === matIntent;
    const head = h('tr', {}, h('th', {}, 'α'), ...BAND_HEADS.map((b) => h('th', {}, b)), h('th', {}, 's1k'));
    const matRows = (x) => {
      const on = compared.find((c) => c.key === x.key);
      const click = () => toggle(x);
      const title = on ? 'On the graph — click to take it off' : 'Click to plot its α on the graph';
      return [
        h('tr', { class: `name${on ? ' plotted' : ''}`, onclick: click, title }, h('td', { colspan: 6 }, on ? h('i', { class: 'linekey', style: `border-color:${on.colour}` }) : '', swatch(x.m), ` ${x.name}`, x.sub ? h('span', { class: 'sub' }, ` · ${x.sub}`) : ''), h('td', { colspan: 2, class: 'spark' }, alphaSpark(x.m.alpha, on?.colour))),
        h('tr', { class: `vals${on ? ' plotted' : ''}`, onclick: click, title }, h('td', {}, ''), ...x.m.alpha.map((a) => h('td', {}, fmt(a))), h('td', {}, fmt(x.m.scatter[3]))),
      ];
    };
    const picked = all.filter(fits);
    const step = INTENTS.find((s) => s.id === matIntent);
    const env = step && picked.length ? { ...spread(picked.map((x) => x.m)), colour: step.colour, label: `${step.label} · ${picked.length}` } : null;
    const parts = [
      h('h3', {}, 'Materials'),
      h(
        'div',
        { class: 'mat-charts' },
        h('div', { class: 'mat-dial' }, intentDial(all.map((x) => x.m), matIntent, (id) => { matIntent = id; render(); }), h('p', { class: 'hint' }, step ? step.hint : 'Reflect on one side, absorb on the other: pick what the surface should do, and the list below keeps only what does it. A material’s slice is its NRC, the mean α over 250 Hz – 2 kHz.')),
        alphaGraph(compared, env, (key) => { compared = compared.filter((c) => c.key !== key); render(); }),
      ),
      h('p', { class: 'hint' }, 'What the blocks in the CAD’s Acoustic palette stand for: α absorption per octave band, s scattering at 1 kHz. Typical published figures, rounded — design intent, not a test report. The swatch is how each is drawn in the elevations and the 3-D room: a grid for absorbers, wells for diffusers, a sheen for glass, diagonals for masonry.'),
    ];
    const products = picked.filter((x) => x.product);
    if (products.length) parts.push(h('h4', {}, 'Products — fixed-size blocks'), h('table', { class: 'grid treat pick' }, head.cloneNode(true), ...products.flatMap(matRows)));
    for (const cat of [...new Set(MATERIALS.map((m) => m.category))]) {
      const rows = picked.filter((x) => !x.product && x.m.category === cat);
      if (rows.length) parts.push(h('h4', {}, `${cat} — finishes`), h('table', { class: 'grid treat pick' }, head.cloneNode(true), ...rows.flatMap(matRows)));
    }
    if (!picked.length) parts.push(h('p', { class: 'hint' }, 'Nothing here does that — pick another slice.'));
    return parts;
  }

  return { roomPane, treatmentsPane, patchDetails, materialsPane };
}
