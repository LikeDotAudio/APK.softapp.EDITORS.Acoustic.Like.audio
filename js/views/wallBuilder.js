// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS } from '../acoustics/bands.js';
import { ELEVATION_FACES, ELEVATION_LAYER } from '../acoustics/elevations.js';
import { DEFAULT_ISOLATION } from '../acoustics/isolation.js';
import { MATERIALS, PRODUCTS, material, paletteItems } from '../acoustics/materials.js';
import { faceCoords } from '../acoustics/patches.js';
import { brassMarker } from '../cad/marks.js';
import { soundingSpeakers } from '../acoustics/layouts.js';
import { panelOptions, reflectionPanels } from '../acoustics/reflectionPanels.js';
import { acrossWall, faceArea, snapToGuide, wallAbsorption, wallDetails, wallDivisions, wallGuides, wallLineToSheet, wallOutline, wallRegions, wallSpan, wallTransmission, wallWindows } from '../acoustics/wallPlan.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { FACE_COLOURS } from './glyphs.js';

/**
 * THE WALL BUILDER
 *
 * One wall, planned on a page of its own (the 🧱 Wall tab beside the six
 * views): its elevation split by the division lines drawn in the CAD, each
 * region tagged with what is painted in it, dimensioned from the brass
 * marker's centre line; a key plan saying where on the room the wall is
 * split; the selected region, and what it is — changed here, it is repainted
 * in the CAD; the FINISH SCHEDULE; a stud section of every build on it
 * (the detail callouts D1, D2 …) and of the wall's own construction; and the
 * numbers — what it soaks up and what it lets through (acoustics/wallPlan.js).
 *
 * The drawing is the CAD's: division lines and regions are drawn there (this
 * page jumps the CAD to the wall's elevation), and everything here is read
 * back from what it reports, so the two never disagree. The ruler and the
 * pencil draw a division from here too — straight into the CAD, on the
 * wall's elevation layer — settling on the divisions the wall offers
 * (wallPlan.js wallGuides): the centre line, the first-reflection panels'
 * edges, the glass, the ears' height and the board module, shown faintly.
 */

/** How each kind of guide is drawn on the elevation. */
const GUIDE_COLOUR = { centre: '#d6b27a', panel: '#4ade80', window: '#9cc7e8', ears: '#f472b6', module: '#64748b' };
const GUIDE_NAME = { panel: 'reflection panels', window: 'glass', ears: 'ears', module: 'board module' };
const TOOL_HINT = {
  pick: 'Click a region to see it',
  rulerV: 'Click to draw a division up the wall — it settles on the guides, else every 10 mm',
  rulerH: 'Click to draw a division across the wall — it settles on the guides, else every 10 mm',
  pencil: 'Click, then click again to draw a line — Shift keeps it level or plumb · Esc stops',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mm = (v) => Math.round(v * 1000);
const signed = (v) => (Math.round(v * 1000) > 0 ? `+${mm(v)}` : `${mm(v)}`);
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : '—');
const BAND_HEADS = BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b)));
const TITLE = { front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall' };

/** How a region is drawn: a hatch by what it is, the colour its tag is outlined in. */
function lookOf(paletteId) {
  const mat = material(paletteId);
  if (/glass/.test(mat.id)) return { pattern: 'wbGlass', stroke: '#4f8fc0', text: '#9cc7e8' };
  if (/trap/.test(mat.id)) return { pattern: 'wbTrap', stroke: '#3f8f4a', text: '#8fd19a' };
  if (mat.category === 'Absorber') return { pattern: 'wbWool', stroke: '#3f8f4a', text: '#8fd19a' };
  if (mat.category === 'Diffuser') return { pattern: 'wbQrd', stroke: '#d4a52a', text: '#e8c766' };
  if (mat.category === 'Resonator') return { pattern: 'wbSlat', stroke: '#b5b54d', text: '#d6d67a' };
  return { pattern: null, fill: mat.color ?? '#c9c6bf', stroke: '#c9c6bf', text: '#c9c6bf' };
}

/** The hatches, sized to the drawing (`u` is about one 60th of it). */
function patterns(u) {
  const p = (id, w, body) => `<pattern id="${id}" width="${w}" height="${w}" patternUnits="userSpaceOnUse">${body}</pattern>`;
  const a = u * 1.2;
  return `<defs>
    ${p('wbQrd', a, `<rect width="${a}" height="${a}" fill="#d4a52a" fill-opacity=".22"/><path d="M0 0V${a}M${a / 3} 0V${a}M${(2 * a) / 3} 0V${a}" stroke="#d4a52a" stroke-opacity=".55" stroke-width="${u * 0.08}"/>`)}
    ${p('wbWool', a, `<rect width="${a}" height="${a}" fill="#3f8f4a" fill-opacity=".25"/><path d="M0 ${a}L${a} 0" stroke="#3f8f4a" stroke-opacity=".7" stroke-width="${u * 0.08}"/>`)}
    ${p('wbTrap', a, `<rect width="${a}" height="${a}" fill="#2d6e3a" fill-opacity=".35"/><path d="M0 ${a}L${a} 0M0 0L${a} ${a}" stroke="#3f8f4a" stroke-opacity=".55" stroke-width="${u * 0.08}"/>`)}
    ${p('wbSlat', a, `<rect width="${a}" height="${a}" fill="#8a8a3a" fill-opacity=".25"/><path d="M${a / 2} 0V${a}" stroke="#b5b54d" stroke-opacity=".6" stroke-width="${u * 0.3}"/>`)}
    ${p('wbGlass', a, `<rect width="${a}" height="${a}" fill="#4f8fc0" fill-opacity=".25"/><path d="M0 ${a}L${a} 0" stroke="#9cc7e8" stroke-opacity=".35" stroke-width="${u * 0.06}"/>`)}
  </defs>`;
}

/** Section hatches for the stud details, in mm on the drawing. */
const SECTION_DEFS = `<defs>
  <pattern id="wbMasonry" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#4b4b4b"/><path d="M0 16L16 0" stroke="#7a7a7a" stroke-width="1.5"/></pattern>
  <pattern id="wbConcrete" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#5a5a5a"/><path d="M0 16L16 0M0 0L16 16" stroke="#7a7a7a" stroke-width="1"/></pattern>
  <pattern id="wbIns" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#2d4a31"/><path d="M0 12Q6 0 12 12T24 12" stroke="#5fae6a" stroke-width="1.5" fill="none"/></pattern>
  <pattern id="wbBoard" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#c9c6bf" fill-opacity=".8"/></pattern>
  <pattern id="wbAir" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#1e293b"/></pattern>
  <pattern id="wbWood" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#8a6a44"/><path d="M0 6H12" stroke="#b08d57" stroke-width="1"/></pattern>
  <pattern id="wbIso" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#0c4a6e"/><circle cx="6" cy="6" r="3" fill="none" stroke="#38bdf8" stroke-width="1"/></pattern>
</defs>`;
const KIND_FILL = { masonry: 'url(#wbMasonry)', concrete: 'url(#wbConcrete)', insulation: 'url(#wbIns)', board: 'url(#wbBoard)', air: 'url(#wbAir)', wood: 'url(#wbWood)', stud: 'url(#wbIns)', isolator: 'url(#wbIso)' };

export function createWallBuilder({ root, store, engine, cad, inputs, jumpTo }) {
  let face = 'front';
  let lastSheet = null;
  /** The selected region's tag on this wall (F4), or null. */
  let picked = null;
  /** What a click on the elevation does: 'pick' a region, 'rulerV' / 'rulerH' a division right across, 'pencil' a line. */
  let tool = 'pick';
  let showGuides = true;
  /** The pencil's first point, wall metres, while a line is being drawn. */
  let pen = null;
  /** The last drawing, for the pointer: { room, span, top, outline, guides, div, u } — set by render. */
  let geo = null;

  root.addEventListener('click', (e) => {
    if (tool !== 'pick' && e.target.closest('.wb-svg')) {
      draw(e);
      return;
    }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'face') {
      face = t.dataset.face;
      picked = null;
      pen = null;
    } else if (act === 'tool') {
      tool = t.dataset.tool === tool ? 'pick' : t.dataset.tool;
      pen = null;
    } else if (act === 'guides') showGuides = !showGuides; else if (act === 'pick') picked = t.dataset.tag === picked ? null : t.dataset.tag;
    else if (act === 'open') jumpTo(face);
    else if (act === 'paint') {
      const id = root.querySelector('select[data-act-change="repaint"]')?.value;
      jumpTo(face);
      if (id) cad.link?.arm(id);
    } else if (act === 'detail') root.querySelector(`#wb-detail-${t.dataset.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else return;
    render();
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-act-change="repaint"]');
    if (!sel || !sel.dataset.id) return;
    // a region painted in the CAD (a fill) changes what it is there; the CAD reports it back and this redraws
    cad.link?.repaint([sel.dataset.id], sel.value);
  });

  root.addEventListener('pointermove', (e) => {
    if (tool !== 'pick' && e.target.closest('.wb-svg')) ghost(aimAt(e));
  });
  root.addEventListener('pointerleave', () => ghost(null));
  root.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || tool === 'pick' || !root.isConnected || !root.offsetParent) return;
    if (pen) pen = null;
    else tool = 'pick';
    render();
  });

  // ---------------------------------------------------------------- the ruler and the pencil

  /** The pointer on the elevation, in the wall's metres, or null off it. */
  function local(e) {
    const svg = root.querySelector('.wb-svg');
    const m = svg?.getScreenCTM();
    if (!m || !geo) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x / 1000, y: (geo.top * 1000 - p.y) / 1000 };
  }

  /**
   * What a click here would draw: { a, b, label, guides } in wall metres — the ruler's division right across the
   * wall where it settles, or the pencil's line from its first point (its first point alone before that).
   */
  function aimAt(e) {
    const p = local(e);
    if (!p || !geo) return null;
    const { span, top, outline, guides, div, u } = geo;
    const reach = (u / 1000) * 0.8;
    // the guides, the lines already drawn and the wall's own edges all hold the ruler
    const xs = [...guides.xs, ...div.xs.map((v) => ({ v, why: 'a division drawn', kind: 'drawn' })), { v: 0, why: 'wall end', kind: 'edge' }, { v: span, why: 'wall end', kind: 'edge' }];
    const zs = [...guides.zs, ...div.zs.map((v) => ({ v, why: 'a division drawn', kind: 'drawn' })), { v: 0, why: 'floor', kind: 'edge' }, { v: top, why: 'top', kind: 'edge' }];
    if (tool === 'rulerV' || tool === 'rulerH') {
      const vert = tool === 'rulerV';
      const s = snapToGuide(vert ? xs : zs, vert ? p.x : p.y, reach);
      const ends = acrossWall(outline, vert ? 'x' : 'y', s.v);
      if (!ends) return null;
      const [a, b] = vert ? [{ x: s.v, y: ends[0] }, { x: s.v, y: ends[1] }] : [{ x: ends[0], y: s.v }, { x: ends[1], y: s.v }];
      // the two bays it makes, between the neighbouring divisions
      const marks = (vert ? [0, ...div.xs, span] : [0, ...div.zs, top]).sort((m, n) => m - n);
      const lo = Math.max(...marks.filter((m) => m < s.v - 1e-4));
      const hi = Math.min(...marks.filter((m) => m > s.v + 1e-4));
      const at = vert ? `${signed(s.v - span / 2)} from the centre` : `${mm(s.v)} up`;
      return { a, b, label: `${at} · bays ${mm(s.v - lo)} | ${mm(hi - s.v)}${s.guide ? ` · ${s.guide.why}` : ''}`, held: s.guide };
    }
    let x = snapToGuide(xs, p.x, reach);
    let y = snapToGuide(zs, p.y, reach);
    if (pen && e.shiftKey) {
      // level or plumb, whichever it is nearer
      if (Math.abs(p.x - pen.x) > Math.abs(p.y - pen.y)) y = { v: pen.y, guide: null };
      else x = { v: pen.x, guide: null };
    }
    const q = { x: Math.max(0, Math.min(span, x.v)), y: Math.max(0, Math.min(top, y.v)) };
    const why = [x.guide?.why, y.guide?.why].filter(Boolean).join(' × ');
    if (!pen) return { a: q, b: null, label: `${signed(q.x - span / 2)}, ${mm(q.y)} up${why ? ` · ${why}` : ''}` };
    const len = Math.hypot(q.x - pen.x, q.y - pen.y);
    const deg = Math.round((Math.atan2(q.y - pen.y, q.x - pen.x) * 180) / Math.PI);
    return { a: pen, b: q, label: `${mm(len)} mm at ${deg}° · to ${signed(q.x - span / 2)}, ${mm(q.y)} up${why ? ` · ${why}` : ''}` };
  }

  /** The line a click would draw, and its read-out, over the elevation — drawn straight in, without a re-render. */
  function ghost(aim) {
    const g = root.querySelector('.wb-ghost');
    if (!g || !geo) return;
    const { top, u } = geo;
    const X = (v) => v * 1000;
    const Y = (v) => (top - v) * 1000;
    if (!aim) {
      g.innerHTML = '';
      return;
    }
    const out = [];
    if (aim.b) out.push(`<path d="M${X(aim.a.x)} ${Y(aim.a.y)}L${X(aim.b.x)} ${Y(aim.b.y)}" stroke="#facc15" stroke-width="${u * 0.16}" stroke-dasharray="${u * 0.6} ${u * 0.3}"/>`);
    const tip = aim.b ?? aim.a;
    out.push(`<circle cx="${X(tip.x)}" cy="${Y(tip.y)}" r="${u * 0.35}" fill="none" stroke="#facc15" stroke-width="${u * 0.12}"/>`);
    if (pen) out.push(`<circle cx="${X(pen.x)}" cy="${Y(pen.y)}" r="${u * 0.3}" fill="#facc15"/>`);
    g.innerHTML = out.join('');
    const read = root.querySelector('.wb-read');
    if (read) read.textContent = aim.label;
  }

  /** A click with the ruler or the pencil: the line into the CAD, on this wall's elevation layer. */
  function draw(e) {
    const aim = aimAt(e);
    if (!aim) return;
    if (tool === 'pencil' && !pen) {
      pen = aim.a;
      ghost(aimAt(e));
      return;
    }
    const g = store.state.cad.geometry;
    const layer = g?.layers?.find((l) => l.name === ELEVATION_LAYER[face]);
    const read = root.querySelector('.wb-read');
    if (!cad.link || !layer) {
      if (read) read.textContent = `⚠ the CAD has no ${ELEVATION_LAYER[face]} layer yet — ✎ Open the ${face} elevation in the CAD once, then draw here`;
      return;
    }
    const line = wallLineToSheet(geo.room, face, aim.a, aim.b, METRES_PER_UNIT[g.units] ?? 1);
    if (!line || (Math.abs(aim.a.x - aim.b.x) < 1e-4 && Math.abs(aim.a.y - aim.b.y) < 1e-4)) return;
    cad.link.walls({ op: 'add', a: line.a, b: line.b, layer: layer.id });
    // the pencil carries on from where the line ended, as a pencil does
    if (tool === 'pencil') pen = aim.b;
    ghost(aimAt(e));
  }

  function render() {
    // a choice being made is not pulled out from under the pointer
    const active = root.ownerDocument.activeElement;
    if (active?.tagName === 'SELECT' && root.contains(active)) return;
    const room = engine.out.room;
    if (!room) {
      root.innerHTML = '<div class="wb-empty">No room yet — draw one in the CAD or pick 🎲 Room.</div>';
      return;
    }
    const sheet = store.state.sheet;
    if (sheet !== lastSheet) {
      lastSheet = sheet;
      if (ELEVATION_FACES.includes(sheet)) face = sheet;
    }
    const { settings } = store.state;
    const { patches, lines } = inputs();
    const regions = wallRegions(room, face, patches);
    const div = wallDivisions(room, face, lines);
    const windows = wallWindows(room, face, settings.windows?.[engine.out.planLayer] ?? []);
    const details = wallDetails(regions);
    const mix = store.state.mics.find((m) => m.mix) ?? null;
    const ap = settings.autoPanels ?? {};
    const panels = reflectionPanels(room, soundingSpeakers(store.state.speakers, settings), mix, panelOptions(ap, false));
    const guides = wallGuides(room, face, { panels, windows, mix });
    const sel = regions.find((r) => r.tag === picked) ?? null;
    if (!sel) picked = null;
    const iso = { ...DEFAULT_ISOLATION, ...settings.isolation };
    const baseId = room.walls.find((w) => w.face === face)?.material?.id ?? settings.faceMaterials[face];
    const absorb = wallAbsorption(room, face, regions, baseId);
    const trans = wallTransmission(room, face, iso, windows);
    const { span, top } = wallSpan(room, face);
    const fileName = store.state.fileName || 'Untitled room';

    root.innerHTML = `
      <div class="wb">
        <div class="wb-head">
          <h2 style="color:${FACE_COLOURS[face]}">${TITLE[face]}</h2>
          <span class="wb-meta">${esc(fileName)} · ${mm(span)} × ${mm(top)} mm · layer <b>${esc(ELEVATION_LAYER[face])}</b> · positions measured from the brass marker</span>
          <nav class="wb-faces">${ELEVATION_FACES.map((f) => `<button data-act="face" data-face="${f}" class="${f === face ? 'on' : ''}" style="--c:${FACE_COLOURS[f]}">${f[0].toUpperCase()}${f.slice(1)}</button>`).join('')}</nav>
          <span class="wb-count">${regions.length} region${regions.length === 1 ? '' : 's'} · ${div.xs.length + div.zs.length} division line${div.xs.length + div.zs.length === 1 ? '' : 's'} · ${details.length} detail${details.length === 1 ? '' : 's'}</span>
        </div>
        <div class="wb-grid">
          <div class="wb-col">
            <section class="wb-card wb-elev">${toolbar(guides)}${elevation(room, regions, div, windows, details, sel, span, top, guides)}
              ${regions.length ? '' : `<p class="wb-hint">No regions on this wall yet. Draw division lines with the │ ─ Ruler or the ✎ Pencil above — they settle on the faint guides — or <button data-act="open">✎ Open the ${face} elevation in the CAD</button>; then pick a finish or a product from the Acoustic palette and click a bay to fill it.</p>`}
            </section>
            <div class="wb-row">
              <section class="wb-card wb-key"><h4>Key plan · where the ${face} wall is split</h4>${keyPlan(room, div, regions)}</section>
              <section class="wb-card wb-sel">${selected(sel, details, span)}</section>
            </div>
            <section class="wb-card">${transmissionCard(trans, windows, iso)}</section>
            <section class="wb-card">${absorptionCard(absorb, room, face)}</section>
          </div>
          <div class="wb-col">
            <section class="wb-card"><h4>Finish schedule · ${face}</h4>${schedule(regions, details, absorb, sel)}</section>
            ${details.map((d) => `<section class="wb-card" id="wb-detail-${d.n}">${detailCard(d, span, trans)}</section>`).join('')}
            <section class="wb-card">${buildCard(trans)}</section>
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- the elevation

  /** The ruler, the pencil and the guides, over the elevation; the read-out of what a click would draw. */
  function toolbar(guides) {
    const b = (id, label, title) => `<button data-act="tool" data-tool="${id}" class="${tool === id ? 'on' : ''}" title="${title}">${label}</button>`;
    const kinds = [...new Set([...guides.xs, ...guides.zs].map((g) => g.kind))].filter((k) => GUIDE_NAME[k]);
    return `<div class="wb-tools">
      ${b('rulerV', '│ Ruler', 'Draw a division up the wall, floor to top')}${b('rulerH', '─ Ruler', 'Draw a division across the wall, end to end')}${b('pencil', '✎ Pencil', 'Draw a line of any length and angle')}
      <button data-act="guides" class="${showGuides ? 'on' : ''}" title="The divisions this wall offers: the centre line, the first-reflection panels, the glass, the ears' height, the board module">┆ Guides</button>
      ${showGuides ? `<span class="wb-legend">${kinds.map((k) => `<i style="--c:${GUIDE_COLOUR[k]}"></i>${GUIDE_NAME[k]}`).join(' ')}</span>` : ''}
      <span class="wb-read">${TOOL_HINT[tool]}</span>
    </div>`;
  }

  function elevation(room, regions, div, windows, details, sel, span, top, guides) {
    const W = span * 1000;
    const H = top * 1000;
    const u = Math.max(W, H) / 60;
    geo = { room, span, top, outline: wallOutline(room, face), guides, div, u };
    const fs = u * 1.05;
    const padL = u * 10;
    const padR = u * 2;
    const padT = u * 3;
    const padB = u * 8;
    const X = (x) => x * 1000;
    const Y = (z) => H - z * 1000;
    const out = [];
    out.push(`<svg class="wb-svg${tool === 'pick' ? '' : ' drawing'}" viewBox="${-padL} ${-padT} ${W + padL + padR} ${H + padT + padB}" role="img" aria-label="${TITLE[face]} elevation, its regions and division lines">`);
    out.push(patterns(u));
    const outline = wallOutline(room, face);
    const outlinePath = outline.length >= 3 ? `M${outline.map((p) => `${X(p.x)} ${Y(p.y)}`).join('L')}Z` : `M0 0H${W}V${H}H0Z`;
    out.push(`<path d="${outlinePath}" fill="#c9c6bf" fill-opacity=".08"/>`);
    out.push(`<clipPath id="wbClip"><path d="${outlinePath}"/></clipPath><g clip-path="url(#wbClip)">`);
    for (const r of regions) {
      const look = lookOf(r.p.paletteId);
      const d = `M${r.pts.map((p) => `${X(p.x)} ${Y(p.y)}`).join('L')}Z`;
      out.push(`<path d="${d}" fill="${look.pattern ? `url(#${look.pattern})` : look.fill}" fill-opacity="${look.pattern ? 1 : 0.18}" data-act="pick" data-tag="${r.tag}" class="wb-region"/>`);
    }
    for (const w of windows) out.push(`<rect x="${X(w.x0)}" y="${Y(w.y1)}" width="${X(w.x1 - w.x0)}" height="${X(w.y1 - w.y0)}" fill="url(#wbGlass)" stroke="#9cc7e8" stroke-width="${u * 0.1}"/>`);
    out.push('</g>');
    if (sel) out.push(`<path d="M${sel.pts.map((p) => `${X(p.x)} ${Y(p.y)}`).join('L')}Z" fill="none" stroke="#f4902c" stroke-width="${u * 0.3}" pointer-events="none"/>`);
    out.push(`<path d="${outlinePath}" fill="none" stroke="#e8e8e8" stroke-width="${u * 0.18}"/>`);
    // the divisions the wall offers, faint, each saying why — not where one is already drawn
    if (showGuides) {
      out.push(`<g clip-path="url(#wbClip)" class="wb-guides">`);
      for (const g of guides.xs) if (!div.xs.some((x) => Math.abs(x - g.v) < 1e-3)) out.push(`<path d="M${X(g.v)} 0V${H}" stroke="${GUIDE_COLOUR[g.kind]}" stroke-opacity=".55" stroke-width="${u * 0.07}" stroke-dasharray="${u * 0.25} ${u * 0.35}"><title>${esc(g.why)} · ${signed(g.v - span / 2)}</title></path>`);
      for (const g of guides.zs) if (!div.zs.some((z) => Math.abs(z - g.v) < 1e-3)) out.push(`<path d="M0 ${Y(g.v)}H${W}" stroke="${GUIDE_COLOUR[g.kind]}" stroke-opacity=".55" stroke-width="${u * 0.07}" stroke-dasharray="${u * 0.25} ${u * 0.35}"><title>${esc(g.why)} · ${mm(g.v)} up</title></path>`);
      out.push('</g>');
    }
    // the division lines as drawn, and a dot where each meets the wall's edge
    for (const l of div.lines) out.push(`<path d="M${X(l.a.x)} ${Y(l.a.y)}L${X(l.b.x)} ${Y(l.b.y)}" stroke="#f4902c" stroke-width="${u * 0.13}"/>`);
    for (const x of div.xs) out.push(`<circle cx="${X(x)}" cy="0" r="${u * 0.3}" fill="#f4902c"/><circle cx="${X(x)}" cy="${H}" r="${u * 0.3}" fill="#f4902c"/>`);
    // the brass marker's centre line
    out.push(`<path d="M${W / 2} ${-padT * 0.6}V${H + u * 1.4}" stroke="#b08d57" stroke-dasharray="${u} ${u * 0.4} ${u * 0.2} ${u * 0.4}" stroke-width="${u * 0.1}"/>`);
    out.push(`<circle cx="${W / 2}" cy="${H + u * 2}" r="${u * 0.6}" fill="#1e1e1e" stroke="#b08d57" stroke-width="${u * 0.15}"/><path d="M${W / 2 - u * 0.6} ${H + u * 2}h${u * 1.2}M${W / 2} ${H + u * 1.4}v${u * 1.2}" stroke="#b08d57" stroke-width="${u * 0.12}"/>`);
    // the tags
    for (const r of regions) {
      const look = lookOf(r.p.paletteId);
      // the name cut to what fits the bay; a narrow one carries its tag alone
      const fit = Math.floor((X(r.x1 - r.x0) - fs * 1.2) / (fs * 0.85 * 0.6));
      const short = fit < 5 ? '' : r.name.length > fit ? `${r.name.slice(0, fit - 1)}…` : r.name;
      const w = Math.max(r.tag.length * fs * 0.62, short.length * fs * 0.85 * 0.6) + fs;
      const h = short ? fs * 2.6 : fs * 1.5;
      const cx = X((r.x0 + r.x1) / 2);
      const cy = Y((r.y0 + r.y1) / 2);
      out.push(`<g class="wb-tag" data-act="pick" data-tag="${r.tag}"><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${fs * 0.3}" fill="#1e1e1e" stroke="${r === sel ? '#f4902c' : look.stroke}" stroke-width="${u * 0.08}"/>`);
      out.push(`<text x="${cx - w / 2 + fs * 0.5}" y="${short ? cy - fs * 0.15 : cy + fs * 0.35}" font-size="${fs}" font-weight="700" fill="#f4f4f4">${r.tag}</text>${short ? `<text x="${cx - w / 2 + fs * 0.5}" y="${cy + fs * 0.95}" font-size="${fs * 0.85}" fill="${look.text}">${esc(short)}</text>` : ''}<title>${r.tag} · ${esc(r.name)}</title></g>`);
    }
    // the callouts: a section cut a quarter of the way up each built region, a bubble out past the left edge
    regions.forEach((r, i) => {
      const d = details.find((x) => x.regions.includes(r));
      if (!d) return;
      const y = Y(r.y0 + (r.y1 - r.y0) * 0.25);
      const x0 = X(r.x0) + u * 0.4;
      const x1 = X(r.x1) - u * 0.4;
      const rad = u * 1.3;
      // two columns of bubbles out past the height dimension, so neighbours clear
      const bx = -padL + rad + u * 0.3 + (i % 2) * rad * 2.2;
      out.push(`<g class="wb-callout" data-act="detail" data-n="${d.n}"><path d="M${x0} ${y}H${x1}" stroke="#f4f4f4" stroke-width="${u * 0.1}" stroke-dasharray="${u} ${u * 0.3}"/>`);
      out.push(`<path d="M${x0 + u * 0.5} ${y - u * 0.4}L${x0} ${y}L${x0 + u * 0.5} ${y + u * 0.4}M${x1 - u * 0.5} ${y - u * 0.4}L${x1} ${y}L${x1 - u * 0.5} ${y + u * 0.4}" stroke="#f4f4f4" stroke-width="${u * 0.1}" fill="none"/>`);
      out.push(`<path d="M${bx + rad} ${y}H${x0}" stroke="#9aa4b2" stroke-width="${u * 0.07}"/><circle cx="${bx}" cy="${y}" r="${rad}" fill="#1e1e1e" stroke="#f4f4f4" stroke-width="${u * 0.12}"/><path d="M${bx - rad} ${y}H${bx + rad}" stroke="#f4f4f4" stroke-width="${u * 0.07}"/>`);
      out.push(`<text x="${bx}" y="${y - rad * 0.2}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#f4f4f4">${d.n}</text><text x="${bx}" y="${y + rad * 0.75}" text-anchor="middle" font-size="${fs * 0.7}" fill="#9aa4b2">D${d.n}</text></g>`);
    });
    // dimensions: across from the centre line, and up from the floor
    const xs = [0, ...div.xs.filter((x) => x > 1e-3 && x < span - 1e-3), span];
    const yd = H + u * 3.6;
    out.push(`<g font-size="${fs * 0.9}" fill="#9aa4b2" text-anchor="middle"><path d="M0 ${yd}H${W}" stroke="#6b7280" stroke-width="${u * 0.07}"/>`);
    xs.forEach((x, i) => {
      out.push(`<path d="M${X(x)} ${yd - u * 0.4}V${yd + u * 0.4}" stroke="#6b7280" stroke-width="${u * 0.07}"/><text x="${X(x)}" y="${yd + u * 1.4}">${signed(x - span / 2)}</text>`);
      if (i) out.push(`<text x="${X((x + xs[i - 1]) / 2)}" y="${yd + u * 2.6}" fill="#d4d4d4">${mm(x - xs[i - 1])}</text>`);
    });
    out.push(`<text x="${W / 2}" y="${yd + u * 1.4}" fill="#d6b27a">0</text></g>`);
    const zs = [0, ...div.zs.filter((z) => z > 1e-3 && z < top - 1e-3), top];
    const xd = -u * 0.9;
    out.push(`<g font-size="${fs * 0.9}" fill="#9aa4b2" text-anchor="end"><path d="M${xd} 0V${H}" stroke="#6b7280" stroke-width="${u * 0.07}"/>`);
    for (const z of zs) out.push(`<path d="M${xd - u * 0.4} ${Y(z)}H${xd + u * 0.4}" stroke="#6b7280" stroke-width="${u * 0.07}"/><text x="${xd - u * 0.6}" y="${Y(z) + fs * 0.35}">${mm(z)}</text>`);
    out.push('</g>');
    // what the ruler or the pencil would draw (ghost)
    out.push('<g class="wb-ghost" pointer-events="none"></g></svg>');
    return out.join('');
  }

  // ---------------------------------------------------------------- the key plan

  function keyPlan(room, div, regions) {
    const xs = room.poly.map((p) => p.x);
    const ys = room.poly.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    const s = 240 / Math.max(w, h);
    const pad = 22;
    const P = (p) => `${pad + (p.x - x0) * s} ${pad + (h - (p.y - y0)) * s}`;
    const out = [`<svg class="wb-keysvg" viewBox="0 0 ${w * s + pad * 2} ${h * s + pad * 2}" role="img" aria-label="Plan of the room with the ${face} wall highlighted and its split points marked">`];
    out.push(`<path d="M${room.poly.map(P).join('L')}Z" fill="#2a1a12" stroke="#6b7280" stroke-width="1.5"/>`);
    const mine = room.walls.filter((wl) => wl.face === face);
    for (const wl of mine) out.push(`<path d="M${P(wl.a)}L${P(wl.b)}" stroke="${FACE_COLOURS[face]}" stroke-width="4" stroke-linecap="round"/>`);
    // each vertical division line where it falls on the wall in plan
    const { span } = wallSpan(room, face);
    const at = faceCoords(room, face);
    const flip = face === 'left' || face === 'back';
    for (const x of div.xs) {
      const t = flip ? span - x : x;
      for (const wl of mine) {
        const ta = at(wl.a).t;
        const tb = at(wl.b).t;
        if (t < Math.min(ta, tb) - 1e-6 || t > Math.max(ta, tb) + 1e-6 || Math.abs(tb - ta) < 1e-9) continue;
        const k = (t - ta) / (tb - ta);
        out.push(`<circle cx="${pad + (wl.a.x + (wl.b.x - wl.a.x) * k - x0) * s}" cy="${pad + (h - (wl.a.y + (wl.b.y - wl.a.y) * k - y0)) * s}" r="4" fill="#f4902c"/>`);
        break;
      }
    }
    const b = brassMarker(room);
    out.push(`<circle cx="${pad + (b.x - x0) * s}" cy="${pad + (h - (b.y - y0)) * s}" r="7" fill="#1e1e1e" stroke="#b08d57" stroke-width="2"/><path d="M${pad + (b.x - x0) * s - 7} ${pad + (h - (b.y - y0)) * s}h14M${pad + (b.x - x0) * s} ${pad + (h - (b.y - y0)) * s - 7}v14" stroke="#b08d57" stroke-width="1.5"/>`);
    out.push('</svg>');
    const pieces = div.xs.filter((x) => x > 1e-3 && x < span - 1e-3).length + 1;
    out.push(`<p class="wb-small">${face} wall · ${pieces} piece${pieces === 1 ? '' : 's'} across · ${regions.length} region${regions.length === 1 ? '' : 's'} · <span style="color:#d6b27a">⊕ brass marker</span>, the centre every position is measured from</p>`);
    return out.join('');
  }

  // ---------------------------------------------------------------- the selected region

  function selected(sel, details, span) {
    if (!sel) return '<h4>Region</h4><p class="wb-hint">Click a region on the elevation, or a row of the schedule, to see it and change what it is.</p>';
    const d = details.find((x) => x.regions.includes(sel));
    const fill = String(sel.p.id).startsWith('fill:') && !sel.p.host;
    const items = paletteItems();
    const groups = [...new Set(items.map((x) => x.category))];
    const options = groups.map((g) => `<optgroup label="${esc(g)}">${items.filter((x) => x.category === g).map((x) => `<option value="${esc(x.id)}"${x.id === sel.p.paletteId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
    return `<h4>Region ${sel.tag} · selected</h4>
      <p class="wb-mono">${mm(sel.x1 - sel.x0)} × ${mm(sel.y1 - sel.y0)} mm · ${sel.area.toFixed(2)} m² · x ${signed(sel.x0 - span / 2)} → ${signed(sel.x1 - span / 2)} · z ${mm(sel.y0)} → ${mm(sel.y1)}</p>
      <label class="wb-label">Finish or product
        <select data-act-change="repaint" data-id="${fill ? esc(sel.p.id) : ''}"${fill ? '' : ' disabled'}>${options}</select>
      </label>
      ${fill ? '' : `<p class="wb-small">${sel.how === 'mirrored' ? 'A mirrored copy — change the one it mirrors.' : 'A product placed as a block — replace it in the CAD.'}</p>`}
      <div class="wb-actions">
        <span class="wb-small">${esc(sel.how)}</span>
        <button data-act="paint" title="Arm the chosen item in the CAD's palette and jump to this wall, to paint another bay with it">Paint another bay</button>
        <button data-act="open">✎ In the CAD</button>
        ${d ? `<button data-act="detail" data-n="${d.n}">Detail ${d.n} ↓</button>` : ''}
      </div>`;
  }

  // ---------------------------------------------------------------- the schedule

  function schedule(regions, details, absorb, sel) {
    const row = (r) => {
      const mat = material(r.p.paletteId);
      const d = details.find((x) => x.regions.includes(r));
      return `<tr data-act="pick" data-tag="${r.tag}" class="${r === sel ? 'on' : ''}">
        <td class="tag">${r.tag}</td><td>${esc(r.name)}<div class="muted">${esc(r.how)}${d ? ` · D${d.n}` : ''}</div></td>
        <td class="n">${mm(r.x1 - r.x0)}×${mm(r.y1 - r.y0)}</td><td class="n">${r.area.toFixed(2)}</td>
        <td class="n">${f2(mat.alpha[0])}</td><td class="n">${f2(mat.alpha[2])}</td><td class="n">${f2(mat.alpha[4])}</td><td class="n">${f2(mat.scatter[3])}</td></tr>`;
    };
    const base = material(absorb.rest.name ? MATERIALS.find((m) => m.name === absorb.rest.name)?.id : null);
    return `<div class="wb-scroll"><table class="wb-table">
      <thead><tr><th>Tag</th><th>Finish / product · fit</th><th class="n">mm</th><th class="n">m²</th><th class="n">α125</th><th class="n">α500</th><th class="n">α2k</th><th class="n">s</th></tr></thead>
      <tbody>${regions.map(row).join('')}
        <tr class="base"><td class="tag">—</td><td>${esc(absorb.rest.name)}<div class="muted">base · the rest of the wall</div></td><td class="n">—</td><td class="n">${absorb.rest.area.toFixed(2)}</td>
        <td class="n">${f2(base.alpha[0])}</td><td class="n">${f2(base.alpha[2])}</td><td class="n">${f2(base.alpha[4])}</td><td class="n">${f2(base.scatter[3])}</td></tr>
      </tbody></table></div>`;
  }

  // ---------------------------------------------------------------- the stud sections

  /**
   * DETAIL Dn: a plan section through the first bay of that build, to scale —
   * the wall's own construction behind, a 45 mm stud at each division line,
   * the build between hatched (stepped wells for a QRD), its face, labelled,
   * the bay's width and each edge from the centre line.
   */
  function detailCard(d, span, trans) {
    const r = d.regions[0];
    const Wtrue = (r.x1 - r.x0) * 1000;
    // a bay wider than 1500 is drawn with a break in it, its studs and edges true, its width dimensioned true
    const broken = Wtrue > 1500;
    const W = broken ? 1500 : Wtrue;
    const D = d.build.depth * 1000;
    const frame = Math.min(45, W / 6);
    const layers = trans.layers.length ? trans.layers : [['Masonry', 100, 'masonry']];
    const wallT = layers.reduce((s, [, t]) => s + t, 0);
    const pad = 30;
    // the words grow with the drawing, so they read the same on a narrow bay as on a wide one
    const fs = Math.max(16, (W + 2 * pad) / 28);
    const cut = (t, n = 30) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
    // what each layer is, beside it, stacked so no two run into each other
    const wanted = [
      { text: `wall · ${cut(trans.layers.length ? trans.build.label : 'masonry', 22)} · ${wallT}`, y: wallT / 2, colour: '#9aa4b2' },
      { text: `${cut(d.name, 22)} · ${Math.round(D)} deep`, y: wallT + D / 2, colour: '#d4d4d4' },
      { text: cut(d.build.face), y: wallT + D, colour: '#d4d4d4' },
    ];
    let last = -Infinity;
    for (const l of wanted) last = l.at = Math.max(l.y, last + fs * 1.3);
    const lab = fs * 24;
    const vbW = W + 2 * pad + lab;
    const bottom = Math.max(wallT + D + fs * 6.5, last + fs);
    const out = [`<svg class="wb-detail" viewBox="${-pad} ${-fs * 1.2} ${vbW} ${bottom + fs * 1.2}" role="img" aria-label="Section through ${esc(d.regions.map((q) => q.tag).join(', '))}: the wall, a stud at each division line, ${esc(d.name)}">${SECTION_DEFS}`];
    // the wall's construction, room side at the bottom (nearest the build)
    let y = 0;
    for (const [, t, kind] of [...layers].reverse()) {
      out.push(`<rect x="${-pad * 0.6}" y="${y}" width="${W + pad * 1.2}" height="${t}" fill="${KIND_FILL[kind] ?? '#555'}" stroke="#9a9a9a" stroke-width="1"/>`);
      y += t;
    }
    // the studs at the division lines, the build between, its face
    const y0 = y;
    out.push(`<rect x="0" y="${y0}" width="${frame}" height="${D}" fill="url(#wbWood)" stroke="#b08d57"/><rect x="${W - frame}" y="${y0}" width="${frame}" height="${D}" fill="url(#wbWood)" stroke="#b08d57"/>`);
    if (d.build.infill === 'wells') {
      const n = Math.max(2, Math.round((W - 2 * frame) / 50));
      const step = (W - 2 * frame) / n;
      for (let k = 0; k < n; k++) {
        const depth = D * (0.25 + 0.75 * (((k * k) % 7) / 6));
        out.push(`<rect x="${frame + k * step}" y="${y0}" width="${step}" height="${D - depth}" fill="#8a6a44" stroke="#d4a52a" stroke-width="1"/>`);
        out.push(`<path d="M${frame + k * step} ${y0}V${y0 + D}" stroke="#d4a52a" stroke-width="1.2"/>`);
      }
    } else out.push(`<rect x="${frame}" y="${y0}" width="${W - 2 * frame}" height="${D}" fill="url(#wbIns)"/>`);
    out.push(`<path d="M0 ${y0 + D}H${W}" stroke="#d4d4d4" stroke-width="3"/>`);
    if (broken) {
      // the break: a gap with a zig-zag each side, through the wall and the build
      const m = W / 2;
      const z = (x) => `M${x} ${-fs * 0.4}L${x} ${y0 * 0.4}l${fs * 0.3} ${fs * 0.3}l${-fs * 0.6} ${fs * 0.3}l${fs * 0.3} ${fs * 0.3}L${x} ${y0 + D + fs * 0.4}`;
      out.push(`<rect x="${m - fs * 0.4}" y="${-fs * 0.5}" width="${fs * 0.8}" height="${y0 + D + fs}" fill="#181818"/><path d="${z(m - fs * 0.4)}${z(m + fs * 0.4)}" stroke="#9aa4b2" stroke-width="1.5" fill="none"/>`);
    }
    // division lines through the studs
    out.push(`<path d="M${frame / 2} ${-fs * 0.6}V${y0 + D + fs * 0.6}M${W - frame / 2} ${-fs * 0.6}V${y0 + D + fs * 0.6}" stroke="#f4902c" stroke-dasharray="8 4" stroke-width="1.2"/>`);
    const lx = W + pad * 0.8 + fs;
    for (const l of wanted) out.push(`<path d="M${W + 2} ${l.y}L${lx - fs * 0.6} ${l.at}H${lx - 4}" stroke="#9aa4b2" fill="none"/><text x="${lx}" y="${l.at + fs * 0.35}" font-size="${fs * 0.9}" fill="${l.colour}">${esc(l.text)}</text>`);
    // the width, ticked at the division lines, each edge from the centre line
    const dy = y0 + D + fs * 2;
    out.push(`<path d="M0 ${dy}H${W}M0 ${dy - fs * 0.5}V${dy + fs * 0.5}M${W} ${dy - fs * 0.5}V${dy + fs * 0.5}" stroke="#6b7280"/>`);
    out.push(`<text x="${W / 2}" y="${dy - fs * 0.35}" text-anchor="middle" font-size="${fs * 0.9}" fill="#d4d4d4">${Math.round(Wtrue)}</text>`);
    out.push(`<text x="0" y="${dy + fs * 1.5}" text-anchor="middle" font-size="${fs * 0.9}" fill="#f4902c">${signed(r.x0 - span / 2)}</text><text x="${W}" y="${dy + fs * 1.5}" text-anchor="middle" font-size="${fs * 0.9}" fill="#f4902c">${signed(r.x1 - span / 2)}</text>`);
    out.push(`<text x="${W / 2}" y="${dy + fs * 3}" text-anchor="middle" font-size="${fs * 0.8}" fill="#9aa4b2">stud ${Math.round(frame)} × ${Math.round(D)} at each division line · ROOM ↓</text>`);
    out.push('</svg>');
    return `<div class="wb-dhead"><span class="wb-bubble">${d.n}</span><b>Detail D${d.n} · section through ${esc(d.regions.map((q) => q.tag).join(', '))}</b><span class="wb-small">plan section, ${broken ? 'to scale, broken' : 'to scale'}, mm</span></div>${out.join('')}`;
  }

  /**
   * THE WALL'S OWN BUILD, as a plan section 1800 mm long: its layers, room
   * side at the bottom, a stud every 600 mm through each framed layer, and
   * how thick it is all together.
   */
  function buildCard(trans) {
    const layers = trans.layers;
    if (!layers.length) return `<h4>Wall build</h4><p class="wb-hint">Not set — Build tab says how the walls are built (studs, block, double stud …); single stud is assumed for the numbers below.</p>`;
    const L = 1800;
    const total = layers.reduce((s, [, t]) => s + t, 0);
    const fs = 46;
    const out = [`<svg class="wb-detail" viewBox="-20 -10 ${L + fs * 19} ${total * 3 + fs * 2.2}" role="img" aria-label="Plan section of the wall build: ${esc(layers.map(([n]) => n).join(', '))}">${SECTION_DEFS}`];
    // the depth drawn ×3, so a 13 mm board is still a layer you can see and name
    const X3 = 3;
    let y = 0;
    for (const [name, t0, kind] of [...layers].reverse()) {
      const t = t0 * X3;
      const framed = /stud/i.test(name);
      out.push(`<rect x="0" y="${y}" width="${L}" height="${t}" fill="${KIND_FILL[kind] ?? '#555'}" stroke="#9a9a9a" stroke-width="1.5"/>`);
      if (framed) for (let x = 0; x <= L; x += 600) out.push(`<rect x="${Math.min(L - 45, Math.max(0, x - 22.5))}" y="${y}" width="45" height="${t}" fill="url(#wbWood)" stroke="#b08d57" stroke-width="1.5"/>`);
      out.push(`<path d="M${L + 6} ${y + t / 2}H${L + 40}" stroke="#9aa4b2" stroke-width="1.5"/><text x="${L + 48}" y="${y + t / 2 + fs * 0.35}" font-size="${fs}" fill="#d4d4d4">${esc(name)} · ${t0}</text>`);
      y += t;
    }
    out.push(`<text x="0" y="${y + fs * 1.3}" font-size="${fs}" fill="#9aa4b2">ROOM ↓ · studs at 600 mm centres · ${total} mm overall · depth drawn ×${X3}</text>`);
    out.push('</svg>');
    return `<h4>Wall build · ${esc(trans.build.label)}</h4>${out.join('')}`;
  }

  // ---------------------------------------------------------------- the numbers

  function transmissionCard(trans, windows, iso) {
    const rows = trans.parts.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.area.toFixed(2)}</td>${p.tl.map((v) => `<td class="n">${f0(v)}</td>`).join('')}<td class="n">${f0(trans.parts.length === 1 ? trans.rating : NaN)}</td></tr>`);
    const comp = `<tr class="total"><td>Composite</td><td class="n">${trans.area.toFixed(2)}</td>${trans.tl.map((v) => `<td class="n">${f0(v)}</td>`).join('')}<td class="n">${trans.rating}</td></tr>`;
    const max = Math.max(80, ...trans.tl);
    const bars = `<svg class="wb-bars" viewBox="0 0 300 110" role="img" aria-label="Transmission loss per octave, the build and the composite">${trans.tl
      .map((v, b) => {
        const x = 12 + b * 48;
        const hb = (trans.parts[0].tl[b] / max) * 84;
        const hc = (v / max) * 84;
        return `<rect x="${x}" y="${90 - hb}" width="18" height="${hb}" fill="#64748b"/><rect x="${x + 20}" y="${90 - hc}" width="18" height="${hc}" fill="#f4902c"/><text x="${x + 19}" y="104" text-anchor="middle" font-size="10" fill="#9aa4b2">${BAND_HEADS[b]}</text>`;
      })
      .join('')}</svg><p class="wb-small"><span style="color:#64748b">■</span> the build alone · <span style="color:#f4902c">■</span> the wall as it is, glass and all</p>`;
    const leak = trans.leak
      ? `<p class="wb-calc">Shared with the house: for ${trans.roomDb[0]} dB in the room, L_house = L_room − TL + 10·log10(S / 10 m²) with S ${trans.area.toFixed(1)} m²:</p>
         <table class="wb-table"><tr><th>Hz</th>${BAND_HEADS.map((b) => `<th class="n">${b}</th>`).join('')}</tr><tr><td>House side, dB</td>${trans.leak.map((v) => `<td class="n">${f0(v)}</td>`).join('')}</tr></table>`
      : `<p class="wb-small">Not shared with the house (${esc(iso.setting)}) — the Build tab says which walls are.</p>`;
    return `<h4>Transmission loss · what the wall lets through</h4>
      <div class="wb-scroll"><table class="wb-table"><thead><tr><th>Element</th><th class="n">m²</th>${BAND_HEADS.map((b) => `<th class="n">${b}</th>`).join('')}<th class="n">≈STC</th></tr></thead><tbody>${rows.join('')}${comp}</tbody></table></div>
      ${bars}
      <p class="wb-calc">τ = Σ Sᵢ·10^(−TLᵢ/10) / S · TL = −10·log10 τ${windows.length ? ` · glass on the STC contour from its single number` : ''} · rated by the highest contour it clears (no octave &gt; 8 dB under, &gt; 10 dB summed). Treatment on the room side adds next to nothing and is left out.${iso.walls === 'unset' ? ' Build not set: single stud assumed.' : ''}</p>
      ${leak}
      <p class="wb-calc">Under the rating's bands, where a sub lives: composite TL ${trans.low.freqs.map((f, i) => `${f} Hz ${f0(trans.low.tl[i])} dB`).join(' · ')} — each part's 125 Hz figure carried down the mass law, 6 dB per octave, so at best. A single-number rating (≈STC, NRC) is fitted from 125 Hz up and says nothing here.</p>
      <p class="wb-small">Estimates of design intent from typical published figures, not a test report.</p>`;
  }

  function absorptionCard(absorb, room, face) {
    const row = (name, area, A, cls = '') => `<tr class="${cls}"><td>${name}</td><td class="n">${area.toFixed(2)}</td>${A.map((v) => `<td class="n">${f2(v)}</td>`).join('')}</tr>`;
    return `<h4>Absorption · what the wall soaks up, m² sabins</h4>
      <div class="wb-scroll"><table class="wb-table"><thead><tr><th>Region</th><th class="n">m²</th>${BAND_HEADS.map((b) => `<th class="n">${b}</th>`).join('')}</tr></thead><tbody>
      ${absorb.rows.map((r) => row(`${r.tag} · ${esc(r.name)}`, r.area, r.A)).join('')}
      ${row(`${esc(absorb.rest.name)} · base`, absorb.rest.area, absorb.rest.A, 'base')}
      ${row('Wall', faceArea(room, face), absorb.total, 'total')}
      <tr class="share"><td>Share of the room's</td><td></td>${absorb.share.map((v) => `<td class="n">${Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—'}</td>`).join('')}</tr>
      </tbody></table></div>
      <p class="wb-calc">A = Σ Sᵢ·αᵢ + S_rest·α_base, per octave; the share is of the room's A, surfaces and furniture, as its RT60 is summed.</p>`;
  }

  return { render, get face() { return face; } };
}

/** Exposed for the tests: which products and finishes the region select offers, grouped. */
export const PALETTE_GROUPS = () => [...new Set(paletteItems().map((x) => x.category))];
export { PRODUCTS };
