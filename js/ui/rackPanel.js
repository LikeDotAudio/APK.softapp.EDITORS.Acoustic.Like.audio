// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { firstFree, itemFromPart, rackFootprint, rackOf, rackPlan } from '../acoustics/rack.js';
import { SITE } from '../site.js';
import { button, h, num, row, select, text } from './dom.js';

/**
 * THE RACK, IN THE INSPECTOR
 *
 * A selected rack shows itself twice — its front, U by U, the empty spaces
 * hatched; and its side, each item as deep as it really goes behind the
 * front rail, its cables after it, against the line where the rails stop —
 * then what it holds as rows to edit. Gear comes from the parts catalogue the
 * bench declares (OS/BIM/parts.json: its U, and its depth where the manual
 * gives one) or is typed in by hand. All of it saves into settings.racks
 * under the rack's CAD block id.
 */

/** The bench's parts catalogue, where site.js says it is (relative to the page); [] where there is none. */
let catalogue = null;
export function loadCatalogue(onLoad) {
  if (catalogue) return catalogue;
  catalogue = [];
  fetch(new URL(SITE.catalogue, document.baseURI))
    .then((r) => (r.ok ? r.json() : { parts: [] }))
    .then((d) => {
      catalogue = (d.parts ?? []).filter((p) => p.rack_units > 0);
      onLoad?.();
    })
    .catch(() => {});
  return catalogue;
}

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** The front and the side, drawn to one scale: mm in, an SVG out. */
function rackDrawing(rack, plan, paletteId) {
  const { d } = rackFootprint(paletteId);
  const U = 14; // px per U
  const H = plan.units * U;
  const panel = 160;
  const deepest = Math.max(plan.railDepth, ...plan.items.map((it) => it.reach ?? 0), d - 150);
  const k = 150 / deepest; // px per mm along the depth
  const sideX = panel + 70;
  const W = sideX + deepest * k + 20;
  const y = (u) => 14 + H - u * U; // the top edge of U u
  const kids = [
    s('text', { x: 24 + panel / 2, y: 10, 'text-anchor': 'middle', class: 'rk-head' }, 'front'),
    s('text', { x: sideX + (deepest * k) / 2, y: 10, 'text-anchor': 'middle', class: 'rk-head' }, 'side · depth behind the front rail'),
    s('rect', { x: 24, y: 14, width: panel, height: H, class: 'rk-frame' }),
    s('rect', { x: sideX, y: 14, width: plan.railDepth * k, height: H, class: 'rk-frame' }),
    s('line', { x1: sideX + plan.railDepth * k, y1: 8, x2: sideX + plan.railDepth * k, y2: 20 + H, class: 'rk-limit' }),
    s('text', { x: sideX + plan.railDepth * k, y: 30 + H, 'text-anchor': 'middle', class: 'rk-limit-t' }, `rails ${Math.round(plan.railDepth)} mm`),
  ];
  for (let u = 1; u <= plan.units; u++) kids.push(s('text', { x: 20, y: y(u) + U / 2 + 3, 'text-anchor': 'end', class: 'rk-u' }, u));
  for (const r of plan.runs) {
    kids.push(s('rect', { x: 24, y: y(r.to), width: panel, height: r.n * U, class: 'rk-free' }));
    kids.push(s('text', { x: 24 + panel / 2, y: y(r.to) + (r.n * U) / 2 + 3, 'text-anchor': 'middle', class: 'rk-free-t' }, `${r.n} U free`));
  }
  for (const it of plan.items) {
    const lo = Math.max(1, it.at);
    const hi = Math.min(plan.units, it.top);
    if (hi < lo) continue;
    const top = y(hi);
    const hh = (hi - lo + 1) * U;
    const cls = it.fits === false ? 'rk-item bad' : it.depth == null ? 'rk-item unknown' : 'rk-item';
    kids.push(s('rect', { x: 24, y: top, width: panel, height: hh, class: cls }, s('title', {}, `${it.name} · U${it.at}${it.units > 1 ? `–U${it.top}` : ''}`)));
    kids.push(s('text', { x: 28, y: top + hh / 2 + 3, class: 'rk-item-t' }, it.name.length > 24 ? `${it.name.slice(0, 23)}…` : it.name));
    const deep = it.depth ?? 0;
    kids.push(s('rect', { x: sideX, y: top + 1, width: Math.max(2, deep * k), height: hh - 2, class: cls }, s('title', {}, `${it.name}: ${it.depth == null ? 'depth not known' : `${Math.round(it.depth)} mm deep, ${Math.round(it.cable)} mm of cable behind — ${Math.round(it.reach)} mm in all`}`)));
    if (it.depth != null && it.cable > 0) kids.push(s('rect', { x: sideX + deep * k, y: top + hh * 0.25, width: it.cable * k, height: hh * 0.5, class: 'rk-cable' }));
    kids.push(s('text', { x: sideX + 3, y: top + hh / 2 + 3, class: 'rk-item-t' }, it.depth == null ? '? mm' : `${Math.round(it.reach)} mm`));
  }
  return s('svg', { class: 'rack-drawing', viewBox: `0 0 ${W} ${H + 36}`, width: '100%' }, ...kids);
}

/**
 * The panel for one rack piece. `racks` is settings.racks; `put(racks)` saves
 * it; `rerender` draws the inspector again (when the catalogue arrives).
 */
export function rackPanel(piece, racks, put, rerender) {
  const told = racks?.[piece.id] ?? {};
  const rack = rackOf(racks, piece.id, piece.paletteId);
  const plan = rackPlan(rack);
  const save = (patch) => put({ ...racks, [piece.id]: { ...told, ...patch } });
  const items = told.items ?? [];
  const setItems = (list) => save({ items: list });
  const upItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const parts = loadCatalogue(rerender);
  const runs = plan.runs.map((r) => (r.from === r.to ? `U${r.from}` : `U${r.from}–U${r.to}`)).join(', ');
  const deepest = plan.deepest;

  const add = (item) => {
    const at = firstFree(plan, item.units);
    setItems([...items, { ...item, at: at ?? plan.units + 1 }]);
  };
  let pick = parts[0]?.id ?? '';
  const partPick = parts.length
    ? select(pick, parts.map((p) => ({ value: p.id, label: `${p.name} · ${p.rack_units} U${Number.isFinite(p.depth_mm) ? ` · ${p.depth_mm} mm` : ''}` })), (v) => (pick = v))
    : null;

  return [
    h('h4', {}, `Rack · ${rack.units} U`),
    h('p', { class: 'stat' }, `${plan.used} U used · ${plan.free} U free${runs ? ` (${runs})` : ''}${deepest ? ` · deepest ${deepest.name}, ${Math.round(deepest.reach)} mm of ${Math.round(plan.railDepth)} mm` : ''}`),
    rackDrawing(rack, plan, piece.paletteId),
    plan.problems.length ? h('ul', { class: 'warn' }, ...plan.problems.map((p) => h('li', {}, p))) : '',
    row('Rack units', num(rack.units, (v) => save({ units: Math.max(1, Math.round(v)) }), { step: 1, min: 1, max: 60, unit: 'U' })),
    row('Rail depth', num(rack.railDepth, (v) => save({ railDepth: Math.max(50, v) }), { step: 10, min: 50, unit: 'mm' })),
    row('Cable room', num(rack.cable, (v) => save({ cable: Math.max(0, v) }), { step: 10, min: 0, unit: 'mm' })),
    h(
      'table',
      { class: 'grid rack-items' },
      h('tr', {}, h('th', { title: 'Its lowest U' }, 'at U'), h('th', { title: 'How many U it takes' }, 'U tall'), h('th', {}, 'what'), h('th', { title: 'Behind the front rail, chassis only' }, 'depth mm'), h('th', { title: 'Depth plus the cables behind it' }, 'really'), h('th', {}, '')),
      ...items.map((it, i) => {
        const p = plan.items[i];
        return h(
          'tr',
          { class: p.fits === false ? 'bad' : '' },
          h('td', {}, num(it.at, (v) => upItem(i, { at: Math.round(v) }), { step: 1, min: 1 })),
          h('td', {}, num(it.units ?? 1, (v) => upItem(i, { units: Math.max(1, Math.round(v)) }), { step: 1, min: 1 })),
          h('td', {}, text(it.name, (v) => upItem(i, { name: v }))),
          h('td', {}, num(it.depth, (v) => upItem(i, { depth: Math.max(0, v) }), { step: 5, min: 0 })),
          h('td', {}, p.reach == null ? '?' : `${Math.round(p.reach)}`),
          h('td', {}, button('✕', () => setItems(items.filter((_, j) => j !== i)), { title: 'Take it out of the rack' })),
        );
      }),
    ),
    h(
      'div',
      { class: 'actions' },
      partPick ?? '',
      partPick ? button('＋ From the catalogue', () => {
        const part = parts.find((p) => p.id === pick);
        if (part) add(itemFromPart(part, 1));
      }, { title: 'Put this part in the lowest free space it fits, with its U and its depth from the catalogue (OS/BIM/parts.json)' }) : '',
      button('＋ By hand', () => add({ id: `hand-${Date.now().toString(36)}`, name: 'New unit', units: 1, depth: null }), { title: 'Add a unit the catalogue does not have: name it, give it its U and its depth' }),
      button('＋ 1 U blank', () => add({ id: `blank-${Date.now().toString(36)}`, name: 'Blank panel', units: 1, depth: 10 }), { title: 'A blanking panel — a used space with nothing behind it' }),
    ),
    h('p', { class: 'hint' }, 'U1 is the lowest. Depth is the chassis behind the front rail; “really” adds the cables behind it, and that is what has to fit the rails. The elevations hatch the empty spaces and, side-on, show each depth.'),
  ];
}
