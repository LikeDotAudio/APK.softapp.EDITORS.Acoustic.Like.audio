// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { PRODUCTS } from './materials.js';

/**
 * WHAT IS IN THE RACK, AND HOW DEEP IT REALLY GOES
 *
 * A rack is counted in U — one rack unit, 44.45 mm (EIA-310) — numbered from
 * the bottom, U1 the lowest. Each rack keeps what it holds in
 * `settings.racks[<its CAD block id>]`: how many U it has, how deep its rails
 * take gear, the room left behind for the cables, and its items. An item sits
 * from `at` (its lowest U) up `units` U, and reaches `depth` mm back from the
 * front rail; its connectors and the bend of the cables in them take `cable`
 * mm more behind that (the rack's own unless the item says). That sum is how
 * deep the thing really is in the rack, and it is what has to fit the rails.
 *
 * Everything in millimetres here but the solids, which are the room's metres.
 * Plain data in, plain data out: the room carries the plan to the worker.
 */

/** One rack unit, mm (EIA-310). */
export const U_MM = 44.45;
/** A 19-inch panel across its ears, mm (EIA-310). */
export const PANEL_MM = 482.6;
/** The plinth under U1 and the roof over the top U, mm together — a floor rack of the kind. */
const FRAME_MM = 130;
/** The front rail stands this far behind the front of the cabinet, mm: room for the door and the handles. */
const RAIL_SETBACK_MM = 75;

export const DEFAULT_RACK = { units: 24, railDepth: null, cable: 100, items: [] };

export const isRack = (paletteId) => /^rack-/.test(String(paletteId ?? ''));

/** The cabinet's footprint, mm: { w, d } from its palette block. */
export function rackFootprint(paletteId) {
  const p = PRODUCTS.find((x) => x.id === paletteId);
  const [w, d] = p?.size ?? [0.6, 0.8];
  return { w: w * 1000, d: d * 1000 };
}

/** A rack's settings filled out: every field there, the rails `railDepth` deep (by default the cabinet less its door and back). */
export function rackOf(racks, id, paletteId) {
  const told = racks?.[id] ?? {};
  const { d } = rackFootprint(paletteId);
  const units = Math.max(1, Math.round(told.units ?? DEFAULT_RACK.units));
  return {
    ...DEFAULT_RACK,
    ...told,
    units,
    railDepth: told.railDepth ?? d - 2 * RAIL_SETBACK_MM,
    cable: told.cable ?? DEFAULT_RACK.cable,
    items: (told.items ?? []).map((it, i) => ({
      ...it,
      id: it.id ?? `item${i + 1}`,
      name: it.name || 'Unit',
      at: Math.round(it.at ?? 1),
      units: Math.max(1, Math.round(it.units ?? 1)),
      depth: Number.isFinite(it.depth) ? it.depth : null,
    })),
  };
}

/** How tall the cabinet stands, metres: its U and its frame. */
export const rackHeight = (rack) => (rack.units * U_MM + FRAME_MM) / 1000;

/**
 * The rack read out: every U and what is in it, the empty runs, and what does
 * not fit. { units, used, free, runs: [{ from, to, n }], slots: [{ u, item }],
 * items: [{ …item, top, cable, reach, fits }], deepest, problems: [text] }.
 * `reach` is depth + cable: how deep the item really is behind the front rail.
 */
export function rackPlan(rack) {
  const slots = Array.from({ length: rack.units }, (_, i) => ({ u: i + 1, item: null, clash: [] }));
  const problems = [];
  const items = rack.items.map((it) => {
    const cable = Number.isFinite(it.cable) ? it.cable : rack.cable;
    const reach = it.depth == null ? null : it.depth + cable;
    const top = it.at + it.units - 1;
    const fits = reach == null ? null : reach <= rack.railDepth;
    return { ...it, top, cable, reach, fits };
  });
  for (const it of items) {
    if (it.at < 1 || it.top > rack.units) problems.push(`${it.name} (U${it.at}–U${it.top}) runs off the rack's ${rack.units} U`);
    for (let u = Math.max(1, it.at); u <= Math.min(rack.units, it.top); u++) {
      const s = slots[u - 1];
      if (s.item) s.clash.push(it);
      else s.item = it;
    }
    if (it.depth == null) problems.push(`${it.name}: depth not known — say how deep it is`);
    else if (!it.fits) problems.push(`${it.name} is ${Math.round(it.reach)} mm deep with its cables — the rails take ${Math.round(rack.railDepth)} mm`);
  }
  for (const s of slots) for (const c of s.clash) problems.push(`U${s.u}: ${c.name} and ${s.item.name} in the same space`);
  const runs = [];
  for (const s of slots) {
    if (s.item) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === s.u - 1) last.to = s.u;
    else runs.push({ from: s.u, to: s.u });
  }
  runs.forEach((r) => (r.n = r.to - r.from + 1));
  const used = slots.filter((s) => s.item).length;
  const reaches = items.filter((it) => it.reach != null);
  const deepest = reaches.length ? reaches.reduce((a, b) => (b.reach > a.reach ? b : a)) : null;
  return { units: rack.units, used, free: rack.units - used, runs, slots, items, deepest, railDepth: rack.railDepth, problems: [...new Set(problems)] };
}

/** The lowest U where `units` U are free, or null. */
export function firstFree(plan, units) {
  return plan.runs.find((r) => r.n >= units)?.from ?? null;
}

const STEEL = '#3f4652';
const RAIL = '#9ca3af';
const GEAR = ['#1f2937', '#334155', '#27272a', '#3b3b4f'];
const TOO_DEEP = '#b91c1c';

/**
 * The rack as pieces (pieces.js shapes) in the block's frame, metres — x across,
 * y back from the front at −d/2, z up. The cabinet is its four posts, plinth
 * and roof and its rails, open at the sides so the elevations see in: each
 * item a box as wide as a panel, as tall as its U and as deep as it reaches,
 * its cable room a thinner box behind it; an empty U is just air.
 */
export function rackPieces(rack, paletteId) {
  const { w, d } = rackFootprint(paletteId);
  const W = w / 1000;
  const D = d / 1000;
  const H = rackHeight(rack);
  const plinth = FRAME_MM / 2000;
  const post = 0.03;
  const front = -D / 2 + RAIL_SETBACK_MM / 1000;
  const box = (x, y, z0, bw, bd, bh, colour) => ({ shape: 'box', x, y, z0, w: bw, d: bd, h: bh, colour });
  const out = [
    box(0, 0, 0, W, D, plinth, STEEL),
    box(0, 0, H - plinth, W, D, plinth, STEEL),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => box(sx * (W / 2 - post / 2), sy * (D / 2 - post / 2), plinth, post, post, H - 2 * plinth, STEEL))),
    // the front rails, either side of the panels
    ...[-1, 1].map((sx) => box(sx * (PANEL_MM / 2000 - 0.008), front + 0.002, plinth, 0.016, 0.004, rack.units * (U_MM / 1000), RAIL)),
  ];
  rackPlan(rack).items.forEach((it, i) => {
    const z0 = plinth + (Math.max(1, it.at) - 1) * (U_MM / 1000);
    const hh = Math.min(it.units, rack.units - Math.max(1, it.at) + 1) * (U_MM / 1000);
    if (hh <= 0) return;
    const deep = (it.depth ?? 0) / 1000 || 0.05;
    const colour = it.fits === false ? TOO_DEEP : GEAR[i % GEAR.length];
    out.push(box(0, front + deep / 2, z0 + 0.001, PANEL_MM / 1000 - 0.04, deep, hh - 0.002, colour));
    if (it.depth != null && it.cable > 0) out.push(box(0, front + deep + it.cable / 2000, z0 + hh * 0.2, PANEL_MM / 1000 - 0.12, it.cable / 1000, hh * 0.6, '#64748b'));
  });
  return out;
}

/**
 * Where each U's front lies in the block's frame, metres, for the views that
 * label it: the front rail plane y, and per U its z band and panel width.
 */
export function rackFace(rack, paletteId) {
  const { d } = rackFootprint(paletteId);
  const plinth = FRAME_MM / 2000;
  return { y: -d / 2000 + RAIL_SETBACK_MM / 1000, x: PANEL_MM / 2000, z: (u) => plinth + (u - 1) * (U_MM / 1000), u: U_MM / 1000 };
}

/** A catalogued part (OS/BIM/parts.json) as a rack item at `at`: its U, its declared depth if the catalogue has one. */
export function itemFromPart(part, at) {
  return {
    id: `${part.id}-${Date.now().toString(36)}`,
    name: part.name ?? part.model,
    partId: part.id,
    at,
    units: Math.max(1, Math.round(part.rack_units || 1)),
    depth: Number.isFinite(part.depth_mm) ? part.depth_mm : null,
  };
}
