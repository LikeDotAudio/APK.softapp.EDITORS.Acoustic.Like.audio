// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { firstFree, itemFromPart, rackFootprint, rackOf, rackPlan } from '../acoustics/rack.js';
import { button, h, num, row, select, text } from './dom.js';
import { acceptLibraryDrops, bimFields, libraryButton, setPickerUrls } from '../bimLibrary.js';
import { SITE } from '../site.js';

setPickerUrls(SITE.picker);   // where the picker is: the one config point (site.js), never a module

/**
 * THE RACK, IN THE INSPECTOR
 *
 * A selected rack shows itself twice — its front, U by U, the empty spaces
 * hatched; and its side, each item as deep as it really goes behind the
 * front rail, its cables after it, against the line where the rails stop —
 * then what it holds as rows to edit. Gear comes from the BIM library (📚
 * Library, ROAD-3572: its U, and its depth where the part declares one) — never
 * a list of its own, never typed in. Each item keeps bimId and bimRef, and the
 * bench UNIT it is (`device`, ROAD-3727): with several boxes of one part on the
 * bench (three Chromecasts), the item's row asks which — picked from the bench's
 * own devices of that part, never typed — so the OS Simulation's By rack seats
 * exactly that box. One box of the part: it is that one. All of it saves into
 * settings.racks under the rack's CAD block id.
 */

/** One BIM part as the rack wants it: apk.bim.part/1 (physical.rack_units /
    physical.depth_mm), or a flat record (rack_units / depth_mm). */
export function asRackPart(p) {
  const phys = p.physical ?? {};
  return {
    id: p.id,
    name: p.name ?? `${p.manufacturer ?? ''} ${p.model ?? ''}`.trim(),
    model: p.model,
    rack_units: phys.rack_units ?? p.rack_units,
    depth_mm: phys.depth_mm ?? p.depth_mm,
  };
}

/** A pick's part with its body (U, depth): the picked row is the part as the CAD draws it,
    so the part itself is read from its BIM reference — the live /api/bim/parts/… or the
    snapshot file that holds it ('audio.json#maker/model'). The row alone when neither answers. */
export async function partOfPick(item, fetcher = globalThis.fetch) {
  const url = item?.ref?.url;
  if (!url) return item?.bim ?? {};
  try {
    const [file, id] = url.split('#');
    const r = await fetcher(file);
    if (!r.ok) return item.bim;
    const d = await r.json();
    const got = id ? (d.items ?? d.parts ?? []).find((p) => p.id === id) : d;
    return got ? { ...item.bim, ...got } : item.bim;
  } catch (_) { return item.bim; }
}

/** A bench instance (apk.bim.bench/1) as the unit a rack item keeps: { ref, guid, key, name }
    — ref the bench's (U7), guid its stable id, key its live identity (serial / MAC, never an IP). */
export function unitOfInstance(inst) {
  const out = { ref: String(inst?.ref ?? ''), name: String(inst?.name ?? inst?.ref ?? '') };
  if (inst?.guid) out.guid = String(inst.guid);
  if (inst?.live?.key) out.key = String(inst.live.key);
  return out;
}
const partIdOf = (inst) => String((inst?.part && typeof inst.part === 'object' ? inst.part.id : inst?.part) ?? '').split('@')[0];

/** The bench's units of each part: Map part → [unit] (state: its live state), from the bench
    the OS Simulation draws (SITE.bench, apk.bim.bench/1). No bench (the static site): an empty Map. */
export async function benchUnits(fetcher = globalThis.fetch, url = SITE.bench) {
  const out = new Map();
  if (!url) return out;
  try {
    const r = await fetcher(url, { cache: 'no-store' });
    if (!r.ok) return out;
    const bench = await r.json();
    for (const inst of bench.instances ?? []) {
      const part = partIdOf(inst);
      if (!part || !inst.ref) continue;
      if (!out.has(part)) out.set(part, []);
      out.get(part).push({ ...unitOfInstance(inst), state: inst.live?.state ?? '' });
    }
  } catch (_) { /* no bench: no units to choose from */ }
  return out;
}
// one read of the bench for every panel drawn within 30 s: { at, loading: Promise<Map>, units: Map | null }
let benchCache = null;
function benchUnitsCached() {
  if (!benchCache || Date.now() - benchCache.at > 30000) {
    const c = { at: Date.now(), units: null };
    c.loading = benchUnits().then((u) => { c.units = u; return u; });
    benchCache = c;
  }
  return benchCache.loading;
}
/** The bench's units now when they are in hand; else null, and `then()` once they arrive. */
function benchUnitsNow(then) {
  const was = benchCache;
  benchUnitsCached();
  if (benchCache.units) return benchCache.units;
  if (then) benchCache.loading.then((u) => { if (u.size) then(); });
  return was?.units ?? null;   // the last read while a fresh one comes
}
const unitId = (u) => u?.guid || u?.key || u?.ref || '';
/** Every unit any rack item of the project already names: unit id → the item's rack and index. */
export function rackedUnits(racks) {
  const out = new Map();
  for (const [rackId, r] of Object.entries(racks ?? {})) (r?.items ?? []).forEach((it, i) => { if (it?.device) out.set(unitId(it.device), { rackId, i }); });
  return out;
}

/** A picked {bim, ref} as a rack item at `at`, keeping its BIM reference — and its unit when the
    bench has exactly one box of the part (`units`: that part's bench units). Several: none is
    guessed; the row asks which. */
export async function rackItemOfPick(item, at, fetcher, units = []) {
  const part = asRackPart(await partOfPick(item, fetcher));
  const { bimId, bimRef } = bimFields(item);
  const only = units.length === 1 ? units[0] : null;
  return { ...itemFromPart(part, at), bimId, ...(bimRef ? { bimRef } : {}),
           ...(only ? { device: unitOfInstance({ ...only, live: only.key ? { key: only.key } : null }) } : {}) };
}

/** The `which unit?` choice of one rack item: a select of the bench's units of its part, those
    another item already racks marked so; null when the item names no part or the bench has none. */
function unitChoice(it, units, taken, mine, onPick) {
  if (!it.bimId || !units?.length) return null;
  const NONE = '';
  const options = [{ value: NONE, label: units.length > 1 ? `which unit? (${units.length} on the bench)` : 'which unit?' },
    ...units.map((u) => {
      const t = taken.get(unitId(u));
      const elsewhere = t && !(t.rackId === mine.rackId && t.i === mine.i);
      return { value: unitId(u), label: `${u.name}${u.name !== u.ref ? ` · ${u.ref}` : ''}${u.state && u.state !== 'online' ? ` · ${u.state}` : ''}${elsewhere ? ' · racked' : ''}` };
    })];
  const el = select(it.device ? unitId(it.device) : NONE, options, (v) => {
    const u = units.find((x) => unitId(x) === v);
    onPick(u ? unitOfInstance({ ...u, live: u.key ? { key: u.key } : null }) : null);
  });
  el.title = 'The bench unit in this rack: the OS Simulation\'s By rack seats exactly this box';
  if (!it.device) el.classList.add('ask');
  return el;
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
  // the bench's units of each part (ROAD-3727): read once, then the panel is drawn again with them
  const units = benchUnitsNow(rerender);
  const taken = rackedUnits(racks);
  const runs = plan.runs.map((r) => (r.from === r.to ? `U${r.from}` : `U${r.from}–U${r.to}`)).join(', ');
  const deepest = plan.deepest;

  const add = (item) => {
    const at = firstFree(plan, item.units);
    setItems([...items, { ...item, at: at ?? plan.units + 1 }]);
  };
  // 📚 Library (ROAD-3572): the BIM library's picker — live on the bench, the snapshot on the
  // static site. Each pick is racked with its U and depth, keeping its BIM reference.
  const addPicks = async (picks) => {
    let list = items;
    const bench = await benchUnitsCached();
    for (const it of picks) {
      const part = String(bimFields(it).bimId).split('@')[0];
      const item = await rackItemOfPick(it, 1, undefined, bench.get(part) ?? []);
      const at = firstFree(rackPlan({ ...rack, items: list }), item.units);
      list = [...list, { ...item, at: at ?? plan.units + 1 }];
    }
    setItems(list);
  };
  const libSlot = libraryButton(addPicks, { title: 'Rack a device from the BIM library', multiple: true });

  // a part dragged from the library onto the rack drawing is racked the same way
  const drawing = rackDrawing(rack, plan, piece.paletteId);
  acceptLibraryDrops(drawing, (it) => { void addPicks([it]); });

  return [
    h('h4', {}, `Rack · ${rack.units} U`),
    h('p', { class: 'stat' }, `${plan.used} U used · ${plan.free} U free${runs ? ` (${runs})` : ''}${deepest ? ` · deepest ${deepest.name}, ${Math.round(deepest.reach)} mm of ${Math.round(plan.railDepth)} mm` : ''}`),
    drawing,
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
          h('td', {}, text(it.name, (v) => upItem(i, { name: v })),
            unitChoice(it, units?.get(String(it.bimId).split('@')[0]), taken, { rackId: piece.id, i },
              (device) => upItem(i, { device }))),
          h('td', {}, num(it.depth, (v) => upItem(i, { depth: Math.max(0, v) }), { step: 5, min: 0 })),
          h('td', {}, p.reach == null ? '?' : `${Math.round(p.reach)}`),
          h('td', {}, button('✕', () => setItems(items.filter((_, j) => j !== i)), { title: 'Take it out of the rack' })),
        );
      }),
    ),
    h(
      'div',
      { class: 'actions' },
      libSlot,
      button('＋ 1 U blank', () => add({ id: `blank-${Date.now().toString(36)}`, name: 'Blank panel', units: 1, depth: 10 }), { title: 'A blanking panel — a used space with nothing behind it' }),
    ),
    h('p', { class: 'hint' }, 'U1 is the lowest. Depth is the chassis behind the front rail; “really” adds the cables behind it, and that is what has to fit the rails. The elevations hatch the empty spaces and, side-on, show each depth.'),
  ];
}
